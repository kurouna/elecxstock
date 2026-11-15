import './clock' // ほかのモジュールより先に時刻をそろえる（テストのときだけ）
import './theme-init' // 最初の描画からテーマの色にする
import '@fontsource-variable/noto-sans-jp/wght.css'
import '@fontsource/noto-sans-mono/latin-400.css'
import '@fontsource/noto-sans-mono/latin-500.css'
import './app.css'
import { mount } from 'svelte'
import App from './components/App.svelte'
import { trackInputMode } from './lib/inputMode'

trackInputMode()
mount(App, { target: document.getElementById('app')! })
