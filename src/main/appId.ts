// Windows のアプリの ID（AppUserModelID。タスクバーのまとまり・通知・ショートカットに使う）。純関数（テストは tests/unit/main/app-id.test.ts）
/** インストールした版の ID（electron-builder.yml の appId と同じ。ショートカットにも付く） */
export const APP_ID = 'dev.kurouna.elecxstock'

/**
 * パッケージした版だけ APP_ID を使う。開発・テスト・デモ（node_modules の electron.exe）は別の ID にする。
 * 同じ ID だと、インストールした版とタスクバーで 1 つにまとめられ、名前とアイコンが「Electron」になる
 */
export function appUserModelId(isPackaged: boolean): string {
  return isPackaged ? APP_ID : `${APP_ID}.dev`
}
