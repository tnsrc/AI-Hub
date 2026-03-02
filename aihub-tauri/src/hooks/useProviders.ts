import { create } from 'zustand'
import { ProviderState } from '../shared/types/provider'
import { aihub } from '../tauri-bridge'

interface ProviderStore {
  providers: ProviderState[]
  activeId: string | null
  hiddenIds: Set<string>
  titles: Record<string, string>
  loading: boolean
  loadingProviderId: string | null
  errorProviderId: string | null
  errorMessage: string | null

  // Actions
  load: () => Promise<void>
  setActive: (id: string) => void
  setHidden: (ids: string[]) => void
  setTitle: (id: string, title: string) => void
  setProviderLoading: (id: string) => void
  setProviderLoaded: (id: string) => void
  setProviderError: (id: string, message: string) => void
  clearProviderError: () => void
}

export const useProviderStore = create<ProviderStore>((set, get) => ({
  providers: [],
  activeId: null,
  hiddenIds: new Set(),
  titles: {},
  loading: true,
  loadingProviderId: null,
  errorProviderId: null,
  errorMessage: null,

  load: async () => {
    const providers = await aihub.getProviders()
    const active = providers.find((p) => p.active)
    const hidden = providers.filter((p) => p.hidden).map((p) => p.id)
    set({
      providers,
      activeId: active?.id || null,
      hiddenIds: new Set(hidden),
      loading: false
    })
  },

  setActive: (id: string) => set({ activeId: id }),

  setHidden: (ids: string[]) => set({ hiddenIds: new Set(ids) }),

  setTitle: (id: string, title: string) =>
    set((state) => ({ titles: { ...state.titles, [id]: title } })),

  setProviderLoading: (id: string) => set({ loadingProviderId: id }),

  setProviderLoaded: (id: string) => {
    if (get().loadingProviderId === id) {
      set({ loadingProviderId: null })
    }
  },

  setProviderError: (id: string, message: string) =>
    set({ errorProviderId: id, errorMessage: message }),

  clearProviderError: () =>
    set({ errorProviderId: null, errorMessage: null })
}))
