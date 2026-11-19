// main のファイルの読み書きの結果（Electron に依存しない純関数。単体テストで確かめる。guards.ts と同じ流儀）。
// 取りやめ（ダイアログを閉じた）と失敗（書けない・読めない）を分けて renderer に返し、失敗は renderer が知らせる
import type { OpenFileFailure, SaveFileResult } from '@shared/bridge'

/** 保存・開くダイアログの結果の形（Electron の SaveDialogReturnValue と同じ項目） */
export type Picked = { canceled: boolean; filePath?: string | undefined }

/** 保存ダイアログで選んだ場所へ書く。閉じたら cancelled、書けなかったら（権限・使用中・容量）failed */
export async function saveVia(
  pick: () => Promise<Picked>,
  write: (file: string) => void,
  log: (msg: string) => void,
): Promise<SaveFileResult> {
  const r = await pick()
  if (r.canceled || !r.filePath) return 'cancelled'
  try {
    write(r.filePath)
    return 'saved'
  } catch (err) {
    log(`write ${r.filePath}: ${String(err)}`)
    return 'failed'
  }
}

/** 開くファイルの大きさの上限（バイト） */
export const OPEN_MAX_BYTES = 20_000_000

/** 選んだファイルを読む。大きすぎれば too-large、消えた・権限が無い・ほかのアプリが開いているなら read */
export function readPicked(
  file: string,
  fs: { size: (f: string) => number; read: (f: string) => Buffer },
  log: (msg: string) => void,
): Buffer | OpenFileFailure {
  try {
    if (fs.size(file) > OPEN_MAX_BYTES) return { error: 'too-large' }
    return fs.read(file)
  } catch (err) {
    log(`openFile: ${String(err)}`)
    return { error: 'read' }
  }
}
