/// <reference types="vite/client" />

declare module '*.module.css' {
  const classes: { readonly [key: string]: string }
  export default classes
}

interface AIHubAPI {
  getProviders(): Promise<import('../shared/types/provider').ProviderState[]>
  switchProvider(id: string): Promise<void>
  reloadProvider(id: string): Promise<void>
  retryProvider(id: string): Promise<void>
  clearSession(id: string): Promise<void>
  addProvider(params: { name: string; url: string }): Promise<unknown>
  removeProvider(id: string): Promise<boolean>
  reorderProviders(orderedIds: string[]): Promise<void>
  updateProvider(id: string, url: string): Promise<boolean>
  getSettings(): Promise<import('../shared/types/ipc').AppSettings>
  updateSettings(settings: Partial<import('../shared/types/ipc').AppSettings>): Promise<void>
  shellReady(): Promise<void>
  expandShell(): Promise<void>
  collapseShell(): Promise<void>
  getMemoryUsage(): Promise<{ pid: number; type: string; memoryKB: number }[]>
  onProviderSwitched(cb: (providerId: string) => void): () => void
  onProviderLoadFailed(cb: (providerId: string, errorDesc: string) => void): () => void
  onProviderLoading(cb: (providerId: string) => void): () => void
  onProviderLoaded(cb: (providerId: string) => void): () => void
  onProviderTitleUpdated(cb: (providerId: string, title: string) => void): () => void
  onProviderVisibilityChanged(cb: (hiddenIds: string[]) => void): () => void
  onProviderListChanged(cb: () => void): () => void
  onOpenAddProviderDialog(cb: () => void): () => void
  onOpenSettingsDialog(cb: () => void): () => void
}

interface Window {
  aihub: AIHubAPI
}
