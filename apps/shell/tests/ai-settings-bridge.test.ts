import { describe, expect, it, vi } from 'vitest'
import type { AiSettingsApi } from '../src/shared/home-api'
import { defaultAiSettings, isSafeAiSettings } from '@genoffice/ai-provider'

describe('AiSettingsApi contract', () => {
  it('round-trips settings through the three channels', async () => {
    const invoke = vi.fn(async (channel: string, ..._args: unknown[]) =>
      channel === 'ai:get-settings' ? defaultAiSettings() : { ok: true },
    )
    const api: AiSettingsApi = {
      getAiSettings: () => invoke('ai:get-settings') as never,
      setAiSettings: (s) => invoke('ai:set-settings', s) as never,
      testAiSettings: (s) => invoke('ai:chat', s) as never,
    }

    const settings = await api.getAiSettings()
    expect(settings.provider).toBe('custom')
    expect(invoke).toHaveBeenCalledWith('ai:get-settings')

    await api.setAiSettings(settings)
    expect(invoke).toHaveBeenCalledWith('ai:set-settings', settings)

    await api.testAiSettings(settings)
    expect(invoke).toHaveBeenCalledWith('ai:chat', settings)
  })
})

describe('isSafeAiSettings', () => {
  it('accepts a well-formed settings object', () => {
    expect(isSafeAiSettings(defaultAiSettings())).toBe(true)
  })

  it('rejects a non-http base URL', () => {
    const s = defaultAiSettings()
    s.providers.custom.baseUrl = 'file:///etc/passwd'
    expect(isSafeAiSettings(s)).toBe(false)
  })

  it('rejects a missing providers map', () => {
    expect(isSafeAiSettings({ provider: 'custom' })).toBe(false)
  })

  it('rejects a non-object', () => {
    expect(isSafeAiSettings(null)).toBe(false)
    expect(isSafeAiSettings('custom')).toBe(false)
  })
})
