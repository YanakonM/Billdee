import { defineConfig } from 'vitest/config';

// Unit tests live next to the code in src/. The e2e/ folder is Playwright's
// (also *.spec.js) — exclude it so `vitest run` doesn't try to execute it.
export default defineConfig({
  test: {
    include: ['src/**/*.test.js'],
    environment: 'node',
  },
});
