// モック用の架空データ。銘柄名・コードは実在だが、価格・配当・指標はすべて乱数で作った架空の値（基準の株価・利回り・権利月も実際とは無関係）。
'use strict'
window.MOCK = (() => {
  // code, 日本語名, 英語名, 市場, 業種(ja), 業種(en), 種別, 基準価格, 利回り目安(%), 配当月
  const U = [
    ['7203', 'トヨタ自動車', 'Toyota Motor', 'P', '輸送用機器', 'Transport Equip.', 'stock', 18616, 2.7, [3, 9]],
    ['8058', '三菱商事', 'Mitsubishi Corp.', 'P', '卸売業', 'Wholesale', 'stock', 12872, 4.9, [3, 9]],
    ['8306', '三菱ＵＦＪフィナンシャル・グループ', 'Mitsubishi UFJ FG', 'P', '銀行業', 'Banks', 'stock', 19707, 2.2, [3, 9]],
    ['8316', '三井住友フィナンシャルグループ', 'Sumitomo Mitsui FG', 'P', '銀行業', 'Banks', 'stock', 4728, 4.5, [2, 8]],
    ['8411', 'みずほフィナンシャルグループ', 'Mizuho FG', 'P', '銀行業', 'Banks', 'stock', 704, 3.3, [4, 10]],
    ['9432', '日本電信電話', 'NTT', 'P', '情報・通信業', 'Info. & Comm.', 'stock', 4746, 3.2, [2, 8]],
    ['9433', 'ＫＤＤＩ', 'KDDI', 'P', '情報・通信業', 'Info. & Comm.', 'stock', 5312, 3.5, [5, 11]],
    ['9434', 'ソフトバンク', 'SoftBank Corp.', 'P', '情報・通信業', 'Info. & Comm.', 'stock', 2221, 4.2, [3, 9]],
    ['2914', '日本たばこ産業', 'Japan Tobacco', 'P', '食料品', 'Foods', 'stock', 16821, 2.0, [2, 8]],
    ['8001', '伊藤忠商事', 'ITOCHU', 'P', '卸売業', 'Wholesale', 'stock', 3895, 4.0, [5, 11]],
    ['8031', '三井物産', 'Mitsui & Co.', 'P', '卸売業', 'Wholesale', 'stock', 14268, 4.1, [6, 12]],
    ['4502', '武田薬品工業', 'Takeda Pharmaceutical', 'P', '医薬品', 'Pharmaceutical', 'stock', 18279, 2.5, [2, 8]],
    ['8766', '東京海上ホールディングス', 'Tokio Marine HD', 'P', '保険業', 'Insurance', 'stock', 7755, 1.3, [3, 9]],
    ['5401', '日本製鉄', 'Nippon Steel', 'P', '鉄鋼', 'Iron & Steel', 'stock', 8416, 2.9, [3, 9]],
    ['1605', 'ＩＮＰＥＸ', 'INPEX', 'P', '鉱業', 'Mining', 'stock', 476, 2.3, [5, 11]],
    ['6501', '日立製作所', 'Hitachi', 'P', '電気機器', 'Electric Appliances', 'stock', 12860, 4.4, [3, 9]],
    ['6758', 'ソニーグループ', 'Sony Group', 'P', '電気機器', 'Electric Appliances', 'stock', 6028, 2.5, [1, 7]],
    ['7974', '任天堂', 'Nintendo', 'P', 'その他製品', 'Other Products', 'stock', 10754, 1.9, [3, 9]],
    ['4063', '信越化学工業', 'Shin-Etsu Chemical', 'P', '化学', 'Chemicals', 'stock', 973, 4.1, [3, 9]],
    ['8053', '住友商事', 'Sumitomo Corp.', 'P', '卸売業', 'Wholesale', 'stock', 7125, 3.9, [3, 9]],
    ['5020', 'ＥＮＥＯＳホールディングス', 'ENEOS HD', 'P', '石油・石炭製品', 'Oil & Coal', 'stock', 3984, 3.6, [6, 12]],
    ['8591', 'オリックス', 'ORIX', 'P', 'その他金融業', 'Other Financing', 'stock', 14009, 3.7, [1, 7]],
    ['94345', 'ソフトバンク第１回社債型種類株式', 'SoftBank Corp. Bond-type Class Shares 1', 'P', '情報・通信業', 'Info. & Comm.', 'stock', 4442, 2.8, [2, 8]],
    ['130A', 'Ｖｅｒｉｔａｓ　Ｉｎ　Ｓｉｌｉｃｏ', 'Veritas In Silico', 'G', '医薬品', 'Pharmaceutical', 'stock', 927, 0, []],
    ['8951', '日本ビルファンド投資法人', 'Nippon Building Fund', 'R', 'REIT', 'REIT', 'reit', 105000, 5.7, [4, 10]],
    ['8952', 'ジャパンリアルエステイト投資法人', 'Japan Real Estate Inv.', 'R', 'REIT', 'REIT', 'reit', 52000, 5.4, [5, 11]],
    ['3462', '野村不動産マスターファンド投資法人', 'Nomura RE Master Fund', 'R', 'REIT', 'REIT', 'reit', 109000, 4.1, [1, 7]],
    ['3283', '日本プロロジスリート投資法人', 'Nippon Prologis REIT', 'R', 'REIT', 'REIT', 'reit', 109000, 4.3, [5, 11]],
    ['8953', '日本都市ファンド投資法人', 'Japan Metropolitan Fund', 'R', 'REIT', 'REIT', 'reit', 54000, 5.8, [5, 11]],
    ['3269', 'アドバンス・レジデンス投資法人', 'Advance Residence Inv.', 'R', 'REIT', 'REIT', 'reit', 58000, 4.6, [3, 9]],
    ['8963', 'インヴィンシブル投資法人', 'Invincible Investment', 'R', 'REIT', 'REIT', 'reit', 150000, 4.3, [3, 9]],
    ['3281', 'ＧＬＰ投資法人', 'GLP J-REIT', 'R', 'REIT', 'REIT', 'reit', 148000, 5.4, [5, 11]],
    ['1306', 'ＴＯＰＩＸ連動型上場投資信託', 'NEXT FUNDS TOPIX ETF', 'E', 'ETF', 'ETF', 'etf', 3107, 2.6, [3]],
  ]
  const instruments = U.map(([code, ja, en, mkt, secJa, secEn, type, base, yld, months]) => ({
    code, ja: ja.normalize('NFKC'), en, mkt, secJa, secEn, type, base, yld, months,
  }))
  const byCode = Object.fromEntries(instruments.map((i) => [i.code, i]))

  function rng(seed) {
    let a = 0
    for (const ch of seed) a = (a * 31 + ch.charCodeAt(0)) >>> 0
    return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  }
  // 営業日（土日を除く）。祝日は簡略化して扱わない
  const END = new Date(Date.UTC(2026, 10, 12))
  function businessDays(years) {
    const out = []; const d = new Date(END); d.setUTCFullYear(d.getUTCFullYear() - years)
    while (d <= END) { const w = d.getUTCDay(); if (w !== 0 && w !== 6) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1) }
    return out
  }
  const DAYS = businessDays(5)
  const cache = new Map()
  function daily(code) {
    if (cache.has(code)) return cache.get(code)
    const ins = byCode[code]; const r = rng(code)
    const n = DAYS.length
    // 終点が基準価格になるよう、後ろから作る
    const vol = ins.type === 'reit' ? 0.009 : ins.type === 'etf' ? 0.008 : 0.016
    const drift = (r() - 0.45) * 0.0006
    const closes = new Array(n); closes[n - 1] = ins.base
    for (let i = n - 2; i >= 0; i--) closes[i] = closes[i + 1] / (1 + drift + (r() - 0.5) * 2 * vol + Math.sin(i / 37) * 0.002)
    const tick = ins.base >= 10000 ? 100 : ins.base >= 1000 ? 1 : 0.1
    const rd = (x) => Math.round(x / tick) * tick
    const vbase = ins.type === 'reit' ? 12000 : ins.type === 'etf' ? 900000 : (2e10 / ins.base) * (0.3 + r())
    const bars = []
    for (let i = 0; i < n; i++) {
      const c = closes[i], o = i ? closes[i - 1] * (1 + (r() - 0.5) * vol * 0.6) : c
      const h = Math.max(o, c) * (1 + r() * vol * 0.8), l = Math.min(o, c) * (1 - r() * vol * 0.8)
      bars.push({ time: DAYS[i], open: rd(o), high: rd(h), low: rd(l), close: rd(c), volume: Math.round(vbase * (0.5 + r() * 1.2) * (1 + Math.abs(c - o) / c * 20)) })
    }
    cache.set(code, bars)
    return bars
  }
  function aggregate(bars, tf) {
    if (tf === 'D') return bars
    const key = (t) => {
      if (tf === 'M') return t.slice(0, 7)
      const d = new Date(t + 'T00:00:00Z'); const w = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - w); return d.toISOString().slice(0, 10)
    }
    const out = []; let cur = null, k0 = null
    for (const b of bars) {
      const k = key(b.time)
      if (k !== k0) { cur = { time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }; out.push(cur); k0 = k }
      else { cur.high = Math.max(cur.high, b.high); cur.low = Math.min(cur.low, b.low); cur.close = b.close; cur.volume += b.volume }
    }
    return out
  }
  function sma(bars, n) {
    const out = []; let s = 0
    for (let i = 0; i < bars.length; i++) { s += bars[i].close; if (i >= n) s -= bars[i - n].close; if (i >= n - 1) out.push({ time: bars[i].time, value: s / n }) }
    return out
  }
  function dividends(code) {
    const ins = byCode[code]; if (!ins.months.length) return []
    const r = rng(code + 'div'); const out = []
    const per = (ins.base * ins.yld / 100) / ins.months.length
    for (let y = 2021; y <= 2026; y++) {
      for (const m of ins.months) {
        const date = `${y}-${String(m).padStart(2, '0')}-${m === 2 ? 26 : 28}`
        if (date > '2026-11-12') continue
        const g = Math.pow(ins.type === 'reit' ? 1.02 : 1.07, y - 2026)
        let amt = per * g * (0.97 + r() * 0.06)
        amt = ins.base >= 10000 ? Math.round(amt) : Math.round(amt * 10) / 10
        out.push({ date, amount: amt })
      }
    }
    return out
  }
  function metrics(code) {
    const ins = byCode[code]; const b = daily(code); const last = b.at(-1), prev = b.at(-2)
    const r = rng(code + 'm')
    const div12 = dividends(code).filter((d) => d.date > '2025-11-12').reduce((s, d) => s + d.amount, 0)
    const turnover = b.slice(-20).reduce((s, x) => s + x.close * x.volume, 0) / 20
    const hi52 = Math.max(...b.slice(-245).map((x) => x.high)), lo52 = Math.min(...b.slice(-245).map((x) => x.low))
    const ma75 = b.slice(-75).reduce((s, x) => s + x.close, 0) / 75
    const shares = ins.type === 'reit' ? 3e6 + r() * 6e6 : (5e12 / ins.base) * (0.3 + r() * 1.5)
    return {
      close: last.close, chg: last.close - prev.close, chgPct: (last.close / prev.close - 1) * 100,
      yld: div12 ? (div12 / last.close) * 100 : 0, div12,
      per: ins.code === '130A' ? null : ins.type === 'etf' ? null : 8 + r() * 22,
      pbr: ins.type === 'etf' ? null : 0.6 + r() * 2.4,
      mcap: last.close * shares, turnover, hi52, lo52,
      fromHi: (last.close / hi52 - 1) * 100, maDev: (last.close / ma75 - 1) * 100,
      r1y: (last.close / b.at(-245).close - 1) * 100,
    }
  }
  const watchlists = [
    { id: 'fav', builtin: true, ja: '★お気に入り', en: '★ Favorites', codes: ['7203', '8058', '8306', '2914', '8951', '3462', '9434', '8766'] },
    { id: 'hd', ja: '高配当', en: 'High Yield', codes: ['2914', '4502', '5401', '1605', '8591', '8053', '8316', '9434', '9432'] },
    { id: 'reit', ja: 'J-REIT', en: 'J-REIT', codes: ['8951', '8952', '3462', '3283', '8953', '3269', '8963', '3281'] },
    { id: 'watch', ja: '監視', en: 'Watch', codes: ['6501', '6758', '7974', '4063', '130A', '1306'] },
    { id: 'cand', builtin: true, ja: '◆売買候補', en: '◆ Candidates', codes: [] },
  ]
  return { instruments, byCode, daily, aggregate, sma, dividends, metrics, watchlists, END: '2026-11-12' }
})()
