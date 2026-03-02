import { Provider } from './types/provider'

export const BUILT_IN_PROVIDERS: Provider[] = [
  {
    id: 'mca',
    name: 'MCA',
    url: 'https://mca-ai.fcc.gov',
    shortcut: 'CmdOrCtrl+1',
    builtin: true,
    order: 0
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    url: 'https://chat.openai.com',
    shortcut: 'CmdOrCtrl+2',
    builtin: true,
    order: 1
  },
  {
    id: 'gemini',
    name: 'Gemini',
    url: 'https://gemini.google.com',
    shortcut: 'CmdOrCtrl+3',
    builtin: true,
    order: 2
  },
  {
    id: 'grok',
    name: 'Grok',
    url: 'https://grok.com',
    shortcut: 'CmdOrCtrl+4',
    builtin: true,
    order: 3
  },
  {
    id: 'claude',
    name: 'Claude',
    url: 'https://claude.ai',
    shortcut: 'CmdOrCtrl+5',
    builtin: true,
    order: 4
  }
]
