<script lang="ts" module>
// ツールバーのアイコン（FR-V13）。線で描く 24×24 の図形。色は文字色（currentColor）、意味はボタンの名前とツールチップで伝える
const PATHS = {
  /** 取り込む: 下向きの矢印とトレイ */
  import: 'M12 4v11M7 10l5 5 5-5M4 15v4h16v-4',
  /** 書き出す・共有: 上向きの矢印と箱 */
  export: 'M12 15V4M7 9l5-5 5 5M5 13v6h14v-6',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6',
  save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
  saveAs: 'M5 4h9l3 3v5M8 4v5h6V4M5 4v16h7M14 20l6-6 2 2-6 6h-2z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  columns: 'M4 5h16v14H4zM9.5 5v14M14.5 5v14',
  pin: 'M9 4h6l-1 6 3 3H7l3-3zM12 13v7',
  listAdd: 'M4 6h10M4 11h10M4 16h6M17 13v8M13 17h8',
  pause: 'M8 5v14M16 5v14',
  play: 'M7 5l12 7-12 7z',
  cancel: 'M6 6l12 12M18 6L6 18',
  resetSize: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5M9 9l-5-5M15 9l5-5M9 15l-5 5M15 15l5 5',
} as const
export type IconName = keyof typeof PATHS
</script>

<script lang="ts">
let { name, size = 14 }: { name: IconName; size?: number } = $props()
</script>

<svg class="icon" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d={PATHS[name]} />
</svg>

<style>
  .icon {
    display: block;
    flex: none;
  }
</style>
