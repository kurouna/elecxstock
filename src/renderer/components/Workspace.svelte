<script lang="ts">
import { setFocus } from '../lib/commands'
import { app } from '../stores/app.svelte'
import { allPanes, findPane, layout, toggleDockOpen } from '../stores/layout.svelte'

// レイアウトを開いたとき、フォーカスが無ければ最初のペインに置く（キーボードだけで始められるように）
$effect(() => {
  void layout.doc.active
  if (!findPane(app.focus)) {
    const first = allPanes(layout.entry, false)[0]
    if (first) setFocus(first.id)
  }
})

import Dock from './Dock.svelte'
import Node from './Node.svelte'
</script>

<div class="wsp">
  {#if layout.entry.docks.left}
    <Dock dock={layout.entry.docks.left} />
  {/if}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="main" onmousedown={() => toggleDockOpen(false)}>
    {#key layout.doc.active}
      <Node node={layout.entry.root} />
    {/key}
  </div>
</div>

<style>
  .wsp {
    display: flex;
    height: 100%;
    gap: 1px;
  }
  .main {
    position: relative;
    flex: 1;
    min-width: 0;
    height: 100%;
  }
</style>
