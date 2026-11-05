import type { Config } from '../config.js';
import type { Store } from '../store/db.js';
import type { JiraClient } from '../integrations/jira.js';
import type { EvolutionClient } from '../whatsapp/client.js';
import type { WaMessage } from '../whatsapp/types.js';
import { runClaude } from './claude.js';
import { buildJiraTools } from './tools.js';

/**
 * Shared "ask the AI" path used by DMs, !ask, @mentions and reply-to-bot.
 */
export async function aiAnswer(
  msg: WaMessage,
  deps: { cfg: Config; store: Store; wa: EvolutionClient; jira: JiraClient },
): Promise<string> {
  const { cfg, store, wa, jira } = deps;
  const isGroup = msg.isGroup;

  const groupProject = isGroup ? store.groupSettings(msg.chatId).jiraProject : undefined;
  const jiraTools = jira.isConfigured()
    ? buildJiraTools(jira, () => groupProject ?? (cfg.JIRA_DEFAULT_PROJECT || undefined))
    : { tools: [], execute: (async () => 'Jira is not configured.') as any };

  const who = isGroup ? msg.senderName || msg.senderId : 'the user';
  const system = `You are ${cfg.BOT_NAME}, a WhatsApp ${isGroup ? 'group bot' : 'personal assistant'}.
${isGroup ? `You are in the group "${msg.chatId}"; ${who} spoke to you, so answer them directly.` : 'You are chatting 1:1 with your owner.'}
Keep replies short and conversational — it is a phone chat, not a document.
Use plain text (no markdown tables). A few short bullets are fine.
Today is ${new Date().toISOString().slice(0, 10)}.
${jira.isConfigured() ? `You have Jira tools. Use them when the user asks about tickets, and quote the issue URL in your reply.` : ''}`;

  let userContent: string;
  if (isGroup) {
    // The current message is already stored; drop it from the context window.
    const recent = store
      .recentMessages(msg.chatId, 20)
      .filter((m) => !(m.ts === msg.timestamp && m.content === msg.text));
    const lines = recent.map((m) => `- ${m.sender ?? 'Someone'}: ${m.content}`).join('\n');
    userContent = lines
      ? `Recent group messages:\n${lines}\n\nNew message from ${who}: ${msg.text}`
      : `New message from ${who}: ${msg.text}`;
  } else {
    userContent = msg.text;
  }

  if (!isGroup) await wa.setPresence(msg.chatId, 'composing').catch(() => {});

  let replyText: string;
  try {
    replyText = await runClaude({
      cfg,
      system,
      history: store.history(msg.chatId, cfg.HISTORY_TURNS * 2),
      userContent,
      tools: jiraTools.tools,
      execute: jiraTools.execute,
    });
  } catch (err: any) {
    replyText = `Sorry, the AI reply failed: ${String(err?.message ?? err).slice(0, 200)}`;
  } finally {
    if (!isGroup) await wa.setPresence(msg.chatId, 'paused').catch(() => {});
  }

  store.addHistory(msg.chatId, 'user', isGroup ? `From ${who}: ${msg.text}` : msg.text);
  store.addHistory(msg.chatId, 'assistant', replyText);
  return replyText;
}
