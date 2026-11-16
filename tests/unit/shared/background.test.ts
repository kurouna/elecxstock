// 常駐と自動起動の判断（FR-BG1〜BG8。docs/design-background.md）。main と設定の画面が共有する純粋な関数
import {
  decideClose,
  HIDDEN_ARG,
  LOGIN_ITEM_NAME,
  type LoginState,
  launchAction,
  loginArgs,
  loginState,
  loginView,
  QUIT_ARG,
  savedBackground,
  secondInstance,
  startHiddenNow,
  trayHint,
  trayMenu,
} from '@shared/background'
import { describe, expect, it } from 'vitest'

const file = (data: Record<string, unknown>) => JSON.stringify({ version: 1, data })

describe('保存した設定の読み取り（FR-BG1・BG7）', () => {
  it('{ version, data } の形と平たい形のどちらも読む', () => {
    expect(savedBackground(file({ closeToTray: true, lang: 'en', disclaimerAccepted: true, firstRunDone: true }))).toEqual({
      closeToTray: true,
      lang: 'en',
      ready: true,
    })
    expect(savedBackground(JSON.stringify({ closeToTray: true, lang: 'ja' })).closeToTray).toBe(true)
  })
  it('無い・壊れている・欠けた項目・知らない値は既定（オフ・日本語・初回が済んでいない）', () => {
    const def = { closeToTray: false, lang: 'ja', ready: false }
    expect(savedBackground(null)).toEqual(def)
    expect(savedBackground('{')).toEqual(def)
    expect(savedBackground('null')).toEqual(def)
    expect(savedBackground(file({}))).toEqual(def)
    expect(savedBackground(file({ closeToTray: 'yes', lang: 'fr' }))).toEqual(def)
  })
  it('初回の同意と初回の取り込みが両方済んで初めて ready', () => {
    expect(savedBackground(file({ disclaimerAccepted: true, firstRunDone: false })).ready).toBe(false)
    expect(savedBackground(file({ disclaimerAccepted: false, firstRunDone: true })).ready).toBe(false)
  })
})

describe('閉じたときの動き（FR-BG1・BG2）', () => {
  it('1 枚目は、しまう設定がオンで終了の途中でなければ隠す', () => {
    expect(decideClose({ slot: 'main', closeToTray: true, quitting: false })).toBe('hide')
    expect(decideClose({ slot: 'main', closeToTray: false, quitting: false })).toBe('close')
    expect(decideClose({ slot: 'main', closeToTray: true, quitting: true })).toBe('close')
  })
  it('フリー N は単独で閉じたら今までどおり閉じる', () => {
    for (const slot of ['free2', 'free3', 'free4']) expect(decideClose({ slot, closeToTray: true, quitting: false })).toBe('close')
  })
})

describe('起動の引数と二度目の起動（FR-BG8）', () => {
  it('--quit は --hidden より強い。どちらも無ければ open', () => {
    expect(launchAction(['elecxstock.exe'])).toBe('open')
    expect(launchAction(['elecxstock.exe', HIDDEN_ARG])).toBe('hidden')
    expect(launchAction(['elecxstock.exe', QUIT_ARG])).toBe('quit')
    expect(launchAction(['elecxstock.exe', HIDDEN_ARG, QUIT_ARG])).toBe('quit')
    // 引数の一部に含まれるだけのものは見ない
    expect(launchAction(['elecxstock.exe', '--hidden-x', 'x--quit'])).toBe('open')
  })
  it('1 つ目が受け取ったとき: quit は終える・hidden は何もしない・open は前に出す', () => {
    expect(secondInstance({ action: 'quit' }, false)).toBe('quit')
    expect(secondInstance({ action: 'hidden' }, false)).toBe('none')
    expect(secondInstance({ action: 'open' }, false)).toBe('reveal')
  })
  it('終了の途中は何もしない（before-quit の流れを短絡させない）', () => {
    for (const action of ['quit', 'hidden', 'open']) expect(secondInstance({ action }, true)).toBe('none')
  })
  it('知らない形のデータ（古い版の二度目の起動）は open', () => {
    expect(secondInstance(undefined, false)).toBe('reveal')
    expect(secondInstance({ action: 'evil' }, false)).toBe('reveal')
    expect(secondInstance('quit', false)).toBe('reveal')
  })
})

describe('隠して起動する（FR-BG7）', () => {
  const ready = { closeToTray: false, lang: 'ja' as const, ready: true }
  it('--hidden で、初回が済んでいれば隠す', () => {
    expect(startHiddenNow('hidden', ready)).toBe(true)
    expect(startHiddenNow('open', ready)).toBe(false)
  })
  it('初回が済んでいなければ窓を出す（見えない初回の画面で止まらないように）', () => {
    expect(startHiddenNow('hidden', { ...ready, ready: false })).toBe(false)
  })
})

