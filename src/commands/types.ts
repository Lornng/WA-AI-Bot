import type { Config } from '../config.js';
import type { Store } from '../store/db.js';
import type { EvolutionClient } from '../whatsapp/client.js';
import type { JiraClient } from '../integrations/jira.js';
import type { WaMessage, Permission } from '../whatsapp/types.js';

export interface CommandContext {
  msg: WaMessage;
  /** Words after the command name. */
  args: string[];
  /** Raw text after the command name. */
  argText: string;
  store: Store;
  wa: EvolutionClient;
  cfg: Config;
  jira: JiraClient;
  isOwner: boolean;
  /** Group admin (always false in DMs; owner is handled separately). */
  isAdmin: boolean;
  reply: (text: string) => Promise<void>;
}

export interface Command {
  name: string;
  aliases?: string[];
  description: string;
  usage?: string;
  group: 'general' | 'ai' | 'jira' | 'admin';
  permission?: Permission;
  /** Hide from !help unless owner. */
  ownerOnlyHelp?: boolean;
  run(ctx: CommandContext): Promise<void>;
}

export function registerCommand(list: Command[], cmd: Command): void {
  list.push(cmd);
}
