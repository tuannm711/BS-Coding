import { useEffect } from 'react'
import type { BsSettings } from '@shared/types'
import { appearanceVariables } from '@shared/appearance'

export function useAppearance() {
  useEffect(() => {
    let mounted = true
    let revision = 0
    let applied: string[] = []
    const apply = (settings: BsSettings) => {
      for (const key of applied) document.documentElement.style.removeProperty(key)
      const variables = appearanceVariables(settings.appearance)
      for (const [key, value] of Object.entries(variables)) document.documentElement.style.setProperty(key, value)
      applied = Object.keys(variables)
    }
    const initialRevision = revision
    void window.api.getSettings().then(settings => { if (mounted && initialRevision === revision) apply(settings) }).catch(() => {})
    const saved = (event: Event) => { revision++; apply((event as CustomEvent<BsSettings>).detail) }
    window.addEventListener('bs:settings-saved', saved)
    return () => {
      mounted = false
      window.removeEventListener('bs:settings-saved', saved)
      for (const key of applied) document.documentElement.style.removeProperty(key)
    }
  }, [])
}
