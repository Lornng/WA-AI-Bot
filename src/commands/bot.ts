import type { Command, CommandContext } from './types.js';

export const bot: Command = {
  name: 'bot',
  description: 'Group admin: enable or disable the bot in this group.',
  usage: '!bot on|off|status',
  group: 'admin',
  permission: 'groupAdmin',
  async run(ctx: CommandContext) {
    if (!ctx.msg.isGroup) {
      await ctx.reply('This only works in groups. In DMs I am always on for allowlisted numbers.');
      return;
    }
    const arg = ctx.args[0]?.toLowerCase();
    const s = ctx.store.groupSettings(ctx.msg.chatId);
    switch (arg) {
      case 'on':
        ctx.store.setGroupEnabled(ctx.msg.chatId, true);
        await ctx.reply('Bot enabled in this group. 🟢');
        break;
      case 'off':
        ctx.store.setGroupEnabled(ctx.msg.chatId, false);
        await ctx.reply('Bot disabled in this group (I will only answer the owner). 🔴');
        break;
      case 'status':
      case undefined:
        await ctx.reply(s.enabled ? 'Bot is ON in this group.' : 'Bot is OFF in this group.');
        break;
      default:
        await ctx.reply('Usage: !bot on|off|status');
    }
  },
};
