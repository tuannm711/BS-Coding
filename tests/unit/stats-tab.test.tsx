import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { StatsSummary } from '../../src/shared/types'
import StatsTab, { formatStatsRows, StatsView } from '../../src/renderer/src/components/settings/StatsTab'

const summary: StatsSummary = {
  totalCost: 1.2345,
  totalTokens: 12345,
  perModel: {
    'gpt-5': { messages: 3, tokens: 900, cost: 0.5 },
    'claude-sonnet-4-6': { messages: 1, tokens: 100, cost: 0.75 }
  },
  perSession: [
    { id: 's1', title: 'Cheap', model: 'gpt-5', usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: 0.1 } },
    { id: 's2', title: 'Dear', model: 'gpt-5', usage: { input: 9, output: 9, cacheRead: 0, cacheWrite: 0, cost: 0.9 } }
  ]
}

describe('stats view model', () => {
  it('orders models and sessions by cost, dearest first', () => {
    const rows = formatStatsRows(summary)
    expect(rows.models.map(row => row.name)).toEqual(['claude-sonnet-4-6', 'gpt-5'])
    expect(rows.sessions.map(row => row.title)).toEqual(['Dear', 'Cheap'])
  })

  it('reports empty when nothing has been recorded', () => {
    expect(formatStatsRows({ totalCost: 0, totalTokens: 0, perModel: {}, perSession: [] }).empty).toBe(true)
    expect(formatStatsRows(summary).empty).toBe(false)
  })

  it('names an unattributed model rather than showing a blank row', () => {
    const rows = formatStatsRows({ ...summary, perModel: { '': { messages: 1, tokens: 5, cost: 0.01 } }, perSession: [] })
    expect(rows.models[0].name).toBe('Unattributed')
  })
})

describe('stats view', () => {
  it('renders both totals and every row it was given', () => {
    const markup = renderToStaticMarkup(React.createElement(StatsView, { summary }))
    expect(markup).toContain('$1.2345')
    expect(markup).toContain('12,345')
    expect(markup).toContain('claude-sonnet-4-6')
    expect(markup).toContain('Dear')
  })

  it('says so when nothing has been recorded', () => {
    const markup = renderToStaticMarkup(React.createElement(StatsView, { summary: { totalCost: 0, totalTokens: 0, perModel: {}, perSession: [] } }))
    expect(markup).toContain('No usage recorded yet')
  })

  it('shows a loading state before the summary arrives', () => {
    const markup = renderToStaticMarkup(React.createElement(StatsView, { summary: null }))
    expect(markup).toContain('Loading')
  })
})

describe('stats tab', () => {
  // The suite runs with environment: 'node', so effects never fire during
  // renderToStaticMarkup. This asserts the pre-fetch render only; the fetched
  // state is covered through StatsView above.
  it('renders its loading state without touching window', () => {
    expect(renderToStaticMarkup(React.createElement(StatsTab))).toContain('Loading')
  })
})
