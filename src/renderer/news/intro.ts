// 版を上げた既存の利用者に、ニュースのペインを一度だけ案内する（docs/design-news.md §7.1）。マーケットのタブは自動では変えない
import { keyOf } from '../lib/commands'
import { bridge, t, toast } from '../stores/app.svelte'

export async function introNews(): Promise<void> {
  const l = await bridge.call('news.list', {}).catch(() => null)
  if (!l?.intro) return
  toast(t('news.firstNotice', { key: keyOf('changeWidget') || 'Ctrl+K' }), undefined, 10_000)
  await bridge.call('news.noticed', {}).catch(() => {})
}
