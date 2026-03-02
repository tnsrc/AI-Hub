export interface AddProviderParams {
  name: string
  url: string
}

export interface UpdateProviderParams {
  id: string
  url: string
}

export interface AppSettings {
  theme: 'system' | 'dark' | 'light'
  hiddenProviders: string[]
  providerOrder: string[]
}
