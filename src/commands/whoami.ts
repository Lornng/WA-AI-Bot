import type { Command, CommandContext } from './types.js';

export const whoami: Command = {
  name: 'whoami',
  description: 'Show your number as the bot sees it (useful for the allowlist).',
  group: 'general',
  async run(ctx: CommandContext) {
    const number = ctx.msg.senderId.split('@')[0];
    const lines = [`Your number: +${number}`];
    if (ctx.isOwner) lines.push('You are the bot owner.');
    else if (ctx.cfg.ALLOWED_NUMBERS.includes(number)) lines.push('You are on the allowlist.');
    else lines.push('You are not on the allowlist (you can still use me in groups).');
    await ctx.reply(lines.join('\n'));
  },
};
