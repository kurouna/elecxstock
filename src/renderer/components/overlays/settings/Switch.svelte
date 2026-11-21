<script lang="ts">
// 設定のスイッチ（docs/design-dialogs.md §6）: 今の 10px の四角の代わり。「オン／オフ」の文字つき。role="switch"。
// 使えないときは disabled ではなく aria-disabled にする（フォーカスを受け、↑ ↓ で行を越えられ、理由を読める。押しても変えない）
// tabindex: 一覧の行の中のスイッチは -1（一覧を Tab の 1 か所にし、Space は一覧が選んだ行に使う。ニュースのフィード）
import { t } from '../../../stores/app.svelte'

let {
  on,
  label,
  disabled = false,
  describedby,
  tabindex = 0,
  onchange,
}: { on: boolean; label: string; disabled?: boolean; describedby?: string; tabindex?: number; onchange: () => void } = $props()
</script>

<!-- 文字とつまみを 1 つの要素にまとめる（表の行の中で 2 つの欄に分かれないように） -->
<span class="swr">
<span class="swl" aria-hidden="true">{on ? t('set.on') : t('set.off')}</span>
<button
  type="button"
  class="sw"
  class:on
  class:off={disabled}
  role="switch"
  aria-checked={on}
  aria-label={label}
  aria-disabled={disabled || undefined}
  aria-describedby={describedby}
  {tabindex}
  data-primary
  onclick={() => !disabled && onchange()}
></button>
</span>

<style>
  .swr {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex: none;
  }
  .swl {
    width: 28px;
    text-align: right;
    color: var(--text-3);
    font-size: var(--fs-1);
  }
  .sw {
    position: relative;
    flex: none;
    width: 36px;
    height: 20px;
    padding: 0;
    border-radius: 10px;
    border: 1px solid var(--line-strong);
    background: var(--panel-3);
    cursor: pointer;
  }
  .sw::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--text-3);
    transition: transform var(--motion);
  }
  /* オンのつまみは地の色（--focus の地との差をはっきり。§2.2） */
  .sw.on {
    background: var(--focus);
    border-color: var(--focus);
  }
  .sw.on::after {
    transform: translateX(16px);
    background: var(--bg);
  }
  /* 使えないとき: 不透明度ではなく色で薄くする（§2.1） */
  .sw.off {
    cursor: default;
    background: var(--panel-2);
    border-color: var(--line);
  }
  .sw.off::after {
    background: var(--line-strong);
  }
  .sw:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
</style>
