---
version: alpha
name: BS Coding
description: A compact Studio Dark desktop workspace for concurrent coding agents.
colors:
  primary: '#4da3ff'
  background: '#0b0e13'
  panel: '#10141b'
  raised: '#161b24'
  text: '#cdd3de'
  strong: '#eef1f6'
  muted: '#8b93a3'
  danger: '#ff5f56'
  warning: '#ffb454'
  success: '#4ade9f'
typography:
  sans:
    fontFamily: Instrument Sans Variable, Segoe UI Variable, system-ui, sans-serif
  mono:
    fontFamily: JetBrains Mono, ui-monospace, monospace
rounded:
  DEFAULT: 6px
  sm: 4px
  lg: 10px
spacing:
  section-gap: 12px
  rail-width: 279px
components:
  button: {}
  card: {}
  dialog: {}
  input: {}
  table: {}
---

# BS Coding Design System

## Overview

### Creative North Star

A coding studio console: cool slate layers, quiet blue controls, readable agent identities, and compact operational information. This records the existing Studio Dark identity in `src/renderer/src/styles.css`; it does not generate tokens.

### Product context and register

The primary users run multiple coding agents in an Electron desktop window. The register is product utility with dense but readable controls. UI labels are English; main-process notices may be Vietnamese as specified in AGENTS.md. No country-specific market positioning is assumed. The memorable signature is a dark console framed by fixed rails; forms and agent controls favor familiar behavior.

Runtime CSS variables in `src/renderer/src/styles.css` own colors, fonts, radii and geometry. This file mirrors those tokens. Existing Settings tables, quota windows and Mode controls provide the component baseline. Avoid unrelated visual changes when extending one workflow.

## Colors

Blue indicates selection and primary actions. Layered panel/raised surfaces express hierarchy. Yellow communicates recoverable quota or validation warnings; red marks destructive actions. Text labels accompany semantic color. Keyboard focus uses the accent token.

## Typography

Instrument Sans is the UI face, Bricolage Grotesque is used for display labels, and the existing JetBrains/system monospace stack displays code. Use tabular numerals for usage. Preserve full technical values in tooltips when space requires truncation.

## Layout

The existing stylesheet uses a 4px spacing rhythm. Both rails are 279px. Fleet scrolls inside its rail and displays one card per agent. Settings content owns its scrolling; tables allow horizontal overflow. The chat toolbar wraps at constrained widths, keeping Mode, quick messages and agent/model controls usable.

## Elevation & Depth

Use tonal layers, subtle hairline borders and the existing shadow tokens. Popups and dialogs use raised surfaces. Do not add decorative gradients or animations to frequently updated content.

## Shapes

Use the runtime 4px/6px/10px radius tokens. Existing small icon buttons and badges retain their shared geometry.

## Components

### Foundational visual states

Enabled actions use a pointer, hover and focus-visible treatment. Selected toggles expose aria-pressed. Disabled controls cannot invoke handlers. Use existing loading indicators and textual empty/error states.

### Buttons and actions

Use shared `btn`, `agent-icon-button` and Fleet toggle classes. Quick messages use neutral small buttons with the configured name and content preview. Delete actions require an app-owned confirmation; routine draft saves do not.

### Navigation and data display

Fleet identifies agents before their provider/account metadata. Show only quota relevant to the bound pool; time windows are constraints of that pool. Settings agent rows choose provider/account/quota; model selection belongs in chat.

### Forms and overlays

Settings uses draft/Save/Cancel. Native selects deliberately retain platform keyboard and popup behavior. Modal dialogs own focus, Escape and restoration; unsaved changes use an app-owned discard dialog. Quick-message textareas have sufficient fixed minimum height and no manual resize.

### Iconography

Use lucide-react with accessible labels and tooltip descriptions for icon actions. Preserve text for important primary actions and agent identities.

### Motion

Streaming updates remain immediate. Avoid decorative animation in chat hot paths. Existing reduced-motion preferences apply.

### Content and data visualization

Use short English action labels. Quota bars reuse `QuotaWindow`, with explicit unknown values rather than inventing measurements. Bound and shared quota facts come from the shared binding contract.

## Do's and Don'ts

- Keep one agent per provider account quota and offer only that pool's models.
- Preserve session history when removing agents or migrating old assignments.
- Reuse current tokens and controls; do not create a separate visual system for Quick Messages.
- Do not group Fleet's primary display by provider or show unreported quota as zero.
