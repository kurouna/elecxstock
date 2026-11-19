// main のファイルの読み書きの結果（src/main/fileIo.ts）: 取りやめと失敗を分けて返す
import { describe, expect, it } from 'vitest'
import { OPEN_MAX_BYTES, readPicked, saveVia } from '../../../src/main/fileIo'

const logs: string[] = []
const log = (m: string) => void logs.push(m)

describe('ファイルの保存の結果（FR-S3, FR-S12, FR-H8, FR-C11）', () => {
  it('書けたら saved、ダイアログを閉じたら cancelled（書かない）、書けなかったら failed（ログに残す）', async () => {
    const wrote: string[] = []
    const write = (f: string) => void wrote.push(f)
    expect(await saveVia(async () => ({ canceled: false, filePath: 'C:/x/a.json' }), write, log)).toBe('saved')
    expect(await saveVia(async () => ({ canceled: true, filePath: '' }), write, log)).toBe('cancelled')
    expect(await saveVia(async () => ({ canceled: false }), write, log)).toBe('cancelled')
    expect(wrote).toEqual(['C:/x/a.json'])
    const denied = () => {
      throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' })
    }
    expect(await saveVia(async () => ({ canceled: false, filePath: 'C:/ro/a.json' }), denied, log)).toBe('failed')
    expect(logs.at(-1)).toMatch(/C:\/ro\/a\.json.*EACCES/)
  })
})

describe('ファイルを開いた結果（FR-S12, FR-H9）', () => {
  const buf = Buffer.from('{}')
  it('読めたら中身、上限を超えたら too-large、読めなければ read（選ばなかったのと同じにしない）', () => {
    expect(readPicked('a', { size: () => 2, read: () => buf }, log)).toBe(buf)
    expect(readPicked('a', { size: () => OPEN_MAX_BYTES, read: () => buf }, log)).toBe(buf)
    expect(readPicked('a', { size: () => OPEN_MAX_BYTES + 1, read: () => buf }, log)).toEqual({ error: 'too-large' })
    const gone = () => {
      throw new Error('ENOENT')
    }
    expect(readPicked('a', { size: gone, read: () => buf }, log)).toEqual({ error: 'read' })
    expect(readPicked('a', { size: () => 2, read: gone }, log)).toEqual({ error: 'read' })
  })
})
