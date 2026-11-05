import type { Command, CommandContext } from './types.js';

export const status: Command = {
  name: 'status',
  description: 'Show bot status.',
  group: 'general',
  async run(ctx: CommandContext) {
    let conn = 'unknown';
    try {
      const st = await ctx.wa.connectionState();
      conn = st.state ?? 'unknown';
    } catch {
      conn = 'unreachable';
    }
    const lines = [
      `Connection: ${conn}`,
      `Model: ${ctx.cfg.ANTHROPIC_MODEL}`,
      `Jira: ${ctx.jira.isConfigured() ? 'configured' : 'not configured'}`,
      `Uptime: ${Math.round(process.uptime() / 3600)}h ${Math.round((process.uptime() % 3600) / 60)}m`,
    ];
    if (ctx.msg.isGroup) {
      const s = ctx.store.groupSettings(ctx.msg.chatId);
      lines.push(`Bot in this group: ${s.enabled ? 'on' : 'off'}`);
      lines.push(`Group Jira project: ${s.jiraProject ?? (ctx.cfg.JIRA_DEFAULT_PROJECT || 'none')}`);
    }
    await ctx.reply(lines.join('\n'));
  },
};
