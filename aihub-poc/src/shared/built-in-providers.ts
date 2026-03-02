import { Provider } from './types/provider'

export const BUILT_IN_PROVIDERS: Provider[] = [
  {
    id: 'mca',
    name: 'MCA',
    url: 'https://mca-ai.fcc.gov',
    shortcut: 'CmdOrCtrl+1',
    partition: 'persist:provider-mca',
    builtin: true,
    order: 0
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    url: 'https://chat.openai.com',
    shortcut: 'CmdOrCtrl+2',
    partition: 'persist:provider-chatgpt',
    builtin: true,
    order: 1
  },
  {
    id: 'gemini',
    name: 'Gemini',
    url: 'https://gemini.google.com',
    shortcut: 'CmdOrCtrl+3',
    partition: 'persist:provider-gemini',
    builtin: true,
    order: 2
  },
  {
    id: 'grok',
    name: 'Grok',
    url: 'https://grok.com',
    shortcut: 'CmdOrCtrl+4',
    partition: 'persist:provider-grok',
    builtin: true,
    order: 3
  },
  {
    id: 'claude',
    name: 'Claude',
    url: 'https://claude.ai',
    shortcut: 'CmdOrCtrl+5',
    partition: 'persist:provider-claude',
    builtin: true,
    order: 4
  }
]
