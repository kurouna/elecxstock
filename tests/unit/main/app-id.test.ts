// Windows のアプリの ID（AppUserModelID）。インストールした版と、開発・テスト・デモ（node_modules の electron.exe）を分ける
// （同じ ID だとタスクバーで 1 つにまとめられ、名前とアイコンが「Electron」になる）
import { describe, expect, it } from 'vitest'
import { APP_ID, appUserModelId } from '../../../src/main/appId'

describe('アプリの ID（NFR-Q9）', () => {
  it('インストールした版は electron-builder の appId と同じ、開発・テストでは別の ID', () => {
    expect(appUserModelId(true)).toBe(APP_ID)
    expect(appUserModelId(false)).not.toBe(APP_ID)
  })
  it('APP_ID は electron-builder.yml の appId と同じ（ショートカットの ID と合わないとタスクバーで別のアプリになる）', async () => {
    const { readFileSync } = await import('node:fs')
    expect(readFileSync('electron-builder.yml', 'utf8')).toContain(`appId: ${APP_ID}`)
  })
})
