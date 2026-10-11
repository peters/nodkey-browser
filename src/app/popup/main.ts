import { createApp } from 'vue'
import '../../styles/main.css'
import { activeTabId } from '../../services/background'
import App from './App.vue'

document.documentElement.lang = chrome.i18n.getUILanguage()
void activeTabId().then((tabId) => {
  createApp(App, { tabId }).mount('#app')
})
