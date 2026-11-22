// elecxstock UI mock — 画面デザインの検討用。データはすべて架空（mock-data.js）。
'use strict'
const LW = window.LightweightCharts
const M = window.MOCK

// ---------------------------------------------------------------- i18n (FR-N1〜N3)
const DICT = {
  ja: {
    cmdPh: '銘柄・コマンドを検索（1〜9 を打つと銘柄ジャンプ）', open: '取引終了', layouts: ['MTF', 'グリッド', 'スクリーナー', 'インカム'],
    watchlist: 'ウォッチリスト', chart: 'チャート', info: '銘柄情報', screener: 'スクリーナー', grid: 'チャートグリッド', src: '対象', srcScreen: 'スクリーナー結果', period: '期間', periods: ['3か月', '6か月', '1年', '2年', '5年', '全期間'], scale: '表示', scales: ['通常', '対数', '比較%'], ma: 'MA', sortBy: '並べ替え', sorts: { ret: '期間騰落率', yld: '利回り', maDev: '75日線乖離', fromHi: '高値から', turnover: '売買代金' }, candOnly: '◆のみ', toList: '◆をリストへ', candOn: '売買候補に追加', candOff: '売買候補から外しました', drawerPin: 'ピン留め', srcOwn: 'このグリッドの銘柄', resetSizes: 'サイズを戻す', sizesReset: 'サイズを元に戻しました', undo: '元に戻す', undone: '元に戻しました', layoutReset: 'レイアウトを初期状態に戻しました', pinned: '今の銘柄をこのグリッドに固定しました', addedGrid: 'このグリッドに追加', removedGrid: 'このグリッドから外しました', confirmLayoutTitle: 'レイアウトを初期状態に戻しますか？', confirmLayoutBody: 'ペインの並び・区切り線・ドロワー・グリッドの銘柄と設定が、プリセットの初期状態に戻ります。', doReset: '初期状態に戻す', drawerHint: 'Ctrl+B で開く', divcal: '配当カレンダー',
    starOnly: '★のみ', items: '銘柄', code: 'コード', name: '銘柄名', price: '終値', chg: '前日比', yld: '利回り', turnover: '売買代金', per: 'PER', pbr: 'PBR', pbrBook: 'PBR(簿価)', mkt: '区分', r1y: '1年',
    mktName: { P: 'プライム', G: 'グロース', S: 'スタンダード', R: 'REIT', E: 'ETF' },
    yldTrail: '実績利回り', yldNote: '実績 = 過去12か月の配当 ÷ 終値（基準日 2026/11/12・ローカル配当履歴から計算）', divHist: '配当・分配金の履歴', mcap: '時価総額', hi52: '52週高値', lo52: '52週安値', fromHi: '高値から', maDev: '75日線乖離', sector: '業種', exDate: '権利落ち日', perShare: '1株あたり', perUnit: '1口あたり',
    jobs: 'ジョブ', idle: '待機', updating: '更新中', lastUpd: '最終更新', source: 'データ: Yahoo Finance（非公式・遅延あり）', mock: 'MOCK DATA — 価格・配当は架空', notAdvice: '投資助言ではありません', help: 'ショートカット',
    conds: '条件', and: 'かつ', any: 'どちらでも', hits: '件', run: '実行', sort: '並べ替え', cndFav: 'お気に入り', cndMkt: '市場区分', cndYld: '実績利回り', cndTurn: '売買代金(20日平均)',
    actions: 'アクション', symbols: '銘柄', toEnter: 'Enter で実行', toMove: '↑↓ 移動', toClose: 'Esc 閉じる', jump: '銘柄ジャンプ', jumpHint: 'Enter でリンクグループに送る',
    settings: '設定', general: '一般', display: '表示', data: 'データ', keys: 'キー', language: '言語', density: '行の高さ', normal: '標準', compact: '詰める', candle: 'ローソク足の色', jpStyle: '日本式（陽線 赤・陰線 青）', usStyle: '欧米式（陽線 緑・陰線 赤）', theme: 'テーマ', dark: 'ダーク', retention: '日足の保存期間', years: '年',
    dbSize: 'DB の容量', symbolsN: '銘柄数', period: '期間', failures: '取得失敗', clearAll: '全データを削除して取り直す', clearSome: '銘柄を指定して取り直す', dataNote: 'お気に入り・ウォッチリスト・レイアウト・設定は削除しません。',
    confirmTitle: '全データを削除して取り直しますか？', confirmItems: ['日足・月次系列・配当・分割・指標（約 152MB）', '2,091 銘柄を初回と同じく取り直します（約 18 分）', '取り直し中も、取得済みの銘柄から順に使えます'], keepDelisted: '上場廃止銘柄のデータは残す（Yahoo から取り直せません）', cancel: 'キャンセル', doClear: '削除して取り直す',
    added: 'ウォッチリスト「監視」に追加しました', favOn: 'お気に入りに追加', favOff: 'お気に入りから外しました', removed: 'リストから外しました', cleared: '全データを削除しました。取り直しを開始します', linkSet: 'リンク', log: '対数軸', adj: '価格の調整', adjModes: ['分割調整済み', '未調整', '配当込み'], ind: '指標メニュー（モックでは未実装）', page: 'ページ',
    month: (m) => `${m}月`, all: 'すべて',
  },
  en: {
    cmdPh: 'Search symbols & commands (type digits to jump)', open: 'Closed', layouts: ['MTF', 'Grid', 'Screener', 'Income'],
    watchlist: 'Watchlist', chart: 'Chart', info: 'Symbol Info', screener: 'Screener', grid: 'Chart Grid', src: 'Source', srcScreen: 'Screener results', period: 'Period', periods: ['3M', '6M', '1Y', '2Y', '5Y', 'All'], scale: 'Scale', scales: ['Linear', 'Log', 'Compare %'], ma: 'MA', sortBy: 'Sort', sorts: { ret: 'Period return', yld: 'Yield', maDev: 'vs 75D MA', fromHi: 'From high', turnover: 'Turnover' }, candOnly: '◆ only', toList: '◆ to list', candOn: 'Added to candidates', candOff: 'Removed from candidates', drawerPin: 'Pin', srcOwn: 'This grid’s symbols', resetSizes: 'Reset sizes', sizesReset: 'Pane sizes reset', undo: 'Undo', undone: 'Undone', layoutReset: 'Layout reset to preset', pinned: 'Pinned current symbols to this grid', addedGrid: 'Added to this grid', removedGrid: 'Removed from this grid', confirmLayoutTitle: 'Reset this layout to its preset?', confirmLayoutBody: 'Panes, dividers, drawers and the grid’s symbols and settings return to the preset.', doReset: 'Reset layout', drawerHint: 'Ctrl+B to open', divcal: 'Dividend Calendar',
    starOnly: '★ only', items: 'items', code: 'Code', name: 'Name', price: 'Last', chg: 'Chg', yld: 'Yield', turnover: 'Turnover', per: 'P/E', pbr: 'P/B', pbrBook: 'P/B (book)', mkt: 'Mkt', r1y: '1Y',
    mktName: { P: 'Prime', G: 'Growth', S: 'Standard', R: 'REIT', E: 'ETF' },
    yldTrail: 'Trailing yield', yldNote: 'Trailing = dividends of the past 12 months ÷ last (as of Nov 12, 2026, computed from local history)', divHist: 'Dividend / distribution history', mcap: 'Market cap', hi52: '52W high', lo52: '52W low', fromHi: 'From high', maDev: 'vs 75D MA', sector: 'Sector', exDate: 'Ex-date', perShare: 'Per share', perUnit: 'Per unit',
    jobs: 'Jobs', idle: 'Idle', updating: 'Updating', lastUpd: 'Updated', source: 'Data: Yahoo Finance (unofficial, delayed)', mock: 'MOCK DATA — prices are fictitious', notAdvice: 'Not investment advice', help: 'Shortcuts',
    conds: 'Conditions', and: 'AND', any: 'Any', hits: 'hits', run: 'Run', sort: 'Sort', cndFav: 'Favorite', cndMkt: 'Market', cndYld: 'Trailing yield', cndTurn: 'Turnover (20D avg)',
    actions: 'Actions', symbols: 'Symbols', toEnter: 'Enter to run', toMove: '↑↓ move', toClose: 'Esc close', jump: 'Symbol jump', jumpHint: 'Enter sends to the link group',
    settings: 'Settings', general: 'General', display: 'Display', data: 'Data', keys: 'Keys', language: 'Language', density: 'Row height', normal: 'Normal', compact: 'Compact', candle: 'Candle colors', jpStyle: 'Japanese (up red, down blue)', usStyle: 'Western (up green, down red)', theme: 'Theme', dark: 'Dark', retention: 'Daily history', years: 'years',
    dbSize: 'Database size', symbolsN: 'Symbols', period: 'Period', failures: 'Fetch failures', clearAll: 'Delete all data and refetch', clearSome: 'Refetch selected symbols', dataNote: 'Favorites, watchlists, layouts and settings are kept.',
    confirmTitle: 'Delete all market data and refetch?', confirmItems: ['Daily, monthly, dividends, splits, metrics (about 152 MB)', 'Refetches 2,091 symbols like the first run (about 18 min)', 'Symbols become usable as soon as each is fetched'], keepDelisted: 'Keep data of delisted symbols (Yahoo no longer has it)', cancel: 'Cancel', doClear: 'Delete and refetch',
    added: 'Added to watchlist "Watch"', favOn: 'Added to favorites', favOff: 'Removed from favorites', removed: 'Removed from list', cleared: 'All data deleted. Refetching…', linkSet: 'Link', log: 'Log scale', adj: 'Price adjustment', adjModes: ['Split-adjusted', 'Unadjusted', 'Total return'], ind: 'Indicators (not in mock)', page: 'Page',
    month: (m) => new Date(2026, m - 1, 1).toLocaleString('en', { month: 'short' }), all: 'All',
  },
}
const S = {
  lang: 'ja', colors: 'jp', density: 'normal', layout: 0, focus: null, maximized: null, overlay: null,
  links: { 1: '7203', 2: '8951', 3: '2914', 4: '8306', 5: '3462' },
  favs: new Set(M.watchlists[0].codes), lists: M.watchlists, adj: 0,
}
const T = (k) => DICT[S.lang][k]
const nameOf = (c) => (S.lang === 'ja' ? M.byCode[c].ja : M.byCode[c].en)
const loc = () => (S.lang === 'ja' ? 'ja-JP' : 'en-US')
const fmtPx = (v) => v == null ? '—' : v.toLocaleString(loc(), { minimumFractionDigits: v < 1000 ? 1 : 0, maximumFractionDigits: v < 1000 ? 1 : 0 })
const fmt = (v, d = 2) => v == null || Number.isNaN(v) ? '—' : v.toLocaleString(loc(), { minimumFractionDigits: d, maximumFractionDigits: d })
const sgn = (v, d = 2, suf = '') => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toLocaleString(loc(), { minimumFractionDigits: d, maximumFractionDigits: d }) + suf
const cls = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : 'flat')
function big(v) {
  if (S.lang === 'ja') {
    if (v >= 1e12) return `${fmt(v / 1e12, 2)}<span class="unit">兆</span>`
    return `${fmt(v / 1e8, v >= 1e10 ? 0 : 1)}<span class="unit">億</span>`
  }
  if (v >= 1e12) return `¥${fmt(v / 1e12, 2)}<span class="unit">T</span>`
  return `¥${fmt(v / 1e9, 1)}<span class="unit">B</span>`
}
const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim()
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const metricsCache = new Map()
const MET = (c) => metricsCache.get(c) ?? (metricsCache.set(c, M.metrics(c)), metricsCache.get(c))

// ---------------------------------------------------------------- layouts（木構造。FR-L1, L5）
let uid = 0
const P = (type, o = {}) => ({ id: `p${++uid}`, type, link: 1, ...o })
const R = (sizes, ...children) => ({ dir: 'row', sizes, children })
const C = (sizes, ...children) => ({ dir: 'col', sizes, children })
const LAYOUTS = [
  { root: R([24, 76], P('watchlist', { list: 'fav' }), C([62, 38], P('chart', { tf: 'D' }), R([50, 50], P('chart', { tf: 'W' }), P('chart', { tf: 'M' })))) },
  { root: P('grid', { src: 'live' }), docks: { left: { panes: [P('watchlist', { list: 'fav' }), P('screener')], active: 1, pinned: false, open: false, width: 660 } } },
  { root: R([46, 54], P('screener'), C([58, 42], R([62, 38], P('chart', { tf: 'D' }), P('chart', { tf: 'W' })), P('info'))) },
  { root: R([48, 52], C([45, 55], P('watchlist', { list: 'hd', link: 3 }), P('divcal', { link: 3 })), C([55, 45], P('chart', { tf: 'M', link: 3 }), P('info', { link: 3 }))) },
]
const PRESETS = JSON.parse(JSON.stringify(LAYOUTS))          // プリセットの初期値（FR-L9, L10）
const STORE = 'elecxstock.mock.layouts.v1'
if (/fresh=1/.test(location.hash)) localStorage.removeItem(STORE)
try { const saved = JSON.parse(localStorage.getItem(STORE) ?? 'null'); if (Array.isArray(saved) && saved.length === LAYOUTS.length) saved.forEach((l, i) => { LAYOUTS[i] = l; if (l.docks?.left) l.docks.left.open = l.docks.left.pinned }) } catch {}
let saveTimer
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(() => localStorage.setItem(STORE, JSON.stringify(LAYOUTS)), 300) }   // 今のレイアウトの自動保存（FR-L4, G11）
addEventListener('beforeunload', () => localStorage.setItem(STORE, JSON.stringify(LAYOUTS)))
const mounted = new Map() // pane id -> {pane, el, api}

