import Anthropic from '@anthropic-ai/sdk';
import type { Config } from '../config.js';
import type { HistoryRow } from '../store/db.js';

export type ToolExecutor = (name: string, input: Record<string, any>) => Promise<string>;

export interface RunClaudeOpts {
  cfg: Config;
  client?: Anthropic;
  system: string;
  history: HistoryRow[];
  userContent: string;
  tools: Anthropic.Tool[];
  execute: ToolExecutor;
  maxToolRounds?: number;
}

/**
 * Run a Claude turn with an agentic tool-use loop.
 * Returns the final assistant text.
 */
export async function runClaude(opts: RunClaudeOpts): Promise<string> {
  const client =
    opts.client ?? new Anthropic({ apiKey: opts.cfg.ANTHROPIC_API_KEY });
  const maxRounds = opts.maxToolRounds ?? 5;

  const messages: Anthropic.MessageParam[] = [
    ...opts.history.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: opts.userContent },
  ];

  let rounds = 0;
  while (true) {
    const resp = await client.messages.create({
      model: opts.cfg.ANTHROPIC_MODEL,
      max_tokens: 2048,
      system: opts.system,
      tools: opts.tools.length > 0 ? opts.tools : undefined,
      messages,
    });

    if (resp.stop_reason === 'tool_use') {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of resp.content) {
        if (block.type !== 'tool_use') continue;
        let output: string;
        try {
          output = await opts.execute(block.name, block.input as Record<string, any>);
        } catch (err: any) {
          output = `Error: ${err?.message ?? String(err)}`;
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: output,
        });
      }
      messages.push({ role: 'assistant', content: resp.content });
      messages.push({
        role: 'user',
        content: [...toolResults, ...(rounds >= maxRounds ? [{ type: 'text' as const, text: '(Tool budget reached. Stop calling tools and reply with your final answer.)' }] : [])],
      });
      rounds++;
      if (rounds > maxRounds + 1) {
        return 'Done (stopped after too many tool calls).';
      }
      continue;
    }

    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return text || '(no reply)';
  }
}
