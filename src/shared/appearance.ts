import type { AppearanceSettings } from './types'

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  background: '#0b0e13', text: '#cdd3de', button: '#4da3ff'
}

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}

export function normalizeAppearance(value: unknown): AppearanceSettings {
  const raw = value && typeof value === 'object' ? value as Partial<AppearanceSettings> : {}
  const color = (key: keyof AppearanceSettings) => isHexColor(raw[key]) ? raw[key].toLowerCase() : DEFAULT_APPEARANCE[key]
  return { background: color('background'), text: color('text'), button: color('button') }
}

function rgb(hex: string): number[] {
  return [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16))
}

export function mixColor(color: string, target: string, amount: number): string {
  const destination = rgb(target)
  return '#' + rgb(color).map((channel, i) => Math.round(channel + (destination[i] - channel) * amount).toString(16).padStart(2, '0')).join('')
}

function luminance(hex: string): number {
  const channels = rgb(hex).map(value => {
    const channel = value / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

export function contrastRatio(a: string, b: string): number {
  const first = luminance(a)
  const second = luminance(b)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

/** CSS variables are the sole renderer adapter for persisted appearance. */
export function appearanceVariables(value: unknown): Record<string, string> {
  const colors = normalizeAppearance(value)
  const light = luminance(colors.background) > 0.45
  const layerTarget = light ? '#000000' : '#ffffff'
  const buttonText = contrastRatio(colors.button, '#000000') > contrastRatio(colors.button, '#ffffff') ? '#000000' : '#ffffff'
  const vars: Record<string, string> = {
    '--bg': '#0b0e13', '--bg-panel': '#10141b', '--bg-raised': '#161b24', '--bg-hover': '#1b212c', '--bg-active': '#242b38',
    '--bg-tab-inactive': '#0e1218', '--bg-input': '#1a1f29', '--bg-input-hover': '#232a37', '--bg-code': '#090c11',
    '--bg-chat': '#090c11', '--bg-bubble': '#141922', '--bg-bubble-user': '#1d2330', '--status-bg': '#0e1218',
    '--text': '#cdd3de', '--text-strong': '#eef1f6', '--chat-text': '#eef1f6', '--text-dim': '#8b93a3', '--text-faint': '#8b93a3',
    '--accent': '#4da3ff', '--accent-strong': '#7cbfff', '--accent-dim': '#4da3ff1f', '--accent-border': '#4da3ff52', '--focus-ring': '#4da3ff61',
    '--hairline': '#bacae614',
    '--button-bg': colors.button,
    '--button-hover': mixColor(colors.button, buttonText === '#000000' ? '#ffffff' : '#000000', 0.12),
    '--button-text': buttonText
  }
  if (colors.background !== DEFAULT_APPEARANCE.background) {
    Object.assign(vars, {
      '--bg': colors.background,
      '--bg-panel': mixColor(colors.background, layerTarget, 0.025),
      '--bg-raised': mixColor(colors.background, layerTarget, 0.05),
      '--bg-hover': mixColor(colors.background, layerTarget, 0.08),
      '--bg-active': mixColor(colors.background, layerTarget, 0.12),
      '--bg-tab-inactive': mixColor(colors.background, layerTarget, 0.015),
      '--bg-input': mixColor(colors.background, layerTarget, 0.065),
      '--bg-input-hover': mixColor(colors.background, layerTarget, 0.10),
      '--bg-code': mixColor(colors.background, light ? '#ffffff' : '#000000', 0.18),
      '--bg-chat': colors.background,
      '--bg-bubble': mixColor(colors.background, layerTarget, 0.04),
      '--bg-bubble-user': mixColor(colors.background, layerTarget, 0.08),
      '--status-bg': mixColor(colors.background, layerTarget, 0.02),
      '--hairline': mixColor(colors.background, colors.text, 0.18)
    })
  }
  if (colors.text !== DEFAULT_APPEARANCE.text || colors.background !== DEFAULT_APPEARANCE.background) {
    Object.assign(vars, {
      '--text': colors.text, '--text-strong': colors.text, '--chat-text': colors.text,
      '--text-dim': mixColor(colors.text, colors.background, 0.25),
      '--text-faint': mixColor(colors.text, colors.background, 0.35)
    })
  }
  if (colors.button !== DEFAULT_APPEARANCE.button || colors.background !== DEFAULT_APPEARANCE.background) {
    let accent = colors.button
    const target = contrastRatio(colors.background, '#000000') > contrastRatio(colors.background, '#ffffff') ? '#000000' : '#ffffff'
    for (let step = 0; step < 10 && contrastRatio(accent, colors.background) < 4.5; step++) accent = mixColor(accent, target, 0.15)
    Object.assign(vars, {
      '--accent': accent, '--accent-strong': accent,
      '--accent-dim': `${accent}1f`, '--accent-border': `${accent}52`, '--focus-ring': `${accent}61`
    })
  }
  return vars
}
