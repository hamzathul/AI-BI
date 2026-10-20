import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // The e2e suite shares one app database. Running files in parallel lets
    // one test's RUNNING sync row or metadata snapshot race another's.
    fileParallelism: false,
  },
});
