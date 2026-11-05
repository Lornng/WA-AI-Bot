import type { Command, CommandContext } from './types.js';
import { aiAnswer } from '../ai/answer.js';

export const ask: Command = {
  name: 'ask',
  aliases: ['q'],
  description: 'Ask the AI a question (uses chat context).',
  usage: '!ask <question>',
  group: 'ai',
  async run(ctx: CommandContext) {
    const question = ctx.argText.trim();
    if (!question) {
      await ctx.reply('Usage: !ask <question>');
      return;
    }
    await ctx.reply(await aiAnswer({ ...ctx.msg, text: question }, {
      cfg: ctx.cfg,
      store: ctx.store,
      wa: ctx.wa,
      jira: ctx.jira,
    }));
  },
};
