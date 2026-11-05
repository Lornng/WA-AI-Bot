import type { Command, CommandContext } from './types.js';

export const help: Command = {
  name: 'help',
  description: 'Show available commands.',
  group: 'general',
  async run(ctx: CommandContext) {
    const { cfg } = ctx;
    const p = cfg.BOT_PREFIX;
    const lines = [
      `Hi! I'm ${cfg.BOT_NAME}. Things I understand:`,
      '',
      `${p}help — this list`,
      `${p}ask <question> — AI answer (in groups, with chat context)`,
      `${p}reset — clear my conversation memory for this chat`,
      `${p}status — bot status`,
      `${p}whoami — show your number as I see it`,
      '',
      'Jira:',
      `${p}jira create <summary> — create an issue in this chat's project`,
      `${p}jira find <text|KEY> — search issues`,
      `${p}jira <KEY> — show one issue`,
      `${p}jira comment <KEY> <text> — add a comment`,
      `${p}jira move <KEY> <status> — change status`,
      '',
    ];
    if (ctx.msg.isGroup) {
      lines.push(
        'Group admins:',
        `${p}bot on|off|status — enable/disable the bot in this group`,
        `${p}project <KEY|off> — set the default Jira project for this group`,
        '',
      );
    }
    lines.push(`You can also just @mention me or reply to one of my messages with a question.`);
    await ctx.reply(lines.join('\n'));
  },
};
