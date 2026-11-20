// コマンドバー・ショートカット一覧・ペインの種類のモックが共有する関数（docs/design-dialogs.md §2）。
// アプリでは match は src/shared/match.ts、keyParts は lib/keys.ts にする想定。
;(function () {
  /** 比べるための形: NFKC・小文字・カタカナをひらがなに（長さは変えない） */
  const fold = (s) =>
    s
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
  const SEP = /[\s・/／（）()、:：\-]/

  /**
   * 空白で分けた語をすべて含むか（AND）。text のどこに当たったか（ranges）と点数を返す。
   * 語が text に無くても alias に当たれば残す（強調はしない・点数は低い）。
   */
  function match(q, text, alias = []) {
    const toks = fold(q).split(/\s+/).filter(Boolean)
    if (!toks.length) return { score: 0, ranges: [] }
    const ft = fold(text)
    const fa = alias.map(fold)
    let score = 0
    const ranges = []
    for (const tk of toks) {
      const i = ft.indexOf(tk)
      if (i >= 0) {
        ranges.push([i, i + tk.length])
        score += i === 0 ? 4 : SEP.test(ft[i - 1]) ? 3 : 1
      } else if (fa.some((a) => a.includes(tk))) score += 0.5
      else return null
    }
    return { score, ranges }
  }

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  /** 当たった範囲を <mark> にする（アプリでは {@html} を使わず、区切った文字列を {#each} で描く） */
  function hl(text, ranges) {
    if (!ranges || !ranges.length) return esc(text)
    const on = new Array(text.length).fill(false)
    for (const [a, b] of ranges) for (let i = a; i < b; i++) on[i] = true
    let out = ''
    let cur = false
    for (let i = 0; i < text.length; i++) {
      if (on[i] !== cur) {
        out += on[i] ? '<mark>' : '</mark>'
        cur = on[i]
      }
      out += esc(text[i])
    }
    return out + (cur ? '</mark>' : '')
  }

  /** "Ctrl+Shift+N / Ctrl+Z" → [["Ctrl","Shift","N"], ["Ctrl","Z"]]。"+ −" や "D W M" は空白で分けたキーの並び */
  function keyParts(s) {
    return s.split(/\s\/\s/).map((alt) =>
      alt
        .split(' ')
        .filter(Boolean)
        .flatMap((tok, j) => {
          const parts = tok.length > 1 && /.\+./.test(tok) ? tok.split('+') : [tok]
          return j ? [' ', ...parts] : parts
        }),
    )
  }
  /** 1 つの組み合わせの表記（"Alt+1–6" など）が、押した組み合わせ（"Alt+3"）に当たるか。1–9・Alt+1–6・Arrows の範囲にも当てる */
  function tokHits(tok, combo) {
    if (!combo) return false
    const want = combo.split('+')
    const wk = want.pop()
    const wm = want.sort().join('+')
    const ps = tok.length > 1 && /.\+./.test(tok) ? tok.split('+') : [tok]
    const k = ps.pop()
    if (ps.sort().join('+') !== wm) return false
    if (k === wk) return true
    const r = /^(\d)–(\d)$/.exec(k)
    if (r && /^\d$/.test(wk) && +wk >= +r[1] && +wk <= +r[2]) return true
    return k === 'Arrows' && '←→↑↓'.includes(wk)
  }
  /** 組み合わせの中の区切り（同時押し）と並び（空白）を区別して描く。combo を渡すと、当たった組み合わせだけ .hit にする */
  function keysHtml(s, combo) {
    if (!s) return ''
    return (
      '<span class="keys">' +
      s
        .split(/\s\/\s/)
        .map((alt) =>
          alt
            .split(' ')
            .filter(Boolean)
            .map((tok) => {
              const cls = tokHits(tok, combo) ? ' class="hit"' : ''
              return (tok.length > 1 && /.\+./.test(tok) ? tok.split('+') : [tok]).map((k) => `<kbd${cls}>${esc(k)}</kbd>`).join('<span class="pl">+</span>')
            })
            .join(' '),
        )
        .join('<span class="or">/</span>') +
      '</span>'
    )
  }

  /** 押したキーを "Ctrl+Shift+N" の形に（修飾キーだけのときは null） */
  const NAMES = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', ' ': 'Space', Escape: 'Esc', PageUp: 'PgUp', PageDown: 'PgDn', '-': '−' }
  function comboOf(e) {
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null
    const k = NAMES[e.key] ?? (e.code.startsWith('Key') ? e.code.slice(3) : e.code.startsWith('Digit') ? e.code.slice(5) : e.key.length === 1 ? e.key.toUpperCase() : e.key)
    const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift'].filter(Boolean)
    return [...mods, k].join('+')
  }
  /** 行のキーの表記に、押した組み合わせが含まれるか */
  function hasCombo(keys, combo) {
    if (!keys || !combo) return false
    return keys.split(/\s\/\s/).some((alt) => alt.split(' ').filter(Boolean).some((tok) => tokHits(tok, combo)))
  }

  // ---------------- 後ろのアプリ（架空のレイアウト）
  function stage(el, focus = 'チャート') {
    const panes = [
      ['ウォッチリスト', 'var(--l1)'],
      ['チャート', 'var(--l1)'],
      ['銘柄情報', 'var(--l1)'],
      ['ヒートマップ', ''],
    ]
    el.innerHTML = `<div class="app"><div class="top"><b style="color:var(--text)">elecxstock</b><span class="tab on">ホーム</span><span class="tab">スクリーナー</span><span class="tab">グリッド</span><span class="tab">マーケット</span><span class="tab">ポートフォリオ</span><span class="tab">配当</span><span class="tab">マイレイアウト</span></div>
      <div class="body">${panes
        .map(
          ([n, c], i) =>
            `<div class="pane${n === focus ? ' focus' : ''}" style="${i === 1 ? 'grid-row:1/3;grid-column:2' : i === 0 ? '' : ''}"><div class="ph">${c ? `<span class="dot" style="background:${c}"></span>` : ''}${n}</div></div>`,
        )
        .join('')}</div></div>`
  }

  // ---------------- テーマ（#light）
  function theme() {
    const light = /(^|[#&])light\b/.test(location.hash)
    document.documentElement.dataset.theme = light ? 'light' : 'dark'
    return light
  }
  let tt
  function toast(msg) {
    let el = document.querySelector('.toast')
    if (!el) {
      el = document.createElement('div')
      el.className = 'toast'
      document.querySelector('.stage').appendChild(el)
    }
    el.textContent = msg
    el.classList.add('on')
    clearTimeout(tt)
    tt = setTimeout(() => el.classList.remove('on'), 1800)
  }
  const LOCK_SVG = '<svg class="svgi" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>'
  const PEN_SVG = '<svg class="svgi" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13 7 4 4"/></svg>'
  const SEARCH_SVG = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>'
  /** IME の変換中（FR-KB5） */
  const composing = (e) => e.isComposing || e.keyCode === 229

  window.L = { fold, match, hl, esc, keyParts, keysHtml, comboOf, hasCombo, stage, theme, toast, SEARCH_SVG, LOCK_SVG, PEN_SVG, composing }
})()
