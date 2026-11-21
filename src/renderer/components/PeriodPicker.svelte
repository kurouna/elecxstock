<script lang="ts">
// 表示期間の選択（FR-G3）。チャートグリッド・チャート・マーケットで同じ形・同じ言葉・同じキー（Alt+1〜6）にそろえる
import { PERIODS } from '../lib/periods'
import { t } from '../stores/app.svelte'

let {
  value,
  onchange,
  allowDefault = false,
}: {
  /** PERIODS の位置。undefined は既定（チャートは時間軸ごとの既定の本数） */
  value: number | undefined
  onchange: (v: number | undefined) => void
  /** 「既定」を選べるか（チャート・マーケット。時間軸ごとの既定の本数） */
  allowDefault?: boolean
} = $props()
</script>

<select
  class="period"
  aria-label={t('period.label')}
  title={`${t('period.label')} (Alt+1〜6)`}
  value={value ?? -1}
  onchange={(e) => {
    const v = Number((e.currentTarget as HTMLSelectElement).value)
    // 選んだあと欄にフォーカスを残さない（残るとペインのキーが効かない。FR-KB4）
    e.currentTarget.blur()
    onchange(v < 0 ? undefined : v)
  }}
>
  {#if allowDefault}<option value={-1}>{t('period.default')}</option>{/if}
  {#each PERIODS as p, i (p.key)}<option value={i}>{t(p.key)}</option>{/each}
</select>

<style>
  .period {
    height: 20px;
    background: var(--panel-3);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    color: var(--text-2);
    font-size: var(--fs-1);
    padding: 0 2px;
    cursor: pointer;
  }
  .period:hover {
    color: var(--text);
  }
</style>
