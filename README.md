# WA-AI-Bot

A WhatsApp number that does two jobs:

1. **Chat contact** — DM it like a person and get Claude-powered replies with per-chat memory.
2. **Group bot** — add it to a WhatsApp group and call it with `!commands`, `@mentions` or replies to its messages, like a Discord bot.

It integrates with **Jira** from day one (commands + natural language), with the same plug-in pattern ready for Trello, Discord and Google Drive later.

## Architecture

```
WhatsApp ⇄ Evolution API (Docker: Postgres)
              │ webhook MESSAGES_UPSERT          ▲ REST sendText/sendMedia
              ▼                                  │
        Bot service (Node/TS, Fastify)
          ├─ router      DM → AI chat | group → only on !cmd / @mention / reply
          ├─ commands/   !help !ask !reset !jira !bot !project !status !whoami
          ├─ ai/         Claude (tool use → integrations)
          ├─ integrations/  jira (later: trello, discord, gdrive)
          └─ store/      SQLite (history, group settings, dedupe)
```

**Why Evolution API?** It is a self-hosted REST gateway over WhatsApp that supports *both* the free Baileys linked-device mode and Meta's official Cloud API behind one interface, so the bot can start free and move to the official API later without a rewrite.

## ⚠️ Read this first (ban risk)

- **Baileys mode is unofficial.** It is against WhatsApp's terms. Use a **dedicated spare SIM number**, never your personal or business number. Bans are permanent and unappealable. Keep volume low and never message strangers in bulk.
- **Official Cloud API** is ToS-safe and paid. Note that since 15 Jan 2026 Meta bans *general-purpose* AI assistants on it — task-focused bots (Jira helper) are still fine, so on the Cloud API keep the chatbot task-oriented.
- The bot has built-in safety: number allowlist for DMs, owner-only commands, per-group on/off, per-chat rate limits, and it ignores its own messages.

## Setup (Docker, recommended)

Prereqs: Docker + Docker Compose, an Anthropic API key, a spare phone number.

```bash
cp .env.example .env
# edit .env: OWNER_NUMBER (your number, digits only), EVOLUTION_API_KEY (long random),
#           ANTHROPIC_API_KEY, JIRA_* values
docker compose up -d --build
```

1. **Pair the number:** open the Evolution manager at `http://localhost:3000/manager`, log in with `EVOLUTION_API_KEY`. Create the instance `default` (or let the bot create it on startup — it calls `/instance/create` if missing), then scan the QR with the phone holding the spare SIM (WhatsApp → Linked devices).
2. **Webhook:** set the instance webhook to `http://bot:3010/webhook` (already configured via `WEBHOOK_GLOBAL` in docker-compose).
3. Check `http://localhost:3010/health` — `state` should become `"open"`.

Then DM the number "hi" and expect a reply. In a group, try `!help`, `@bot what is up`, or `!jira create Test ticket`.

## Setup (local dev, no Docker)

Run Evolution somewhere (another host or Docker): `docker run -p 3000:3000 evoapicloud/evolution-api:2.3.7` (set `AUTHENTICATION_API_KEY`).

```bash
cp .env.example .env   # EVOLUTION_URL=http://localhost:3000
npm install
npm run dev            # tsx watch src/index.ts
```

Create the instance at `http://localhost:3000/manager` and set its webhook to `http://localhost:3010/webhook`.

## Jira

Create an API token at https://id.atlassian.com/api/tokens (Cloud), then set:

- `JIRA_BASE_URL=https://your-company.atlassian.net`
- `JIRA_EMAIL`, `JIRA_API_TOKEN`
- `JIRA_DEFAULT_PROJECT` (e.g. `WA`)

Per-group default projects: a group admin runs `!project <KEY>`.

## Commands

| Command | Who | What |
|---|---|---|
| `!help` | anyone | list commands |
| `!ask <q>` / `!q <q>` | allowlisted / group members | AI answer (group context in groups) |
| `!reset` | allowlisted / group admin | clear chat memory |
| `!status` | anyone | connection, model, Jira, uptime |
| `!whoami` | anyone | your number as the bot sees it |
| `!jira create <summary>` | anyone | create issue in chat default project |
| `!jira find <text\|KEY>` | anyone | search / look up issues |
| `!jira <KEY>` | anyone | show one issue |
| `!jira comment <KEY> <text>` | anyone | add a comment |
| `!jira move <KEY> <status>` | anyone | change status |
| `!bot on\|off\|status` | group admin / owner | toggle the bot per group |
| `!project <KEY\|off>` | group admin / owner | default Jira project per group |

**Natural language:** Claude has Jira tools, so in a DM or when @mentioned, "log a bug that the booking page is slow" creates the issue and replies with the link.

## Configuration

See `.env.example` for all variables. Key ones:

| Var | Meaning |
|---|---|
| `OWNER_NUMBER` | digits-only number; always allowed, can use owner/admin commands |
| `ALLOWED_NUMBERS` | extra numbers allowed to DM the bot (comma-separated) |
| `BOT_PREFIX` | command prefix (default `!`) |
| `ANTHROPIC_MODEL` | default `claude-sonnet-5-5` |
| `STALE_AFTER_MIN` | ignore messages older than this (reconnect replay safety) |
| `RATE_MAX` / `RATE_WINDOW_MS` | per-(chat, sender) rate limit |
| `HISTORY_TURNS` | how many past AI turns feed each reply |

## Testing

```bash
npm test               # vitest: normalize + router (fake Evolution client)
npm run build          # tsc type-check/build
sh scripts/smoke.sh    # build + boot server + POST a fake webhook (no Evolution needed)
```

### Dev chat — test the bot without a WhatsApp number

With `DEV_CHAT=1` in `.env`, the bot serves a local chat page that runs the exact
same pipeline a WhatsApp DM uses (router, commands, Claude, Jira tools), simulating
a DM from `OWNER_NUMBER`:

```bash
npm run dev            # with DEV_CHAT=1 in .env
# open http://localhost:3010/dev
```

Useful before you have a linked number, and handy afterwards (e.g. `!jira create …`
to test Jira wiring without a phone in hand). Don't expose the port publicly with
`DEV_CHAT=1`.

## Extending (new integrations)

Each integration is three small pieces:

1. `src/integrations/<name>.ts` — an async client class (REST SDK of choice).
2. `src/commands/<name>.ts` — a `Command` registered in `src/commands/index.ts`.
3. `src/ai/tools.ts` (or a parallel file) — Anthropic tool definitions + executor, wired into `src/ai/answer.ts`.

Planned: **Trello** (add/list cards), **Discord** (bridge WA group ⇄ Discord channel), **Google Drive** (search, share links, upload attachments), **Jira webhooks → group** (issue status notifications).

## Project layout

```
docker-compose.yml      # evolution-api + postgres + bot
Dockerfile              # bot image
src/index.ts            # Fastify server: /webhook, /health
src/config.ts           # zod-validated env
src/router.ts           # DM vs group vs command routing, allowlist, rate limit
src/whatsapp/normalize.ts  # Evolution payload → WaMessage
src/whatsapp/client.ts     # thin Evolution REST client
src/ai/answer.ts            # shared AI answer path (DM + group)
src/ai/claude.ts            # Claude tool-use loop
src/ai/tools.ts             # Jira tool definitions + executor
src/commands/               # registry + one file per command
src/integrations/jira.ts    # Jira Cloud client
src/store/db.ts             # SQLite: messages, history, group settings
src/dev-chat.html.ts        # /dev local test page (DEV_CHAT=1)
scripts/smoke.sh            # pipeline smoke test without Evolution
tests/                      # vitest unit tests
```
