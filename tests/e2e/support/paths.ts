// E2E の共通の場所。種の userData・使い捨ての userData はこの実行だけの一時フォルダに置く（実行をまたいで残さない）
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** globalSetup が作り、テストの worker に環境変数で渡す */
export const SEED_ENV = 'ELECXSTOCK_E2E_SEED'
export const RUN_ENV = 'ELECXSTOCK_E2E_RUN'

export const newRunDir = () => join(tmpdir(), `elecxstock-e2e-${process.pid}-${Date.now().toString(36)}`)

export function seedDir(): string {
  const d = process.env[SEED_ENV]
  if (!d) throw new Error(`${SEED_ENV} がありません。npx playwright test から動かしてください（globalSetup が種を作る）`)
  return d
}
export function runDir(): string {
  const d = process.env[RUN_ENV]
  if (!d) throw new Error(`${RUN_ENV} がありません`)
  return d
}
