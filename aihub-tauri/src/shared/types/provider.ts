export interface Provider {
  id: string
  name: string
  url: string
  shortcut: string
  builtin: boolean
  icon?: string
  order: number
}

export interface ProviderState {
  id: string
  name: string
  url: string
  active: boolean
  hidden: boolean
  builtin: boolean
  icon?: string
  order: number
}
