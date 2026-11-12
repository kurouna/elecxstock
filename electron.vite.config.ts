import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'electron-vite'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))
const pkg = JSON.parse(readFileSync(r('package.json'), 'utf8')) as { version: string }
const define = { __APP_VERSION__: JSON.stringify(pkg.version) }

export default defineConfig({
  main: {
    define,
    resolve: { alias: { '@shared': r('src/shared'), '@core': r('src/core') } },
    build: {
      rolldownOptions: {
        input: {
          index: r('src/main/index.ts'),
          // Core は Electron の utilityProcess として fork する（NFR-A1: Electron を import しない）
          core: r('src/core/worker.ts'),
        },
      },
    },
  },
  preload: {
    resolve: { alias: { '@shared': r('src/shared') } },
    build: {
      rolldownOptions: {
        input: { index: r('src/preload/index.ts') },
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: r('src/renderer'),
    define,
    plugins: [svelte({ configFile: r('svelte.config.js') })],
    resolve: { alias: { '@shared': r('src/shared'), '@renderer': r('src/renderer') } },
    build: { target: 'chrome140', rolldownOptions: { input: { index: r('src/renderer/index.html') } } },
  },
})
