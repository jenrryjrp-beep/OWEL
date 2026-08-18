import { describe, expect, it } from 'vitest'
import {
  AI_PROVIDERS,
  defaultAiSettings,
  isSafeAiSettings,
  resolveAiSettings,
} from '../src/providers'

describe('defaultAiSettings', () => {
  it('gives every provider its default model and an empty key by default', () => {
    const settings = defaultAiSettings()
    expect(settings.provider).toBe('custom')
    for (const meta of AI_PROVIDERS) {
      expect(settings.providers[meta.id].apiKey).toBe('')
      expect(settings.providers[meta.id].model).toBe(meta.defaultModel)
    }
    expect(settings.providers.custom.baseUrl).toBe('')
    expect(settings.providers.anthropic.baseUrl).toBeUndefined()
  })

  it('applies caller-supplied default keys only to the listed providers', () => {
    const settings = defaultAiSettings({ anthropic: 'sk-ant-preset' })
    expect(settings.providers.anthropic.apiKey).toBe('sk-ant-preset')
    expect(settings.providers.gemini.apiKey).toBe('')
  })

  it('leaves the custom slot unrestricted to any fixed model list', () => {
    const custom = AI_PROVIDERS.find((p) => p.id === 'custom')
    expect(custom).toBeDefined()
    expect(custom?.models).toEqual([])
    expect(custom?.defaultModel).toBe('')
    expect(custom?.needsBaseUrl).toBe(true)
  })

  it('starts a fresh install with the custom slot blank — no gateway baked in', () => {
    const settings = defaultAiSettings()
    expect(settings.provider).toBe('custom')
    expect(settings.providers.custom.model).toBe('')
    expect(settings.providers.custom.baseUrl).toBe('')
    expect(settings.providers.custom.apiKey).toBe('')
  })

  it('leaves a stored genspark choice intact — migration is Task 8 policy, not a default', () => {
    const defaults = defaultAiSettings()
    const resolved = resolveAiSettings(
      { provider: 'genspark', providers: defaults.providers },
      defaults,
    )
    expect(resolved.provider).toBe('genspark')
  })

  it('never routes a legacy pre-provider key to a third-party host', () => {
    // Upstream's legacy branch writes the stored key into the custom slot with
    // a baseUrl fallback of https://api.openai.com/v1. Upstream selected
    // 'genspark', so that entry was never used. Once the default is 'custom'
    // it IS used — a legacy file would send document text to OpenAI.
    const resolved = resolveAiSettings({ apiKey: 'oai-legacy' }, defaultAiSettings())
    expect(resolved.provider).toBe('custom')
    expect(resolved.providers.custom.baseUrl).toBe('')
    expect(resolved.providers.custom.apiKey).toBe('')
    expect(resolved.providers.custom.model).toBe('')
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
})

describe('resolveAiSettings', () => {
  it('returns fresh defaults when nothing is stored', () => {
    const defaults = defaultAiSettings({ anthropic: 'sk-ant-preset' })
    expect(resolveAiSettings({}, defaults)).toEqual(defaults)
  })

  it('discards the pre-provider single-endpoint shape instead of migrating it', () => {
    const defaults = defaultAiSettings()
    expect(
      resolveAiSettings(
        { apiKey: 'legacy-key', model: 'legacy-model', baseUrl: 'https://legacy.example.com/v1' },
        defaults,
      ),
    ).toEqual(defaults)
  })

  it('merges stored multi-provider settings over the defaults, provider by provider', () => {
    const defaults = defaultAiSettings({ anthropic: 'preset-key' })
    const resolved = resolveAiSettings(
      {
        provider: 'gemini',
        providers: {
          gemini: { apiKey: 'gemini-key', model: 'gemini-2.5-pro' },
        } as never,
      },
      defaults,
    )
    expect(resolved.provider).toBe('gemini')
    expect(resolved.providers.gemini).toEqual({
      apiKey: 'gemini-key',
      model: 'gemini-2.5-pro',
    })
    // provider not mentioned in stored.providers keeps the computed default
    expect(resolved.providers.anthropic.apiKey).toBe('preset-key')
  })
})
