// JPX の上場銘柄一覧（data_j.xlsx / data_e.xlsx）から銘柄名を読む。xlsx は fflate でその場で作る（銘柄名・業種は架空）
import { parseJpx } from '@core/providers/jpx'
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** 文字列のセルだけの最小の xlsx（列は A 日付・B コード・C 銘柄名・D 市場・商品区分・E 業種コード・F 業種区分） */
function xlsx(rows: string[][]): Uint8Array {
  const col = (i: number) => String.fromCharCode(65 + i)
  const sheet = rows
    .map(
      (r, y) =>
        `<row r="${y + 1}">${r.map((v, x) => `<c r="${col(x)}${y + 1}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`).join('')}</row>`,
    )
    .join('')
  return zipSync({
    'xl/worksheets/sheet1.xml': strToU8(`<?xml version="1.0"?><worksheet><sheetData>${sheet}</sheetData></worksheet>`),
  })
}
const HEAD_JA = ['日付', 'コード', '銘柄名', '市場・商品区分', '33業種コード', '33業種区分']
const HEAD_EN = ['Date', 'Local Code', 'Name (English)', 'Section/Products', '33 Sector(Code)', '33 Sector(name)']

const ja = xlsx([
  HEAD_JA,
  ['20261031', '9991', 'ＡＢＣ架空ホールディングス', 'プライム（内国株式）', '5250', '情報・通信業'],
  ['20261031', '9992', '架空第１２３銀行', 'スタンダード（内国株式）', '7050', '銀行業'],
  ['20261031', '9993', 'ｶｸｳ商事', 'グロース（内国株式）', '6050', '卸売業'],
])
const en = xlsx([
  HEAD_EN,
  ['20261031', '9991', 'ABC Fictitious Holdings,Inc.', 'Prime Market (Domestic)', '5250', 'Information & Communication'],
  ['20261031', '9992', 'The Fictitious 123 Bank,Ltd.', 'Standard Market (Domestic)', '7050', 'Banks'],
])

describe('銘柄名の日本語名と英語名（FR-U7）', () => {
  it('日本語名は NFKC で正規化して持つ（全角英数字・半角カナ）', () => {
    const rows = parseJpx(ja, en)
    expect(rows.map((r) => r.nameJa)).toEqual(['ABC架空ホールディングス', '架空第123銀行', 'カクウ商事'])
  })
  it('英語名は英語版の一覧からコードで引く。英語版に無い銘柄は空', () => {
    const rows = parseJpx(ja, en)
    expect(rows.map((r) => [r.code, r.nameEn, r.sectorEn])).toEqual([
      ['9991', 'ABC Fictitious Holdings,Inc.', 'Information & Communication'],
      ['9992', 'The Fictitious 123 Bank,Ltd.', 'Banks'],
      ['9993', '', ''],
    ])
  })
  it('英語版の一覧が取れなくても、日本語名だけで読む', () => {
    const rows = parseJpx(ja)
    expect(rows.map((r) => [r.nameJa, r.nameEn])).toEqual([
      ['ABC架空ホールディングス', ''],
      ['架空第123銀行', ''],
      ['カクウ商事', ''],
    ])
  })
})
