import { describe, expect, it, vi } from 'vitest'
import { defaultAiSettings, isSafeAiSettings, resolveAiSettings } from '@genoffice/ai-provider'
import type { AiSettings } from '@genoffice/ai-provider'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  app: { getPath: () => '/tmp/genoffice-test', on: vi.fn() },
  net: { fetch: vi.fn() },
}))

// Keep the real slides AI IPC module under test without loading renderer-only
// PPTX/WASM dependencies that are unrelated to settings resolution.
vi.mock('@genoffice/pptx-engine', () => ({
  addPicture: vi.fn(),
  replacePictureBytes: vi.fn(),
}))
vi.mock('@genoffice/pptx-render', () => ({ EMU_PER_PX_96: 9525 }))
vi.mock('../../slides/src/main/session-state', () => ({
  pushHistory: vi.fn(),
  rebuildSlide: vi.fn(),
  scheduleHistoryNotify: vi.fn(),
  sessions: new Map(),
}))

/**
 * Each app must return exactly what resolveAiSettings produces. Upstream reset
 * settings.provider to 'genspark' afterwards, discarding a stored choice.
 */
const stored = {
  provider: 'custom' as const,
  providers: {
    ...defaultAiSettings().providers,
    custom: {
      apiKey: 'sk-pilot',
      model: 'local-model',
      baseUrl: 'https://gateway.example.com/api/llm',
    },
  },
}

describe.each([
  ['docs', () => import('@genoffice/docs/src/main/docs-main')],
  ['sheets', () => import('@genoffice/sheets/src/main/sheets-main')],
  ['slides', () => import('@genoffice/slides/src/main/ai-ipc')],
])('%s readAiSettings', (_name, load) => {
  it('keeps a stored custom provider instead of resetting it', async () => {
    const mod = (await load()) as { readAiSettings: (s: unknown) => AiSettings }
    expect(mod.readAiSettings(stored).provider).toBe('custom')
    expect(mod.readAiSettings(stored).providers.custom.apiKey).toBe('sk-pilot')
  })

  it('lands on the gateway when nothing is stored', async () => {
    const mod = (await load()) as { readAiSettings: (s: unknown) => AiSettings }
    expect(mod.readAiSettings({}).provider).toBe('custom')
  })
})

describe('reference composition', () => {
  it('is what each app must match', () => {
    expect(resolveAiSettings(stored, defaultAiSettings()).provider).toBe('custom')
  })
})

describe('ai:set-settings guard', () => {
  it('rejects a base URL that is not http(s)', () => {
    const bad = structuredClone(stored)
    bad.providers.custom.baseUrl = 'file:///etc/passwd'
    expect(isSafeAiSettings(bad)).toBe(false)
  })

  it('accepts the settings the pilot actually stores', () => {
    expect(isSafeAiSettings(stored)).toBe(true)
  })
})
