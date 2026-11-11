import Fastify from 'fastify';
import pino from 'pino';
import { loadConfig } from './config.js';
import { Store } from './store/db.js';
import { EvolutionClient } from './whatsapp/client.js';
import { JiraClient } from './integrations/jira.js';
import { normalize } from './whatsapp/normalize.js';
import { Router } from './router.js';
import { dispatchCommand, parseCommand, type DispatchDeps } from './commands/index.js';
import { aiAnswer } from './ai/answer.js';
import type { WaMessage } from './whatsapp/types.js';
import { DEV_CHAT_HTML } from './dev-chat.html.js';

const cfg = loadConfig();
const log = pino({ name: 'wa-ai-bot' });

const store = new Store(cfg.DATA_DIR);
const wa = new EvolutionClient(cfg);
const jira = new JiraClient(cfg);
const router = new Router(cfg, store);
const deps: DispatchDeps = { cfg, store, wa, jira };

/** The bot's own JID, learned from the connection state (for mentions/replies). */
let botJid: string | undefined;
let connectionState: string | undefined;

async function refreshState(): Promise<void> {
  try {
    const st = await wa.connectionState();
    botJid = st.instance ?? botJid;
    connectionState = st.state ?? connectionState;
  } catch (err: any) {
    log.warn({ err: String(err?.message ?? err) }, 'connectionState unavailable');
  }
}

let evolutionReady = false;

async function tryEnsureInstance(): Promise<void> {
  await wa.ensureInstance(cfg.EVOLUTION_INSTANCE_TOKEN);
  evolutionReady = true;
  log.info('Evolution instance ready — if state is not "open", pair the number via http://<evolution>/manager');
  await refreshState();
}

async function startup(): Promise<void> {
  // Evolution may still be booting; keep trying in the background.
  try {
    await tryEnsureInstance();
  } catch (err: any) {
    log.warn(
      { err: String(err?.message ?? err) },
      'Evolution API not reachable yet — will retry every 30s',
    );
  }
  const retry = setInterval(async () => {
    if (evolutionReady) return clearInterval(retry);
    try {
      await tryEnsureInstance();
      clearInterval(retry);
    } catch {
      /* retry again */
    }
  }, 30_000);
  retry.unref();
  setInterval(() => {
    if (evolutionReady) refreshState().catch(() => {});
  }, 60_000).unref();
}

const app = Fastify({ logger: false });

app.get('/health', async () => ({
  ok: true,
  state: connectionState ?? 'unknown',
  botJid,
  uptimeSec: Math.round(process.uptime()),
}));

app.post('/webhook', async (req, reply) => {
  const apiKey = req.headers['apikey'];
  if (cfg.EVOLUTION_API_KEY && apiKey !== cfg.EVOLUTION_API_KEY) {
    return reply.code(401).send({ error: 'bad apikey' });
  }
  const body = req.body as any;

  // Ack immediately; process async so Evolution does not time out during AI calls.
  const event = body?.event;
  const data = body?.data;
  reply.code(200).send({ ok: true });

  if (event === 'connection.update') {
    log.info(`connection.update: ${data?.state ?? 'unknown'}`);
    void refreshState();
    return;
  }
  if (event !== 'messages.upsert') return;

  const msg = normalize(body, {
    botJid,
    staleAfterMs: cfg.STALE_AFTER_MIN * 60_000,
  });
  if (!msg) return;
  if (msg.fromMe) return;

  void router
    .handle(msg, deps)
    .catch((err) => log.error({ err, chatId: msg.chatId, id: msg.id }, 'router error'));
});

/**
 * Local dev chat (enabled with DEV_CHAT=1): exercise the exact same command +
 * AI pipeline a WhatsApp DM would use, without a linked number.
 * Simulates a DM from the owner; replies are returned as JSON instead of sent
 * through Evolution.
 */
if (cfg.DEV_CHAT) {
  const devOut: string[] = [];
  const devWa = {
    sendText: (_chatId: string, text: string) => {
      devOut.push(text);
      return Promise.resolve({});
    },
    setPresence: () => Promise.resolve({}),
    sendReaction: () => Promise.resolve({}),
    getGroupMetadata: () => Promise.resolve({ participants: [] }),
    connectionState: () => Promise.resolve({ state: 'dev' }),
  } as unknown as EvolutionClient;
  const devDeps: DispatchDeps = { cfg, store, wa: devWa, jira };

  app.post('/dev/chat', async (req, reply) => {
    const { text } = (req.body ?? {}) as any;
    if (typeof text !== 'string' || !text.trim()) {
      return reply.code(400).send({ error: 'text required' });
    }
    const ownerDigits = cfg.OWNER_NUMBER || '0000000000';
    const msg: WaMessage = {
      id: `dev-${Date.now()}`,
      chatId: `dev-${ownerDigits}@c.us`,
      isGroup: false,
      senderId: `${ownerDigits}@s.whatsapp.net`,
      senderName: 'Dev',
      text: text.trim(),
      messageType: 'conversation',
      mentionsBot: false,
      replyToBot: false,
      fromMe: false,
      timestamp: Date.now(),
    };
    devOut.length = 0;
    const parsed = parseCommand(msg.text, cfg.BOT_PREFIX);
    if (parsed) {
      await dispatchCommand(msg, parsed, devDeps);
    } else {
      devOut.push(await aiAnswer(msg, devDeps));
    }
    return { reply: devOut.join('\n\n') };
  });

  app.get('/dev', async (_req, reply) => reply.type('text/html; charset=utf-8').send(DEV_CHAT_HTML));
}

await startup();
await app.listen({ port: cfg.PORT, host: '0.0.0.0' });
log.info(`wa-ai-bot listening on :${cfg.PORT} (instance: ${cfg.EVOLUTION_INSTANCE})`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    log.info(`${signal} received, shutting down`);
    await app.close();
    store.close();
    process.exit(0);
  });
}
