<script lang="ts">
// 「同じ銘柄をまとめる」のチェック（カードごと。キーは A）。分類が口座のときは場所を取ったまま見えなくする（見出しの並びを動かさない）
import { t } from '../../../stores/app.svelte'

let { on, locked, onchange }: { on: boolean; locked: boolean; onchange: (on: boolean) => void } = $props()
</script>

<label class="mchk" class:off={locked} title={t('folio.mergeTip')}>
  <input type="checkbox" checked={on} disabled={locked} tabindex="-1" onchange={(e) => onchange(e.currentTarget.checked)} />{t('folio.merge')}
</label>

<style>
.mchk {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--fs-1);
  font-weight: 400;
  color: var(--text-2);
  cursor: pointer;
  white-space: nowrap;
}
.mchk input {
  margin: 0;
  accent-color: var(--focus);
}
.mchk.off {
  visibility: hidden;
}
</style>
