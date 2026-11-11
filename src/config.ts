import { z } from 'zod';

const str = (def: string) => z.string().default(def);

const Env = z.object({
  PORT: z.coerce.number().int().default(3010),
  BOT_NAME: str('Wally'),
  BOT_PREFIX: str('!'),
  OWNER_NUMBER: z.string().regex(/^\d+$/, 'digits only').default(''),
  ALLOWED_NUMBERS: z
    .string()
    .default('')
    .transform((s) => s.split(',').map((n) => n.trim().replace(/\D/g, '')).filter(Boolean)),
  DATA_DIR: str('./data'),
  STALE_AFTER_MIN: z.coerce.number().int().positive().default(2),
  RATE_MAX: z.coerce.number().int().positive().default(10),
  RATE_WINDOW_MS: z.coerce.number().int().positive().default(30_000),
  HISTORY_TURNS: z.coerce.number().int().positive().default(20),

  EVOLUTION_URL: str('http://evolution:3000'),
  EVOLUTION_API_KEY: str(''),
  EVOLUTION_INSTANCE: str('default'),
  EVOLUTION_INSTANCE_TOKEN: str(''),

  /** 1 = expose the local dev chat at /dev (test pipeline without WhatsApp). */
  DEV_CHAT: z.string().default('0').transform((v) => v === '1' || v === 'true'),

  ANTHROPIC_API_KEY: str(''),
  ANTHROPIC_MODEL: str('claude-sonnet-5-5'),

  JIRA_BASE_URL: str(''),
  JIRA_EMAIL: str(''),
  JIRA_API_TOKEN: str(''),
  JIRA_DEFAULT_PROJECT: str(''),
  JIRA_DEFAULT_ISSUE_TYPE: str('Task'),
});

export type Config = z.infer<typeof Env>;

export function loadConfig(): Config {
  const parsed = Env.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment configuration:');
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  return parsed.data;
}
