import type { Command, CommandContext } from './types.js';
import { JiraError } from '../integrations/jira.js';

function currentProject(ctx: CommandContext): string | undefined {
  if (ctx.msg.isGroup)
    return ctx.store.groupSettings(ctx.msg.chatId).jiraProject ?? (ctx.cfg.JIRA_DEFAULT_PROJECT || undefined);
  return ctx.cfg.JIRA_DEFAULT_PROJECT || undefined;
}

const KEY_RE = /^[A-Z][A-Z0-9]{1,9}-\d+$/;

export const jira: Command = {
  name: 'jira',
  aliases: ['j'],
  description: 'Jira operations: create, find, show, comment, move.',
  usage: '!jira create <summary> | !jira find <text> | !jira <KEY> | !jira comment <KEY> <text> | !jira move <KEY> <status>',
  group: 'jira',
  async run(ctx: CommandContext) {
    if (!ctx.jira.isConfigured()) {
      await ctx.reply('Jira is not configured on the bot (set JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN).');
      return;
    }
    const [sub, ...rest] = ctx.args;
    const argText = rest.join(' ');

    try {
      switch (sub?.toLowerCase()) {
        case 'create': {
          if (!argText) throw new JiraError('Usage: !jira create <summary>');
          const issue = await ctx.jira.createIssue({
            summary: argText,
            project: currentProject(ctx),
          });
          await ctx.reply(`✅ ${issue.key} "${issue.summary}" [${issue.status}]\n${issue.url}`);
          return;
        }
        case 'find':
        case 'search': {
          if (!argText) throw new JiraError('Usage: !jira find <text>');
          const issues = await ctx.jira.findIssues(argText, 5);
          if (issues.length === 0) {
            await ctx.reply(`No issues found for "${argText}".`);
            return;
          }
          await ctx.reply(
            issues.map((i) => `${i.key} "${i.summary}" [${i.status}]${i.assignee ? ` → ${i.assignee}` : ''}\n${i.url}`).join('\n\n'),
          );
          return;
        }
        case 'comment': {
          const key = rest[0];
          const text = rest.slice(1).join(' ');
          if (!key || !KEY_RE.test(key.toUpperCase()) || !text)
            throw new JiraError('Usage: !jira comment <KEY> <text>');
          const res = await ctx.jira.addComment(key, text);
          await ctx.reply(`💬 Comment added to ${key.toUpperCase()}\n${res.url}`);
          return;
        }
        case 'move':
        case 'status': {
          const key = rest[0];
          const status = rest.slice(1).join(' ');
          if (!key || !KEY_RE.test(key.toUpperCase()) || !status)
            throw new JiraError('Usage: !jira move <KEY> <status>');
          const issue = await ctx.jira.moveIssue(key, status);
          await ctx.reply(`➡️ ${issue.key} → [${issue.status}]\n${issue.url}`);
          return;
        }
        default: {
          // Treat the whole arg text as a key or search.
          const q = ctx.argText.trim();
          if (!q) throw new JiraError('Usage: !jira create <summary> | find <text> | <KEY> | comment <KEY> <text> | move <KEY> <status>');
          if (KEY_RE.test(q.toUpperCase())) {
            const issue = await ctx.jira.getIssue(q);
            await ctx.reply(`${issue.key} "${issue.summary}"\nStatus: ${issue.status}${issue.assignee ? `\nAssignee: ${issue.assignee}` : ''}\n${issue.url}`);
          } else {
            const issues = await ctx.jira.findIssues(q, 3);
            if (issues.length === 0) await ctx.reply(`No issues found for "${q}".`);
            else
              await ctx.reply(
                issues.map((i) => `${i.key} "${i.summary}" [${i.status}]\n${i.url}`).join('\n\n'),
              );
          }
        }
      }
    } catch (err: any) {
      await ctx.reply(`⚠️ ${err instanceof JiraError ? err.message : `Jira error: ${String(err?.message ?? err).slice(0, 200)}`}`);
    }
  },
};
