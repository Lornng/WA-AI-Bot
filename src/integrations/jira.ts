import { createCloudClient, type CloudClient } from 'jira.js';
import type { Config } from '../config.js';

export class JiraError extends Error {}

export interface JiraIssueSummary {
  key: string;
  summary: string;
  status: string;
  assignee?: string;
  url: string;
}

/** Thin wrapper over jira.js cloud client for the operations the bot needs. */
export class JiraClient {
  private jira?: CloudClient;
  private baseUrl: string;
  private defaultProject: string;
  private defaultIssueType: string;

  constructor(cfg: Pick<Config, 'JIRA_BASE_URL' | 'JIRA_EMAIL' | 'JIRA_API_TOKEN' | 'JIRA_DEFAULT_PROJECT' | 'JIRA_DEFAULT_ISSUE_TYPE'>) {
    this.baseUrl = cfg.JIRA_BASE_URL.replace(/\/$/, '');
    this.defaultProject = cfg.JIRA_DEFAULT_PROJECT;
    this.defaultIssueType = cfg.JIRA_DEFAULT_ISSUE_TYPE || 'Task';
    if (this.baseUrl && cfg.JIRA_EMAIL && cfg.JIRA_API_TOKEN) {
      this.jira = createCloudClient({
        host: this.baseUrl,
        auth: { type: 'basic', email: cfg.JIRA_EMAIL, apiToken: cfg.JIRA_API_TOKEN },
      });
    }
  }

  isConfigured(): boolean {
    return this.jira !== undefined;
  }

  private requireClient(): CloudClient {
    if (!this.jira) throw new JiraError('Jira is not configured (JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN).');
    return this.jira;
  }

  private url(key: string): string {
    return `${this.baseUrl}/browse/${key}`;
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err: any) {
      const raw: string = err?.message ?? String(err);
      let friendly = raw;
      try {
        const parsed = JSON.parse(raw);
        friendly = parsed.errorMessages?.join('; ') || parsed.message || raw;
      } catch {
        /* keep raw */
      }
      if (err?.status === 401 || /401|invalid api token/i.test(raw))
        throw new JiraError('Jira rejected the credentials (401). Check JIRA_EMAIL / JIRA_API_TOKEN.');
      throw new JiraError(`Jira error: ${String(friendly).slice(0, 300)}`);
    }
  }

  private summarize(i: any): JiraIssueSummary {
    return {
      key: i.key,
      summary: i.fields?.summary ?? '—',
      status: i.fields?.status?.name ?? '—',
      assignee: i.fields?.assignee?.displayName ?? undefined,
      url: this.url(i.key),
    };
  }

  async createIssue(input: { summary: string; description?: string; project?: string; issueType?: string }): Promise<JiraIssueSummary> {
    const jira = this.requireClient();
    const project = input.project || this.defaultProject;
    if (!project) throw new JiraError('No Jira project set. Use `!project <KEY>` in a group, or set JIRA_DEFAULT_PROJECT.');
    const fields: Record<string, any> = {
      project: { key: project },
      summary: input.summary,
      issuetype: { name: input.issueType || this.defaultIssueType },
    };
    if (input.description) fields.description = input.description;
    const created = await this.withRetry(() => jira.issues.createIssue({ fields }));
    const createdAny = created as any;
    return {
      key: createdAny.key,
      summary: createdAny.fields?.summary ?? input.summary,
      status: createdAny.fields?.status?.name ?? '—',
      assignee: createdAny.fields?.assignee?.displayName,
      url: this.url(createdAny.key),
    };
  }

  /** Find issues: exact key lookup first, otherwise JQL text search. */
  async findIssues(query: string, max = 5): Promise<JiraIssueSummary[]> {
    const jira = this.requireClient();
    const trimmed = query.trim();
    const keyMatch = trimmed.match(/^([A-Z][A-Z0-9]{1,9})-(\d+)$/);
    if (keyMatch) {
      const issue = await this.withRetry(() =>
        jira.issues.getIssue({ issueIdOrKey: trimmed.toUpperCase() }),
      );
      return [this.summarize(issue)];
    }
    const quoted = trimmed.replace(/"/g, '\\"');
    const jql = `summary ~ "${quoted}" OR description ~ "${quoted}" ORDER BY updated DESC`;
    const result = await this.withRetry(() =>
      jira.issueSearch.searchIssuesPost({ jql, maxResults: max }),
    );
    return ((result.issues as any[]) ?? []).map((i) => this.summarize(i));
  }

  async getIssue(key: string): Promise<JiraIssueSummary> {
    const jira = this.requireClient();
    const issue = await this.withRetry(() =>
      jira.issues.getIssue({ issueIdOrKey: key.toUpperCase() }),
    );
    return this.summarize(issue);
  }

  async addComment(key: string, comment: string): Promise<{ url: string }> {
    const jira = this.requireClient();
    const upper = key.toUpperCase();
    await this.withRetry(() => jira.issueComments.addComment({ issueIdOrKey: upper, body: comment }));
    return { url: this.url(upper) };
  }

  /** Move an issue to a status by name (case-insensitive). */
  async moveIssue(key: string, statusName: string): Promise<JiraIssueSummary> {
    const jira = this.requireClient();
    const upper = key.toUpperCase();
    const [issue, transitions] = await Promise.all([
      this.withRetry(() => jira.issues.getIssue({ issueIdOrKey: upper })),
      this.withRetry(() => jira.issues.getTransitions({ issueIdOrKey: upper })),
    ]);
    const list: any[] = ((transitions as any).transitions ?? []).filter((t: any) => t.to?.name);
    const wanted = statusName.trim().toLowerCase();
    const transition =
      list.find((t) => t.to.name.toLowerCase() === wanted) ??
      list.find((t) => t.to.name.toLowerCase().includes(wanted));
    if (!transition) {
      const options = list.map((t) => t.to.name).join(', ');
      throw new JiraError(
        `No transition to "${statusName}" from ${(issue as any).fields?.status?.name ?? 'current status'}. Available: ${options || 'none'}.`,
      );
    }
    await this.withRetry(() => jira.issues.doTransition({ issueIdOrKey: upper, transition: { id: transition.id } }));
    const after = await this.getIssue(upper);
    return { ...after, status: transition.to.name };
  }
}
