import { fileURLToPath } from 'node:url'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'

// テストの作り（層・置き場所・きまり）は docs/testing.md。
// unit: 純粋な関数・登録表・画面の純粋なロジック（L1・L2。速い。npm run test:fast）
// int: Core の結合と画面のロジックの結合（L3・L4。初回取得の済んだ種の DB を globalSetup で 1 回だけ作る）
const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))
export default defineConfig({
  plugins: [svelte({ configFile: r('svelte.config.js') })],
  resolve: { alias: { '@shared': r('src/shared'), '@core': r('src/core'), '@renderer': r('src/renderer') } },
  test: {
    environment: 'node',
    setupFiles: ['tests/support/setup.ts'],
    slowTestThreshold: 500,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/{shared,core,registry,renderer,main,news}/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'int',
          include: ['tests/unit/{core-int,renderer-int}/**/*.test.ts'],
          globalSetup: ['tests/support/seed.ts'],
          testTimeout: 30_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/core/**', 'src/shared/**', 'src/renderer/lib/**', 'src/renderer/stores/**'],
      exclude: ['src/core/providers/yahoo.ts', 'src/core/providers/jpx.ts', 'src/core/worker.ts', 'src/core/clock-init.ts'],
    },
  },
})
