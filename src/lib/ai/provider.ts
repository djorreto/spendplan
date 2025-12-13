/**
 * ========================================
 * 🤖 AI PROVIDER FACTORY
 * ========================================
 * Sistema enchufable de proveedores de IA
 */

import type { AIProvider, AIProviderConfig } from './types'
import { MockAIProvider } from './mock-provider'
import { GrokAIProvider } from './grok-provider'

// Registry de providers disponibles
const providers: Record<string, new (...args: unknown[]) => AIProvider> = {
  mock: MockAIProvider,
  grok: GrokAIProvider as unknown as new (...args: unknown[]) => AIProvider,
}

/**
 * Crea una instancia del provider de IA según la configuración
 */
export function createAIProvider(config: AIProviderConfig): AIProvider {
  const providerName = config.provider.toLowerCase()

  switch (providerName) {
    case 'grok':
      if (!config.apiKey) {
        console.warn('Grok API key not provided, falling back to mock')
        return new MockAIProvider()
      }
      return new GrokAIProvider(config.apiKey, config.model)

    case 'mock':
    default:
      return new MockAIProvider()
  }
}

/**
 * Obtiene la lista de providers disponibles
 */
export function getAvailableProviders(): string[] {
  return Object.keys(providers)
}

/**
 * Registra un nuevo provider
 */
export function registerProvider(
  name: string, 
  providerClass: new (...args: unknown[]) => AIProvider
): void {
  providers[name.toLowerCase()] = providerClass
}

// Re-export types
export type { AIProvider, AIProviderConfig } from './types'
export type {
  CategorizeInput,
  CategorizeOutput,
  InsightsInput,
  InsightsOutput,
  OCRInput,
  OCROutput,
  ParseMessageInput,
  ParseMessageOutput,
} from './types'

