<script lang="ts">
// 資産構成のツリーマップ（FR-PF5）: 面積は評価額、色は含み損益率か前日比の 5 段（控えめに混ぜる）。分類の見出しは中立の帯。
// 小さいタイルは銘柄コードだけ。口座で分けたときは左の帯で口座を示す（面は塗らない）
import { type AllocGroup, allocTiles, heatBg as bg, type FRow, signPct, type Tile, tileInk } from '../../../lib/folio'
import { app } from '../../../stores/app.svelte'

let {
  rows,
  group,
  heat,
  sel,
  focused,
  label,
  ontiles,
  onpick,
}: {
  rows: FRow[]
  group: AllocGroup
  heat: number
  sel: number
  focused: boolean
  label: (key: string) => string
  ontiles: (leaves: Tile[]) => void
  /** タイルを押した（リンク色に送る） */
  onpick: (i: number) => void
} = $props()
let w = $state(0)
let h = $state(0)
const tiles = $derived(w > 10 && h > 10 ? allocTiles(rows, group, heat, w, h) : [])
const leaves = $derived(tiles.filter((x) => !x.group))
$effect(() => ontiles(leaves))
const light = $derived(app.settings.theme === 'light')
const share = (t: Tile) => t.item.rows.reduce((s, r) => s + r.value, 0) / (rows.reduce((s, r) => s + r.value, 0) || 1)
</script>

<div class="tm" bind:clientWidth={w} bind:clientHeight={h}>
  {#each tiles as t (t.item.key + (t.group ? ':g' : ''))}
    {#if t.group}
      <div class="grp" style:left={`${t.x}px`} style:top={`${t.y}px`} style:width={`${t.w}px`} style:height={`${t.h}px`}>
        {#if t.head}<b class="gh" style:width={`${t.w - 2}px`}><i style:background={bg(t.step)}></i>{label(t.item.key)} <span class="num">{(share(t) * 100).toFixed(0)}% {signPct(t.metric)}</span></b>{/if}
      </div>
    {:else}
      {@const i = leaves.indexOf(t)}
      {@const r = t.item.rows[0]!}
      <div
        class="tile"
        class:sel={focused && i === sel}
        style:left={`${t.x}px`}
        style:top={`${t.y}px`}
        style:width={`${t.w}px`}
        style:height={`${t.h}px`}
        style:background={bg(t.step)}
        style:color={tileInk(t.step, light)}
        title={`${r.code} ${r.name} ${signPct(t.metric)}`}
        onclick={() => onpick(i)}
        role="button"
        tabindex="-1"
        onkeydown={() => {}}
      >
        {#if group === 'acct'}<i class="stripe" style:background={`var(--acct-${r.acct})`}></i>{/if}
        {#if t.w > 74 && t.h > 32}<b>{r.name}</b><span class="num">{signPct(t.metric)}</span>{:else if t.w > 34 && t.h > 16}<b class="num">{r.code}</b>{/if}
      </div>
    {/if}
  {/each}
</div>

<style>
.tm {
  flex: 1 1 0;
  position: relative;
  min-height: 150px;
  overflow: hidden;
}
.tile,
.grp {
  position: absolute;
  overflow: hidden;
}
.tile {
  padding: 3px 5px;
  font-size: var(--fs-1);
  line-height: 1.3;
  box-shadow: inset 0 0 0 1px var(--panel);
  transition:
    left 320ms ease,
    top 320ms ease,
    width 320ms ease,
    height 320ms ease;
}
:global(:root[data-reduce-motion='true']) .tile {
  transition: none;
}
.tile {
  cursor: pointer;
}
.tile:hover {
  filter: brightness(1.12);
}
.tile.sel {
  box-shadow: inset 0 0 0 2px var(--focus);
  z-index: 2;
}
.tile b {
  display: block;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tile span {
  white-space: nowrap;
}
.stripe {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
}
.grp {
  pointer-events: none;
  box-shadow: inset 0 0 0 1px var(--panel);
}
.gh {
  position: absolute;
  left: 1px;
  top: 1px;
  height: 15px;
  padding: 0 5px;
  background: var(--panel-2);
  color: var(--text-2);
  font-size: var(--fs-1);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 5px;
}
.gh i {
  width: 7px;
  height: 7px;
  border-radius: 1px;
  flex: none;
}
.gh .num {
  color: var(--text-3);
  font-weight: 400;
}
</style>
