import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Router } from '../src/router.js';
import { Store } from '../src/store/db.js';
import { JiraClient } from '../src/integrations/jira.js';
import type { Config } from '../src/config.js';
import type { WaMessage } from '../src/whatsapp/types.js';

const OWNER = '61400000000';
const FRIEND = '61412345678';
const STRANGER = '61499999999';
const GROUP = '120363999999999@g.us';

function makeCfg(over: Partial<Config> = {}): Config {
  return {
    PORT: 0,
    BOT_NAME: 'TestBot',
    BOT_PREFIX: '!',
    OWNER_NUMBER: OWNER,
    ALLOWED_NUMBERS: [FRIEND],
    DATA_DIR: '',
    STALE_AFTER_MIN: 2,
    RATE_MAX: 3,
    RATE_WINDOW_MS: 60_000,
    HISTORY_TURNS: 10,
    EVOLUTION_URL: 'http://localhost:3000',
    EVOLUTION_API_KEY: 'test',
    EVOLUTION_INSTANCE: 'default',
    EVOLUTION_INSTANCE_TOKEN: '',
    ANTHROPIC_API_KEY: 'dummy',
    ANTHROPIC_MODEL: 'test-model',
    JIRA_BASE_URL: '',
    JIRA_EMAIL: '',
    JIRA_API_TOKEN: '',
    JIRA_DEFAULT_PROJECT: '',
    JIRA_DEFAULT_ISSUE_TYPE: 'Task',
    ...over,
  };
}

function makeMsg(over: Partial<WaMessage>): WaMessage {
  return {
    id: Math.random().toString(36).slice(2),
    chatId: `${FRIEND}@c.us`,
    isGroup: false,
    senderId: `${FRIEND}@s.whatsapp.net`,
    senderName: 'Friend',
    text: 'hi',
    messageType: 'conversation',
    mentionsBot: false,
    replyToBot: false,
    fromMe: false,
    timestamp: Date.now(),
    ...over,
  };
}

function fakeWa(sent: { chatId: string; text: string }[]) {
  return {
    sendText: async (chatId: string, text: string) => {
      sent.push({ chatId, text });
      return {};
    },
    setPresence: async () => ({}),
    sendReaction: async () => ({}),
    getGroupMetadata: async () => ({
      participants: [
        { id: `${OWNER}@s.whatsapp.net`, admin: 'admin' },
        { id: `${FRIEND}@s.whatsapp.net`, admin: null },
        { id: '61455555555@s.whatsapp.net', admin: 'admin' },
      ],
    }),
    connectionState: async () => ({ instance: `${OWNER}@s.whatsapp.net`, state: 'open' }),
  } as any;
}

