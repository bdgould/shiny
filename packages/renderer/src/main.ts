import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import ResultsWindowApp from './ResultsWindowApp.vue'
import './assets/styles/main.css'

export const RESULTS_WINDOW_HASH = '#results'

/**
 * The same bundle serves two windows. The main process opens the popped-out
 * results window with a `#results` hash; everything else is the main app.
 */
export function selectRootComponent(hash: string) {
  return hash === RESULTS_WINDOW_HASH ? ResultsWindowApp : App
}

const app = createApp(selectRootComponent(window.location.hash))
const pinia = createPinia()

app.use(pinia)
app.mount('#app')
