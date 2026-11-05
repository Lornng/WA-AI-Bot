import type { Command, CommandContext } from './types.js';

export const project: Command = {
  name: 'project',
  description: 'Group admin: set the default Jira project for this group.',
  usage: '!project <KEY|off>',
  group: 'jira',
  permission: 'groupAdmin',
  async run(ctx: CommandContext) {
    const arg = ctx.argText.trim();
    if (!ctx.msg.isGroup) {
      await ctx.reply(
        `Default project (global): ${ctx.cfg.JIRA_DEFAULT_PROJECT || 'none'}. In a group, an admin can set one with !project <KEY>.`,
      );
      return;
    }
    if (arg.toLowerCase() === 'off' || arg === '') {
      ctx.store.setGroupJiraProject(ctx.msg.chatId, undefined);
      await ctx.reply(`Group project cleared. Using global default: ${ctx.cfg.JIRA_DEFAULT_PROJECT || 'none'}.`);
      return;
    }
    if (!/^[A-Z][A-Z0-9]{1,9}$/i.test(arg)) {
      await ctx.reply('Usage: !project <KEY> (e.g. WA) or !project off');
      return;
    }
    ctx.store.setGroupJiraProject(ctx.msg.chatId, arg.toUpperCase());
    await ctx.reply(`✅ Default Jira project for this group: ${arg.toUpperCase()}`);
  },
};
