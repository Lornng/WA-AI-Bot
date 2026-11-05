import type { Config } from '../config.js';
import type { Store } from '../store/db.js';
import type { EvolutionClient } from '../whatsapp/client.js';
import type { JiraClient } from '../integrations/jira.js';
import type { WaMessage } from '../whatsapp/types.js';
import type { Command, CommandContext } from './types.js';
import { help } from './help.js';
import { ask } from './ask.js';
import { reset } from './reset.js';
import { status } from './status.js';
import { whoami } from './whoami.js';
import { jira } from './jira.js';
import { bot } from './bot.js';
import { project } from './project.js';

export interface DispatchDeps {
  cfg: Config;
  store: Store;
  wa: EvolutionClient;
  jira: JiraClient;
}

export const commands: Command[] = [help, ask, reset, status, whoami, jira, bot, project];

export function findCommand(name: string): Command | undefined {
  const n = name.toLowerCase();
  return commands.find((c) => c.name === n || c.aliases?.includes(n));
}

export interface ParsedCommand {
  name: string;
  argText: string;
  args: string[];
}

/** Parse "!jira find bug" with prefix "!" → { name: 'jira', argText: 'find bug', args: [...] }. */
export function parseCommand(text: string, prefix: string): ParsedCommand | null {
  if (!text.startsWith(prefix)) return null;
  const rest = text.slice(prefix.length).trim();
  const [name, ...args] = rest.split(/\s+/);
  if (!name) return null;
  return { name: name.toLowerCase(), argText: args.join(' '), args };
}

const ADMIN_CACHE_TTL = 10 * 60 * 1000;
const adminCache = new Map<string, { admins: Set<string>; at: number }>();

async function isGroupAdmin(msg: WaMessage, deps: DispatchDeps): Promise<boolean> {
  const cached = adminCache.get(msg.chatId);
  const now = Date.now();
  if (cached && now - cached.at < ADMIN_CACHE_TTL) return cached.admins.has(msg.senderId);
  try {
    const meta = await deps.wa.getGroupMetadata(msg.chatId);
    const admins = new Set<string>(
      (meta.participants ?? []).filter((p: any) => p.admin).map((p: any) => p.id as string),
    );
    adminCache.set(msg.chatId, { admins, at: now });
    return admins.has(msg.senderId);
  } catch {
    return false;
  }
}

/**
 * Dispatch a parsed command for a message. Handles permissions and replies.
 * Returns true if a command was handled.
 */
export async function dispatchCommand(msg: WaMessage, parsed: ParsedCommand, deps: DispatchDeps): Promise<boolean> {
  const cmd = findCommand(parsed.name);
  if (!cmd) {
    await safeReply(deps, msg, `Unknown command: ${deps.cfg.BOT_PREFIX}${parsed.name}. Try ${deps.cfg.BOT_PREFIX}help.`);
    return true;
  }

  const digits = msg.senderId.split('@')[0];
  const isOwner = deps.cfg.OWNER_NUMBER !== '' && digits === deps.cfg.OWNER_NUMBER;

  let isAdmin = false;
  const perm = cmd.permission ?? 'any';
  if (!isOwner && perm === 'groupAdmin' && msg.isGroup) {
    isAdmin = await isGroupAdmin(msg, deps);
  }
  if (perm === 'owner' && !isOwner) {
    await safeReply(deps, msg, 'That command is for the bot owner.');
    return true;
  }
  if (perm === 'groupAdmin' && msg.isGroup && !isOwner && !isAdmin) {
    await safeReply(deps, msg, 'That command needs group admin rights.');
    return true;
  }

  const ctx: CommandContext = {
    msg,
    args: parsed.args,
    argText: parsed.argText,
    store: deps.store,
    wa: deps.wa,
    cfg: deps.cfg,
    jira: deps.jira,
    isOwner,
    isAdmin,
    reply: (text) =>
      deps.wa.sendText(msg.chatId, text, {
        quotedId: msg.id,
        mentions: msg.isGroup ? [msg.senderId] : undefined,
      }),
  };

  try {
    await cmd.run(ctx);
  } catch (err: any) {
    await safeReply(deps, msg, `Command failed: ${String(err?.message ?? err).slice(0, 200)}`);
  }
  return true;
}

async function safeReply(deps: DispatchDeps, msg: WaMessage, text: string): Promise<void> {
  try {
    await deps.wa.sendText(msg.chatId, text, { quotedId: msg.id, mentions: msg.isGroup ? [msg.senderId] : undefined });
  } catch {
    /* reply is best-effort */
  }
}
