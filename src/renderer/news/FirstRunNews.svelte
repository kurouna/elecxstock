<script lang="ts">
// 初回起動の「取得の確認」の段に置くニュースの選択（docs/design-news.md §8・FR-NW3）。選択の初期値は「取る」。
// 答えは取得を始める（または後で）ときに FirstRun が commitNews で保存する。Space でオン・オフ
import { t } from '../stores/app.svelte'

let { on = $bindable(true) }: { on?: boolean } = $props()
</script>

<div class="news-row">
  <span>{t('first.news.title')}</span>
  <span class="r">
    <button type="button" class="toggle" class:on aria-pressed={on} aria-label={t('first.news.title')} onclick={() => (on = !on)}><span class="box"></span></button>
    <span class="hint">{on ? t('first.news.onHint') : t('first.news.offHint')}</span>
  </span>
</div>

<style>
  .news-row {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--s-3);
    align-items: start;
    margin: var(--s-2) 0;
  }
  .r {
    display: flex;
    gap: var(--s-2);
    align-items: flex-start;
  }
  .toggle {
    flex: none;
    margin-top: 2px;
  }
  .hint {
    color: var(--text-3);
    font-size: var(--fs-1);
    line-height: 1.6;
  }
</style>
