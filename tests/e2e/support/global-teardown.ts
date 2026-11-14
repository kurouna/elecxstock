import { rmSync } from 'node:fs'
import { RUN_ENV } from './paths'

export default async function globalTeardown(): Promise<void> {
  const run = process.env[RUN_ENV]
  if (!run) return
  try {
    rmSync(run, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  } catch {
    // Windows で閉じきっていないファイルが残っても失敗にしない（一時フォルダ）
  }
}