function renderLayoutTabs() {
  const nav = document.getElementById('layouts')
  nav.innerHTML = T('layouts').map((n, i) => `<button type="button" data-i="${i}" aria-current="${i === S.layout}"><span>${n}</span><kbd>Ctrl+Shift+${i + 1}</kbd></button>`).join('')
  nav.querySelectorAll('button').forEach((b) => (b.onclick = () => switchLayout(+b.dataset.i)))
}
function switchLayout(i) {
  S.layout = i; S.maximized = null
  build()
}
function build() {
  dockEl = null; clearTimeout(dockTimer)
  for (const m of mounted.values()) m.api.destroy?.()
  mounted.clear()
  const ws = document.getElementById('workspace'); ws.innerHTML = ''
  const L = LAYOUTS[S.layout]
  if (L.docks?.left) ws.appendChild(buildDock(L.docks.left))
  const main = document.createElement('div'); main.className = 'ws-main'; main.appendChild(buildNode(L.root)); ws.appendChild(main)
  main.addEventListener('mousedown', () => { const d = LAYOUTS[S.layout].docks?.left; if (d?.open && !d.pinned) closeDock() })
  const first = [...mounted.values()].find((m) => !m.inDock) ?? [...mounted.values()][0]
  setFocus(S.focus && mounted.has(S.focus) ? S.focus : first.pane.id)
  renderLayoutTabs(); renderStatus(); scheduleSave()
}
function buildNode(node, parent = null, index = 0) {
  if (node.type) { paneParent.set(node.id, { parent, index }); return buildPane(node) }
  const el = document.createElement('div'); el.className = `split ${node.dir}`
  const kids = node.children.map((ch, i) => buildNode(ch, node, i))
  const apply = () => kids.forEach((k, i) => (k.style.flex = `${node.sizes[i]} 1 0`))
  node.apply = apply
  kids.forEach((k, i) => {
    el.appendChild(k)
    if (i < kids.length - 1) {
      const g = document.createElement('div'); g.className = 'gutter'; g.title = S.lang === 'ja' ? 'ドラッグで大きさを変える・ダブルクリックで等分' : 'Drag to resize, double-click to even'
      g.addEventListener('mousedown', (e) => {
        e.preventDefault(); g.classList.add('drag'); document.body.classList.add(node.dir === 'row' ? 'resizing-x' : 'resizing-y')
        const rect = el.getBoundingClientRect(), total = node.sizes[i] + node.sizes[i + 1]
        const a0 = kids[i].getBoundingClientRect(), b0 = kids[i + 1].getBoundingClientRect()
        const start = node.dir === 'row' ? a0.left : a0.top, span = node.dir === 'row' ? b0.right - a0.left : b0.bottom - a0.top
        const move = (ev) => {
          const pos = (node.dir === 'row' ? ev.clientX : ev.clientY) - start
          const r = Math.max(0.08, Math.min(0.92, pos / span))
          node.sizes[i] = total * r; node.sizes[i + 1] = total * (1 - r); apply()
        }
        const up = () => { removeEventListener('mousemove', move); removeEventListener('mouseup', up); g.classList.remove('drag'); document.body.classList.remove('resizing-x', 'resizing-y'); scheduleSave(); relayout() }
        addEventListener('mousemove', move); addEventListener('mouseup', up)
      })
      g.addEventListener('dblclick', () => { const t = node.sizes[i] + node.sizes[i + 1]; node.sizes[i] = node.sizes[i + 1] = t / 2; apply(); scheduleSave(); relayout() })
      el.appendChild(g)
    }
  })
  apply()
  return el
}
const paneParent = new Map()
function relayout() { for (const m of mounted.values()) m.api.resize?.() }
function eachSplit(node, f) { if (node.children) { f(node); node.children.forEach((c) => eachSplit(c, f)) } }
function sizesOf(layout) { const out = []; eachSplit(layout.root, (n) => out.push([...n.sizes])); return { splits: out, dock: layout.docks?.left?.width } }
function setSizes(layout, snap) { let k = 0; eachSplit(layout.root, (n) => { n.sizes = [...snap.splits[k++]]; n.apply?.() }); if (layout.docks?.left && snap.dock) { layout.docks.left.width = snap.dock; const p = document.querySelector('.dock-panel'); if (p) p.style.width = snap.dock + 'px' } scheduleSave(); relayout() }
let undoSnap = null, undoTimer
function resetSizes() {
  const L = LAYOUTS[S.layout], P0 = PRESETS[S.layout]
  undoSnap = { layout: S.layout, snap: sizesOf(L) }
  setSizes(L, sizesOf(P0))
  toastAction(T('sizesReset'), T('undo') + ' (Ctrl+Z)', undoReset)
  clearTimeout(undoTimer); undoTimer = setTimeout(() => (undoSnap = null), 10000)
}
function undoReset() { if (!undoSnap || undoSnap.layout !== S.layout) return false; setSizes(LAYOUTS[S.layout], undoSnap.snap); undoSnap = null; document.querySelector('.toast')?.remove(); toast(T('undone')); return true }
function nudgeDivider(dir) {   // Alt+Shift+矢印（§6.5.2）
  const info = paneParent.get(S.focus); if (!info?.parent) return
  let { parent, index } = info
  const want = dir === 'left' || dir === 'right' ? 'row' : 'col'
  if (parent.dir !== want) return
  const grow = dir === 'right' || dir === 'down'
  const j = index < parent.children.length - 1 ? index + 1 : index - 1
  const d = (parent.sizes[index] + parent.sizes[j]) * 0.03 * (grow === (j > index) ? 1 : -1)
  if (parent.sizes[index] + d < 5 || parent.sizes[j] - d < 5) return
  parent.sizes[index] += d; parent.sizes[j] -= d; parent.apply(); scheduleSave(); relayout()
}
function confirmLayoutReset() {
  const root = overlay(`<div class="scrim"><div class="dialog confirm" role="alertdialog"><h3>${T('confirmLayoutTitle')}</h3><p class="dim">${T('confirmLayoutBody')}</p><div class="actions" style="justify-content:flex-end"><button type="button" class="btn" data-x="no">${T('cancel')}</button><button type="button" class="btn danger" data-x="yes">${T('doReset')}</button></div></div></div>`, 'confirm')
  root.querySelector('[data-x="no"]').onclick = closeOverlay
  root.querySelector('[data-x="yes"]').onclick = () => { closeOverlay(); LAYOUTS[S.layout] = JSON.parse(JSON.stringify(PRESETS[S.layout])); S.focus = null; build(); toast(T('layoutReset')) }
  root.querySelector('[data-x="no"]').focus()
}
const TITLES = { watchlist: 'watchlist', chart: 'chart', info: 'info', screener: 'screener', grid: 'grid', divcal: 'divcal' }
// ---------------------------------------------------------------- drawer（§6.12）
let dockEl = null, dockTimer = null
function buildDock(dock) {
  const wrap = document.createElement('div'); wrap.className = 'dock' + (dock.pinned ? ' pinned' : '') + (dock.open ? ' open' : '')
  wrap.innerHTML = `<div class="dock-rail" tabindex="0" title="${T('drawerHint')}"></div><div class="dock-panel" style="width:${dock.width}px"><div class="dock-tabs"></div><div class="dock-body"></div></div>`
  const rail = wrap.querySelector('.dock-rail'), body = wrap.querySelector('.dock-body')
  rail.innerHTML = dock.panes.map((p, i) => `<button type="button" data-i="${i}" class="${i === dock.active ? 'on' : ''}"><span>${T(TITLES[p.type])}</span></button>`).join('') + `<span class="rail-key">Ctrl+B</span>`
  rail.querySelectorAll('button').forEach((b) => (b.onclick = () => { dock.active = +b.dataset.i; openDock(true) }))
  dock.panes.forEach((p, i) => { const el = buildPane(p); mounted.get(p.id).inDock = true; el.classList.add('in-dock'); el.hidden = i !== dock.active; body.appendChild(el) })
  function tabs() {
    wrap.querySelector('.dock-tabs').innerHTML = dock.panes.map((p, i) => `<button type="button" data-i="${i}" aria-selected="${i === dock.active}">${T(TITLES[p.type])}</button>`).join('') + `<span class="spacer"></span><button type="button" class="pin ${dock.pinned ? 'on' : ''}" title="Ctrl+Alt+B">⊿ ${T('drawerPin')}</button>`
    wrap.querySelectorAll('.dock-tabs [data-i]').forEach((b) => (b.onclick = () => { dock.active = +b.dataset.i; showActive(); setFocus(dock.panes[dock.active].id) }))
    wrap.querySelector('.dock-tabs .pin').onclick = () => pinDock()
  }
  function showActive() { dock.panes.forEach((p, i) => (mounted.get(p.id).el.hidden = i !== dock.active)); rail.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.i === dock.active)); tabs(); mounted.get(dock.panes[dock.active].id).api.update() }
  tabs()
  rail.addEventListener('mouseenter', () => { clearTimeout(dockTimer); dockTimer = setTimeout(() => openDock(false), 200) })
  rail.addEventListener('mouseleave', () => clearTimeout(dockTimer))
  wrap.querySelector('.dock-panel').addEventListener('mouseleave', () => { if (!dock.pinned && !wrap.contains(document.activeElement)) { clearTimeout(dockTimer); dockTimer = setTimeout(() => closeDock(false), 300) } })
  wrap.querySelector('.dock-panel').addEventListener('mouseenter', () => clearTimeout(dockTimer))
  rail.addEventListener('keydown', (e) => { const p = mounted.get(dock.panes[dock.active].id); if (p.api.key?.(e)) { e.preventDefault(); e.stopPropagation() } })
  dockEl = { wrap, dock, showActive, rail }
  return wrap
}
function openDock(focus = true) {
  const d = dockEl; if (!d) return
  d.dock.open = true; d.wrap.classList.add('open'); d.showActive()
  if (focus) { S.prevFocus = mounted.get(S.focus)?.inDock ? S.prevFocus : S.focus; setFocus(d.dock.panes[d.dock.active].id) }
}
function closeDock(restore = true) {
  const d = dockEl; if (!d || d.dock.pinned) return
  d.dock.open = false; d.wrap.classList.remove('open')
  if (restore && mounted.get(S.focus)?.inDock) setFocus(S.prevFocus && mounted.has(S.prevFocus) ? S.prevFocus : [...mounted.values()].find((m) => !m.inDock).pane.id)
}
function pinDock() {
  const d = dockEl; if (!d) return
  d.dock.pinned = !d.dock.pinned; d.dock.open = d.dock.pinned || d.dock.open
  d.wrap.classList.toggle('pinned', d.dock.pinned); d.wrap.classList.toggle('open', d.dock.open)
  d.showActive(); for (const m of mounted.values()) m.api.resize?.()
  toast(`${T('drawerPin')}: ${d.dock.pinned ? 'ON' : 'OFF'}`)
}
function buildPane(pane) {
  const el = document.createElement('section'); el.className = 'pane'; el.tabIndex = 0; el.dataset.id = pane.id
  el.innerHTML = `<div class="pane-h"></div><div class="pane-b"></div>`
  el.addEventListener('mousedown', () => setFocus(pane.id))
  const api = VIEWS[pane.type](pane, el.querySelector('.pane-b'), el.querySelector('.pane-h'))
  mounted.set(pane.id, { pane, el, api })
  queueMicrotask(() => api.update())
  return el
}
function header(pane, h, extra = '') {
  const l = pane.link
  h.innerHTML = `<span class="link l${l}" title="${T('linkSet')} ${l || '—'} (Ctrl+${l || 0})">${l || '·'}</span><span class="pane-title">${T(TITLES[pane.type])}</span>${extra}<span class="spacer"></span><span class="tools"><button type="button" data-a="max" title="Ctrl+Shift+Enter">⤢</button><button type="button" data-a="close" title="Ctrl+Shift+W">✕</button></span>`
  h.querySelector('[data-a="max"]').onclick = () => toggleMax(pane.id)
}
const codeOf = (pane) => (pane.link ? S.links[pane.link] : pane.code ?? '7203')
function symHeader(pane) {
  const c = codeOf(pane); const m = MET(c)
  return `<span class="star ${S.favs.has(c) ? 'on' : ''}" data-star="${c}" title="Ctrl+D">★</span><span class="sym"><span class="code">${c}</span>${esc(nameOf(c))}</span><span class="num">${fmtPx(m.close)}</span><span class="num ${cls(m.chg)}">${sgn(m.chgPct, 2, '%')}</span>`
}
function setFocus(id) {
  S.focus = id
  for (const [pid, m] of mounted) m.el.classList.toggle('focused', pid === id)
  const m = mounted.get(id); if (m && document.activeElement !== m.el && !S.overlay) m.el.focus({ preventScroll: true })
}
function toggleMax(id) {
  S.maximized = S.maximized === id ? null : id
  for (const [pid, m] of mounted) m.el.classList.toggle('max', pid === S.maximized)
  for (const m of mounted.values()) m.api.resize?.()
}
function setLinkCode(group, code) {
  if (!group) return
  S.links[group] = code
  for (const m of mounted.values()) if (m.pane.link === group) m.api.update()
}
function refreshAll() { metricsCache.clear(); for (const m of mounted.values()) m.api.update() }

// ---------------------------------------------------------------- views
const VIEWS = {}