describe('サインイン時の起動の登録（FR-BG6・BG7）', () => {
  const own = { name: LOGIN_ITEM_NAME, scope: 'user', enabled: true }
  it('引数は、通知領域に入れておくときだけ --hidden', () => {
    expect(loginArgs(true)).toEqual([HIDDEN_ARG])
    expect(loginArgs(false)).toEqual([])
  })
  it('自分の名前の、利用者ごとの項目だけを見る', () => {
    expect(loginState(true, [], false)).toEqual({ available: true, on: false, hidden: false, disabledByOs: false })
    expect(loginState(true, [{ ...own, name: 'Other' }], false).on).toBe(false)
    expect(loginState(true, [{ ...own, scope: 'machine' }], false).on).toBe(false)
    expect(loginState(true, [own], false)).toEqual({ available: true, on: true, hidden: false, disabledByOs: false })
  })
  it('タスクマネージャーで無効にされていたら、オフで出して理由を持つ', () => {
    expect(loginState(true, [{ ...own, enabled: false }], true)).toEqual({ available: true, on: false, hidden: true, disabledByOs: true })
  })
  it('引数が --hidden と一致したら hidden。登録が無ければ一致しても偽', () => {
    expect(loginState(true, [own], true).hidden).toBe(true)
    expect(loginState(true, [], true).hidden).toBe(false)
  })
  it('登録できない（開発版）ときは、項目があっても何も無いことにする', () => {
    expect(loginState(false, [own], true)).toEqual({ available: false, on: false, hidden: false, disabledByOs: false })
  })
})

describe('設定の画面のスイッチ（FR-BG1・BG6・BG7）', () => {
  const st = (o: Partial<LoginState> = {}): LoginState => ({ available: true, on: false, hidden: false, disabledByOs: false, ...o })
  it('読み取り専用の間は、閉じても残すを押せない（画面とファイルがずれるため）。サインイン時の起動は押せる', () => {
    const v = loginView(st(), { readOnly: true })
    expect(v.closeToTray.disabled).toBe(true)
    expect(v.login.disabled).toBe(false)
    expect(loginView(st(), { readOnly: false }).closeToTray.disabled).toBe(false)
  })
  it('開発版ではサインイン時の起動を押せず、そう書く', () => {
    const v = loginView(st({ available: false }), { readOnly: false })
    expect(v.login).toEqual({ disabled: true, on: false, note: 'dev' })
    expect(v.hidden.disabled).toBe(true)
  })
  it('タスクマネージャーで無効にされていたら、オフで出して注意を出す（押すと有効に戻る）', () => {
    const v = loginView(st({ disabledByOs: true, hidden: true }), { readOnly: false })
    expect(v.login).toEqual({ disabled: false, on: false, note: 'disabledByOs' })
    expect(v.hidden).toEqual({ disabled: true, on: false })
  })
  it('main からまだ読めていない間は、サインイン時の起動の 2 つを押せず、注意も出さない', () => {
    expect(loginView(null, { readOnly: false })).toEqual({
      closeToTray: { disabled: false },
      login: { disabled: true, on: false, note: null },
      hidden: { disabled: true, on: false },
    })
  })
  it('通知領域に入れておくは、サインイン時の起動がオンのときだけ押せる', () => {
    expect(loginView(st(), { readOnly: false }).hidden).toEqual({ disabled: true, on: false })
    expect(loginView(st({ on: true, hidden: true }), { readOnly: false }).hidden).toEqual({ disabled: false, on: true })
    expect(loginView(st({ on: true }), { readOnly: false }).login).toEqual({ disabled: false, on: true, note: null })
  })
})

describe('トレイのメニューと案内（FR-BG5）', () => {
  it('開く・設定・区切り・終了の順で、言語ごとの名前', () => {
    expect(trayMenu('ja').map((x) => x.id)).toEqual(['open', 'settings', 'separator', 'quit'])
    expect(trayMenu('ja').find((x) => x.id === 'quit')).toMatchObject({ label: 'elecxstock を終了' })
    expect(trayMenu('en').find((x) => x.id === 'open')).toMatchObject({ label: 'Open elecxstock' })
  })
  it('案内は ^ の中にあることを言う', () => {
    expect(trayHint('ja').body).toContain('^')
    expect(trayHint('en').body).toContain('^')
    expect(trayHint('en').title).not.toBe(trayHint('ja').title)
  })
})
