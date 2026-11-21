<script lang="ts">
// 口座の印（色の点。複数の口座で持つ銘柄の行・タイルに付ける）。名前はツールチップ
import type { AccountType } from '@shared/types'
import { accountName } from '../../../lib/portfolio'

let { accts }: { accts: AccountType[] } = $props()
</script>

<span class="adots" title={accts.map(accountName).join('・')}>{#each accts as a (a)}<i style:background={`var(--acct-${a})`}></i>{/each}</span>

<style>
.adots {
  display: inline-flex;
  gap: 3px;
  margin-left: 6px;
  vertical-align: 1px;
}
i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  display: inline-block;
}
</style>
