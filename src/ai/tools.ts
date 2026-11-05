import type Anthropic from '@anthropic-ai/sdk';
import type { JiraClient } from '../integrations/jira.js';
import type { ToolExecutor } from './claude.js';

/** Build Anthropic tool definitions + executor for the Jira integration. */
export function buildJiraTools(
  jira: JiraClient,
  defaultProject: () => string | undefined,
): { tools: Anthropic.Tool[]; execute: ToolExecutor } {
  const tools: Anthropic.Tool[] = [
    {
      name: 'jira_create_issue',
      description:
        'Create a Jira issue. Use when the user asks to log/create/open a ticket, task, bug or story.',
      input_schema: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Short one-line summary of the issue.' },
          description: { type: 'string', description: 'Optional longer description.' },
          project: { type: 'string', description: 'Jira project key. Omit to use the chat default.' },
          issue_type: {
            type: 'string',
            enum: ['Task', 'Bug', 'Story'],
            description: 'Issue type. Default Task.',
          },
        },
        required: ['summary'],
      },
    },
    {
      name: 'jira_find_issues',
      description:
        'Search Jira issues by free text, or look up one by key (e.g. WA-123). Returns key, summary, status, assignee and URL.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Free text to search, or an issue key like WA-123.' },
        },
        required: ['query'],
      },
    },
    {
      name: 'jira_add_comment',
      description: 'Add a comment to an existing Jira issue.',
      input_schema: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Issue key, e.g. WA-123.' },
          comment: { type: 'string' },
        },
        required: ['key', 'comment'],
      },
    },
    {
      name: 'jira_move_issue',
      description:
        "Move a Jira issue to another status (e.g. 'In Progress', 'Done').",
      input_schema: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          status: { type: 'string', description: 'Target status name.' },
        },
        required: ['key', 'status'],
      },
    },
  ];

  const execute: ToolExecutor = async (name, input) => {
    const project = defaultProject();
    switch (name) {
      case 'jira_create_issue': {
        const issue = await jira.createIssue({
          summary: input.summary,
          description: input.description,
          project: input.project ?? project,
          issueType: input.issue_type,
        });
        return `Created ${issue.key} "${issue.summary}" [${issue.status}] → ${issue.url}`;
      }
      case 'jira_find_issues': {
        const issues = await jira.findIssues(input.query, 5);
        if (issues.length === 0) return `No issues found for "${input.query}".`;
        return issues
          .map((i) => `${i.key} "${i.summary}" [${i.status}]${i.assignee ? ` → ${i.assignee}` : ''} ${i.url}`)
          .join('\n');
      }
      case 'jira_add_comment': {
        const res = await jira.addComment(input.key, input.comment);
        return `Comment added to ${input.key.toUpperCase()} → ${res.url}`;
      }
      case 'jira_move_issue': {
        const issue = await jira.moveIssue(input.key, input.status);
        return `${issue.key} moved to [${issue.status}] → ${issue.url}`;
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  };

  return { tools, execute };
}
