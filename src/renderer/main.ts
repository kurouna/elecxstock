import '@fontsource-variable/noto-sans-jp/wght.css'
import '@fontsource/noto-sans-mono/latin-400.css'
import '@fontsource/noto-sans-mono/latin-500.css'
import './app.css'
import { mount } from 'svelte'
import App from './components/App.svelte'

mount(App, { target: document.getElementById('app')! })
