import { useEffect, useState } from "react"

/* ---------- Types ---------- */

interface ModelRow {
  name: string
  id: string
  context: string
  toolSupport: "Verified" | "Degraded" | "Unsupported"
  reasoning: boolean
  streaming: boolean
  images: boolean
}

interface Account {
  id: string
  name: string
  plan: string
  health: "Healthy" | "Cooldown" | "Warning"
  quota: number
  status: "healthy" | "warning" | "cooldown"
  enabled: boolean
  routing: "Healthy" | "Warning" | "Cooldown" | "Unavailable"
  authType: string
  quotaReset: string
  lastRefresh: string
  connected: string
  models: ModelRow[]
}

interface Provider {
  id: string
  name: string
  abbr: string
  status: "Connected" | "Local"
  health: "Healthy" | "Running" | "Degraded"
  accountCount: number
  accounts?: Account[]
}

/* ---------- Data ---------- */

const openaiModels: ModelRow[] = [
  { name: "GPT-5", id: "gpt-5", context: "256K", toolSupport: "Verified", reasoning: true, streaming: true, images: true },
  { name: "Codex", id: "codex-1", context: "128K", toolSupport: "Verified", reasoning: false, streaming: true, images: false },
]
const anthropicModels: ModelRow[] = [
  { name: "Claude Opus 5", id: "claude-opus-5", context: "200K", toolSupport: "Verified", reasoning: true, streaming: true, images: true },
  { name: "Claude Sonnet 5", id: "claude-sonnet-5", context: "200K", toolSupport: "Verified", reasoning: true, streaming: true, images: true },
]
const googleModels: ModelRow[] = [
  { name: "Gemini 2.0 Pro", id: "gemini-2.0-pro", context: "2M", toolSupport: "Verified", reasoning: true, streaming: true, images: true },
  { name: "Gemini 2.0 Flash", id: "gemini-2.0-flash", context: "1M", toolSupport: "Degraded", reasoning: false, streaming: true, images: true },
]

