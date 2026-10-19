import { z } from 'zod';

/**
 * The environment contract. Anything the API needs from the outside world is
 * declared here, once. `ConfigModule` runs this at boot, so a bad or missing
 * value stops the process before it can serve a single request.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.url(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Passed to `ConfigModule.forRoot({ validate })`.
 * `safeParse` (instead of `parse`) lets us add a clear, multi-line message.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    throw new Error(
      `Invalid environment configuration:\n${z.prettifyError(result.error)}`,
    );
  }

  return result.data;
}
