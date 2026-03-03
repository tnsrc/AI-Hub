import Store from 'electron-store'
import { Provider } from '../shared/types/provider'
import { AppSettings } from '../shared/types/ipc'
import { BUILT_IN_PROVIDERS } from '../shared/built-in-providers'

interface StoreSchema {
  settings: AppSettings
  customProviders: Provider[]
  windowState: {
    x?: number
    y?: number
    width: number
    height: number
    isMaximized: boolean
  }
  activeProviderId: string
}

const store = new Store<StoreSchema>({
  name: 'fcc-ai-hub',
  defaults: {
    settings: {
      theme: 'system',
      hiddenProviders: ['chatgpt', 'grok', 'claude'],
      providerOrder: BUILT_IN_PROVIDERS.map((p) => p.id)
    },
    customProviders: [],
    windowState: {
      width: 1400,
      height: 900,
      isMaximized: false
    },
    activeProviderId: 'mca'
  }
})

export default store
