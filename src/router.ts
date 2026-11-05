import type { Config } from './config.js';
import type { Store } from './store/db.js';
import type { WaMessage } from './whatsapp/types.js';
import { dispatchCommand, parseCommand, type DispatchDeps } from './commands/index.js';
import { aiAnswer } from './ai/answer.js';

/**
 * Central message router:
 *  - DM from allowlisted number → AI chat
 *  - Group: only when message is a !command, @mentions the bot, or replies to it
 *  - Safety: allowlist, per-chat rate limit, ignore own/stale/duplicate messages
 */
export type AnswerFn = (msg: WaMessage, deps: DispatchDeps) => Promise<string>;

export class Router {
  private hits = new Map<string, number[]>();

  constructor(
    private cfg: Config,
    private store: Store,
    /** Injectable for tests; defaults to the real Claude answer path. */
    private answer: AnswerFn = aiAnswer,
  ) {}

  private rateLimited(chatId: string, senderId: string): boolean {
    if (this.hits.size > 2000) this.hits.clear(); // crude GC
    const key = `${chatId}|${senderId}`;
    const now = Date.now();
    const window = this.cfg.RATE_WINDOW_MS;
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < window);
    this.hits.set(key, recent);
    if (recent.length >= this.cfg.RATE_MAX) return true;
    recent.push(now);
    return false;
  }

  async handle(msg: WaMessage, deps: DispatchDeps): Promise<void> {
    if (msg.fromMe) return;

    if (this.store.seen(msg.id)) return;
    this.store.remember({
      id: msg.id,
      chatId: msg.chatId,
      senderId: msg.senderId,
      senderName: msg.senderName,
      text: msg.text,
      timestamp: msg.timestamp,
    });

    const digits = msg.senderId.split('@')[0];
    const isOwner = this.cfg.OWNER_NUMBER !== '' && digits === this.cfg.OWNER_NUMBER;
    const allowed = isOwner || this.cfg.ALLOWED_NUMBERS.includes(digits);

    if (msg.isGroup) {
      const s = this.store.groupSettings(msg.chatId);
      if (!s.enabled && !isOwner) return;
    }

    if (this.rateLimited(msg.chatId, msg.senderId)) return;

    // 1) Commands
    const parsed = msg.text ? parseCommand(msg.text, this.cfg.BOT_PREFIX) : null;
    if (parsed) {
      if (!msg.isGroup && !allowed) return; // strangers cannot run commands in DMs
      await dispatchCommand(msg, parsed, deps);
      return;
    }

    // 2) DMs → AI chat
    if (!msg.isGroup) {
      if (!allowed) return; // silently ignore non-allowlisted DMs
      const text = await this.answer(msg, deps);
      await this.reply(deps, msg, text);
      return;
    }

    // 3) Groups → only @mention or reply-to-bot
    if (msg.mentionsBot || msg.replyToBot) {
      if (!msg.text) {
        await this.reply(deps, msg, 'I can read text and captions for now — send me a message instead.');
        return;
      }
      const text = await this.answer(msg, deps);
      await this.reply(deps, msg, text);
    }
  }

  private async reply(deps: DispatchDeps, msg: WaMessage, text: string): Promise<void> {
    try {
      await deps.wa.sendText(msg.chatId, text, {
        quotedId: msg.id,
        mentions: msg.isGroup ? [msg.senderId] : undefined,
      });
    } catch (err: any) {
      console.error(`Failed to reply in ${msg.chatId}:`, String(err?.message ?? err));
    }
  }
}