describe('router', () => {
  let dir: string;
  let store: Store;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wabot-test-'));
    store = new Store(dir);
  });

  afterEach(() => {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('answers DMs from allowlisted numbers via the AI', async () => {
    const sent: any[] = [];
    const cfg = makeCfg();
    const answers: string[] = [];
    const router = new Router(cfg, store, async (msg) => {
      answers.push(msg.text);
      return `AI: ${msg.text}`;
    });
    await router.handle(makeMsg({}), { cfg, store, wa: fakeWa(sent), jira: new JiraClient(cfg) });
    expect(answers).toEqual(['hi']);
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toBe('AI: hi');
    expect(sent[0].chatId).toBe(`${FRIEND}@c.us`);
  });

  it('silently ignores DMs from non-allowlisted strangers', async () => {
    const sent: any[] = [];
    const cfg = makeCfg();
    const router = new Router(cfg, store, async () => 'SHOULD NOT BE CALLED');
    await router.handle(
      makeMsg({ chatId: `${STRANGER}@c.us`, senderId: `${STRANGER}@s.whatsapp.net`, text: 'hello stranger' }),
      { cfg, store, wa: fakeWa(sent), jira: new JiraClient(cfg) },
    );
    expect(sent).toHaveLength(0);
  });

  it('always allows the owner in DMs', async () => {
    const sent: any[] = [];
    const cfg = makeCfg();
    const router = new Router(cfg, store, async (m) => `owner:${m.text}`);
    await router.handle(
      makeMsg({ chatId: `${OWNER}@c.us`, senderId: `${OWNER}@s.whatsapp.net`, text: 'hey' }),
      { cfg, store, wa: fakeWa(sent), jira: new JiraClient(cfg) },
    );
    expect(sent.map((s) => s.text)).toEqual(['owner:hey']);
  });

  it('ignores group messages unless mentioned or replied to', async () => {
    const sent: any[] = [];
    const cfg = makeCfg();
    let aiCalls = 0;
    const router = new Router(cfg, store, async () => {
      aiCalls++;
      return 'group answer';
    });
    const deps = { cfg, store, wa: fakeWa(sent), jira: new JiraClient(cfg) };

    await router.handle(makeMsg({ chatId: GROUP, isGroup: true, text: 'normal group chat' }), deps);
    expect(aiCalls).toBe(0);

    await router.handle(
      makeMsg({ chatId: GROUP, isGroup: true, text: '@bot hi', mentionsBot: true }),
      deps,
    );
    expect(aiCalls).toBe(1);

    await router.handle(
      makeMsg({ chatId: GROUP, isGroup: true, text: 'follow up', replyToBot: true }),
      deps,
    );
    expect(aiCalls).toBe(2);
    expect(sent).toHaveLength(2);
  });

  it('runs commands for group members', async () => {
    const sent: any[] = [];
    const cfg = makeCfg();
    const router = new Router(cfg, store, async () => 'nope');
    await router.handle(
      makeMsg({ chatId: GROUP, isGroup: true, text: '!whoami' }),
      { cfg, store, wa: fakeWa(sent), jira: new JiraClient(cfg) },
    );
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain(`+${FRIEND}`);
  });

  it('denies group-admin commands to regular members', async () => {
    const sent: any[] = [];
    const cfg = makeCfg();
    const router = new Router(cfg, store, async () => 'nope');
    await router.handle(
      makeMsg({ chatId: GROUP, isGroup: true, text: '!bot off' }),
      { cfg, store, wa: fakeWa(sent), jira: new JiraClient(cfg) },
    );
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain('admin');
  });

  it('allows group-admin commands for group admins', async () => {
    const sent: any[] = [];
    const cfg = makeCfg();
    const router = new Router(cfg, store, async () => 'nope');
    const admin = '61455555555';
    await router.handle(
      makeMsg({
        chatId: GROUP,
        isGroup: true,
        senderId: `${admin}@s.whatsapp.net`,
        senderName: 'GroupAdmin',
        text: '!bot off',
      }),
      { cfg, store, wa: fakeWa(sent), jira: new JiraClient(cfg) },
    );
    expect(sent[0].text).toContain('disabled');
    // After !bot off, non-owner members are ignored
    const sent2: any[] = [];
    const router2 = new Router(cfg, store, async () => 'nope');
    await router2.handle(
      makeMsg({ chatId: GROUP, isGroup: true, text: '!whoami' }),
      { cfg, store, wa: fakeWa(sent2), jira: new JiraClient(cfg) },
    );
    expect(sent2).toHaveLength(0);
  });

  it('owner bypasses a disabled group', async () => {
    const sent: any[] = [];
    const cfg = makeCfg();
    const router = new Router(cfg, store, async () => 'nope');
    store.setGroupEnabled(GROUP, false);
    await router.handle(
      makeMsg({
        chatId: GROUP,
        isGroup: true,
        senderId: `${OWNER}@s.whatsapp.net`,
        senderName: 'Owner',
        text: '!whoami',
      }),
      { cfg, store, wa: fakeWa(sent), jira: new JiraClient(cfg) },
    );
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain('owner');
  });

  it('ignores the bot\'s own messages', async () => {
    const sent: any[] = [];
    const cfg = makeCfg();
    const router = new Router(cfg, store, async () => 'nope');
    await router.handle(
      makeMsg({ fromMe: true, text: 'my own message' }),
      { cfg, store, wa: fakeWa(sent), jira: new JiraClient(cfg) },
    );
    expect(sent).toHaveLength(0);
  });

  it('dedupes by message id', async () => {
    const sent: any[] = [];
    const cfg = makeCfg();
    const router = new Router(cfg, store, async (m) => `AI:${m.text}`);
    const msg = makeMsg({ id: 'SAME-ID' });
    const deps = { cfg, store, wa: fakeWa(sent), jira: new JiraClient(cfg) };
    await router.handle(msg, deps);
    await router.handle({ ...msg }, deps);
    expect(sent).toHaveLength(1);
  });

  it('rate limits a sender per chat', async () => {
    const sent: any[] = [];
    const cfg = makeCfg({ RATE_MAX: 3 });
    const router = new Router(cfg, store, async (m) => `AI:${m.text}`);
    const deps = { cfg, store, wa: fakeWa(sent), jira: new JiraClient(cfg) };
    for (let i = 0; i < 5; i++) {
      await router.handle(makeMsg({ id: `RL-${i}`, text: `msg ${i}` }), deps);
    }
    expect(sent).toHaveLength(3);
  });
});
