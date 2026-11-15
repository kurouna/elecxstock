// スクリーナーの項目の一覧（docs/screener-fields.md）を、指標の登録表から作る（純粋な関数）。
// 作るのは scripts/gen-fields-doc.mjs、文書が登録表と合っているかは tests/unit/registry/fields-doc.test.ts が確かめる
// 表のセルの中の | は \| にする
const esc = (s) => String(s ?? '').replaceAll('|', String.raw`\|`)
const OPS = { '>=': '≥', '<=': '≤', '=': '=', in: '∈', notin: '∉' }

/** @param {{ FIELDS: any[], FIELD_GROUPS: any[], usable: (f: any) => boolean, refFields: (f: any) => any[] }} reg */
export function fieldsDoc(reg) {
  const { FIELDS, FIELD_GROUPS, usable, refFields } = reg
  const fields = FIELDS.filter((f) => usable(f))
  const out = [
    '# スクリーナーの項目 / Screener fields',
    '',
    '<!-- このファイルは npm run gen:fields-doc が指標の登録表（src/shared/fields.ts）から作る。手で直さない -->',
    '',
    `スクリーナーとアラートの条件に使える項目の一覧です（${fields.length} 項目）。スクリーナーの「＋ 条件を追加」（Insert）で、分類ごとに並んだダイアログから選び、打って絞り込めます。値はすべて手元に取り込んだデータから計算します。`,
    '',
    `The fields you can use in screener and alert conditions (${fields.length} fields). Press Insert ("+ Add condition") in the screener to pick one from a dialog grouped by category, and type to filter. All values are computed from the data stored on your PC.`,
    '',
    '- 単位: 金額は表示の単位で打ちます（1 株あたりは円、最低投資金額は万円、時価総額・売買代金は億円）。「30万」「1.5億」のように単位を付けても読みます。/ Units: type money in the display unit (yen per share, 10k yen for minimum investment, 100M yen for market cap and turnover); suffixes such as 30万 or 1.5億 also work.',
    '- 相対条件: 同じ種類の項目どうしで比べられます（例: 終値 ≥ 75日移動平均 +5%）。/ Relative conditions compare fields of the same kind (e.g. Last ≥ MA75 + 5%).',
    '- 欠損: 値の無い銘柄を含めるかを条件ごとに選べます（市場データと実行時に計算する項目）。/ For market-data and computed fields you can choose per condition whether to include symbols without a value.',
    '- 保有の項目（保有している・損益率・保有割合・業種の保有割合・取得利回り）は、保有の記録があるときだけダイアログに出ます。/ Holdings fields (held, P/L, weight, sector weight, yield on cost) appear in the dialog only when you have holdings.',
    '',
  ]
  for (const g of FIELD_GROUPS) {
    const fs = fields.filter((f) => f.group === g.id)
    if (!fs.length) continue
    out.push(
      `## ${g.label.ja} / ${g.label.en}`,
      '',
      '| 項目 / Field | 単位 / Unit | 比べ方 / Ops | 相対条件の相手 / Compare with | 説明 / Description |',
      '| --- | --- | --- | --- | --- |',
    )
    for (const f of fs) {
      const unit = f.unit ? `${f.unit.ja} / ${f.unit.en}` : f.type === 'percent' ? '%' : ''
      const ops = f.operators.map((o) => OPS[o] ?? o).join(' ')
      const refs = refFields(f)
        .map((r) => r.label.ja)
        .join('、')
      const desc = f.description ? `${esc(f.description.ja)}<br>${esc(f.description.en)}` : ''
      out.push(`| ${esc(f.label.ja)}<br>${esc(f.label.en)} | ${esc(unit)} | ${ops} | ${esc(refs)} | ${desc} |`)
    }
    out.push('')
  }
  return `${out.join('\n').trimEnd()}\n`
}
