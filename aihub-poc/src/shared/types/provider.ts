export interface Provider {
  id: string
  name: string
  url: string
  shortcut: string
  partition: string
  builtin: boolean
  icon?: string // URL or data URI for custom provider favicons
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
