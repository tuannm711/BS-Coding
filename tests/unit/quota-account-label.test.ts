import { describe, expect, it } from 'vitest'
import { formatProviderAccountType } from '../../src/renderer/src/components/quota/quota-view'

describe('quota account provider labels', () => {
  it('does not label Antigravity OAuth as ChatGPT OAuth', () => {
    expect(formatProviderAccountType('antigravity', 'oauth')).toBe('Antigravity OAuth')
    expect(formatProviderAccountType('openai', 'oauth')).toBe('ChatGPT OAuth')
  })
})
