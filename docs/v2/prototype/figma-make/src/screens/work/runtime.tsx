import { useState } from "react"

/* ---------- Types & data ---------- */

export type ToolHealth = "Verified" | "Degraded" | "Unsupported"
export type QuotaHealth = "Healthy" | "Warning" | "Cooldown"

export interface Runtime {
  id: string
  label: string
  provider: string
  model: string
  toolHealth: ToolHealth
  quotaHealth: QuotaHealth
}

export const RUNTIMES: Record<string, Runtime> = {
  "claude-opus": { id: "claude-opus", label: "Claude Opus", provider: "Anthropic", model: "claude-opus-5", toolHealth: "Verified", quotaHealth: "Healthy" },
  codex: { id: "codex", label: "Codex", provider: "OpenAI", model: "codex-1", toolHealth: "Verified", quotaHealth: "Healthy" },
  gpt: { id: "gpt", label: "GPT", provider: "OpenAI", model: "gpt-5", toolHealth: "Verified", quotaHealth: "Warning" },
  gemini: { id: "gemini", label: "Gemini 2.0 Pro", provider: "Google", model: "gemini-2.0-pro", toolHealth: "Verified", quotaHealth: "Healthy" },
  "gemini-flash": { id: "gemini-flash", label: "Gemini 2.0 Flash", provider: "Google", model: "gemini-2.0-flash", toolHealth: "Degraded", quotaHealth: "Healthy" },
  llama: { id: "llama", label: "Ollama Llama 3.3", provider: "Ollama", model: "llama-3.3-70b", toolHealth: "Unsupported", quotaHealth: "Healthy" },
}

export const RUNTIME_ORDER = ["claude-opus", "codex", "gpt", "gemini", "gemini-flash", "llama"]

export interface Epoch {
  n: number
  runtimeId: string
  start: string
  end: string
  executions: number
  status: "Completed" | "Running"
}

export interface RuntimeEvent {
  id: string
  from: Runtime
  to: Runtime
  time: string
}

export const toolHealthStyle = (h: ToolHealth) =>
  h === "Verified" ? "bg-ok-muted text-ok" : h === "Degraded" ? "bg-warn-muted text-warn" : "bg-err-muted text-err"
export const quotaHealthStyle = (q: QuotaHealth) =>
  q === "Healthy" ? "bg-ok-muted text-ok" : q === "Warning" ? "bg-warn-muted text-warn" : "bg-err-muted text-err"

/* ---------- Header runtime selector ---------- */

