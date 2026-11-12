import { fileURLToPath } from 'node:url'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))
export default defineConfig({
  plugins: [svelte({ configFile: r('svelte.config.js') })],
  resolve: { alias: { '@shared': r('src/shared'), '@core': r('src/core'), '@renderer': r('src/renderer') } },
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
})