const PROVIDERS: Provider[] = [
  {
    id: "openai",
    name: "OpenAI",
    abbr: "OA",
    status: "Connected",
    health: "Healthy",
    accountCount: 3,
    accounts: [
      { id: "a", name: "Account A", plan: "ChatGPT Pro", health: "Healthy", quota: 74, status: "healthy", enabled: true, routing: "Healthy", authType: "Sign in with ChatGPT", quotaReset: "in 3d 4h", lastRefresh: "2m ago", connected: "Aug 12, 2026", models: openaiModels },
      { id: "b", name: "Account B", plan: "ChatGPT Plus", health: "Healthy", quota: 38, status: "warning", enabled: true, routing: "Warning", authType: "API Key", quotaReset: "in 5d", lastRefresh: "11m ago", connected: "Jul 30, 2026", models: openaiModels },
      { id: "c", name: "Account C", plan: "ChatGPT Pro", health: "Cooldown", quota: 0, status: "cooldown", enabled: false, routing: "Cooldown", authType: "Sign in with ChatGPT", quotaReset: "in 4h 22m", lastRefresh: "1h ago", connected: "Aug 01, 2026", models: openaiModels },
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    abbr: "AN",
    status: "Connected",
    health: "Healthy",
    accountCount: 2,
    accounts: [
      { id: "d", name: "Primary", plan: "Claude Pro", health: "Healthy", quota: 81, status: "healthy", enabled: true, routing: "Healthy", authType: "API Key", quotaReset: "in 2d 8h", lastRefresh: "just now", connected: "Jun 18, 2026", models: anthropicModels },
      { id: "e", name: "Secondary", plan: "Claude Pro", health: "Healthy", quota: 56, status: "healthy", enabled: true, routing: "Healthy", authType: "Native Claude Runtime", quotaReset: "in 2d 8h", lastRefresh: "6m ago", connected: "Jul 02, 2026", models: anthropicModels },
    ],
  },
  {
    id: "google",
    name: "Google",
    abbr: "GO",
    status: "Connected",
    health: "Healthy",
    accountCount: 1,
    accounts: [
      { id: "f", name: "Default", plan: "Gemini Advanced", health: "Healthy", quota: 92, status: "healthy", enabled: true, routing: "Healthy", authType: "Gemini API / Vertex", quotaReset: "in 6d", lastRefresh: "4m ago", connected: "Aug 20, 2026", models: googleModels },
    ],
  },
  {
    id: "ollama",
    name: "Ollama",
    abbr: "OL",
    status: "Local",
    health: "Running",
    accountCount: 0,
  },
]

/* ---------- Catalog for "Connect new provider" ---------- */

interface CatalogEntry {
  id: string
  name: string
  abbr: string
  auth: string[]
  runtime: string
  capabilities: string[]
}

const CATALOG: CatalogEntry[] = [
  { id: "openai", name: "OpenAI", abbr: "OA", auth: ["Sign in with ChatGPT", "API Key"], runtime: "Model runtime", capabilities: ["Tool use", "Streaming", "Reasoning", "Images"] },
  { id: "anthropic", name: "Anthropic", abbr: "AN", auth: ["API Key", "Native Claude Runtime"], runtime: "Model + native runtime", capabilities: ["Tool use", "Streaming", "Reasoning", "Images"] },
  { id: "google", name: "Google", abbr: "GO", auth: ["Gemini API / Vertex", "Native runtime"], runtime: "Model + native (where supported)", capabilities: ["Tool use", "Streaming", "Images"] },
  { id: "copilot", name: "GitHub Copilot", abbr: "GH", auth: ["Sign in with GitHub"], runtime: "Model runtime", capabilities: ["Tool use", "Streaming"] },
  { id: "compat", name: "OpenAI-compatible", abbr: "{}", auth: ["Base URL + API Key"], runtime: "Custom endpoint", capabilities: ["Varies by endpoint"] },
  { id: "ollama", name: "Ollama", abbr: "OL", auth: ["Local server"], runtime: "Local runtime", capabilities: ["Streaming", "Local models"] },
]

/* ---------- Style helpers (unchanged look) ---------- */

const healthStyle = (h: string) => {
  if (h === "Healthy" || h === "Running") return "bg-ok-muted text-ok"
  if (h === "Cooldown") return "bg-err-muted text-err"
  return "bg-warn-muted text-warn"
}
const accountStatusStyle = (s: string) => {
  if (s === "healthy") return "bg-ok-muted text-ok"
  if (s === "cooldown") return "bg-err-muted text-err"
  return "bg-warn-muted text-warn"
}
const routingStyle = (r: string) => {
  if (r === "Healthy") return "bg-ok-muted text-ok"
  if (r === "Warning") return "bg-warn-muted text-warn"
  if (r === "Cooldown") return "bg-err-muted text-err"
  return "bg-elevated text-faint"
}
const capStyle = (v: string) =>
  v === "Verified" || v === "Supported" ? "bg-ok-muted text-ok"
    : v === "Degraded" ? "bg-err-muted text-err"
    : v === "Unknown" ? "bg-elevated text-faint"
    : "bg-warn-muted text-warn"

const inputCls = "w-full bg-base border border-line rounded-lg px-3 py-2 text-xs text-fore placeholder:text-faint focus:outline-none focus:border-[#3a3a44]"
const btnGhost = "px-2.5 py-1 text-[10px] text-dim hover:text-fore border border-line hover:bg-hover rounded-md transition-colors"

/* ---------- Capability probe ---------- */

function CapabilityProbe({ model }: { model: ModelRow }) {
  const [state, setState] = useState<"idle" | "running" | "done">("idle")

  if (state === "idle") {
    return (
      <button onClick={() => { setState("running"); setTimeout(() => setState("done"), 700) }} className={btnGhost}>
        Verify model capabilities
      </button>
    )
  }
  if (state === "running") {
    return <span className="text-[10px] text-faint">Probing {model.id}…</span>
  }

  const degraded = model.toolSupport === "Degraded" || model.toolSupport === "Unsupported"
  const results: { label: string; value: string }[] = [
    { label: "Structured tool call", value: degraded ? "Degraded" : "Verified" },
    { label: "Streaming", value: model.streaming ? "Verified" : "Unsupported" },
    { label: "Reasoning", value: model.reasoning ? "Supported" : "Unknown" },
    { label: "Images", value: model.images ? "Supported" : "Unknown" },
    { label: "Parallel tools", value: "Unknown" },
  ]

  return (
    <div className="mt-2 rounded-lg border border-line bg-base p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-faint uppercase tracking-wider">Probe results</span>
        <button onClick={() => setState("idle")} className="text-[10px] text-faint hover:text-dim">Reset</button>
      </div>
      <div className="space-y-1">
        {results.map((r) => (
          <div key={r.label} className="flex items-center justify-between">
            <span className="text-[11px] text-dim">{r.label}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${capStyle(r.value)}`}>{r.value}</span>
          </div>
        ))}
      </div>
      {degraded && (
        <div className="flex items-start gap-2 pt-2 border-t border-line">
          <span className="text-warn text-[11px] leading-none mt-0.5">⚠</span>
          <p className="text-[11px] text-warn leading-relaxed">
            <span className="font-medium">Tool use — Degraded.</span> This model may describe tool actions instead of
            invoking them. Narrated tool text is never counted as a successful tool execution. Coding agents should use
            a verified tool-capable runtime.
          </p>
        </div>
      )}
    </div>
  )
}

/* ---------- Account detail ---------- */

function AccountDetail({
  acc,
  refreshing,
  onRefresh,
  onReconnect,
  onToggleEnabled,
  onRemove,
}: {
  acc: Account
  refreshing: boolean
  onRefresh: () => void
  onReconnect: () => void
  onToggleEnabled: (v: boolean) => void
  onRemove: () => void
}) {
  const enabled = acc.enabled
  const meta = [
    { label: "Plan", value: acc.plan },
    { label: "Status", value: acc.health },
    { label: "Quota", value: acc.status === "cooldown" ? "Exhausted" : `${acc.quota}% remaining` },
    { label: "Quota reset", value: acc.quotaReset },
    { label: "Last refresh", value: refreshing ? "Refreshing…" : acc.lastRefresh },
    { label: "Authentication", value: acc.authType },
    { label: "Connected", value: acc.connected },
  ]

  return (
    <div className="mt-3 rounded-lg border border-line bg-base overflow-hidden">
      {/* Meta grid */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 px-4 py-3.5">
        {meta.map((m) => (
          <div key={m.label} className="flex items-center justify-between">
            <span className="text-[11px] text-faint">{m.label}</span>
            <span className="text-[11px] text-dim">{m.value}</span>
          </div>
        ))}
      </div>

      {/* Routing */}
      <div className="px-4 py-3.5 border-t border-line">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-faint uppercase tracking-wider">Account routing</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${routingStyle(enabled ? acc.routing : "Unavailable")}`}>
            {enabled ? acc.routing : "Unavailable"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-0.5 bg-elevated rounded-lg p-0.5">
            {(["Enabled", "Disabled"] as const).map((o) => (
              <button
                key={o}
                onClick={() => onToggleEnabled(o === "Enabled")}
                className={`px-3 py-1 text-[10px] rounded-md font-medium transition-colors ${
                  (o === "Enabled") === enabled ? "bg-hover text-fore" : "text-faint hover:text-dim"
                }`}
              >
                {o}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-faint">Multiple accounts can be enabled — routing is health-aware, not exclusive.</span>
        </div>
      </div>

      {/* Models */}
      <div className="px-4 py-3.5 border-t border-line">
        <div className="text-[10px] text-faint uppercase tracking-wider mb-2">Available models · {acc.models.length}</div>
        <div className="space-y-2">
          {acc.models.map((m) => (
            <div key={m.id} className="rounded-lg border border-line bg-surface px-3 py-2.5">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-medium text-fore">{m.name}</span>
                <span className="text-[10px] font-mono text-faint">{m.id}</span>
                <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded font-medium ${capStyle(m.toolSupport)}`}>
                  Tool use {m.toolSupport}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                <span className="text-[10px] text-dim bg-elevated border border-line px-1.5 py-0.5 rounded">Context {m.context}</span>
                {m.reasoning && <span className="text-[10px] text-info bg-info-muted px-1.5 py-0.5 rounded">Reasoning</span>}
                {m.streaming && <span className="text-[10px] text-info bg-info-muted px-1.5 py-0.5 rounded">Streaming</span>}
                {m.images && <span className="text-[10px] text-info bg-info-muted px-1.5 py-0.5 rounded">Images</span>}
              </div>
              <CapabilityProbe model={m} />
            </div>
          ))}
        </div>
      </div>

      {/* Account actions */}
      <div className="px-4 py-3 border-t border-line flex items-center gap-1.5">
        <button onClick={onRefresh} disabled={refreshing} className={`${btnGhost} disabled:opacity-50`}>
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
        <button onClick={onReconnect} className={btnGhost}>Reconnect</button>
        <button onClick={() => onToggleEnabled(!enabled)} className={btnGhost}>
          {enabled ? "Disable" : "Enable"}
        </button>
        <button
          onClick={onRemove}
          className="px-2.5 py-1 text-[10px] text-err border border-err-muted hover:bg-err hover:text-white rounded-md transition-colors ml-auto"
        >
          Remove
        </button>
      </div>
    </div>
  )
}

/* ---------- Reconnect + remove dialogs ---------- */

function ReconnectModal({ name, onClose, onDone }: { name: string; onClose: () => void; onDone: () => void }) {
  const [phase, setPhase] = useState<"connecting" | "done">("connecting")
  useEffect(() => {
    const id = setTimeout(() => setPhase("done"), 1100)
    return () => clearTimeout(id)
  }, [])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-[380px] bg-surface border border-line rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-line flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fore">Reconnect {name}</h2>
          <button onClick={onClose} className="text-faint hover:text-fore transition-colors text-lg leading-none">×</button>
        </div>
        <div className="px-6 py-6 flex flex-col items-center text-center">
          {phase === "connecting" ? (
            <>
              <div className="w-6 h-6 rounded-full border-2 border-accent border-t-transparent animate-spin mb-3" />
              <p className="text-xs text-dim">Re-authenticating and refreshing credentials…</p>
            </>
          ) : (
            <>
              <div className="w-8 h-8 rounded-full bg-ok-muted flex items-center justify-center text-ok mb-3">✓</div>
              <p className="text-xs text-dim">Reconnected successfully. Credentials refreshed.</p>
            </>
          )}
        </div>
        <div className="px-6 py-4 border-t border-line flex justify-end">
          <button onClick={onDone} className="px-4 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40" disabled={phase === "connecting"}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

function RemoveModal({ name, onConfirm, onClose }: { name: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-[400px] bg-surface border border-line rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-line flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fore">Remove {name}?</h2>
          <button onClick={onClose} className="text-faint hover:text-fore transition-colors text-lg leading-none">×</button>
        </div>
        <div className="px-6 py-5">
          <p className="text-xs text-dim leading-relaxed">
            This account will be disconnected and removed from routing. Agents pinned to it will fall back to
            automatic selection. You can reconnect it later.
          </p>
        </div>
        <div className="px-6 py-4 border-t border-line flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-dim hover:text-fore border border-line hover:bg-hover rounded-lg transition-colors">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-1.5 text-xs font-medium text-err border border-err-muted bg-err-muted hover:bg-err hover:text-white rounded-lg transition-colors">Remove account</button>
        </div>
      </div>
    </div>
  )
}

/* ---------- Connect catalog modal ---------- */

function ConnectFields({ id }: { id: string }) {
  if (id === "openai") {
    return (
      <div className="space-y-3">
        <button className="w-full py-2 text-xs font-medium bg-accent text-white rounded-lg hover:opacity-90 transition-opacity">Sign in with ChatGPT</button>
        <div className="flex items-center gap-2 text-[10px] text-faint"><span className="flex-1 h-px bg-line" />or<span className="flex-1 h-px bg-line" /></div>
        <input placeholder="API Key — sk-…" className={`${inputCls} font-mono`} />
      </div>
    )
  }
  if (id === "anthropic") {
    return (
      <div className="space-y-3">
        <input placeholder="API Key — sk-ant-…" className={`${inputCls} font-mono`} />
        <label className="flex items-center gap-2 text-xs text-dim">
          <input type="checkbox" defaultChecked className="accent-[#f47328] w-3.5 h-3.5" />
          Use Native Claude Runtime if available
        </label>
      </div>
    )
  }
  if (id === "google") {
    return (
      <div className="space-y-3">
        <input placeholder="Gemini API key or Vertex project" className={`${inputCls} font-mono`} />
        <label className="flex items-center gap-2 text-xs text-dim">
          <input type="checkbox" defaultChecked className="accent-[#f47328] w-3.5 h-3.5" />
          Prefer native runtime where supported
        </label>
      </div>
    )
  }
  if (id === "copilot") {
    return <button className="w-full py-2 text-xs font-medium bg-accent text-white rounded-lg hover:opacity-90 transition-opacity">Sign in with GitHub</button>
  }
  if (id === "compat") {
    return (
      <div className="space-y-3">
        <input placeholder="Name" className={inputCls} />
        <input placeholder="Base URL — https://api.example.com/v1" className={`${inputCls} font-mono`} />
        <input placeholder="API Key" className={`${inputCls} font-mono`} />
        <textarea rows={2} placeholder="Headers — X-Header: value" className={`${inputCls} font-mono resize-none`} />
        <button className={btnGhost}>Test connection</button>
      </div>
    )
  }
  // ollama
  return (
    <div className="space-y-3">
      <input defaultValue="http://localhost:11434" className={`${inputCls} font-mono`} />
      <div className="flex gap-2">
        <button className={btnGhost}>Test connection</button>
        <button className={btnGhost}>Refresh models</button>
      </div>
    </div>
  )
}

function CatalogModal({ onClose }: { onClose: () => void }) {
  const [selected, setSelected] = useState<CatalogEntry | null>(null)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-[640px] max-h-[85vh] flex flex-col bg-surface border border-line rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-line flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fore">{selected ? `Connect ${selected.name}` : "Connect a provider"}</h2>
          <button onClick={onClose} className="text-faint hover:text-fore transition-colors text-lg leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {!selected ? (
            <div className="grid grid-cols-2 gap-3">
              {CATALOG.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelected(c)}
                  className="text-left rounded-xl border border-line bg-elevated hover:border-[#3a3a44] hover:bg-hover p-4 transition-colors"
                >
                  <div className="flex items-center gap-2.5 mb-2">
                    <span className="w-8 h-8 rounded-lg bg-surface border border-line flex items-center justify-center text-[11px] font-bold text-fore">{c.abbr}</span>
                    <span className="text-sm font-semibold text-fore">{c.name}</span>
                  </div>
                  <div className="text-[11px] text-faint mb-0.5">Auth · {c.auth.join(", ")}</div>
                  <div className="text-[11px] text-faint mb-2">{c.runtime}</div>
                  <div className="flex flex-wrap gap-1">
                    {c.capabilities.map((cap) => (
                      <span key={cap} className="text-[10px] text-dim bg-surface border border-line px-1.5 py-0.5 rounded">{cap}</span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div>
              <button onClick={() => setSelected(null)} className="text-[11px] text-faint hover:text-dim mb-4">← All providers</button>
              <div className="rounded-xl border border-line bg-elevated p-4 mb-4">
                <div className="text-[10px] text-faint uppercase tracking-wider mb-1.5">Connect method</div>
                <div className="flex flex-wrap gap-1.5">
                  {selected.auth.map((a) => (
                    <span key={a} className="text-[10px] text-info bg-info-muted px-1.5 py-0.5 rounded">{a}</span>
                  ))}
                </div>
              </div>
              <ConnectFields id={selected.id} />
            </div>
          )}
        </div>

        {selected && (
          <div className="px-6 py-4 border-t border-line flex justify-end gap-2">
            <button onClick={() => setSelected(null)} className="px-3 py-1.5 text-xs text-dim hover:text-fore border border-line hover:bg-hover rounded-lg transition-colors">Back</button>
            <button onClick={onClose} className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:opacity-90 transition-opacity">Connect</button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ---------- Main panel ---------- */

export function ProvidersPanel() {
  const [providers, setProviders] = useState<Provider[]>(PROVIDERS)
  const [expanded, setExpanded] = useState<string | null>("openai")
  const [openAccount, setOpenAccount] = useState<string | null>(null)
  const [catalog, setCatalog] = useState(false)
  const [refreshing, setRefreshing] = useState<string[]>([])
  const [reconnect, setReconnect] = useState<{ pid: string; aid: string } | null>(null)
  const [removeTarget, setRemoveTarget] = useState<{ pid: string; aid: string } | null>(null)

  const patchAccount = (pid: string, aid: string, patch: Partial<Account>) =>
    setProviders((prev) =>
      prev.map((p) =>
        p.id === pid ? { ...p, accounts: p.accounts?.map((a) => (a.id === aid ? { ...a, ...patch } : a)) } : p
      )
    )

  const handleRefresh = (pid: string, aid: string) => {
    setRefreshing((r) => [...r, aid])
    setTimeout(() => {
      setRefreshing((r) => r.filter((x) => x !== aid))
      patchAccount(pid, aid, { lastRefresh: "just now" })
    }, 800)
  }

  const handleToggleEnabled = (pid: string, aid: string, enabled: boolean) =>
    setProviders((prev) =>
      prev.map((p) =>
        p.id === pid
          ? {
              ...p,
              accounts: p.accounts?.map((a) =>
                a.id === aid ? { ...a, enabled, routing: enabled ? (a.status === "cooldown" ? "Cooldown" : a.status === "warning" ? "Warning" : "Healthy") : "Unavailable" } : a
              ),
            }
          : p
      )
    )

  const findAccount = (t: { pid: string; aid: string } | null) => {
    if (!t) return null
    return providers.find((p) => p.id === t.pid)?.accounts?.find((a) => a.id === t.aid) ?? null
  }

  const doRemove = () => {
    if (!removeTarget) return
    const { pid, aid } = removeTarget
    setProviders((prev) =>
      prev.map((p) =>
        p.id === pid
          ? { ...p, accounts: p.accounts?.filter((a) => a.id !== aid), accountCount: Math.max(0, p.accountCount - 1) }
          : p
      )
    )
    setRemoveTarget(null)
  }

  const doReconnect = (pid: string, aid: string) => {
    patchAccount(pid, aid, { lastRefresh: "just now", health: "Healthy", status: "healthy", enabled: true, routing: "Healthy" })
    setReconnect(null)
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-base font-semibold text-fore mb-1">Providers</h2>
      <p className="text-xs text-faint mb-5 leading-relaxed">
        Manage AI provider connections. Multiple accounts can be enabled simultaneously. Account
        selection is automatic and health-aware by default.
      </p>

      <div className="space-y-3">
        {providers.map((provider) => (
          <div key={provider.id} className="bg-surface border border-line rounded-xl overflow-hidden">
            <button
              onClick={() => setExpanded(expanded === provider.id ? null : provider.id)}
              className="w-full flex items-center gap-4 px-5 py-4 hover:bg-hover transition-colors text-left"
            >
              <div className="w-9 h-9 rounded-lg bg-elevated flex items-center justify-center text-xs font-bold text-fore shrink-0">
                {provider.abbr}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-semibold text-fore">{provider.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${healthStyle(provider.health)}`}>
                    {provider.health}
                  </span>
                </div>
                <div className="text-xs text-faint">
                  {provider.status}
                  {provider.accountCount > 0
                    ? ` · ${provider.accountCount} account${provider.accountCount !== 1 ? "s" : ""}`
                    : ""}
                </div>
              </div>
              <svg
                width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                className={`text-faint transition-transform duration-200 ${expanded === provider.id ? "rotate-180" : ""}`}
              >
                <polyline points="2,4 6,8 10,4" />
              </svg>
            </button>

            {expanded === provider.id && provider.accounts && (
              <div className="border-t border-line">
                {provider.accounts.map((acc, i) => (
                  <div key={acc.id} className={`px-5 py-4 ${i < provider.accounts!.length - 1 ? "border-b border-line" : ""}`}>
                    <div className="flex items-start justify-between gap-4">
                      <button
                        onClick={() => setOpenAccount(openAccount === acc.id ? null : acc.id)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <svg
                            width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                            className={`text-faint transition-transform ${openAccount === acc.id ? "rotate-90" : ""}`}
                          >
                            <polyline points="4,2 8,6 4,10" />
                          </svg>
                          <span className="text-sm font-medium text-fore">{acc.name}</span>
                          <span className="text-xs text-faint">{acc.plan}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${accountStatusStyle(acc.status)}`}>
                            {acc.health}
                          </span>
                          {!acc.enabled && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-elevated text-faint">Disabled</span>}
                        </div>
                        {acc.status !== "cooldown" ? (
                          <div className="flex items-center gap-2 pl-[18px]">
                            <div className="w-36 h-1 bg-elevated rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${acc.quota < 40 ? "bg-warn" : "bg-ok"}`} style={{ width: `${acc.quota}%` }} />
                            </div>
                            <span className="text-xs text-faint">Weekly quota {acc.quota}% remaining</span>
                          </div>
                        ) : (
                          <span className="text-xs text-err pl-[18px]">Rate limit cooldown — resets in 4h 22m</span>
                        )}
                      </button>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleRefresh(provider.id, acc.id)}
                          disabled={refreshing.includes(acc.id)}
                          className={`${btnGhost} disabled:opacity-50`}
                        >
                          {refreshing.includes(acc.id) ? "Refreshing…" : "Refresh"}
                        </button>
                        <button
                          onClick={() => handleToggleEnabled(provider.id, acc.id, !acc.enabled)}
                          className={btnGhost}
                        >
                          {acc.enabled ? "Disable" : "Enable"}
                        </button>
                      </div>
                    </div>

                    {openAccount === acc.id && (
                      <AccountDetail
                        acc={acc}
                        refreshing={refreshing.includes(acc.id)}
                        onRefresh={() => handleRefresh(provider.id, acc.id)}
                        onReconnect={() => setReconnect({ pid: provider.id, aid: acc.id })}
                        onToggleEnabled={(v) => handleToggleEnabled(provider.id, acc.id, v)}
                        onRemove={() => setRemoveTarget({ pid: provider.id, aid: acc.id })}
                      />
                    )}
                  </div>
                ))}
                <div className="px-5 py-3 border-t border-line">
                  <button onClick={() => setCatalog(true)} className="text-xs text-accent hover:opacity-80 transition-opacity font-medium">
                    + Connect account
                  </button>
                </div>
              </div>
            )}

            {expanded === provider.id && !provider.accounts && (
              <div className="border-t border-line px-5 py-4">
                <div className="text-xs text-dim">Local Ollama instance running at localhost:11434</div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {["llama-3.3-70b", "qwen2.5-coder", "deepseek-r1"].map((m) => (
                    <span key={m} className="text-[10px] font-mono text-dim bg-elevated border border-line px-2 py-1 rounded">{m}</span>
                  ))}
                </div>
                <div className="flex gap-2 mt-3">
                  <button className="px-3 py-1.5 text-xs text-dim hover:text-fore border border-line hover:bg-hover rounded-lg transition-colors">Test connection</button>
                  <button className="px-3 py-1.5 text-xs text-dim hover:text-fore border border-line hover:bg-hover rounded-lg transition-colors">Refresh models</button>
                </div>
              </div>
            )}
          </div>
        ))}

        <button
          onClick={() => setCatalog(true)}
          className="w-full px-4 py-3 text-xs font-medium text-dim hover:text-fore border border-dashed border-line hover:border-[#3a3a44] hover:bg-hover rounded-xl transition-colors"
        >
          + Connect new provider
        </button>
      </div>

      {catalog && <CatalogModal onClose={() => setCatalog(false)} />}
      {reconnect && (
        <ReconnectModal
          name={findAccount(reconnect)?.name ?? "account"}
          onClose={() => setReconnect(null)}
          onDone={() => reconnect && doReconnect(reconnect.pid, reconnect.aid)}
        />
      )}
      {removeTarget && (
        <RemoveModal
          name={findAccount(removeTarget)?.name ?? "account"}
          onConfirm={doRemove}
          onClose={() => setRemoveTarget(null)}
        />
      )}
    </div>
  )
}
