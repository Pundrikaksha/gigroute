import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // Tests always run against MockQlooClient + MockLLM, regardless of the developer's shell env.
    env: {
      QLOO_MOCK: '1',
      QLOO_API_KEY: '',
      LLM_API_KEY: '',
    },
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/mocks/server-only.js', import.meta.url)),
    }
  },
})
