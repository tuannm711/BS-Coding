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

Runtime CSS variables in `src/renderer/src/styles.css` own fonts, radii and geometry and provide the startup color fallback. `src/shared/appearance.ts` owns saved color defaults and the color-to-variable adapter; `useAppearance.ts` applies the saved palette to the document. This file mirrors those tokens. Existing Settings tables, quota windows and Mode controls provide the component baseline.

## Colors

Blue indicates selection and primary actions. Layered panel/raised surfaces express hierarchy. Yellow communicates recoverable quota or validation warnings; red marks destructive actions. Text labels accompany semantic color. Keyboard focus uses the accent token.

Appearance exposes background, text and primary button colors as six-digit HEX values. Surface layers derive from the background. Primary button foreground automatically chooses black or white; accent text is adjusted for readability on the chosen background. The default secondary text is `#8b93a3`. Semantic warning/danger colors keep their meaning. A scoped preview uses the same adapter as the document; draft colors apply globally only after Save. Restore defaults is a draft operation.

## Typography

Instrument Sans is the UI face, Bricolage Grotesque is used for display labels, and the existing JetBrains/system monospace stack displays code. Use tabular numerals for usage. Preserve full technical values in tooltips when space requires truncation.

## Layout

The existing stylesheet uses a 4px spacing rhythm. Both rails are 279px. Fleet scrolls inside its rail and displays one card per agent. Settings content owns its scrolling; tables allow horizontal overflow. Mode and agent/model controls share a wrapping row; Quick Messages occupy a separate wrapping row immediately below it and above the composer, centered within each row at every pane width.

Settings is up to 1120px wide and 88dvh tall, bounded by the window. At 760px and below its section navigation becomes a horizontal scroller. Header, feedback and Save/Cancel stay outside the content scroller. Chat uses compact progress prose and expandable tool activity, with an open text surface for the final response.

## Elevation & Depth

Use tonal layers, subtle hairline borders and the existing shadow tokens. Popups and dialogs use raised surfaces. Do not add decorative gradients or animations to frequently updated content.

## Shapes

Use the runtime 4px/6px/10px radius tokens. Existing small icon buttons and badges retain their shared geometry.

## Components

### Foundational visual states

Enabled actions use a pointer, hover and focus-visible treatment. Selected toggles expose aria-pressed. Disabled controls cannot invoke handlers. Use existing loading indicators and textual empty/error states.

### Buttons and actions

Use shared `btn`, `agent-icon-button` and Fleet toggle classes. Quick messages use neutral small buttons with the configured name and content preview. Delete actions require an app-owned confirmation; routine draft saves do not.

The composer action reads Send while idle, Steer while running, and Save message while editing pending guidance. Enter submits; Shift+Enter inserts a line break; IME composition cannot submit. Pending human guidance is labeled steer pending and remains editable/removable until the next step accepts it. Delegated tasks retain the queued label.

### Navigation and data display

Fleet identifies agents before their provider/account metadata. Show only quota relevant to the bound pool; time windows are constraints of that pool. Settings agent rows choose provider/account/quota; model selection belongs in chat.

### Forms and overlays

Settings uses draft/Save/Cancel. Native selects deliberately retain platform keyboard and popup behavior. Modal dialogs own focus, Escape and restoration; unsaved changes use an app-owned discard dialog. Quick-message textareas have sufficient fixed minimum height and no manual resize.

Add and Edit project share the modal form. Editing a name updates the existing project; changing its folder also keeps agent/session IDs and relocates app metadata. The destination must exist and not belong to another registered project. Folder changes require idle sessions/agents and closed project terminals; the app does not move project files.

Copilot uses the existing provider authorization modal with a Device Flow variant. Show the GitHub verification code, Copy code, verification URL, Open browser and expiry. Codes are transient; private device grants and tokens stay in main. Cancel closes the modal and stops polling; denied/expired sessions can generate a new code. Other providers retain callback OAuth.

Browser connection and install-guide dialogs reuse Modal with English setup/status/error copy, native profile/tab selects and keyboard focus restoration. Setup uses an explicit Install / Repair helper action. Existing tabs are assigned to the current chat only through this workflow. Profiles may be disabled/re-enabled; offline selection remains visible rather than silently switching to another profile. Native mode has no port/code fields.

### Iconography

Use lucide-react with accessible labels and tooltip descriptions for icon actions. Preserve text for important primary actions and agent identities.

### Motion

Streaming updates remain immediate. Avoid decorative animation in chat hot paths. Existing reduced-motion preferences apply.

Thinking is displayed only for provider-supplied reasoning. Working, Responding and input-wait states follow real events. Flush batched prose before a tool boundary so activity stays chronological. A persisted `turn-finished` event identifies successful completion. Only the final text after the last tool of a completed turn receives Response, elapsed turn time and Copy; stopped/failed turns never receive a success label. Copy preserves Markdown and reports clipboard failures inline. Completion does not take scroll ownership from a user reading earlier messages.

Final prose that reaches its output budget may continue within the same turn, with tools disabled and at most two automatic continuation requests. Streamed deltas append verbatim; repeated letters, whitespace and Markdown are not deduplicated by content. The final response and Copy retain the joined prose. Missing completion markers, provider failure or exhausted continuation budget preserve partial text and show an error.

### Content and data visualization

Use short English action labels. Quota bars reuse `QuotaWindow`, with explicit unknown values rather than inventing measurements. Bound and shared quota facts come from the shared binding contract.

The chat footer's context count is the latest provider-reported request size (including cache and generated tokens), while Tokens is the cumulative usage recorded for the session. Provider measurements survive reload and measured spending persists after Stop/error. Missing usage remains unknown. Percentage uses the exact account/catalog model limit where available; a fallback is identified as a configured context budget in its tooltip. Tooltip copy explains both measurements and unreported requests.

## Do's and Don'ts

- Keep one agent per provider account quota and offer only that pool's models.
- Preserve session history when removing agents or migrating old assignments.
- Reuse current tokens and controls; do not create a separate visual system for Quick Messages.
- Do not group Fleet's primary display by provider or show unreported quota as zero.
