// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultAiSettings, type AiSettings } from '@genoffice/ai-provider'
import { LocaleProvider } from '../src/renderer/src/locale'
import { SettingsModal } from '../src/renderer/src/SettingsModal'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

function makeSettings(
  baseUrl = 'https://host/api/llm',
  apiKey = 'sk-test',
  model = 'test-model',
): AiSettings {
  const settings = defaultAiSettings()
  settings.providers.custom.baseUrl = baseUrl
  settings.providers.custom.apiKey = apiKey
  settings.providers.custom.model = model
  return settings
}

function installApis(
  getAiSettings: () => Promise<AiSettings>,
  setAiSettings: (settings: AiSettings) => Promise<void>,
  testAiSettings: (settings: AiSettings) => Promise<{ ok: boolean; error?: string }>,
) {
  Object.assign(window, {
    aiOffice: {
      getTheme: vi.fn(async () => 'system'),
      getDefaultSaveDir: vi.fn(async () => ''),
      getUpdateChannel: vi.fn(async () => 'stable'),
      getAppVersion: vi.fn(async () => '0.6.0'),
    },
    aiOfficeSettings: { getAiSettings, setAiSettings, testAiSettings },
  })
}

function renderSettings() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const onClose = vi.fn()

  act(() => {
    root.render(
      <LocaleProvider initial="en">
        <SettingsModal
          status={null}
          loggingOut={false}
          loginWaiting={false}
          loginUrl={null}
          urlCopied={false}
          onOpenLoginUrl={vi.fn()}
          onCopyLoginUrl={vi.fn()}
          onClose={onClose}
          onLogin={vi.fn()}
          onLogout={vi.fn()}
        />
      </LocaleProvider>,
    )
  })

  return { container, root }
}

async function showAiPane(container: HTMLElement) {
  const nav = [...container.querySelectorAll<HTMLButtonElement>('.set-nav-item')].find(
    (button) => button.textContent === 'AI Provider',
  )
  expect(nav).toBeDefined()
  await act(async () => {
    nav?.click()
  })
}

let mounted: { container: HTMLElement; root: Root } | undefined

afterEach(() => {
  mounted?.root.unmount()
  mounted?.container.remove()
  mounted = undefined
})

describe('SettingsModal AI Provider section', () => {
  it('loads the three settings inputs including the model field', async () => {
    let resolveSettings!: (settings: AiSettings) => void
    const settingsPromise = new Promise<AiSettings>((resolve) => {
      resolveSettings = resolve
    })
    const getAiSettings = vi.fn(() => settingsPromise)
    const setAiSettings = vi.fn(async () => {})
    const testAiSettings = vi.fn(async () => ({ ok: true }))
    installApis(getAiSettings, setAiSettings, testAiSettings)
    mounted = renderSettings()

    await showAiPane(mounted.container)
    const inputs = () => [...mounted!.container.querySelectorAll<HTMLInputElement>('.set-input')]
    const buttons = () => [
      ...mounted!.container.querySelectorAll<HTMLButtonElement>('.set-field button'),
    ]
    expect(inputs()).toHaveLength(3)
    expect(inputs().map((input) => input.type)).toEqual(['url', 'password', 'text'])
    expect(mounted.container.querySelectorAll('select')).toHaveLength(0)
    expect(inputs().every((input) => input.disabled)).toBe(true)
    expect(buttons().every((button) => button.disabled)).toBe(true)

    await act(async () => {
      resolveSettings(makeSettings('https://host/api/llm', 'sk-loaded', 'loaded-model'))
      await settingsPromise
    })

    expect(inputs().map((input) => input.value)).toEqual([
      'https://host/api/llm',
      'sk-loaded',
      'loaded-model',
    ])
    expect(inputs().every((input) => !input.disabled)).toBe(true)
    expect(buttons().every((button) => !button.disabled)).toBe(true)

    const test = buttons().find((button) => button.textContent === 'Test connection')
    await act(async () => {
      test?.click()
    })
    expect(testAiSettings).toHaveBeenCalledTimes(1)
    expect(mounted.container.textContent).toContain('Connected')
  })

  it('allows testing a keyless local server with no API key entered', async () => {
    const settings = makeSettings('https://host/api/llm', '', 'local-model')
    const getAiSettings = vi.fn(async () => settings)
    const setAiSettings = vi.fn(async () => {})
    const testAiSettings = vi.fn(async () => ({ ok: true }))
    installApis(getAiSettings, setAiSettings, testAiSettings)
    mounted = renderSettings()
    await showAiPane(mounted.container)

    const test = [
      ...mounted.container.querySelectorAll<HTMLButtonElement>('.set-field button'),
    ].find((button) => button.textContent === 'Test connection')
    expect(test).toBeDefined()
    expect(test?.disabled).toBe(false)
    await act(async () => {
      test?.click()
    })

    expect(testAiSettings).toHaveBeenCalledTimes(1)
    expect(testAiSettings.mock.calls[0][0].providers.custom.apiKey).toBe('')
  })

  it('saves a custom provider with the entered model and normalized base URL', async () => {
    const settings = makeSettings(
      'https://host/api/llm/chat/completions/',
      'sk-updated',
      'llama-3.1-8b',
    )
    const getAiSettings = vi.fn(async () => settings)
    const setAiSettings = vi.fn(async () => {})
    const testAiSettings = vi.fn(async () => ({ ok: true }))
    installApis(getAiSettings, setAiSettings, testAiSettings)
    mounted = renderSettings()
    await showAiPane(mounted.container)

    const save = [
      ...mounted.container.querySelectorAll<HTMLButtonElement>('.set-field button'),
    ].find((button) => button.textContent === 'Save')
    expect(save).toBeDefined()
    await act(async () => {
      save?.click()
    })

    expect(setAiSettings).toHaveBeenCalledTimes(1)
    const saved = setAiSettings.mock.calls[0][0]
    expect(saved.provider).toBe('custom')
    expect(saved.providers.custom.model).toBe('llama-3.1-8b')
    expect(saved.providers.custom.baseUrl).toBe('https://host/api/llm')
    expect(saved.providers.custom.apiKey).toBe('sk-updated')
  })

  it('surfaces the returned error from a failed connection test', async () => {
    const settings = makeSettings()
    const getAiSettings = vi.fn(async () => settings)
    const setAiSettings = vi.fn(async () => {})
    const testAiSettings = vi.fn(async () => ({ ok: false, error: 'bad key' }))
    installApis(getAiSettings, setAiSettings, testAiSettings)
    mounted = renderSettings()
    await showAiPane(mounted.container)

    const test = [
      ...mounted.container.querySelectorAll<HTMLButtonElement>('.set-field button'),
    ].find((button) => button.textContent === 'Test connection')
    expect(test).toBeDefined()
    await act(async () => {
      test?.click()
    })

    expect(testAiSettings).toHaveBeenCalledTimes(1)
    expect(testAiSettings.mock.calls[0][0].providers.custom.model).toBe('test-model')
    expect(mounted.container.textContent).toContain('Connection failed: bad key')
  })
})