// chart（FR-C1〜C4, C9, K3）
const charts = new Set()
VIEWS.chart = (pane, body, h) => {
  body.innerHTML = `<div class="chart-host"></div><div class="legend"><div class="ohlc"></div><div class="mas"></div></div>`
  const host = body.querySelector('.chart-host'), legend = body.querySelector('.legend')
  const chart = LW.createChart(host, {
    autoSize: true,
    layout: { background: { color: css('--panel') }, textColor: css('--text-3'), fontFamily: css('--mono'), fontSize: 11, attributionLogo: true },
    grid: { vertLines: { color: '#161a20' }, horzLines: { color: '#161a20' } },
    rightPriceScale: { borderColor: css('--line'), scaleMargins: { top: 0.12, bottom: 0.22 } },
    timeScale: { borderColor: css('--line'), rightOffset: 4, barSpacing: 6 },
    crosshair: { mode: LW.CrosshairMode.Normal, vertLine: { color: '#55606d', labelBackgroundColor: '#2d3540' }, horzLine: { color: '#55606d', labelBackgroundColor: '#2d3540' } },
    localization: { locale: loc(), dateFormat: 'yyyy/MM/dd' },
  })
  const cs = chart.addSeries(LW.CandlestickSeries, { borderVisible: false, priceLineColor: '#55606d', priceLineStyle: 2 })
  const vs = chart.addSeries(LW.HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false })
  chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, visible: false })
  const MA = { D: [5, 25, 75], W: [13, 26, 52], M: [12, 24, 60] }
  const maColors = ['--ma1', '--ma2', '--ma3']
  const ms = maColors.map((c) => chart.addSeries(LW.LineSeries, { color: css(c), lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }))
  let bars = [], maData = [], kbIndex = null, log = false
  const self = { pane, chart, cs, get bars() { return bars }, syncing: false }
  charts.add(self)
  function colors() {
    const up = css('--up'), down = css('--down')
    cs.applyOptions({ upColor: up, downColor: down, wickUpColor: up, wickDownColor: down })
    return { up, down }
  }
  function showLegend(i) {
    const b = bars[i ?? bars.length - 1]; if (!b) return
    const p = bars[(i ?? bars.length - 1) - 1]
    const ch = p ? (b.close / p.close - 1) * 100 : 0
    legend.querySelector('.ohlc').innerHTML = `<span>${b.time.replaceAll('-', '/')}</span><span>O <b>${fmtPx(b.open)}</b></span><span>H <b>${fmtPx(b.high)}</b></span><span>L <b>${fmtPx(b.low)}</b></span><span>C <b>${fmtPx(b.close)}</b></span><span class="${cls(ch)}">${sgn(ch, 2, '%')}</span><span>V <b>${b.volume.toLocaleString(loc())}</b></span>`
    legend.querySelector('.mas').innerHTML = MA[pane.tf].map((n, k) => {
      const v = maData[k].find((x) => x.time === b.time)?.value
      return `<span style="color:${css(maColors[k])}"><b style="color:var(--text-2);font-weight:400">MA${n}</b> ${v ? fmtPx(v) : '—'}</span>`
    }).join('')
  }
  chart.subscribeCrosshairMove((param) => {
    if (self.syncing) return
    if (!param.time) { showLegend(); for (const o of charts) if (o !== self && o.pane.link && o.pane.link === pane.link) { o.syncing = true; o.chart.clearCrosshairPosition(); o.syncing = false; o.showLegend() } return }
    const i = bars.findIndex((b) => b.time === param.time); showLegend(i)
    // 同じリンクグループの他の時間軸へ十字線を合わせる（FR-K3）
    for (const o of charts) {
      if (o === self || !o.pane.link || o.pane.link !== pane.link) continue
      const ob = o.bars; let j = -1
      for (let k = 0; k < ob.length; k++) { if (ob[k].time <= param.time) j = k; else break }
      if (j < 0) continue
      o.syncing = true; o.chart.setCrosshairPosition(ob[j].close, ob[j].time, o.cs); o.syncing = false; o.showLegend(j)
    }
  })
  self.showLegend = showLegend
  function setRange() {
    const n = bars.length, show = pane.tf === 'D' ? 140 : pane.tf === 'W' ? 110 : n
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - show), to: n + 3 })
  }
  function update() {
    const c = codeOf(pane)
    const tfs = `<span class="seg">${['D', 'W', 'M'].map((t) => `<button type="button" data-tf="${t}" aria-pressed="${t === pane.tf}" title="${t}">${t}</button>`).join('')}</span>`
    header(pane, h, symHeader(pane) + tfs)
    h.querySelectorAll('[data-tf]').forEach((b) => (b.onclick = () => { pane.tf = b.dataset.tf; update() }))
    h.querySelector('[data-star]').onclick = () => toggleFav(c)
    bars = M.aggregate(M.daily(c), pane.tf)
    const { up, down } = colors()
    const px = M.byCode[c].base; cs.applyOptions({ priceFormat: { type: 'price', precision: px < 1000 ? 1 : 0, minMove: px < 1000 ? 0.1 : 1 } })
    cs.setData(bars)
    vs.setData(bars.map((b, i) => ({ time: b.time, value: b.volume, color: i && b.close < bars[i - 1].close ? '#2a3442' : '#3d4756' })))
    maData = MA[pane.tf].map((n) => M.sma(bars, n))
    ms.forEach((s, k) => s.setData(maData[k]))
    chart.applyOptions({ localization: { locale: loc(), dateFormat: S.lang === 'ja' ? 'yyyy/MM/dd' : 'MMM dd, yyyy' } })
    requestAnimationFrame(() => requestAnimationFrame(setRange)); showLegend(); kbIndex = null
  }
  return {
    update, chartSelf: self,
    resize() {},
    destroy() { charts.delete(self); chart.remove() },
    key(e) {
      const k = e.key
      if (!e.ctrlKey && !e.altKey && !e.metaKey) {
        if (['d', 'w', 'm'].includes(k.toLowerCase()) && !e.shiftKey) { pane.tf = k.toUpperCase(); update(); return true }
        if (k.toLowerCase() === 'l') { log = !log; chart.priceScale('right').applyOptions({ mode: log ? LW.PriceScaleMode.Logarithmic : LW.PriceScaleMode.Normal }); toast(`${T('log')}: ${log ? 'ON' : 'OFF'}`); return true }
        if (k.toLowerCase() === 'a') { S.adj = (S.adj + 1) % 3; toast(`${T('adj')}: ${T('adjModes')[S.adj]}`); return true }
        if (k.toLowerCase() === 'i') { toast(T('ind')); return true }
        if (k.toLowerCase() === 'x') { kbIndex = kbIndex == null ? bars.length - 1 : null; if (kbIndex == null) { chart.clearCrosshairPosition(); showLegend() } else moveKb(0); return true }
        const ts = chart.timeScale(), r = ts.getVisibleLogicalRange()
        if ((k === 'ArrowLeft' || k === 'ArrowRight') && kbIndex != null) { moveKb(k === 'ArrowLeft' ? -1 : 1); return true }
        if (k === 'ArrowLeft' || k === 'ArrowRight') { const step = (e.shiftKey ? (r.to - r.from) : 10) * (k === 'ArrowLeft' ? -1 : 1); ts.setVisibleLogicalRange({ from: r.from + step, to: r.to + step }); return true }
        if (k === '+' || k === ';' || k === '-' ) { const span = r.to - r.from, f = k === '-' ? 1.25 : 0.8; ts.setVisibleLogicalRange({ from: r.to - span * f, to: r.to }); return true }
        if (k === '0' && kbIndex == null) { setRange(); return true }
      }
      return false
    },
  }
  function moveKb(d) {
    kbIndex = Math.max(0, Math.min(bars.length - 1, kbIndex + d))
    const b = bars[kbIndex]; chart.setCrosshairPosition(b.close, b.time, cs)
    const r = chart.timeScale().getVisibleLogicalRange()
    if (kbIndex < r.from || kbIndex > r.to) chart.timeScale().scrollToPosition(kbIndex - bars.length + 20, false)
  }
}

