import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))
export default defineConfig({
  resolve: { alias: { '@shared': r('src/shared'), '@core': r('src/core') } },
  test: { include: ['tests/contract/**/*.test.ts'], environment: 'node' },
})
