import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/firestore.rules.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
