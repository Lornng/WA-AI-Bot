import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export interface HistoryRow {
  role: 'user' | 'assistant';
  content: string;
}

export interface GroupSettings {
  enabled: boolean;
  jiraProject?: string;
}

export class Store {
  private db: Database.Database;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.db = new Database(path.join(dataDir, 'bot.db'));
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        sender TEXT,
        sender_name TEXT,
        text TEXT,
        ts INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, ts);

      CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('user','assistant')),
        content TEXT NOT NULL,
        ts INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_history_chat ON history(chat_id, id);

      CREATE TABLE IF NOT EXISTS group_settings (
        chat_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 1,
        jira_project TEXT
      );
    `);
  }

  /** Dedupe: returns true if already processed. */
  seen(messageId: string): boolean {
    return this.db.prepare('SELECT 1 FROM messages WHERE id = ?').get(messageId) !== undefined;
  }

  remember(msg: { id: string; chatId: string; senderId: string; senderName?: string; text: string; timestamp: number }): void {
    this.db
      .prepare('INSERT OR IGNORE INTO messages (id, chat_id, sender, sender_name, text, ts) VALUES (?, ?, ?, ?, ?, ?)')
      .run(msg.id, msg.chatId, msg.senderId, msg.senderName ?? '', msg.text, msg.timestamp);
  }

  /** Recent messages in a chat (newest last), for group context. */
  recentMessages(chatId: string, limit: number): (HistoryRow & { sender?: string; ts?: number })[] {
    const rows = this.db
      .prepare('SELECT sender, sender_name, text, ts FROM messages WHERE chat_id = ? ORDER BY ts DESC, id DESC LIMIT ?')
      .all(chatId, limit) as { sender: string; sender_name: string; text: string; ts: number }[];
    return rows.reverse().map((r) => ({
      role: 'user' as const,
      content: r.text,
      sender: r.sender_name || r.sender,
      ts: r.ts,
    }));
  }

  /** AI conversation history for a chat (newest last). */
  history(chatId: string, limit: number): HistoryRow[] {
    const rows = this.db
      .prepare(
        `SELECT role, content FROM (
           SELECT id, role, content FROM history WHERE chat_id = ? ORDER BY id DESC LIMIT ?
         ) ORDER BY id ASC`,
      )
      .all(chatId, limit) as { role: string; content: string }[];
    return rows.map((r) => ({ role: r.role as 'user' | 'assistant', content: r.content }));
  }

  addHistory(chatId: string, role: 'user' | 'assistant', content: string): void {
    this.db
      .prepare('INSERT INTO history (chat_id, role, content, ts) VALUES (?, ?, ?, ?)')
      .run(chatId, role, content, Date.now());
  }

  clearHistory(chatId: string): number {
    return this.db.prepare('DELETE FROM history WHERE chat_id = ?').run(chatId).changes;
  }

  groupSettings(chatId: string): GroupSettings {
    const row = this.db
      .prepare('SELECT enabled, jira_project FROM group_settings WHERE chat_id = ?')
      .get(chatId) as { enabled: number; jira_project: string | null } | undefined;
    return { enabled: row ? row.enabled === 1 : true, jiraProject: row?.jira_project ?? undefined };
  }

  setGroupEnabled(chatId: string, enabled: boolean): void {
    this.db
      .prepare(
        `INSERT INTO group_settings (chat_id, enabled) VALUES (?, ?)
         ON CONFLICT(chat_id) DO UPDATE SET enabled = excluded.enabled`,
      )
      .run(chatId, enabled ? 1 : 0);
  }

  setGroupJiraProject(chatId: string, project?: string): void {
    this.db
      .prepare(
        `INSERT INTO group_settings (chat_id, jira_project) VALUES (?, ?)
         ON CONFLICT(chat_id) DO UPDATE SET jira_project = excluded.jira_project`,
      )
      .run(chatId, project ?? null);
  }

  close(): void {
    this.db.close();
  }
}
