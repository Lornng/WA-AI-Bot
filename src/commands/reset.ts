import type { Command, CommandContext } from './types.js';

export const reset: Command = {
  name: 'reset',
  description: 'Clear the AI conversation memory for this chat.',
  group: 'ai',
  permission: 'groupAdmin',
  async run(ctx: CommandContext) {
    const n = ctx.store.clearHistory(ctx.msg.chatId);
    await ctx.reply(n > 0 ? `Memory cleared (${n} messages forgotten).` : 'Memory was already empty.');
  },
};
