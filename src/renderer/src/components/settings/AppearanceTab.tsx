import { useId, type CSSProperties } from 'react'
import type { AppearanceSettings } from '@shared/types'
import { appearanceVariables, contrastRatio, DEFAULT_APPEARANCE, isHexColor, normalizeAppearance } from '@shared/appearance'

interface Props {
  appearance?: AppearanceSettings
  onChange: (appearance: AppearanceSettings) => void
}

const FIELDS: Array<{ key: keyof AppearanceSettings; label: string; hint: string }> = [
  { key: 'background', label: 'Background', hint: 'Panels and chat surfaces follow this color.' },
  { key: 'text', label: 'Text', hint: 'Main text in the workspace and chat.' },
  { key: 'button', label: 'Buttons', hint: 'Primary buttons, selection and focus accents.' }
]

export default function AppearanceTab({ appearance, onChange }: Props) {
  const id = useId()
  const colors = appearance ?? DEFAULT_APPEARANCE
  const preview = normalizeAppearance(colors)
  const ratio = contrastRatio(preview.text, preview.background)
  return <div className="settings-tab appearance-tab">
    <p className="settings-hint">Choose workspace colors. Preview changes below, then Save to apply them across the app.</p>
    <div className="appearance-layout">
      <div className="appearance-fields">
        {FIELDS.map(field => {
          const valid = isHexColor(colors[field.key])
          return <div className="settings-row" key={field.key}>
            <label className="label" htmlFor={`${id}-${field.key}`}>{field.label}</label>
            <p className="settings-hint">{field.hint}</p>
            <div className="appearance-color-row">
              <input type="color" aria-label={`Pick ${field.label.toLowerCase()} color`} value={preview[field.key]} onChange={event => onChange({ ...colors, [field.key]: event.target.value })} />
              <input className="input" id={`${id}-${field.key}`} value={colors[field.key]} spellCheck={false} aria-invalid={!valid} aria-describedby={!valid ? `${id}-${field.key}-error` : undefined} onChange={event => onChange({ ...colors, [field.key]: event.target.value })} />
            </div>
            {!valid && <span id={`${id}-${field.key}-error`} className="settings-error">Use a six-digit HEX color, for example #4da3ff.</span>}
          </div>
        })}
        <button className="btn" onClick={() => onChange({ ...DEFAULT_APPEARANCE })}>Restore default colors</button>
      </div>
      <section className="appearance-preview" aria-label="Color preview" style={appearanceVariables(preview) as CSSProperties}>
        <div className="appearance-preview-head">Workspace preview</div>
        <div className="appearance-preview-content">
          <span className="appearance-preview-status">Working · Reading project files</span>
          <div className="appearance-preview-message">Your agent responses will use these colors.</div>
          <code>npm run build</code>
          <button className="btn primary" type="button" disabled>Primary button</button>
        </div>
      </section>
    </div>
    <p className={`appearance-contrast ${ratio < 4.5 ? 'warning' : ''}`} role="status">Text contrast: {ratio.toFixed(1)}:1. {ratio < 4.5 ? 'Choose more distinct text and background colors for easier reading (4.5:1 recommended).' : 'Meets the 4.5:1 text contrast target.'}</p>
  </div>
}
