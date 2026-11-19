<script lang="ts">
// 初回起動（§6.13 FR-FR1〜FR4）: 免責の同意 → 取得の確認（対象・保存期間・リクエスト数と時間の見積もり。ニュースを取るか〔FR-NW3。答えていないときだけ〕）→ 取得の開始。
import { LWC_NOTICE, LWC_NOTICE_PARTS, TRADINGVIEW_URL } from '@shared/attribution'
import { DEFAULT_SETTINGS } from '@shared/settings'
import { onMount } from 'svelte'
import { noticeOpen } from '../../lib/fileNotice'
import FirstRunNews from '../../news/FirstRunNews.svelte'
import { setNews } from '../../news/store.svelte'
import { app, bridge, rpc, saveSettings, t, toast } from '../../stores/app.svelte'

let step = $state<1 | 2>(1)
/** ニュースをまだ答えていないか（管理者の停止・登録表を読めないときは聞かない） */
let askNews = $state(false)
let newsOn = $state(true)
let years = $state(DEFAULT_SETTINGS.retentionYears)
let first = $state<HTMLButtonElement>()
onMount(() => {
  if (app.settings.disclaimerAccepted) step = 2
  years = app.settings.retentionYears
  void bridge
    .call('news.settings.get', {})
    .then((v) => (askNews = v.state === 'unanswered'))
    .catch(() => {})
  queueMicrotask(() => first?.focus())
})
function agree() {
  saveSettings({ disclaimerAccepted: true })
  step = 2
  queueMicrotask(() => first?.focus())
}
/** ニュースの答えを保存する（「後で」でも答えたことにする。初めは取らないと決めた人にペインで聞き直さない） */
function commitNews() {
  if (askNews) void setNews({ enabled: newsOn })
}
async function start() {
  commitNews()
  saveSettings({ retentionYears: years, firstRunDone: true })
  app.overlay = null
  await rpc('jobs.start', { kind: 'initial' })
}
function later() {
  commitNews()
  saveSettings({ firstRunDone: true })
  app.overlay = null
}
async function importJpx() {
  const bytes = noticeOpen(await window.elecxstock.openFile('xlsx'))
  if (!(bytes instanceof Uint8Array)) return
  commitNews()
  saveSettings({ retentionYears: years, firstRunDone: true })
  app.overlay = null
  const n = await rpc('data.importJpx', { bytes: new Uint8Array(bytes) })
  toast(t('jpx.imported', { n: n.toLocaleString() }))
}
</script>

<div class="dialog first" role="dialog" aria-label={t('first.title')}>
  <div class="logo" aria-hidden="true">E</div>
  <h2>{t('first.title')}</h2>
  {#if step === 1}
    <p>{t('first.disclaimer')}</p>
    <div class="actions">
      <button type="button" class="btn primary" bind:this={first} onclick={agree}>{t('first.agree')}</button>
    </div>
  {:else}
    <h3>{t('first.fetchTitle')}</h3>
    <p>{t('first.fetchBody')}</p>
    <div class="field">
      <span>{t('first.retention')}</span>
      <span class="seg">
        {#each [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as y (y)}
          <button type="button" aria-pressed={years === y} onclick={() => (years = y)}>{y}</button>
        {/each}
      </span>
    </div>
    <p class="muted small">{t('first.retentionNote')}</p>
    {#if askNews}<FirstRunNews bind:on={newsOn} />{/if}
    <p class="muted small">{t('first.jpxFailed')} <button type="button" class="chip" onclick={importJpx}>{t('set.importJpx')}</button></p>
    <div class="actions">
      <button type="button" class="btn" onclick={later}>{t('first.later')}</button>
      <button type="button" class="btn primary" bind:this={first} onclick={start}>{t('first.start')}</button>
    </div>
    <p class="credit">
      <span class="credit-note">{LWC_NOTICE[0]}</span><br />
      <span class="credit-note">{LWC_NOTICE_PARTS.before}<button type="button" class="credit-link" onclick={() => window.elecxstock.openExternal(TRADINGVIEW_URL)}>{LWC_NOTICE_PARTS.token}</button>{LWC_NOTICE_PARTS.after}</span>
    </p>
  {/if}
</div>

<style>
  .first {
    width: 640px;
    padding: var(--s-4) 28px 22px;
    line-height: 1.75;
    margin-top: 40px;
  }
  .logo {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--brand);
    color: #fff;
    font-weight: 700;
    font-size: 20px;
    display: grid;
    place-items: center;
    box-shadow: 0 0 0 3px #fff inset;
  }
  h2 {
    margin: var(--s-3) 0 var(--s-2);
    font-size: 18px;
  }
  p {
    color: var(--text-2);
  }
  .field {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    margin: var(--s-2) 0;
  }
  .small {
    font-size: var(--fs-1);
  }
  .credit {
    margin: var(--s-4) 0 0;
    text-align: center;
    line-height: 1.4;
  }
  .credit-link {
    background: none;
    border: 0;
    padding: 0;
    font: inherit;
    font-size: var(--fs-1);
    color: var(--text-3);
    cursor: pointer;
  }
  .credit-note {
    font-size: var(--fs-1);
    color: var(--text-3);
  }
  .credit-link:hover {
    color: var(--text-2);
    text-decoration: underline;
  }
</style>