// watchlist（§6.10, FR-FV2）
VIEWS.watchlist = (pane, body, h) => {
  pane.sel ??= 0; pane.starOnly ??= false; pane.sortCol ??= null; pane.col ??= 2
  body.innerHTML = `<div style="display:flex;flex-direction:column;height:100%"><div class="tabs"></div><div class="filterbar"></div><div class="scroll" style="flex:1"></div></div>`
  const COLS = [
    { k: 'star', l: '', w: 22, cls: 'l' }, { k: 'code', l: () => T('code'), w: 48, cls: 'l' }, { k: 'name', l: () => T('name'), cls: 'l' },
    { k: 'close', l: () => T('price'), w: 76 }, { k: 'chgPct', l: () => T('chg'), w: 64 }, { k: 'yld', l: () => T('yld'), w: 58 }, { k: 'turnover', l: () => T('turnover'), w: 72 },
  ]
  function rows() {
    const list = S.lists.find((l) => l.id === pane.list)
    let codes = list.id === 'fav' ? [...S.favs] : list.codes
    if (pane.starOnly) codes = codes.filter((c) => S.favs.has(c))
    if (pane.sortCol) { const { k, dir } = pane.sortCol; codes = [...codes].sort((a, b) => (MET(a)[k] - MET(b)[k]) * dir) }
    return codes
  }
  function update() {
    header(pane, h, `<span class="dim">${esc(S.lists.find((l) => l.id === pane.list)[S.lang])}</span>`)
    body.querySelector('.tabs').innerHTML = S.lists.map((l) => `<button type="button" data-l="${l.id}" aria-selected="${l.id === pane.list}">${esc(l[S.lang])}<span class="count">${l.id === 'fav' ? S.favs.size : l.codes.length}</span></button>`).join('') + `<button type="button" class="add" title="${S.lang === 'ja' ? '新しいリスト' : 'New list'}">＋</button>`
    body.querySelectorAll('[data-l]').forEach((b) => (b.onclick = () => { pane.list = b.dataset.l; pane.sel = 0; update(); send() }))
    const rs = rows()
    body.querySelector('.filterbar').innerHTML = `<span class="toggle ${pane.starOnly ? 'on' : ''}" data-t="star"><span class="box"></span>${T('starOnly')}</span><kbd>Ctrl+Shift+F</kbd><span style="margin-left:auto" class="num">${rs.length} ${T('items')}</span>`
    body.querySelector('[data-t="star"]').onclick = () => { pane.starOnly = !pane.starOnly; pane.sel = 0; update() }
    const sc = body.querySelector('.scroll')
    sc.innerHTML = `<table class="grid"><colgroup>${COLS.map((c) => `<col${c.w ? ` style="width:${c.w}px"` : ''}>`).join('')}</colgroup><thead><tr>${COLS.map((c, i) => `<th class="${c.cls ?? ''} ${pane.sortCol?.k === c.k || i === pane.col && S.focus === pane.id ? 'sorted' : ''}">${typeof c.l === 'function' ? c.l() : c.l}${pane.sortCol?.k === c.k ? (pane.sortCol.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead><tbody>${rs.map((c, i) => {
      const m = MET(c), ins = M.byCode[c]
      return `<tr data-i="${i}" class="${i === pane.sel ? 'sel' : ''}"><td class="l"><span class="star ${S.favs.has(c) ? 'on' : ''}" data-star="${c}">★</span></td><td class="l code">${c}</td><td class="l name">${esc(nameOf(c))}${ins.type !== 'stock' ? `<span class="tag">${T('mktName')[ins.mkt]}</span>` : ''}</td><td>${fmtPx(m.close)}</td><td class="${cls(m.chg)}">${sgn(m.chgPct, 2, '%')}</td><td>${m.yld ? fmt(m.yld) + '<span class="unit">%</span>' : '—'}</td><td>${big(m.turnover)}</td></tr>`
    }).join('')}</tbody></table>`
    sc.querySelectorAll('tr[data-i]').forEach((tr) => (tr.onclick = () => { pane.sel = +tr.dataset.i; mark(); send() }))
    sc.querySelectorAll('[data-star]').forEach((s) => (s.onclick = (e) => { e.stopPropagation(); toggleFav(s.dataset.star) }))
  }
  function mark() {
    body.querySelectorAll('tr[data-i]').forEach((tr) => tr.classList.toggle('sel', +tr.dataset.i === pane.sel))
    body.querySelector('tr.sel')?.scrollIntoView({ block: 'nearest' })
  }
  function send() { const c = rows()[pane.sel]; if (c) setLinkCodeExcept(pane, c) }
  return {
    update, current: () => rows()[pane.sel],
    key(e) {
      const n = rows().length, k = e.key
      const page = Math.max(1, Math.floor(body.querySelector('.scroll').clientHeight / 24) - 1)
      const mv = { ArrowDown: 1, ArrowUp: -1, PageDown: page, PageUp: -page }[k]
      if (mv && !e.ctrlKey && !e.altKey && !e.shiftKey) { pane.sel = Math.max(0, Math.min(n - 1, pane.sel + mv)); mark(); send(); return true }
      if ((k === 'Home' || k === 'End') && !e.ctrlKey) { pane.sel = k === 'Home' ? 0 : n - 1; mark(); send(); return true }
      if ((k === 'PageDown' || k === 'PageUp') && e.ctrlKey) { const i = S.lists.findIndex((l) => l.id === pane.list); pane.list = S.lists[(i + (k === 'PageDown' ? 1 : -1) + S.lists.length) % S.lists.length].id; pane.sel = 0; update(); send(); return true }
      if ((k === 'ArrowLeft' || k === 'ArrowRight') && !e.altKey) { pane.col = Math.max(1, Math.min(COLS.length - 1, pane.col + (k === 'ArrowLeft' ? -1 : 1))); update(); return true }
      if (k.toLowerCase() === 's' && !e.ctrlKey) { const col = COLS[pane.col].k; if (['code', 'name'].includes(col)) { pane.sortCol = null } else pane.sortCol = { k: col, dir: pane.sortCol?.k === col ? -pane.sortCol.dir : -1 }; pane.sel = 0; update(); send(); return true }
      if (k === 'F' && e.ctrlKey && e.shiftKey) { pane.starOnly = !pane.starOnly; pane.sel = 0; update(); return true }
      if (k === 'Enter') { send(); return true }
      if (k === 'Delete') { const c = rows()[pane.sel]; const l = S.lists.find((x) => x.id === pane.list); if (l.id === 'fav') S.favs.delete(c); else l.codes = l.codes.filter((x) => x !== c); pane.sel = Math.max(0, pane.sel - 1); toast(T('removed')); refreshAll(); return true }
      if (e.altKey && (k === 'ArrowUp' || k === 'ArrowDown') && pane.list !== 'fav') { const l = S.lists.find((x) => x.id === pane.list); const i = pane.sel, j = i + (k === 'ArrowUp' ? -1 : 1); if (j >= 0 && j < l.codes.length) { [l.codes[i], l.codes[j]] = [l.codes[j], l.codes[i]]; pane.sel = j; update() } return true }
      return false
    },
  }
}
function setLinkCodeExcept(pane, code) { if (pane.link) setLinkCode(pane.link, code); else { pane.code = code } }

// symbol info（FR-I1, FR-H3）
VIEWS.info = (pane, body, h) => {
  body.innerHTML = `<div class="scroll"><div class="info"></div></div>`
  const box = body.querySelector('.info')
  function update() {
    const c = codeOf(pane), ins = M.byCode[c], m = MET(c), divs = M.dividends(c)
    header(pane, h, symHeader(pane))
    h.querySelector('[data-star]').onclick = () => toggleFav(c)
    const kv = (k, v) => `<div class="kv"><span>${k}</span><span>${v}</span></div>`
    const unit = ins.type === 'reit' ? T('perUnit') : T('perShare')
    box.innerHTML = `
      <div class="head"><span class="px">${fmtPx(m.close)}</span><span class="num ${cls(m.chg)}">${sgn(m.chg, m.close < 1000 ? 1 : 0)} (${sgn(m.chgPct, 2, '%')})</span><span class="muted">${T('mktName')[ins.mkt]} · ${esc(S.lang === 'ja' ? ins.secJa : ins.secEn)}</span></div>
      ${kv(`${T('yldTrail')}`, m.yld ? `<b style="font-weight:500">${fmt(m.yld)}%</b>` : '—')}${kv(T('mcap'), big(m.mcap))}
      ${kv(ins.type === 'reit' ? T('pbrBook') : T('pbr'), m.pbr ? fmt(m.pbr) + '×' : '—')}${kv(T('per'), m.per ? fmt(m.per, 1) + '×' : '—')}
      ${kv(T('turnover') + (S.lang === 'ja' ? '(20日)' : ' (20D)'), big(m.turnover))}${kv(T('r1y'), `<span class="${cls(m.r1y)}">${sgn(m.r1y, 1, '%')}</span>`)}
      ${kv(T('hi52'), fmtPx(m.hi52))}${kv(T('lo52'), fmtPx(m.lo52))}
      ${kv(T('fromHi'), sgn(m.fromHi, 1, '%'))}${kv(T('maDev'), `<span class="${cls(m.maDev)}">${sgn(m.maDev, 1, '%')}</span>`)}
      <h4><span>${T('divHist')}</span><span class="muted" style="font-weight:400;letter-spacing:0">${unit}</span></h4>
      <div class="bars"><canvas></canvas></div>
      ${divs.slice(-6).reverse().map((d) => kv(`${T('exDate')} ${d.date.replaceAll('-', '/')}`, fmtPx(d.amount))).join('') || `<div class="note">—</div>`}
      <div class="note">${T('yldNote')}</div>`
    requestAnimationFrame(() => drawDivBars(box.querySelector('canvas'), divs))
  }
  return { update }
}
function drawDivBars(cv, divs) {
  const r = cv.parentElement.getBoundingClientRect(), dpr = devicePixelRatio
  cv.width = r.width * dpr; cv.height = r.height * dpr; cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px'
  const g = cv.getContext('2d'); g.scale(dpr, dpr)
  if (!divs.length) return
  const max = Math.max(...divs.map((d) => d.amount)), n = divs.length, bw = Math.max(2, (r.width - 4) / n - 2)
  g.fillStyle = css('--text-3'); g.font = `10px ${css('--mono')}`
  divs.forEach((d, i) => {
    const hh = (d.amount / max) * (r.height - 16), x = 2 + i * (bw + 2), y = r.height - 12 - hh
    g.fillStyle = i >= n - 2 ? '#5b7db0' : '#33465f'
    g.beginPath(); g.roundRect(x, y, bw, hh, [2, 2, 0, 0]); g.fill()
    if (d.date.slice(5, 7) === divs[0].date.slice(5, 7) || i === n - 1) { g.fillStyle = css('--text-3'); g.fillText(d.date.slice(2, 4), x, r.height - 1) }
  })
}

// screener（§5.2, §5.3, FR-SC4, SC9〜SC16）: 指標の登録表と、名前を付けたスクリーン
const FIELDS = {   // 指標の登録表（§5.3 FieldDef の縮小版）。画面はここから作る
  yield: { ja: '実績利回り', en: 'Trailing yield', get: (c) => MET(c).yld, ops: ['>=', '<='], step: 0.5, show: (v) => `${fmt(v)} %` },
  turnover: { ja: '売買代金(20日平均)', en: 'Turnover (20D avg)', get: (c) => MET(c).turnover / 1e8, ops: ['>=', '<='], step: 5, show: (v) => (S.lang === 'ja' ? `${fmt(v, 0)} 億円` : `¥${fmt(v / 10, 1)}B`) },
  per: { ja: 'PER', en: 'P/E', get: (c) => MET(c).per, ops: ['<=', '>='], step: 1, show: (v) => `${fmt(v, 1)} ×` },
  pbr: { ja: 'PBR', en: 'P/B', get: (c) => MET(c).pbr, ops: ['<=', '>='], step: 0.1, show: (v) => `${fmt(v, 2)} ×` },
  r1y: { ja: '1年騰落率', en: '1Y return', get: (c) => MET(c).r1y, ops: ['>=', '<='], step: 5, show: (v) => `${fmt(v, 1)} %` },
  maDev: { ja: '75日線乖離', en: 'vs 75D MA', get: (c) => MET(c).maDev, ops: ['>=', '<='], step: 1, show: (v) => `${fmt(v, 1)} %` },
  fromHi: { ja: '52週高値から', en: 'From 52W high', get: (c) => MET(c).fromHi, ops: ['>=', '<='], step: 1, show: (v) => `${fmt(v, 1)} %` },
  mkt: { ja: '市場区分', en: 'Market', get: (c) => M.byCode[c].mkt, ops: ['in'], choices: [['P', 'R'], ['P'], ['R'], ['P', 'G', 'R', 'E']], show: (v) => v.map((x) => T('mktName')[x]).join(', ') },
  fav: { ja: 'お気に入り', en: 'Favorite', get: (c) => S.favs.has(c), ops: ['='], choices: ['any', 'yes', 'no'], show: (v) => ({ any: T('any'), yes: S.lang === 'ja' ? 'お気に入りである' : 'is favorite', no: S.lang === 'ja' ? 'お気に入りでない' : 'not favorite' })[v] },
}
const DEFAULT_SCREENS = [
  { id: 'hd', name: { ja: '高配当銘柄', en: 'High yield' }, conds: [{ f: 'yield', op: '>=', v: 3.5 }, { f: 'turnover', op: '>=', v: 10 }, { f: 'mkt', op: 'in', v: ['P', 'R'] }, { f: 'fav', op: '=', v: 'any' }] },
  { id: 'value', name: { ja: '割安（PBR 1 倍割れ）', en: 'Value (P/B < 1)' }, conds: [{ f: 'pbr', op: '<=', v: 1 }, { f: 'per', op: '<=', v: 15 }, { f: 'turnover', op: '>=', v: 5 }] },
  { id: 'reit', name: { ja: 'J-REIT 高利回り', en: 'J-REIT high yield' }, conds: [{ f: 'mkt', op: 'in', v: ['R'] }, { f: 'yield', op: '>=', v: 5 }] },
  { id: 'high', name: { ja: '52週高値圏', en: 'Near 52W high' }, conds: [{ f: 'fromHi', op: '>=', v: -3 }, { f: 'maDev', op: '>=', v: 0 }] },
]
const SCREENS_KEY = 'elecxstock.mock.screens.v1'
if (/fresh=1/.test(location.hash)) localStorage.removeItem(SCREENS_KEY)
S.screens = (() => { try { const v = JSON.parse(localStorage.getItem(SCREENS_KEY) ?? 'null'); if (Array.isArray(v) && v.length) return v } catch {} return JSON.parse(JSON.stringify(DEFAULT_SCREENS)) })()
const saveScreens = () => localStorage.setItem(SCREENS_KEY, JSON.stringify(S.screens))
S.liveConds = JSON.parse(JSON.stringify(S.screens[0].conds))   // スクリーナーで今開いている条件（未保存の変更を含む）
const clone = (x) => JSON.parse(JSON.stringify(x))
const nameOfScreen = (sc) => sc.name[S.lang] || sc.name.ja
function evalConds(conds) {
  return M.instruments.filter((i) => conds.every((cd) => {
    const F = FIELDS[cd.f]; if (!F) return true                       // 使えない指標は無視（FR-SC11）
    const x = F.get(i.code)
    if (cd.op === 'in') return cd.v.includes(x)
    if (cd.op === '=') return cd.v === 'any' || (cd.v === 'yes') === x
    if (x == null) return false                                      // 欠損は除外（FR-SC8）
    return cd.op === '>=' ? x >= cd.v : x <= cd.v
  })).map((i) => i.code).sort((a, b) => MET(b).yld - MET(a).yld)
}
const screenCodes = () => evalConds(S.liveConds)
function notifyGrids() { for (const m of mounted.values()) if (m.pane.type === 'grid') m.api.update() }

VIEWS.screener = (pane, body, h) => {
  pane.sel ??= 0; pane.screenId ??= S.screens[0].id; pane.conds ??= clone(S.screens.find((x) => x.id === pane.screenId)?.conds ?? []); pane.ci ??= -1
  body.innerHTML = `<div style="display:flex;flex-direction:column;height:100%"><div class="conds"></div><div class="scroll" style="flex:1"></div></div>`
  const screen = () => S.screens.find((x) => x.id === pane.screenId)
  const dirty = () => !screen() || JSON.stringify(screen().conds) !== JSON.stringify(pane.conds)
  const results = () => evalConds(pane.conds)
  function changed() { S.liveConds = clone(pane.conds); pane.sel = 0; update(); notifyGrids(); scheduleSave() }
  function update() {
    S.liveConds = clone(pane.conds)
    const sc = screen(), d = dirty()
    header(pane, h, `<button type="button" class="chip scr" data-a="open" title="Ctrl+O">▾ ${esc(sc ? nameOfScreen(sc) : (S.lang === 'ja' ? '（名前なし）' : '(untitled)'))}</button>${d ? `<span class="dirty" title="${S.lang === 'ja' ? '保存されていない変更' : 'Unsaved changes'}">● ${S.lang === 'ja' ? '変更あり' : 'Modified'}</span>` : ''}<button type="button" class="chip" data-a="save" title="Ctrl+S" ${d ? '' : 'disabled'}>${S.lang === 'ja' ? '保存' : 'Save'}</button><button type="button" class="chip" data-a="saveas" title="Ctrl+Shift+S">${S.lang === 'ja' ? '名前を付けて保存' : 'Save as…'}</button><button type="button" class="chip" data-a="grid" title="Ctrl+Shift+G">${S.lang === 'ja' ? 'グリッドで開く' : 'Open in grid'}</button>`)
    h.querySelector('[data-a="open"]').onclick = () => openScreens()
    h.querySelector('[data-a="save"]').onclick = () => saveScreen()
    h.querySelector('[data-a="saveas"]').onclick = () => saveScreenAs()
    h.querySelector('[data-a="grid"]').onclick = () => openInGrid()
    const rs = results()
    const row = (cd, i) => { const F = FIELDS[cd.f]; return `<div class="cond ${i === pane.ci ? 'focus' : ''}" data-i="${i}"><span class="and">${i ? T('and') : ''}</span><span class="f">${esc(F[S.lang])}</span><span class="op">${cd.op === 'in' ? '∈' : cd.op === '>=' ? '≥' : cd.op === '<=' ? '≤' : '='}</span><span class="v" data-v="${i}">${esc(F.show(cd.v))}</span><span class="muted x" data-x="${i}" title="Delete">✕</span></div>` }
    body.querySelector('.conds').innerHTML = pane.conds.map(row).join('') +
      `<div class="meta"><span><button type="button" class="chip" data-a="add">＋ ${S.lang === 'ja' ? '条件を追加' : 'Add condition'}</button> <span class="muted">${S.lang === 'ja' ? 'Tab で条件へ · ↑↓ 選ぶ · ← → 値 · Delete 削除' : 'Tab to conditions · ↑↓ select · ← → value · Delete remove'}</span></span><span class="num">${rs.length} / 2,091 ${T('hits')} · 4 ms</span></div>`
    body.querySelectorAll('.cond .v').forEach((el) => (el.onclick = () => { pane.ci = +el.dataset.v; stepValue(1) }))
    body.querySelectorAll('.cond .x').forEach((el) => (el.onclick = () => { pane.conds.splice(+el.dataset.x, 1); pane.ci = -1; changed() }))
    body.querySelector('[data-a="add"]').onclick = () => addCond()
    body.querySelector('.scroll').innerHTML = `<table class="grid"><colgroup><col style="width:22px"><col style="width:48px"><col><col style="width:76px"><col style="width:74px"><col style="width:58px"><col style="width:50px"><col style="width:50px"><col style="width:72px"><col style="width:68px"></colgroup>
      <thead><tr><th class="l"></th><th class="l">${T('code')}</th><th class="l">${T('name')}</th><th class="l">${T('mkt')}</th><th>${T('price')}</th><th class="sorted">${T('yld')} ▼</th><th>${T('per')}</th><th>${T('pbr')}</th><th>${T('turnover')}</th><th>${T('r1y')}</th></tr></thead>
      <tbody>${rs.map((c, i) => { const m = MET(c), ins = M.byCode[c]; return `<tr data-i="${i}" class="${i === pane.sel ? 'sel' : ''}"><td class="l"><span class="star ${S.favs.has(c) ? 'on' : ''}" data-star="${c}">★</span></td><td class="l code">${c}</td><td class="l name">${esc(nameOf(c))}</td><td class="l name dim">${T('mktName')[ins.mkt]}</td><td>${fmtPx(m.close)}</td><td>${m.yld ? fmt(m.yld) + '<span class="unit">%</span>' : '—'}</td><td>${m.per ? fmt(m.per, 1) : '—'}</td><td>${m.pbr ? fmt(m.pbr) : '—'}</td><td>${big(m.turnover)}</td><td class="${cls(m.r1y)}">${sgn(m.r1y, 1, '%')}</td></tr>` }).join('')}</tbody></table>`
    body.querySelectorAll('tr[data-i]').forEach((tr) => (tr.onclick = () => { pane.sel = +tr.dataset.i; pane.ci = -1; mark(); send() }))
    body.querySelectorAll('[data-star]').forEach((s2) => (s2.onclick = (e) => { e.stopPropagation(); toggleFav(s2.dataset.star) }))
  }
  function stepValue(dir) {
    const cd = pane.conds[pane.ci]; if (!cd) return
    const F = FIELDS[cd.f]
    if (F.choices) { const i = F.choices.findIndex((c) => JSON.stringify(c) === JSON.stringify(cd.v)); cd.v = clone(F.choices[(i + dir + F.choices.length) % F.choices.length]) }
    else cd.v = Math.round((cd.v + F.step * dir) * 100) / 100
    changed()
  }
  function addCond() { const used = new Set(pane.conds.map((c) => c.f)); const f = Object.keys(FIELDS).find((k) => !used.has(k)); if (!f) return; const F = FIELDS[f]; pane.conds.push({ f, op: F.ops[0], v: F.choices ? clone(F.choices[0]) : 0 }); pane.ci = pane.conds.length - 1; changed() }
  function saveScreen() { const sc = screen(); if (!sc) return saveScreenAs(); sc.conds = clone(pane.conds); sc.updated = Date.now(); saveScreens(); update(); toast(`${S.lang === 'ja' ? '保存しました' : 'Saved'}: ${nameOfScreen(sc)}`) }
  async function saveScreenAs() {
    const base = screen() ? nameOfScreen(screen()) : ''
    const name = await promptName(S.lang === 'ja' ? 'スクリーンに名前を付けて保存' : 'Save screen as', base ? (S.lang === 'ja' ? `${base} のコピー` : `${base} copy`) : '')
    if (!name) return
    const sc = { id: 'u' + Date.now().toString(36), name: { ja: name, en: name }, conds: clone(pane.conds), created: Date.now() }
    S.screens.push(sc); saveScreens(); pane.screenId = sc.id; update(); notifyGrids(); toast(`${S.lang === 'ja' ? '保存しました' : 'Saved'}: ${name}`)
  }
  async function renameScreen() {
    const sc = screen(); if (!sc) return
    const name = await promptName(S.lang === 'ja' ? 'スクリーンの名前を変更' : 'Rename screen', nameOfScreen(sc)); if (!name) return
    sc.name = { ja: name, en: name }; saveScreens(); update(); notifyGrids()
  }
  pane.openScreen = async (id) => {
    if (id === pane.screenId) return
    if (dirty()) { const r = await askSave(); if (r === 'cancel') return; if (r === 'save') saveScreen() }
    pane.screenId = id; pane.conds = clone(screen().conds); pane.ci = -1; changed()
  }
  pane.rename = renameScreen
  const mark = () => { body.querySelectorAll('tr[data-i]').forEach((tr) => tr.classList.toggle('sel', +tr.dataset.i === pane.sel)); body.querySelector('tr.sel')?.scrollIntoView({ block: 'nearest' }) }
  const send = () => { const c = results()[pane.sel]; if (c) setLinkCode(pane.link, c) }
  return {
    update, current: () => results()[pane.sel],
    key(e) {
      const k = e.key
      if (e.ctrlKey && !e.altKey && e.code === 'KeyS') { e.shiftKey ? saveScreenAs() : saveScreen(); return true }
      if (e.ctrlKey && !e.shiftKey && e.code === 'KeyO') { openScreens(); return true }
      if (k === 'F2') { renameScreen(); return true }
      if (k === 'Tab') { pane.ci = pane.ci >= 0 ? -1 : 0; update(); return true }
      if (pane.ci >= 0 && !e.ctrlKey && !e.altKey) {
        if (k === 'ArrowUp' || k === 'ArrowDown') { pane.ci = Math.max(0, Math.min(pane.conds.length - 1, pane.ci + (k === 'ArrowUp' ? -1 : 1))); update(); return true }
        if (k === 'ArrowLeft' || k === 'ArrowRight') { stepValue(k === 'ArrowRight' ? 1 : -1); return true }
        if (k === 'Delete') { pane.conds.splice(pane.ci, 1); pane.ci = Math.min(pane.ci, pane.conds.length - 1); changed(); return true }
        if (k === 'Insert' || k === '+') { addCond(); return true }
        if (k === 'Escape' || k === 'Enter') { pane.ci = -1; update(); return true }
      }
      const n = results().length, mv = { ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10 }[k]
      if (mv && !e.ctrlKey && !e.altKey) { pane.sel = Math.max(0, Math.min(n - 1, pane.sel + mv)); mark(); send(); return true }
      if (k === 'Enter' && !e.ctrlKey) { send(); return true }
      if (k === 'A' && e.ctrlKey && e.shiftKey) { const l = S.lists.find((x) => x.id === 'watch'); const c = results()[pane.sel]; if (c && !l.codes.includes(c)) l.codes.push(c); toast(T('added')); return true }
      return false
    },
  }
}
// スクリーンの一覧（Ctrl+O）
function openScreens() {
  const scr = [...mounted.values()].find((m) => m.pane.type === 'screener')
  const root = overlay(`<div class="scrim"><div class="dialog palette" role="dialog"><input aria-label="screens" placeholder="${S.lang === 'ja' ? 'スクリーンを検索' : 'Search screens'}"><div class="res"></div><div class="foot"><span>${T('toMove')}</span><span>Enter ${S.lang === 'ja' ? '開く' : 'open'}</span><span>F2 ${S.lang === 'ja' ? '名前の変更' : 'rename'}</span><span>Ctrl+Shift+D ${S.lang === 'ja' ? '複製' : 'duplicate'}</span><span>Delete ${S.lang === 'ja' ? '削除' : 'delete'}</span><span>${T('toClose')}</span></div></div></div>`, 'screens')
  const input = root.querySelector('input'), res = root.querySelector('.res'); let sel = Math.max(0, S.screens.findIndex((x) => x.id === scr?.pane.screenId)), items = [], pendingDel = null
  function render() {
    const q = input.value.trim().toLowerCase()
    items = S.screens.filter((x) => !q || nameOfScreen(x).toLowerCase().includes(q)); sel = Math.min(sel, items.length - 1)
    res.innerHTML = `<div class="grp">${S.lang === 'ja' ? '保存したスクリーン' : 'Saved screens'}</div>` + items.map((x, k) => `<div class="it ${k === sel ? 'sel' : ''}" data-k="${k}"><span class="n">${esc(nameOfScreen(x))}</span><span class="s">${x.conds.length} ${S.lang === 'ja' ? '条件' : 'conditions'} · ${evalConds(x.conds).length} ${T('hits')}</span>${x.id === scr?.pane.screenId ? `<span class="s">● ${S.lang === 'ja' ? '表示中' : 'open'}</span>` : ''}</div>`).join('')
    res.querySelectorAll('.it').forEach((el) => (el.onclick = () => { sel = +el.dataset.k; go() }))
  }
  function go() { const x = items[sel]; closeOverlay(); if (!x) return; if (scr) scr.pane.openScreen(x.id); else { switchLayout(2); setTimeout(() => [...mounted.values()].find((m) => m.pane.type === 'screener')?.pane.openScreen(x.id)) } }
  input.addEventListener('input', () => { sel = 0; render() })
  input.addEventListener('keydown', async (e) => {
    if (e.key !== 'Delete') pendingDel = null
    if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); render(); e.preventDefault() }
    else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); render(); e.preventDefault() }
    else if (e.key === 'Enter') { go(); e.preventDefault() }
    else if (e.key === 'Delete' && items[sel]) {
      e.preventDefault(); const x = items[sel]
      if (S.screens.length <= 1) return
      if (pendingDel !== x) { pendingDel = x; res.querySelector('.it.sel .n').insertAdjacentHTML('beforeend', `<span class="tag" style="color:#ff8a8d;border-color:#5a2a2d">${S.lang === 'ja' ? 'もう一度 Delete で削除' : 'Press Delete again to delete'}</span>`); return }
      pendingDel = null
      S.screens = S.screens.filter((y) => y !== x); saveScreens(); if (scr?.pane.screenId === x.id) { scr.pane.screenId = S.screens[0].id }
      render(); scr?.api.update(); notifyGrids()
    } else if (e.ctrlKey && e.shiftKey && e.code === 'KeyD' && items[sel]) {
      e.preventDefault(); const x = items[sel]; const c = clone(x); c.id = 'u' + Date.now().toString(36); c.name = { ja: `${x.name.ja} のコピー`, en: `${x.name.en} copy` }
      S.screens.splice(S.screens.indexOf(x) + 1, 0, c); saveScreens(); render(); notifyGrids()
    }
  })
  render(); input.focus()
}
// 名前の入力
function promptName(title, initial) {
  return new Promise((resolve) => {
    const root = overlay(`<div class="scrim"><div class="dialog confirm" role="dialog"><h3>${esc(title)}</h3><input class="name-input" value="${esc(initial)}" maxlength="40"><div class="actions" style="justify-content:flex-end"><button type="button" class="btn" data-x="no">${T('cancel')}</button><button type="button" class="btn primary" data-x="yes">${S.lang === 'ja' ? '保存' : 'Save'}</button></div></div></div>`, 'prompt')
    const input = root.querySelector('input'); let done = false
    const finish = (v) => { if (done) return; done = true; S.onOverlayClose = null; closeOverlay(); resolve(v) }
    S.onOverlayClose = () => { if (!done) { done = true; resolve(null) } }
    root.querySelector('[data-x="no"]').onclick = () => finish(null)
    root.querySelector('[data-x="yes"]').onclick = () => finish(input.value.trim() || null)
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); finish(input.value.trim() || null) } })
    input.focus(); input.select()
  })
}
// 保存されていない変更（FR-SC13）
function askSave() {
  return new Promise((resolve) => {
    const root = overlay(`<div class="scrim"><div class="dialog confirm" role="alertdialog"><h3>${S.lang === 'ja' ? '保存されていない変更があります' : 'You have unsaved changes'}</h3><p class="dim">${S.lang === 'ja' ? '今のスクリーンの変更を保存しますか？' : 'Save changes to the current screen?'}</p><div class="actions" style="justify-content:flex-end"><button type="button" class="btn" data-x="cancel">${T('cancel')}</button><button type="button" class="btn" data-x="discard">${S.lang === 'ja' ? '破棄' : 'Discard'}</button><button type="button" class="btn primary" data-x="save">${S.lang === 'ja' ? '保存' : 'Save'}</button></div></div></div>`, 'confirm')
    let done = false
    const finish = (v) => { if (done) return; done = true; S.onOverlayClose = null; closeOverlay(); resolve(v) }
    S.onOverlayClose = () => { if (!done) { done = true; resolve('cancel') } }
    root.querySelectorAll('[data-x]').forEach((b) => (b.onclick = () => finish(b.dataset.x)))
    root.querySelector('[data-x="save"]').focus()
  })
}

// chart grid（§6.11 FR-G1〜G9）: 多数のチャートを並べて一括操作する
const GRIDS = [[2, 2], [3, 2], [3, 3], [4, 3], [5, 4], [6, 5]]
const PERIOD_DAYS = [63, 126, 245, 490, 1225, Infinity]
const SORTS = ['ret', 'yld', 'maDev', 'fromHi', 'turnover']
VIEWS.grid = (pane, body, h) => {
  pane.src ??= 'screen'; pane.own ??= []; pane.tf ??= 'D'; pane.period ??= 2; pane.scale ??= 0; pane.ma ??= true
  pane.sort ??= 'ret'; pane.dir ??= -1; pane.size ??= 3; pane.page ??= 0; pane.sel ??= 0; pane.candOnly ??= false; pane.sync ??= true; pane.zoom ??= null
  body.innerHTML = `<div class="gwrap"><div class="gbar"></div><div class="gtiles"></div></div>`
  const bar = body.querySelector('.gbar'), tiles = body.querySelector('.gtiles')
  let hoverDate = null, raf = 0
  const srcCodes = () => {
    if (pane.src === 'live' || pane.src === 'screen') return screenCodes()
    if (pane.src.startsWith('scr:')) { const sc = S.screens.find((x) => 'scr:' + x.id === pane.src); return sc ? evalConds(sc.conds) : [] }
    if (pane.src === 'fav') return [...S.favs]
    if (pane.src === 'own') return pane.own
    return S.lists.find((l) => l.id === pane.src)?.codes ?? []
  }
  function sliced(code) {
    const all = M.aggregate(M.daily(code), pane.tf)
    const per = { D: 1, W: 5, M: 21 }[pane.tf]
    const n = PERIOD_DAYS[pane.period] === Infinity ? all.length : Math.max(3, Math.ceil(PERIOD_DAYS[pane.period] / per))
    return { all, bars: all.slice(-n) }
  }
  const periodRet = (code) => { const b = sliced(code).bars; return (b.at(-1).close / b[0].close - 1) * 100 }
  function codes() {
    let cs = srcCodes()
    if (pane.candOnly) cs = cs.filter((c) => candSet().has(c))
    if (pane.src === 'own' && pane.sort === 'none') return [...cs]
    const key = (c) => (pane.sort === 'ret' ? periodRet(c) : MET(c)[pane.sort])
    return [...cs].sort((a, b) => (key(a) - key(b)) * pane.dir)
  }
  const dims = () => GRIDS[pane.size]
  const perPage = () => dims()[0] * dims()[1]
  const pageCodes = () => { const cs = codes(); const pp = perPage(); pane.page = Math.min(pane.page, Math.max(0, Math.ceil(cs.length / pp) - 1)); return cs.slice(pane.page * pp, pane.page * pp + pp) }
  function srcLabel(id) { return id === 'own' ? `${T('srcOwn')} (${pane.own.length})` : id === 'live' || id === 'screen' ? T('srcScreen') : id.startsWith('scr:') ? '⌕ ' + nameOfScreen(S.screens.find((x) => 'scr:' + x.id === id) ?? { name: { ja: '?', en: '?' } }) : id === 'fav' ? S.lists[0][S.lang] : S.lists.find((l) => l.id === id)?.[S.lang] }
  function update() {
    const cs = codes(), pp = perPage(), pages = Math.max(1, Math.ceil(cs.length / pp))
    header(pane, h, `<span class="dim">${esc(srcLabel(pane.src))} · ${cs.length} ${T('items')}</span>`)
    const seg = (name, opts, cur, keys) => `<span class="seg" data-g="${name}">${opts.map((o, i) => `<button type="button" data-v="${i}" aria-pressed="${i === cur}" title="${keys ? keys[i] : ''}">${o}</button>`).join('')}</span>`
    const srcs = ['own', 'live', ...S.screens.map((x) => 'scr:' + x.id), 'fav', 'hd', 'reit', 'watch', 'cand']
    bar.innerHTML = `
      <span class="lbl">${T('src')}</span><select class="sel" data-g="src">${srcs.map((s2) => `<option value="${s2}" ${s2 === pane.src ? 'selected' : ''}>${esc(srcLabel(s2))}</option>`).join('')}</select>
      <span class="sep"></span>${seg('tf', ['D', 'W', 'M'], ['D', 'W', 'M'].indexOf(pane.tf), ['D', 'W', 'M'])}
      <span class="sep"></span><span class="lbl">${T('period')}</span>${seg('period', T('periods'), pane.period, ['Alt+1', 'Alt+2', 'Alt+3', 'Alt+4', 'Alt+5', 'Alt+6'])}
      <span class="sep"></span><span class="lbl">${T('scale')}</span>${seg('scale', T('scales'), pane.scale, ['', 'L', 'N'])}
      <span class="toggle ${pane.ma ? 'on' : ''}" data-t="ma"><span class="box"></span>${T('ma')}</span>
      <span class="sep"></span><span class="lbl">${T('sortBy')}</span><button type="button" class="chip" data-a="sort" title="S">${pane.sort === 'none' ? (S.lang === 'ja' ? '並び順どおり' : 'Manual') : T('sorts')[pane.sort] + ' ' + (pane.dir < 0 ? '▼' : '▲')}</button>
      <span class="grow"></span>
      <span class="toggle ${pane.candOnly ? 'on' : ''}" data-t="cand"><span class="box"></span>${T('candOnly')} <span class="num">${candSet().size}</span></span>
      <button type="button" class="chip" data-a="tolist" title="Ctrl+Shift+A">${T('toList')}</button>
      <span class="sep"></span><button type="button" class="chip" data-a="minus" title="−">−</button><span class="num">${dims()[0]}×${dims()[1]}</span><button type="button" class="chip" data-a="plus" title="+">＋</button>
      <span class="num muted">${T('page')} ${pane.page + 1}/${pages}</span>`
    bar.querySelector('[data-g="src"]').onchange = (e) => { pane.src = e.target.value; pane.page = 0; pane.sel = 0; update(); sendSel() }
    bar.querySelectorAll('.seg[data-g] button').forEach((b) => (b.onclick = () => {
      const g = b.parentElement.dataset.g, v = +b.dataset.v
      if (g === 'tf') pane.tf = ['D', 'W', 'M'][v]; if (g === 'period') pane.period = v; if (g === 'scale') pane.scale = v
      update()
    }))
    bar.querySelector('[data-t="ma"]').onclick = () => { pane.ma = !pane.ma; update() }
    bar.querySelector('[data-t="cand"]').onclick = () => { pane.candOnly = !pane.candOnly; pane.page = 0; pane.sel = 0; update() }
    bar.querySelector('[data-a="sort"]').onclick = () => cycleSort()
    bar.querySelector('[data-a="tolist"]').onclick = () => toast(S.lang === 'ja' ? `◆売買候補 ${candSet().size} 銘柄をウォッチリスト「監視」に入れました` : `Added ${candSet().size} candidates to "Watch"`)
    bar.querySelector('[data-a="minus"]').onclick = () => resize(-1)
    bar.querySelector('[data-a="plus"]').onclick = () => resize(1)
    bar.insertAdjacentHTML('beforeend', `<button type="button" class="chip" data-a="pin" title="P">⇩ ${S.lang === 'ja' ? '今の銘柄で固定' : 'Pin current'}</button>`)
    bar.querySelector('[data-a="pin"]').onclick = () => pinCurrent()
    renderTiles(); scheduleSave()
  }
  function pinCurrent() { pane.own = codes(); pane.src = 'own'; pane.sort = 'none'; pane.page = 0; pane.sel = 0; update(); toast(`${T('pinned')}（${pane.own.length}）`) }
  function addOwn(code) { if (!pane.own.includes(code)) pane.own.push(code); if (pane.src !== 'own') { pane.src = 'own'; pane.sort = 'none' } pane.page = Math.floor((pane.own.length - 1) / perPage()); pane.sel = (pane.own.length - 1) % perPage(); update(); toast(`${T('addedGrid')}: ${code} ${nameOf(code)}`) }
  function renderTiles() {
    const [cols, rows0] = pane.zoom ? [1, 1] : dims(), rows = pane.zoom ? 1 : Math.max(1, Math.min(rows0, Math.ceil(codes().length / cols)))
    const list = pane.zoom ? [pane.zoom] : pageCodes()
    tiles.style.gridTemplateColumns = `repeat(${cols}, 1fr)`; tiles.style.gridTemplateRows = `repeat(${rows}, 1fr)`
    tiles.classList.toggle('dense', cols >= 5)
    tiles.innerHTML = Array.from({ length: cols * rows }, (_, i) => {
      const c = list[i]; if (!c) return `<div class="gt empty"></div>`
      const m = MET(c), ret = periodRet(c), cand = candSet().has(c)
      return `<div class="gt ${i === pane.sel && !pane.zoom ? 'sel' : ''} ${cand ? 'cand' : ''}" data-i="${i}">
        <div class="gh"><span class="c">${c}</span><span class="n">${esc(nameOf(c))}</span><span class="p">${fmtPx(m.close)}</span><span class="r ${cls(ret)}">${sgn(ret, 1, '%')}</span></div>
        <div class="gs"><span class="star ${S.favs.has(c) ? 'on' : ''}">★</span><span class="dia ${cand ? 'on' : ''}" title="Space">◆</span><span class="y">${m.yld ? fmt(m.yld) + '%' : ''}</span></div>
        <canvas></canvas></div>`
    }).join('')
    tiles.querySelectorAll('.gt[data-i]').forEach((t) => {
      const i = +t.dataset.i
      t.onclick = () => { pane.sel = i; mark(); sendSel() }
      t.ondblclick = () => zoom(list[i])
      t.querySelector('.dia').onclick = (e) => { e.stopPropagation(); pane.sel = i; toggleCand(list[i]) }
      t.addEventListener('mousemove', (e) => {
        if (!pane.sync) return
        const cv = t.querySelector('canvas'), r = cv.getBoundingClientRect(), { bars } = sliced(list[i])
        const k = Math.max(0, Math.min(bars.length - 1, Math.floor((e.clientX - r.left) / r.width * bars.length)))
        hoverDate = bars[k].time; schedule()
      })
      t.addEventListener('mouseleave', () => { hoverDate = null; schedule() })
    })
    schedule()
  }
  function schedule() { cancelAnimationFrame(raf); raf = requestAnimationFrame(drawAll) }
  function drawAll() {
    const list = pane.zoom ? [pane.zoom] : pageCodes()
    tiles.querySelectorAll('.gt[data-i]').forEach((t) => drawTile(t.querySelector('canvas'), list[+t.dataset.i]))
  }
  function drawTile(cv, code) {
    const r = cv.getBoundingClientRect(), dpr = devicePixelRatio
    if (!r.width || !r.height) return
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr)
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, r.width, r.height)
    const { all, bars } = sliced(code), n = bars.length
    const W = r.width - 48, H = r.height, top = 6, volH = Math.round(H * 0.16), ph = H - top - volH - 4
    const up = css('--up'), down = css('--down'), grid = '#171b21'
    const norm = pane.scale === 2, log = pane.scale === 1
    const base = bars[0].close
    const val = (v) => (norm ? (v / base - 1) * 100 : v)
    let hi = -Infinity, lo = Infinity
    for (const b of bars) { hi = Math.max(hi, val(norm ? b.close : b.high)); lo = Math.min(lo, val(norm ? b.close : b.low)) }
    if (norm) { hi = Math.max(hi, 0); lo = Math.min(lo, 0) }
    const pad = (hi - lo) * 0.06 || 1; hi += pad; lo -= pad
    const f = (v) => (log ? Math.log(Math.max(1e-9, v)) : v)
    const y = (v) => top + (f(hi) - f(val(v))) / (f(hi) - f(lo)) * ph
    const yRaw = (v) => top + (hi - v) / (hi - lo) * ph
    const step = W / n, x = (i) => i * step + step / 2
    // grid lines + right labels
    g.font = `10px ${css('--mono')}`; g.textAlign = 'left'
    for (let k = 0; k <= 3; k++) {
      // 対数のときは対数空間で等分し、目盛りをローソク足と同じ y(v) で置く
      const vv = log ? Math.exp(f(lo) + (f(hi) - f(lo)) * k / 3) : lo + (hi - lo) * k / 3, yy = log ? y(vv) : yRaw(vv)
      g.strokeStyle = grid; g.lineWidth = 1; g.beginPath(); g.moveTo(0, Math.round(yy) + 0.5); g.lineTo(W, Math.round(yy) + 0.5); g.stroke()
      g.fillStyle = css('--text-3'); g.fillText(norm ? `${vv >= 0 ? '+' : ''}${vv.toFixed(0)}%` : fmtPx(vv), W + 4, Math.min(H - volH - 2, Math.max(10, yy + 3)))
    }
    // volume
    const vmax = Math.max(...bars.map((b) => b.volume))
    bars.forEach((b, i) => { const hh = b.volume / vmax * volH; g.fillStyle = i && b.close < bars[i - 1].close ? '#253040' : '#344050'; g.fillRect(x(i) - Math.max(0.5, step * 0.35), H - hh, Math.max(1, step * 0.7), hh) })
    if (norm) {
      // 比較%: 終値の線と 0% の基準線
      const zy = yRaw(0); g.setLineDash([3, 3]); g.strokeStyle = '#3a4350'; g.beginPath(); g.moveTo(0, zy); g.lineTo(W, zy); g.stroke(); g.setLineDash([])
      const last = val(bars.at(-1).close); g.strokeStyle = last >= 0 ? up : down; g.lineWidth = 1.5; g.beginPath()
      bars.forEach((b, i) => (i ? g.lineTo(x(i), y(b.close)) : g.moveTo(x(i), y(b.close)))); g.stroke()
    } else {
      bars.forEach((b, i) => {
        const c = b.close >= b.open ? up : down; g.strokeStyle = c; g.fillStyle = c; g.lineWidth = 1
        const X = Math.round(x(i)) + 0.5
        g.beginPath(); g.moveTo(X, y(b.high)); g.lineTo(X, y(b.low)); g.stroke()
        const t = y(Math.max(b.open, b.close)), bt = y(Math.min(b.open, b.close))
        g.fillRect(Math.round(x(i) - step * 0.35), t, Math.max(1, Math.round(step * 0.7)), Math.max(1, bt - t))
      })
      if (pane.ma) {
        const periods = { D: [25, 75], W: [13, 26], M: [12, 24] }[pane.tf]
        periods.forEach((p, k) => {
          const ma = M.sma(all, p), byT = new Map(ma.map((q) => [q.time, q.value]))
          g.strokeStyle = css(k ? '--ma3' : '--ma2'); g.lineWidth = 1; g.beginPath(); let started = false
          bars.forEach((b, i) => { const v = byT.get(b.time); if (v == null) return; started ? g.lineTo(x(i), y(v)) : g.moveTo(x(i), y(v)); started = true })
          g.stroke()
        })
      }
    }
    // 十字線の日付同期（FR-G8）
    if (hoverDate) {
      let k = -1; for (let i = 0; i < n; i++) { if (bars[i].time <= hoverDate) k = i; else break }
      if (k >= 0) {
        g.strokeStyle = '#7a8594'; g.setLineDash([2, 2]); g.beginPath(); g.moveTo(Math.round(x(k)) + 0.5, 0); g.lineTo(Math.round(x(k)) + 0.5, H); g.stroke(); g.setLineDash([])
        const b = bars[k]; g.fillStyle = 'rgba(16,19,24,.85)'; g.fillRect(4, H - volH - 16, 150, 14)
        g.fillStyle = css('--text-2'); g.fillText(`${b.time.replaceAll('-', '/')}  ${fmtPx(b.close)}  ${sgn((b.close / base - 1) * 100, 1, '%')}`, 6, H - volH - 5)
      }
    }
  }
  function mark() { tiles.querySelectorAll('.gt[data-i]').forEach((t) => t.classList.toggle('sel', +t.dataset.i === pane.sel)) }
  function sendSel() { const c = pageCodes()[pane.sel]; if (c && pane.link) S.links[pane.link] = c, (() => { for (const m of mounted.values()) if (m.pane.link === pane.link && m.pane !== pane) m.api.update() })() }
  function resize(d) { pane.size = Math.max(0, Math.min(GRIDS.length - 1, pane.size + d)); pane.page = 0; pane.sel = 0; update() }
  function cycleSort() { if (pane.sort === 'none') { pane.sort = SORTS[0]; pane.dir = -1; pane.page = 0; return update() } const i = SORTS.indexOf(pane.sort); if (pane.dir < 0) pane.dir = 1; else { pane.sort = SORTS[(i + 1) % SORTS.length]; pane.dir = -1 } pane.page = 0; update() }
  function zoom(c) { pane.zoom = pane.zoom ? null : c; renderTiles() }
  function toggleCand(c) { const l = S.lists.find((x) => x.id === 'cand'); if (l.codes.includes(c)) { l.codes = l.codes.filter((x) => x !== c); toast(`${T('candOff')}: ${c}`) } else { l.codes.push(c); toast(`${T('candOn')}: ${c}`) } update() }
  const ro = new ResizeObserver(() => schedule()); ro.observe(tiles)
  return {
    update, current: () => (pane.zoom ?? pageCodes()[pane.sel]), destroy: () => ro.disconnect(), resize: () => schedule(), addOwn,
    key(e) {
      const k = e.key, [cols] = dims(), n = pageCodes().length
      if (pane.zoom && k === 'Escape') { zoom(); return true }
      if (!e.ctrlKey && !e.altKey) {
        const mv = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[k]
        if (mv && !pane.zoom) { pane.sel = Math.max(0, Math.min(n - 1, pane.sel + mv)); mark(); sendSel(); return true }
        if (k === 'Home' || k === 'End') { pane.sel = k === 'Home' ? 0 : n - 1; mark(); sendSel(); return true }
        if (k === 'PageDown' || k === 'PageUp') { const pages = Math.ceil(codes().length / perPage()); pane.page = Math.max(0, Math.min(pages - 1, pane.page + (k === 'PageDown' ? 1 : -1))); pane.sel = 0; update(); sendSel(); return true }
        const c = e.code
        if (c === 'KeyD' || c === 'KeyW' || c === 'KeyM') { pane.tf = c.slice(3); update(); return true }
        if (c === 'KeyL') { pane.scale = pane.scale === 1 ? 0 : 1; update(); return true }
        if (c === 'KeyN') { pane.scale = pane.scale === 2 ? 0 : 2; update(); return true }
        if (c === 'KeyI') { pane.ma = !pane.ma; update(); return true }
        if (c === 'KeyS') { cycleSort(); return true }
        if (c === 'KeyX') { pane.sync = !pane.sync; toast(`Sync: ${pane.sync ? 'ON' : 'OFF'}`); return true }
        if (k === '+' || k === ';' || c === 'NumpadAdd') { resize(1); return true }
        if (k === '-' || c === 'NumpadSubtract') { resize(-1); return true }
        if (c === 'Space' && e.shiftKey) { pane.candOnly = !pane.candOnly; pane.page = 0; pane.sel = 0; update(); return true }
        if (c === 'Space') { const cd = pane.zoom ?? pageCodes()[pane.sel]; if (cd) toggleCand(cd); return true }
        if (k === 'Enter') { zoom(pageCodes()[pane.sel]); return true }
        if (c === 'KeyP') { pinCurrent(); return true }
        if (k === 'Delete' && pane.src === 'own') { const cd = pageCodes()[pane.sel]; pane.own = pane.own.filter((x) => x !== cd); pane.sel = Math.max(0, pane.sel - 1); update(); toast(`${T('removedGrid')}: ${cd}`); return true }
      }
      if (e.altKey && !e.shiftKey && !e.ctrlKey && pane.src === 'own' && pane.sort === 'none' && (k === 'ArrowLeft' || k === 'ArrowRight')) {
        const i = pane.page * perPage() + pane.sel, j = i + (k === 'ArrowLeft' ? -1 : 1)
        if (j >= 0 && j < pane.own.length) { [pane.own[i], pane.own[j]] = [pane.own[j], pane.own[i]]; pane.sel += j - i; update() }
        return true
      }
      if (e.altKey && /^Digit[1-6]$/.test(e.code)) { pane.period = +e.code.slice(5) - 1; update(); return true }
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyA') { bar.querySelector('[data-a="tolist"]').click(); return true }
      return false
    },
  }
}
const candSet = () => new Set(S.lists.find((l) => l.id === 'cand').codes)

// dividend calendar（P2）: 月と銘柄を選んでリンクグループへ送る
VIEWS.divcal = (pane, body, h) => {
  pane.m ??= 10; pane.r ??= 0
  body.innerHTML = `<div class="cal"></div>`
  const lists = () => { const codes = [...new Set([...S.favs, ...S.lists.flatMap((l) => l.codes)])]; return Array.from({ length: 12 }, (_, i) => codes.filter((c) => M.byCode[c].months.includes(i + 1)).sort((a, b) => MET(b).yld - MET(a).yld)) }
  function update() {
    header(pane, h, `<span class="dim">${S.lang === 'ja' ? '権利確定月 · 全ウォッチリスト' : 'Record month · all watchlists'}</span>`)
    const L = lists()
    body.querySelector('.cal').innerHTML = L.map((list, i) => `<div class="m ${i === 10 ? 'now' : ''} ${i === pane.m ? 'cur' : ''}"><h5><span>${T('month')(i + 1)}</span><span class="num muted">${list.length}</span></h5>${list.slice(0, 6).map((c, r) => `<div class="row ${i === pane.m && r === pane.r ? 'sel' : ''}" data-m="${i}" data-r="${r}"><span>${S.favs.has(c) ? '<span class="star on">★</span> ' : ''}${esc(nameOf(c))}</span><span>${fmt(MET(c).yld)}%</span></div>`).join('')}</div>`).join('')
    body.querySelectorAll('.row').forEach((el) => (el.onclick = () => { pane.m = +el.dataset.m; pane.r = +el.dataset.r; update(); send() }))
  }
  const send = () => { const c = lists()[pane.m][pane.r]; if (c) setLinkCode(pane.link, c) }
  return {
    update, current: () => lists()[pane.m][pane.r],
    key(e) {
      if (e.ctrlKey || e.altKey) return false
      const L = lists(), k = e.key
      if (k === 'ArrowLeft' || k === 'ArrowRight') { let m = pane.m; do { m = (m + (k === 'ArrowRight' ? 1 : -1) + 12) % 12 } while (!L[m].length && m !== pane.m); pane.m = m; pane.r = 0; update(); send(); return true }
      if (k === 'ArrowUp' || k === 'ArrowDown') { const n = Math.min(6, L[pane.m].length); if (!n) return true; pane.r = (pane.r + (k === 'ArrowDown' ? 1 : -1) + n) % n; update(); send(); return true }
      if (k === 'Enter') { send(); return true }
      return false
    },
  }
}

// ---------------------------------------------------------------- favorites / toasts
function toggleFav(c) { if (S.favs.has(c)) { S.favs.delete(c); toast(`${T('favOff')}: ${c}`) } else { S.favs.add(c); toast(`${T('favOn')}: ${c}`) } refreshAll() }
function toastAction(msg, label, fn) {
  document.querySelector('.toast')?.remove()
  const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = `<span>${esc(msg)}</span><button type="button" class="chip" style="margin-left:12px">${esc(label)}</button>`
  t.querySelector('button').onclick = fn; document.body.appendChild(t)
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 10000)
}
let toastTimer
function toast(msg) {
  document.querySelector('.toast')?.remove()
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t)
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 1800)
}

// ---------------------------------------------------------------- status bar（FR-V4）
let job = null
function renderStatus() {
  const sb = document.getElementById('statusbar')
  const jobTxt = job ? `${T('updating')} <span class="num">${job.done.toLocaleString(loc())} / 2,091</span><span class="progress"><i style="width:${(job.done / 2091) * 100}%"></i></span>` : T('idle')
  sb.innerHTML = `<span><span class="dot"></span>${T('lastUpd')} <span class="num">${S.lang === 'ja' ? '2026/11/12 16:05' : 'Nov 12, 2026 16:05'}</span></span><span>${T('jobs')}: ${jobTxt}<kbd>F5</kbd></span><span>${T('source')}</span><span class="mockbadge">${T('mock')}</span><span class="grow"></span><span>${T('notAdvice')}</span><span>${S.lang === 'ja' ? '日本語' : 'English'}</span><span>${T('help')} <kbd>F1</kbd></span>`
  document.getElementById('cmd-ph').textContent = T('cmdPh')
  document.getElementById('market-state').textContent = T('open')
  const rb = document.getElementById('reset'); rb.innerHTML = `⟲ ${T('resetSizes')} <kbd>Ctrl+Alt+R</kbd>`; rb.onclick = () => resetSizes()
}
function runJob() {
  if (job) return
  job = { done: 0 }
  const t = setInterval(() => { job.done = Math.min(2091, job.done + 97); renderStatus(); if (job.done >= 2091) { clearInterval(t); job = null; renderStatus() } }, 120)
}
setInterval(() => { document.getElementById('clock').textContent = new Date().toLocaleTimeString(loc(), { hour12: false }) }, 1000)

// ---------------------------------------------------------------- actions（FR-KB1）
const ACTIONS = [
  { id: 'layout1', ja: 'レイアウト: MTF', en: 'Layout: MTF', key: 'Ctrl+Shift+1', run: () => switchLayout(0) },
  { id: 'layout2', ja: 'レイアウト: グリッド', en: 'Layout: Grid', key: 'Ctrl+Shift+2', run: () => switchLayout(1) },
  { id: 'layout3', ja: 'レイアウト: スクリーナー', en: 'Layout: Screener', key: 'Ctrl+Shift+3', run: () => switchLayout(2) },
  { id: 'screens', ja: 'スクリーンを開く…', en: 'Open screen…', key: 'Ctrl+O', run: () => openScreens() },
  { id: 'resetSizes', ja: 'サイズを元に戻す（今のレイアウト）', en: 'Reset pane sizes (this layout)', key: 'Ctrl+Alt+R', run: () => resetSizes() },
  { id: 'resetLayout', ja: 'レイアウトを初期状態に戻す…', en: 'Reset layout to preset…', key: '', run: () => confirmLayoutReset() },
  { id: 'pinGrid', ja: 'グリッド: 今の銘柄で固定', en: 'Grid: pin current symbols', key: 'P', run: () => { const g = [...mounted.values()].find((x) => x.pane.type === 'grid'); if (g) g.api.key(new KeyboardEvent('keydown', { code: 'KeyP', key: 'p' })) } },
  { id: 'drawer', ja: '左のドロワーを開く / 閉じる', en: 'Toggle left drawer', key: 'Ctrl+B', run: () => toggleDock() },
  { id: 'pin', ja: 'ドロワーをピン留め', en: 'Pin drawer', key: 'Ctrl+Alt+B', run: () => pinDock() },
  { id: 'opengrid', ja: 'スクリーナーの結果をグリッドで開く', en: 'Open screener results in grid', key: 'Ctrl+Shift+G', run: () => openInGrid() },
  { id: 'layout4', ja: 'レイアウト: インカム', en: 'Layout: Income', key: 'Ctrl+Shift+4', run: () => switchLayout(3) },
  { id: 'max', ja: 'ペインを最大化 / 戻す', en: 'Maximize / restore pane', key: 'Ctrl+Shift+Enter', run: () => toggleMax(S.focus) },
  { id: 'fav', ja: 'お気に入りの切り替え', en: 'Toggle favorite', key: 'Ctrl+D', run: () => toggleFav(focusedCode()) },
  { id: 'update', ja: 'データを更新', en: 'Update data', key: 'F5', run: runJob },
  { id: 'settings', ja: '設定を開く', en: 'Open settings', key: 'Ctrl+,', run: () => openSettings() },
  { id: 'data', ja: '設定: データの削除と取り直し', en: 'Settings: delete & refetch data', key: '', run: () => openSettings('data') },
  { id: 'lang', ja: '言語を切り替え（日本語 / English）', en: 'Switch language (日本語 / English)', key: '', run: () => setLang(S.lang === 'ja' ? 'en' : 'ja') },
  { id: 'colors', ja: 'ローソク足の色: 日本式 / 欧米式', en: 'Candle colors: Japanese / Western', key: '', run: () => setColors(S.colors === 'jp' ? 'us' : 'jp') },
  { id: 'density', ja: '行の高さ: 標準 / 詰める', en: 'Row height: normal / compact', key: '', run: () => setDensity(S.density === 'normal' ? 'compact' : 'normal') },
  { id: 'help', ja: 'ショートカット一覧', en: 'Keyboard shortcuts', key: 'F1', run: () => openHelp() },
  { id: 'newlist', ja: '新しいウォッチリスト', en: 'New watchlist', key: '', run: () => toast(S.lang === 'ja' ? 'モックでは未実装' : 'Not in mock') },
  { id: 'split', ja: '右に分割', en: 'Split right', key: 'Ctrl+Shift+E', run: () => toast(S.lang === 'ja' ? 'モックでは未実装' : 'Not in mock') },
]
function toggleDock() { const d = LAYOUTS[S.layout].docks?.left; if (!d) return toast(S.lang === 'ja' ? 'このレイアウトにはドロワーがありません' : 'No drawer in this layout'); d.open ? (d.pinned ? pinDock() : closeDock()) : openDock(true) }
function openInGrid() { switchLayout(1); const g = [...mounted.values()].find((m) => m.pane.type === 'grid'); g.pane.src = 'live'; g.api.update(); setFocus(g.pane.id) }
const focusedCode = () => { const m = mounted.get(S.focus); return m?.api.current?.() ?? codeOf(m.pane) }
function setLang(l) { S.lang = l; document.documentElement.lang = l; build() }
function setColors(c) { S.colors = c; document.documentElement.dataset.colors = c; build() }
function setDensity(d) { S.density = d; document.documentElement.dataset.density = d; build() }

// ---------------------------------------------------------------- overlays
function openScreenById(id) { const scr = [...mounted.values()].find((m) => m.pane.type === 'screener'); if (scr) { const d = LAYOUTS[S.layout].docks?.left; if (scr.inDock && d) { d.active = d.panes.indexOf(scr.pane); openDock(true) } else setFocus(scr.pane.id); scr.pane.openScreen(id) } else { switchLayout(2); setTimeout(() => [...mounted.values()].find((m) => m.pane.type === 'screener')?.pane.openScreen(id)) } }
function closeOverlay() { const cb = S.onOverlayClose; S.onOverlayClose = null; cb?.(); document.getElementById('overlay-root').innerHTML = ''; S.overlay = null; setFocus(S.focus) }
function overlay(html, kind) {
  const root = document.getElementById('overlay-root'); root.innerHTML = html; S.overlay = kind
  root.querySelector('.scrim')?.addEventListener('mousedown', (e) => { if (e.target.classList.contains('scrim')) closeOverlay() })
  return root
}
// command bar（Ctrl+K）
function openPalette(initial = '') {
  const root = overlay(`<div class="scrim"><div class="dialog palette" role="dialog"><input aria-label="command" placeholder="${esc(T('cmdPh'))}" value="${esc(initial)}"><div class="res"></div><div class="foot"><span>${T('toMove')}</span><span>${T('toEnter')}</span><span>${T('toClose')}</span><span style="margin-left:auto">&gt; ${S.lang === 'ja' ? 'でアクションのみ' : 'for actions only'}</span></div></div></div>`, 'palette')
  const input = root.querySelector('input'), res = root.querySelector('.res'); let sel = 0, items = []
  function render() {
    const q = input.value.trim().normalize('NFKC').toLowerCase(), actOnly = q.startsWith('>'), qq = actOnly ? q.slice(1).trim() : q
    const acts = ACTIONS.filter((a) => !qq || a[S.lang].toLowerCase().includes(qq) || a.ja.includes(qq)).map((a) => ({ kind: 'a', a }))
    const syms = actOnly ? [] : M.instruments.filter((i) => !qq || i.code.toLowerCase().startsWith(qq) || i.ja.toLowerCase().includes(qq) || i.en.toLowerCase().includes(qq)).slice(0, 8).map((i) => ({ kind: 's', i }))
    const scrs = S.screens.filter((x) => !qq || nameOfScreen(x).toLowerCase().includes(qq)).map((x) => ({ kind: 'scr', x }))
    items = [...syms, ...scrs, ...acts]; sel = Math.min(sel, items.length - 1)
    let html = ''
    if (syms.length) html += `<div class="grp">${T('symbols')}</div>` + syms.map((x, k) => `<div class="it ${k === sel ? 'sel' : ''}" data-k="${k}"><span class="c">${x.i.code}</span><span class="n">${esc(nameOf(x.i.code))}</span><span class="s">${T('mktName')[x.i.mkt]}</span></div>`).join('')
    if (scrs.length) html += `<div class="grp">${S.lang === 'ja' ? 'スクリーン' : 'Screens'}</div>` + scrs.map((x, k) => `<div class="it ${k + syms.length === sel ? 'sel' : ''}" data-k="${k + syms.length}"><span class="c">⌕</span><span class="n">${esc(nameOfScreen(x.x))}</span><span class="s">${evalConds(x.x.conds).length} ${T('hits')}</span></div>`).join('')
    if (acts.length) html += `<div class="grp">${T('actions')}</div>` + acts.map((x, k) => `<div class="it ${k + syms.length + scrs.length === sel ? 'sel' : ''}" data-k="${k + syms.length + scrs.length}"><span class="n">${esc(x.a[S.lang])}</span>${x.a.key ? `<kbd>${x.a.key}</kbd>` : ''}</div>`).join('')
    res.innerHTML = html
    res.querySelectorAll('.it').forEach((el) => (el.onclick = () => { sel = +el.dataset.k; go() }))
    res.querySelector('.sel')?.scrollIntoView({ block: 'nearest' })
  }
  function go() { const x = items[sel]; if (!x) return; closeOverlay(); if (x.kind === 'a') x.a.run(); else if (x.kind === 'scr') openScreenById(x.x.id); else sendSymbol(x.i.code) }
  input.addEventListener('input', () => { sel = 0; render() })
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); render(); e.preventDefault() }
    else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); render(); e.preventDefault() }
    else if (e.key === 'Enter') { go(); e.preventDefault() }
  })
  render(); input.focus()
}
function sendSymbol(code) { const m = mounted.get(S.focus); if (m.pane.type === 'grid') return m.api.addOwn(code); if (m.pane.link) setLinkCode(m.pane.link, code); else { m.pane.code = code; m.api.update() } toast(`${code} ${nameOf(code)} → ${T('linkSet')} ${m.pane.link || '—'}`) }
// symbol jump（数字キー。FR-O1）
function openJump(first) {
  const root = overlay(`<div class="dialog jump"><div class="big">${esc(first)}</div><div class="res palette" style="width:auto"></div><div class="foot" style="display:flex;justify-content:space-between;padding:6px 12px;color:var(--text-3);font-size:11px;border-top:1px solid var(--line-strong)"><span>${T('jump')}</span><span>${T('jumpHint')}</span></div></div>`, 'jump')
  let buf = first, sel = 0
  const big = root.querySelector('.big'), res = root.querySelector('.res')
  function render() {
    big.textContent = buf.length < 4 ? buf.padEnd(4, '_') : buf
    const cand = M.instruments.filter((i) => i.code.startsWith(buf)).slice(0, 6)
    sel = Math.min(sel, Math.max(0, cand.length - 1))
    res.innerHTML = cand.map((i, k) => `<div class="it ${k === sel ? 'sel' : ''}"><span class="c">${i.code}</span><span class="n">${esc(nameOf(i.code))}</span><span class="s">${T('mktName')[i.mkt]}</span></div>`).join('') || `<div class="it muted">—</div>`
    return cand
  }
  let cand = render()
  S.jumpKey = (e) => {
    if (/^[0-9a-zA-Z]$/.test(e.key) && !e.ctrlKey && !e.altKey && buf.length < 5) { buf += e.key.toUpperCase(); cand = render() }
    else if (e.key === 'Backspace') { buf = buf.slice(0, -1); if (!buf) return closeOverlay(); cand = render() }
    else if (e.key === 'ArrowDown') { sel++; cand = render() } else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); cand = render() }
    else if (e.key === 'Enter') { const c = cand[sel]; closeOverlay(); if (c) sendSymbol(c.code) }
    else if (e.key === 'Escape') closeOverlay()
    e.preventDefault()
  }
}
// F1 help（FR-KB7）
const HELP = {
  ja: [
    ['全体', [['銘柄ジャンプ', '1〜9'], ['コマンドバー', 'Ctrl+K'], ['ショートカット一覧', 'F1'], ['ペイン間の移動', 'Alt+← → ↑ ↓'], ['ペインを順に巡る', 'F6 / Shift+F6'], ['最大化 / 戻す', 'Ctrl+Shift+Enter'], ['右に分割 / 下に分割 / 閉じる', 'Ctrl+Shift+E / O / W'], ['区切り線を動かす', 'Alt+Shift+矢印'], ['サイズを元に戻す / 取り消し', 'Ctrl+Alt+R / Ctrl+Z'], ['ペインを入れ替える', 'Ctrl+Alt+Shift+矢印'], ['リンク色 1〜5 / 解除', 'Ctrl+1〜5 / Ctrl+0'], ['保存レイアウト', 'Ctrl+Shift+1〜9'], ['レイアウトの一覧', 'Ctrl+Shift+L'], ['データ更新 / 選択銘柄', 'F5 / Shift+F5'], ['設定', 'Ctrl+,'], ['閉じる・戻す', 'Esc']]],
    ['一覧', [['行を移動（チャートが追従）', '↑ ↓ PgUp PgDn Home End'], ['列を移動 / 並べ替え', '← → / S'], ['リンクグループに送る', 'Enter'], ['お気に入り', 'Ctrl+D'], ['★のみ表示', 'Ctrl+Shift+F'], ['ウォッチリストに追加', 'Ctrl+Shift+A'], ['リストから外す', 'Delete'], ['行を並べ替える', 'Alt+↑ ↓'], ['リストの切り替え', 'Ctrl+PgUp / PgDn'], ['列の選択', 'Ctrl+Shift+C']]],
    ['チャートグリッド', [['タイルを移動', '← → ↑ ↓ / PgUp PgDn'], ['全タイルの時間軸', 'D / W / M'], ['全タイルの期間', 'Alt+1〜6'], ['格子を細かく / 粗く', '+ / −'], ['対数 / 比較%', 'L / N'], ['移動平均・出来高', 'I'], ['並べ替え', 'S'], ['売買候補の印 / 印だけ表示', 'Space / Shift+Space'], ['候補をウォッチリストへ', 'Ctrl+Shift+A'], ['1 枚を最大化', 'Enter'], ['十字線の日付同期', 'X'], ['今の銘柄で固定 / 外す / 並べ替え', 'P / Delete / Alt+← →'], ['銘柄を足す', '1〜9 → Enter']]],
    ['ドロワー', [['左 / 右のドロワー', 'Ctrl+B / Ctrl+Shift+B'], ['ピン留め', 'Ctrl+Alt+B'], ['閉じる', 'Esc']]],
    ['チャート', [['日足 / 週足 / 月足', 'D / W / M'], ['対数軸 / 価格の調整', 'L / A'], ['指標メニュー', 'I'], ['ズーム / 既定に戻す', '+ − / 0'], ['時間方向のスクロール', '← →（Shift で1画面）'], ['キーボード十字線', 'X → ← →']]],
  ],
  en: [
    ['General', [['Symbol jump', '1–9'], ['Command bar', 'Ctrl+K'], ['Shortcuts', 'F1'], ['Move between panes', 'Alt+Arrows'], ['Cycle panes', 'F6 / Shift+F6'], ['Maximize / restore', 'Ctrl+Shift+Enter'], ['Split right / down / close', 'Ctrl+Shift+E / O / W'], ['Move divider', 'Alt+Shift+Arrows'], ['Reset sizes / undo', 'Ctrl+Alt+R / Ctrl+Z'], ['Swap pane', 'Ctrl+Alt+Shift+Arrows'], ['Link color 1–5 / none', 'Ctrl+1–5 / Ctrl+0'], ['Saved layouts', 'Ctrl+Shift+1–9'], ['Layouts list', 'Ctrl+Shift+L'], ['Update all / selected', 'F5 / Shift+F5'], ['Settings', 'Ctrl+,'], ['Close / back', 'Esc']]],
    ['Lists', [['Move row (charts follow)', '↑ ↓ PgUp PgDn Home End'], ['Move column / sort', '← → / S'], ['Send to link group', 'Enter'], ['Favorite', 'Ctrl+D'], ['★ only', 'Ctrl+Shift+F'], ['Add to watchlist', 'Ctrl+Shift+A'], ['Remove from list', 'Delete'], ['Reorder rows', 'Alt+↑ ↓'], ['Switch list', 'Ctrl+PgUp / PgDn'], ['Columns', 'Ctrl+Shift+C']]],
    ['Chart grid', [['Move tile', 'Arrows / PgUp PgDn'], ['All tiles: timeframe', 'D / W / M'], ['All tiles: period', 'Alt+1–6'], ['Finer / coarser grid', '+ / −'], ['Log / compare %', 'L / N'], ['MA & volume', 'I'], ['Sort', 'S'], ['Mark candidate / only marked', 'Space / Shift+Space'], ['Candidates to watchlist', 'Ctrl+Shift+A'], ['Maximize tile', 'Enter'], ['Crosshair date sync', 'X'], ['Pin / remove / reorder', 'P / Delete / Alt+← →'], ['Add symbol', '1–9 then Enter']]],
    ['Drawers', [['Left / right drawer', 'Ctrl+B / Ctrl+Shift+B'], ['Pin', 'Ctrl+Alt+B'], ['Close', 'Esc']]],
    ['Chart', [['Daily / weekly / monthly', 'D / W / M'], ['Log scale / adjustment', 'L / A'], ['Indicators', 'I'], ['Zoom / reset', '+ − / 0'], ['Scroll in time', '← → (Shift: page)'], ['Keyboard crosshair', 'X then ← →']]],
  ],
}
function openHelp() {
  const ctx = { watchlist: 1, screener: 1, divcal: 1, grid: 2, chart: 4 }[mounted.get(S.focus)?.pane.type]
  overlay(`<div class="scrim"><div class="dialog help"><h3><span>${T('help')}</span><span class="muted" style="font-weight:400;font-size:11px">● ${S.lang === 'ja' ? 'フォーカス中のペインで効くキー' : 'keys for the focused pane'} · Esc</span></h3><div class="cols">${HELP[S.lang].map(([g, rows], gi) => `<section><h4>${g}</h4>${rows.map(([a, k]) => `<div class="row ${gi === ctx ? 'ctx' : ''}"><span>${a}</span><kbd>${k}</kbd></div>`).join('')}</section>`).join('')}</div></div></div>`, 'help')
}
// settings（FR-S5〜S9, FR-D6）
function openSettings(tab = 'general') {
  const tabs = ['general', 'display', 'data', 'keys']
  const root = overlay(`<div class="scrim"><div class="dialog settings" role="dialog"><nav></nav><div class="body"></div></div></div>`, 'settings')
  const nav = root.querySelector('nav'), body = root.querySelector('.body')
  function render() {
    nav.innerHTML = `<h3 style="padding:4px 16px 8px">${T('settings')}</h3>` + tabs.map((t) => `<button type="button" role="tab" data-t="${t}" aria-selected="${t === tab}">${T(t)}</button>`).join('')
    nav.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { tab = b.dataset.t; render() }))
    const seg = (name, opts, cur) => `<span class="seg" data-g="${name}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${v === cur}">${l}</button>`).join('')}</span>`
    if (tab === 'general') body.innerHTML = `<div class="field"><span>${T('language')}</span>${seg('lang', [['ja', '日本語'], ['en', 'English']], S.lang)}</div><div class="field"><span>${T('density')}</span>${seg('density', [['normal', T('normal')], ['compact', T('compact')]], S.density)}</div>`
    if (tab === 'display') body.innerHTML = `<div class="field"><span>${T('candle')}</span>${seg('colors', [['jp', T('jpStyle')], ['us', T('usStyle')]], S.colors)}</div><div class="field"><span>${T('theme')}</span>${seg('theme', [['dark', T('dark')]], 'dark')}</div>`
    if (tab === 'data') body.innerHTML = `<div class="stat"><div><b>152 MB</b><span>${T('dbSize')}</span></div><div><b>2,091</b><span>${T('symbolsN')}</span></div><div><b>3</b><span>${T('failures')}</span></div></div>
      <div class="field"><span>${T('retention')}</span><span class="seg" data-g="ret">${Array.from({ length: 10 }, (_, i) => `<button type="button" aria-pressed="${i + 1 === 5}">${i + 1}</button>`).join('')}</span></div>
      <div class="field"><span>${T('period')}</span><span class="num dim">2021/11/12 – 2026/11/12 · ${S.lang === 'ja' ? '月足は上場以来' : 'monthly since listing'}</span></div>
      <div class="actions"><button type="button" class="btn danger" data-x="all">${T('clearAll')}</button><button type="button" class="btn" data-x="some">${T('clearSome')}</button></div><p class="muted" style="margin-top:8px;font-size:11px">${T('dataNote')}</p>`
    if (tab === 'keys') body.innerHTML = `<p class="dim">${S.lang === 'ja' ? 'すべてのキーは変更できます（FR-KB6）。一覧は F1。' : 'Every key can be rebound (FR-KB6). See F1 for the list.'}</p>`
    body.querySelectorAll('.seg[data-g] button[data-v]').forEach((b) => (b.onclick = () => {
      const g = b.parentElement.dataset.g, v = b.dataset.v
      if (g === 'lang') setLang(v); if (g === 'colors') setColors(v); if (g === 'density') setDensity(v)
      openSettings(tab)
    }))
    body.querySelector('[data-x="all"]')?.addEventListener('click', confirmClear)
    nav.querySelector('[aria-selected="true"]').focus()
  }
  S.settingsKey = (e) => {
    if (document.activeElement?.closest('nav') && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { tab = tabs[(tabs.indexOf(tab) + (e.key === 'ArrowDown' ? 1 : -1) + tabs.length) % tabs.length]; render(); return true }
    return false
  }
  render()
}
function confirmClear() {
  const root = overlay(`<div class="scrim"><div class="dialog confirm" role="alertdialog"><h3>${T('confirmTitle')}</h3><ul>${T('confirmItems').map((x) => `<li>${x}</li>`).join('')}</ul><p class="muted" style="font-size:11px">${T('dataNote')}</p><label class="chk"><input type="checkbox" checked> ${T('keepDelisted')}</label><div class="actions" style="justify-content:flex-end"><button type="button" class="btn" data-x="no">${T('cancel')}</button><button type="button" class="btn danger" data-x="yes">${T('doClear')}</button></div></div></div>`, 'confirm')
  root.querySelector('[data-x="no"]').onclick = closeOverlay
  root.querySelector('[data-x="yes"]').onclick = () => { closeOverlay(); toast(T('cleared')); runJob() }
  root.querySelector('[data-x="no"]').focus()
}

// ---------------------------------------------------------------- keyboard（§6.5）
function paneRects() { return [...mounted.values()].filter((m) => m.el.offsetParent).map((m) => ({ id: m.pane.id, r: m.el.getBoundingClientRect() })) }
function moveFocus(dir) {
  const cur = mounted.get(S.focus).el.getBoundingClientRect(), cx = cur.x + cur.width / 2, cy = cur.y + cur.height / 2
  let best = null, bd = Infinity
  for (const { id, r } of paneRects()) {
    if (id === S.focus) continue
    const x = r.x + r.width / 2, y = r.y + r.height / 2
    const ok = { left: r.right <= cur.left + 1, right: r.left >= cur.right - 1, up: r.bottom <= cur.top + 1, down: r.top >= cur.bottom - 1 }[dir]
    if (!ok) continue
    const d = Math.hypot(x - cx, y - cy); if (d < bd) { bd = d; best = id }
  }
  if (best) setFocus(best)
}
const inText = (e) => e.target.matches?.('input, textarea')
document.addEventListener('keydown', (e) => {
  if (S.overlay === 'jump') return S.jumpKey(e)
  if (e.key === 'Escape') { if (S.overlay) { closeOverlay(); e.preventDefault(); return } const gm = mounted.get(S.focus); if (gm?.pane.type === 'grid' && gm.pane.zoom) { gm.api.key(e); e.preventDefault(); return } if (S.maximized) { toggleMax(S.maximized); e.preventDefault(); return } const d = LAYOUTS[S.layout].docks?.left; if (d?.open && !d.pinned) { closeDock(); e.preventDefault(); return } }
  if (S.overlay === 'settings' && S.settingsKey(e)) { e.preventDefault(); return }
  if (e.key === 'F1') { e.preventDefault(); return S.overlay === 'help' ? closeOverlay() : openHelp() }
  if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'k') { e.preventDefault(); return openPalette() }
  if (S.overlay) return
  if (inText(e)) return
  const m = mounted.get(S.focus)
  if (e.ctrlKey && e.altKey && e.code === 'KeyR') { e.preventDefault(); return resetSizes() }
  if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === 'KeyZ' && undoSnap) { e.preventDefault(); return undoReset() }
  if (e.altKey && e.shiftKey && !e.ctrlKey && e.key.startsWith('Arrow')) { e.preventDefault(); return nudgeDivider(e.key.slice(5).toLowerCase()) }
  if (e.ctrlKey && e.code === 'KeyB' && !e.shiftKey) { e.preventDefault(); return e.altKey ? pinDock() : toggleDock() }
  if (e.ctrlKey && e.shiftKey && e.code === 'KeyG') { e.preventDefault(); return openInGrid() }
  if (e.ctrlKey && e.shiftKey && /^Digit[1-4]$/.test(e.code)) { e.preventDefault(); return switchLayout(+e.code.slice(5) - 1) }
  if (e.ctrlKey && e.shiftKey && e.key === 'Enter') { e.preventDefault(); return toggleMax(S.focus) }
  if (e.ctrlKey && !e.shiftKey && /^Digit[0-5]$/.test(e.code)) { e.preventDefault(); m.pane.link = +e.code.slice(5); m.api.update(); return toast(`${T('linkSet')}: ${m.pane.link || '—'}`) }
  if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'd') { e.preventDefault(); return toggleFav(focusedCode()) }
  if (e.ctrlKey && e.key === ',') { e.preventDefault(); return openSettings() }
  if (e.key === 'F5') { e.preventDefault(); return runJob() }
  if (e.key === 'F6') { e.preventDefault(); const ids = [...mounted.keys()].filter((id) => mounted.get(id).el.offsetParent); const i = ids.indexOf(S.focus); return setFocus(ids[(i + (e.shiftKey ? -1 : 1) + ids.length) % ids.length]) }
  if (e.altKey && !e.shiftKey && !e.ctrlKey && e.key.startsWith('Arrow') && !(m.pane.type === 'watchlist' && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && false)) {
    if ((m.pane.type === 'watchlist' && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && m.pane.list !== 'fav') || (m.pane.type === 'grid' && m.pane.src === 'own' && m.pane.sort === 'none' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight'))) { /* Alt+↑↓ はリスト内の並べ替え */ } else { e.preventDefault(); return moveFocus(e.key.slice(5).toLowerCase()) }
  }
  if (m.api.key?.(e)) { e.preventDefault(); return }
  if (/^Digit[1-9]$/.test(e.code) && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.isComposing) { e.preventDefault(); return openJump(e.code.slice(5)) }
})
window.addEventListener('resize', () => { for (const m of mounted.values()) if (m.pane.type === 'info') m.api.update() })
document.getElementById('cmd').onclick = () => openPalette()

// URL のハッシュで画面の状態を指定できる（スクリーンショット用）: #layout=1&lang=en&colors=us&density=compact&down=2&overlay=palette
function applyHash() {
  const h = new URLSearchParams(location.hash.slice(1))
  if (h.get('lang')) { S.lang = h.get('lang'); document.documentElement.lang = S.lang }
  if (h.get('colors')) { S.colors = h.get('colors'); document.documentElement.dataset.colors = S.colors }
  if (h.get('density')) { S.density = h.get('density'); document.documentElement.dataset.density = S.density }
  if (h.get('layout')) S.layout = +h.get('layout')
  build()
  const m = mounted.get(S.focus)
  for (let i = 0; i < +(h.get('down') ?? 0); i++) m.api.key?.(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
  const ov = h.get('overlay')
  if (ov === 'palette') openPalette(h.get('q') ?? '')
  if (ov === 'help') openHelp()
  if (ov === 'settings') openSettings(h.get('tab') ?? 'general')
  const sm = [...mounted.values()].find((x) => x.pane.type === 'screener')
  if (sm && h.get('dirty')) { sm.pane.conds[0].v += 1; sm.api.update() }
  if (ov === 'screens') openScreens()
  if (ov === 'saveas' && sm) sm.api.key(new KeyboardEvent('keydown', { code: 'KeyS', key: 'S', ctrlKey: true, shiftKey: true }))
  if (ov === 'confirm') { openSettings('data'); confirmClear() }
  const gm = [...mounted.values()].find((x) => x.pane.type === 'grid')
  if (gm) { for (const k of ['tf', 'src']) if (h.get(k)) gm.pane[k] = h.get(k); for (const k of ['period', 'scale', 'size']) if (h.get(k)) gm.pane[k] = +h.get(k); if (h.get('cand')) S.lists.find((l) => l.id === 'cand').codes = h.get('cand').split(','); if (h.get('own')) { gm.pane.own = h.get('own').split(','); gm.pane.src = 'own'; gm.pane.sort = 'none' } gm.api.update() }
  if (h.get('dock') === 'open') openDock(true)
  if (ov === 'jump') { openJump('8'); S.jumpKey(new KeyboardEvent('keydown', { key: '9' })) }
}
document.fonts.ready.then(applyHash)
