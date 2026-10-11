import { createApp } from 'vue'
import '../../styles/main.css'
import OptionsApp from './OptionsApp.vue'

document.documentElement.lang = chrome.i18n.getUILanguage()
document.title = chrome.i18n.getMessage('optTitle') || 'Nodkey'
createApp(OptionsApp).mount('#app')
