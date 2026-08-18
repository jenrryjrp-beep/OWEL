import type { AiProviderId, AiProviderMeta, AiSettings, LegacyAiSettings } from './types'

/**
 * Genspark server-side LLM proxy endpoints. All three protocols share the
 * api_key from the gsk login; model ids follow the proxy's own naming scheme,
 * which differs from the official vendor ids.
 */
export const GENSPARK_LLM_BASE_URLS = {
  anthropic: 'https://www.genspark.ai/api/anthropic',
  gemini: 'https://www.genspark.ai/api/llm_proxy/gemini/v1beta',
  openai: 'https://www.genspark.ai/api/llm_proxy/v1',
} as const

/**
 * Splits GenOffice usage out of the proxy's default "Claw" billing bucket
 * (the backend attributes gsk-key traffic by X-Agent-Type). Only sent to the
 * Genspark proxy — never to direct vendor APIs.
 */
export const GENSPARK_AGENT_TYPE = 'genoffice'

export function gensparkAttributionHeaders(baseUrl?: string): Record<string, string> {
  return baseUrl?.startsWith('https://www.genspark.ai')
    ? { 'X-Agent-Type': GENSPARK_AGENT_TYPE }
    : {}
}

export const AI_PROVIDERS: AiProviderMeta[] = [
  {
    id: 'genspark',
    label: 'Genspark',
    models: [
      'claude-opus-4-7',
      'claude-opus-4-8',
      'claude-sonnet-4-6',
      'claude-haiku-4-5',
      'gpt-5.2',
      'gemini-3.1-pro-preview',
      'gemini-3-flash-preview',
    ],
    defaultModel: 'claude-opus-4-7',
    keyPlaceholder: 'Not required - sign in to Genspark',
  },
  {
    id: 'anthropic',
    label: 'Claude',
    models: [
      'claude-sonnet-5',
      'claude-opus-4-8',
      'claude-opus-4-7',
      'claude-sonnet-4-6',
      'claude-opus-4-6',
      'claude-opus-4-5-20251101',
      'claude-haiku-4-5-20251001',
      'claude-sonnet-4-5-20250929',
    ],
    defaultModel: 'claude-opus-4-7',
    keyPlaceholder: 'sk-ant-api03-...',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
    defaultModel: 'gemini-2.5-flash',
    keyPlaceholder: 'AIza...',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    defaultModel: 'deepseek-chat',
    keyPlaceholder: 'sk-...',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    models: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini'],
    defaultModel: 'gpt-4.1-mini',
    keyPlaceholder: 'sk-...',
  },
  {
    id: 'custom',
    label: 'Local / Custom (OpenAI-compatible)',
    // Free-text model field in the UI — this slot is not restricted to any
    // fixed model list. Works with Ollama, LM Studio, vLLM, llama.cpp
    // server, text-generation-webui, OpenRouter, or any other endpoint that
    // implements the OpenAI chat/completions wire protocol.
    models: [],
    defaultModel: '',
    keyPlaceholder: 'sk-... (leave blank if your server needs no key)',
    needsBaseUrl: true,
  },
]

/**
 * Fresh settings with every provider's default model and an empty key,
 * except providers listed in `defaultApiKeys` (e.g. an app-specific
 * preconfigured Anthropic key). Callers own that policy; this package
 * has no hardcoded keys.
 */
export function defaultAiSettings(
  defaultApiKeys?: Partial<Record<AiProviderId, string>>,
): AiSettings {
  const providers = {} as AiSettings['providers']
  for (const meta of AI_PROVIDERS) {
    providers[meta.id] = {
      apiKey: defaultApiKeys?.[meta.id] ?? '',
      model: meta.defaultModel,
      baseUrl: meta.needsBaseUrl ? '' : undefined,
    }
  }
  return { provider: 'custom', providers }
}

/**
 * Merge on-disk settings over freshly computed defaults. `stored` is whatever
 * the caller read from its settings file (already JSON-parsed); this function
 * does no file I/O.
 */
export function resolveAiSettings(
  stored: Partial<AiSettings> & LegacyAiSettings,
  defaults: AiSettings,
): AiSettings {
  if (!stored.providers) {
    // Fork: 'custom' is the local/self-hosted slot, so a legacy key — which
    // was issued for some other vendor — must never be carried into it, and
    // the baseUrl must never fall back to a third-party host. Upstream could
    // leave this branch alone because it selected 'genspark'; we select
    // 'custom', so the branch is live. Drop the key and keep the blank defaults.
    return defaults
  }
  return {
    provider: stored.provider ?? defaults.provider,
    providers: { ...defaults.providers, ...stored.providers },
  }
}

/**
 * Structural guard for anything about to be persisted as AI settings. The
 * baseUrl check is the load-bearing part: the API key travels to whatever host
 * baseUrl names, so an unvalidated write is how a credential leaves the LAN.
 * Applied in each app's main-process ai:set-settings handler (Task 4) and again
 * in shell's preload (Task 5) so a bad value fails before the IPC hop.
 */
export function isSafeAiSettings(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const s = value as { provider?: unknown; providers?: unknown }
  if (typeof s.provider !== 'string') return false
  if (typeof s.providers !== 'object' || s.providers === null) return false
  for (const cfg of Object.values(s.providers as Record<string, unknown>)) {
    if (typeof cfg !== 'object' || cfg === null) return false
    const c = cfg as { apiKey?: unknown; model?: unknown; baseUrl?: unknown }
    if (typeof c.apiKey !== 'string' || typeof c.model !== 'string') return false
    if (c.baseUrl === undefined || c.baseUrl === '') continue
    if (typeof c.baseUrl !== 'string') return false
    try {
      const proto = new URL(c.baseUrl).protocol
      if (proto !== 'http:' && proto !== 'https:') return false
    } catch {
      return false
    }
  }
  return true
}