export function RuntimeSelector({
  current,
  open,
  setOpen,
  onPick,
}: {
  current: Runtime
  open: boolean
  setOpen: (v: boolean) => void
  onPick: (r: Runtime) => void
}) {
  const others = RUNTIME_ORDER.filter((id) => id !== current.id).map((id) => RUNTIMES[id])

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 text-xs border border-line rounded-lg hover:bg-hover transition-colors"
      >
        <span className={`w-1.5 h-1.5 rounded-full ${current.toolHealth === "Verified" ? "bg-ok" : "bg-warn"}`} />
        <div className="text-left leading-tight">
          <div className="text-fore font-medium">{current.label}</div>
          <div className="text-[10px] text-faint">{current.provider}</div>
        </div>
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className={`text-faint transition-transform ${open ? "rotate-180" : ""}`}>
          <polyline points="2,4 6,8 10,4" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-40 w-72 bg-surface border border-line rounded-xl shadow-2xl overflow-hidden">
            {/* Current */}
            <div className="px-4 py-3 border-b border-line">
              <div className="text-[10px] text-faint uppercase tracking-wider mb-2">Current runtime</div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-fore">{current.label}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${toolHealthStyle(current.toolHealth)}`}>
                  {current.toolHealth === "Verified" ? "Healthy" : current.toolHealth}
                </span>
              </div>
              <div className="text-[11px] text-faint mt-0.5 font-mono">{current.provider} · {current.model}</div>
            </div>

            {/* Switch list */}
            <div className="py-1 max-h-72 overflow-y-auto">
              <div className="px-4 py-1.5 text-[10px] text-faint uppercase tracking-wider">Switch runtime</div>
              {others.map((r) => (
                <button
                  key={r.id}
                  onClick={() => { setOpen(false); onPick(r) }}
                  className="w-full text-left px-4 py-2.5 hover:bg-hover transition-colors"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-fore">{r.label}</span>
                    <span className="text-[10px] text-faint">{r.provider}</span>
                    <span className="text-[10px] font-mono text-faint ml-auto">{r.model}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${toolHealthStyle(r.toolHealth)}`}>
                      Tools {r.toolHealth}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${quotaHealthStyle(r.quotaHealth)}`}>
                      Quota {r.quotaHealth}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/* ---------- Switch confirmation ---------- */

export function SwitchConfirmModal({
  from,
  to,
  onConfirm,
  onClose,
}: {
  from: Runtime
  to: Runtime
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-[440px] bg-surface border border-line rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-line flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fore">Switch runtime?</h2>
          <button onClick={onClose} className="text-faint hover:text-fore transition-colors text-lg leading-none">×</button>
        </div>
        <div className="px-6 py-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 rounded-lg border border-line bg-elevated px-3 py-2.5">
              <div className="text-[10px] text-faint uppercase tracking-wider mb-1">Current</div>
              <div className="text-sm font-medium text-fore">{from.label}</div>
              <div className="text-[11px] text-faint font-mono">{from.provider}</div>
            </div>
            <span className="text-faint">→</span>
            <div className="flex-1 rounded-lg border border-accent bg-accent-muted px-3 py-2.5">
              <div className="text-[10px] text-accent uppercase tracking-wider mb-1">New</div>
              <div className="text-sm font-medium text-fore">{to.label}</div>
              <div className="text-[11px] text-faint font-mono">{to.provider}</div>
            </div>
          </div>

          <div className="text-[11px] text-faint uppercase tracking-wider mb-2">BS Coding will</div>
          <ul className="space-y-1.5 mb-4">
            {["Preserve the Work Session", "Compile normalized context", "Start a new Runtime Epoch", "Preserve tool execution records"].map((t) => (
              <li key={t} className="flex items-start gap-2 text-xs text-dim">
                <span className="text-ok mt-px">✓</span> {t}
              </li>
            ))}
            <li className="flex items-start gap-2 text-xs text-faint">
              <span className="text-faint mt-px">✕</span> Not copy provider-specific reasoning metadata
            </li>
          </ul>

          {to.toolHealth !== "Verified" && (
            <div className="flex items-start gap-2 rounded-lg bg-warn-muted border border-line px-3 py-2 mb-1">
              <span className="text-warn text-[11px] mt-px">⚠</span>
              <p className="text-[11px] text-warn leading-relaxed">
                {to.label} has {to.toolHealth.toLowerCase()} tool capability. Coding execution may be unavailable until verified.
              </p>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-line flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-dim hover:text-fore border border-line hover:bg-hover rounded-lg transition-colors">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:opacity-90 transition-opacity">Switch Runtime</button>
        </div>
      </div>
    </div>
  )
}

/* ---------- Runtime history drawer ---------- */

export function RuntimeHistoryPanel({ epochs, onClose }: { epochs: Epoch[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="w-80 h-full bg-surface border-l border-line shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-line flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fore">Runtime History</h2>
          <button onClick={onClose} className="text-faint hover:text-fore transition-colors text-lg leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {epochs.map((e) => {
            const rt = RUNTIMES[e.runtimeId]
            return (
              <div key={e.n} className="rounded-xl border border-line bg-elevated p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] font-mono text-faint">Epoch {e.n}</span>
                  <span className="text-sm font-medium text-fore">{rt.label}</span>
                  <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded font-medium ${e.status === "Running" ? "bg-ok-muted text-ok" : "bg-elevated text-faint"}`}>
                    {e.status}
                  </span>
                </div>
                <div className="text-[11px] text-faint font-mono mb-2">{rt.provider} · {rt.model}</div>
                <div className="flex items-center gap-4 text-[11px] text-faint">
                  <span>{e.start}–{e.end}</span>
                  <span>{e.executions} tool executions</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ---------- Conversation: runtime change system event ---------- */

export function RuntimeChangeEvent({ event }: { event: RuntimeEvent }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex items-center gap-4 py-1">
      <div className="flex-1 h-px bg-line" />
      <div className="bg-surface border border-line rounded-xl px-5 py-3 text-center shrink-0 w-[360px]">
        <div className="text-xs font-semibold text-warn mb-1">Runtime changed</div>
        <div className="text-xs text-dim">
          {event.from.label}
          <span className="text-faint mx-2">→</span>
          {event.to.label}
        </div>
        <div className="text-[10px] text-faint mt-1">{event.time} · Context transferred successfully</div>

        <button onClick={() => setOpen(!open)} className="mt-2 text-[10px] text-info hover:opacity-80 transition-opacity">
          {open ? "Hide details" : "View transfer details"}
        </button>

        {open && (
          <div className="mt-3 pt-3 border-t border-line text-left space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-elevated border border-line px-3 py-2">
                <div className="text-[10px] text-faint uppercase tracking-wider mb-1">Previous epoch</div>
                <div className="text-[11px] text-dim">{event.from.provider}</div>
                <div className="text-[11px] text-dim font-mono">{event.from.model}</div>
              </div>
              <div className="rounded-lg bg-elevated border border-line px-3 py-2">
                <div className="text-[10px] text-faint uppercase tracking-wider mb-1">New epoch</div>
                <div className="text-[11px] text-dim">{event.to.provider}</div>
                <div className="text-[11px] text-dim font-mono">{event.to.model}</div>
              </div>
            </div>

            <div>
              <div className="text-[10px] text-faint uppercase tracking-wider mb-1.5">Transferred</div>
              <div className="space-y-1">
                {["Conversation summary", "Task state", "Tool execution records", "Relevant artifacts", "Project instructions"].map((t) => (
                  <div key={t} className="flex items-center gap-2 text-[11px] text-dim">
                    <span className="text-ok">✓</span> {t}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[10px] text-faint uppercase tracking-wider mb-1.5">Excluded</div>
              <div className="space-y-1">
                {["Provider-specific reasoning metadata", "Provider-specific cache identifiers"].map((t) => (
                  <div key={t} className="flex items-center gap-2 text-[11px] text-faint">
                    <span className="text-faint">✕</span> {t}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="flex-1 h-px bg-line" />
    </div>
  )
}

/* ---------- Degraded capability banner ---------- */

export function DegradedBanner({
  runtime,
  onRetry,
  onSwitch,
  onTextOnly,
}: {
  runtime: Runtime
  onRetry: () => void
  onSwitch: () => void
  onTextOnly: () => void
}) {
  return (
    <div className="rounded-xl border border-err-muted bg-err-muted/40 px-4 py-3.5">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-err">⚠</span>
        <span className="text-xs font-semibold text-err">Runtime tool capability degraded</span>
      </div>
      <p className="text-[11px] text-dim leading-relaxed mb-3">
        {runtime.label} failed structured tool execution verification. This runtime may describe tool actions
        instead of invoking them. Narrated text is never executed as a real tool action.
      </p>
      <div className="flex items-center gap-2">
        <button onClick={onRetry} className="px-3 py-1.5 text-[11px] text-dim hover:text-fore border border-line hover:bg-hover rounded-lg transition-colors">Retry</button>
        <button onClick={onSwitch} className="px-3 py-1.5 text-[11px] font-medium bg-accent text-white rounded-lg hover:opacity-90 transition-opacity">Switch Runtime</button>
        <button onClick={onTextOnly} className="px-3 py-1.5 text-[11px] text-dim hover:text-fore border border-line hover:bg-hover rounded-lg transition-colors">Continue in text-only mode</button>
      </div>
    </div>
  )
}

/* ---------- Text-only narrated (non-executed) example ---------- */

export function NarratedNotExecuted() {
  return (
    <div className="rounded-lg border border-dashed border-line bg-base px-3 py-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded font-medium bg-elevated text-faint">TEXT</span>
        <span className="text-[10px] text-faint uppercase tracking-wider">Narrated — not executed</span>
      </div>
      <p className="text-xs font-mono text-faint italic">"Calling read('src/auth/google.ts')…"</p>
      <p className="text-[10px] text-faint mt-1">Text-only mode: this is model output, not a real tool execution.</p>
    </div>
  )
}
