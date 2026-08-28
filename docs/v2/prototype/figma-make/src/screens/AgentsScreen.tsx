import { useState } from "react"

type Role = "Coordinator" | "Specialist" | "Worker" | "Reviewer"

interface Agent {
  id: string
  name: string
  role: Role
  provider: string
  model: string
  runtime: string
  status: "ready" | "running"
  caps: string[]
  tools: string[]
  skills: string[]
  contextScope: string
  fallback: string
  description?: string
  runtimeType?: "Model Runtime" | "Native Agent Runtime"
  accountPolicy?: "Auto" | "Preferred" | "Pinned"
  account?: string
  mcp?: string[]
  permissionProfile?: string
  maxSteps?: number
  isolation?: "Shared workspace" | "Git worktree"
  fallbackType?: "None" | "Fallback agent" | "Fallback model"
  fallbackTarget?: string
}

const AGENTS: Agent[] = [
  {
    id: "orchestrator",
    name: "Orchestrator",
    role: "Coordinator",
    provider: "Anthropic",
    model: "claude-opus-5",
    runtime: "Claude Opus",
    status: "ready",
    caps: ["Planning", "Task assignment", "Review coordination", "Dependency scheduling"],
    tools: ["read_file", "list_files", "create_task", "assign_agent"],
    skills: ["planning", "code-review"],
    contextScope: "Work session",
    fallback: "claude-sonnet-5",
  },
  {
    id: "architect",
    name: "Architect",
    role: "Specialist",
    provider: "Anthropic",
    model: "claude-opus-5",
    runtime: "Claude Opus",
    status: "ready",
    caps: ["Architecture analysis", "Technical design", "Dependency planning", "Interface contracts"],
    tools: ["read_file", "list_files", "web_search"],
    skills: ["architecture"],
    contextScope: "Task",
    fallback: "claude-sonnet-5",
  },
  {
    id: "backend",
    name: "Backend Developer",
    role: "Worker",
    provider: "OpenAI",
    model: "codex-1",
    runtime: "Codex",
    status: "running",
    caps: ["Code generation", "API implementation", "Database access", "Server-side logic"],
    tools: ["read_file", "write_file", "run_tests", "run_terminal"],
    skills: ["coding"],
    contextScope: "Task",
    fallback: "claude-sonnet-5",
  },
  {
    id: "frontend",
    name: "Frontend Developer",
    role: "Worker",
    provider: "OpenAI",
    model: "codex-1",
    runtime: "Codex",
    status: "running",
    caps: ["UI implementation", "React", "State management", "Styling"],
    tools: ["read_file", "write_file", "run_terminal"],
    skills: ["coding", "frontend-design"],
    contextScope: "Task",
    fallback: "claude-sonnet-5",
  },
  {
    id: "code-reviewer",
    name: "Code Reviewer",
    role: "Reviewer",
    provider: "Anthropic",
    model: "claude-sonnet-5",
    runtime: "Claude",
    status: "ready",
    caps: ["Code quality", "Maintainability", "Architecture compliance", "Correctness", "Best practices"],
    tools: ["read_file", "list_files"],
    skills: ["code-review"],
    contextScope: "Task",
    fallback: "claude-haiku-4-5",
  },
  {
    id: "security-reviewer",
    name: "Security Reviewer",
    role: "Reviewer",
    provider: "Google",
    model: "gemini-2.0-pro",
    runtime: "Gemini 2.0 Pro",
    status: "ready",
    caps: ["Security analysis", "OWASP review", "Authentication/authorization review", "Secret exposure detection", "Vulnerability analysis"],
    tools: ["read_file", "list_files"],
    skills: ["security-review"],
    contextScope: "Task",
    fallback: "claude-haiku-4-5",
  },
  {
    id: "qa-tester",
    name: "QA / Tester",
    role: "Reviewer",
    provider: "OpenAI",
    model: "gpt-5",
    runtime: "GPT",
    status: "ready",
    caps: ["Test planning", "Unit/integration test execution", "Regression testing", "Acceptance criteria validation", "Failure reproduction"],
    tools: ["read_file", "list_files", "run_tests"],
    skills: ["test-driven-development"],
    contextScope: "Task",
    fallback: "claude-haiku-4-5",
  },
  {
    id: "integration",
    name: "Integration Agent",
    role: "Worker",
    provider: "OpenAI",
    model: "codex-1",
    runtime: "Codex",
    status: "ready",
    caps: ["Merge task outputs", "Resolve integration conflicts", "Run integration checks", "Prepare candidate build"],
    tools: ["read_file", "write_file", "run_tests", "run_terminal"],
    skills: ["coding"],
    contextScope: "Work session",
    fallback: "claude-sonnet-5",
  },
]

const roleStyle: Record<string, string> = {
  Coordinator: "text-accent bg-accent-muted",
  Specialist: "text-info bg-info-muted",
  Worker: "text-ok bg-ok-muted",
  Reviewer: "text-warn bg-warn-muted",
}

function AgentInspector({ agent, onEdit, onRemove }: { agent: Agent; onEdit: () => void; onRemove: () => void }) {
  const [accountPolicy, setAccountPolicy] = useState<"Auto" | "Preferred" | "Pinned">(agent.accountPolicy ?? "Auto")

  return (
    <div className="h-full flex flex-col bg-surface border-l border-line">
      <div className="px-5 py-4 border-b border-line">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-sm font-semibold text-fore">{agent.name}</h2>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${roleStyle[agent.role]}`}>
            {agent.role}
          </span>
        </div>
        <div className={`text-xs ${agent.status === "running" ? "text-ok" : "text-faint"}`}>
          {agent.status === "running" ? "● Running" : "○ Ready"}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Provider hierarchy */}
        <div className="px-5 py-4 border-b border-line">
          <div className="text-[10px] text-faint uppercase tracking-wider mb-3">
            Provider hierarchy
          </div>
          <div className="space-y-2">
            {[
              { label: "Provider", value: agent.provider },
              { label: "Account", value: "Auto" },
              { label: "Model", value: agent.model, mono: true },
              { label: "Runtime", value: agent.runtime },
            ].map((row) => (
              <div key={row.label} className="flex items-center gap-2">
                <span className="w-16 text-xs text-faint shrink-0">{row.label}</span>
                <span className={`text-xs text-dim ${row.mono ? "font-mono" : ""}`}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Capabilities */}
        <div className="px-5 py-4 border-b border-line">
          <div className="text-[10px] text-faint uppercase tracking-wider mb-2">Capabilities</div>
          <div className="flex flex-wrap gap-1.5">
            {agent.caps.map((c) => (
              <span key={c} className="text-[10px] text-faint bg-elevated px-1.5 py-0.5 rounded border border-line">
                {c}
              </span>
            ))}
          </div>
        </div>

        {/* Tools */}
        <div className="px-5 py-4 border-b border-line">
          <div className="text-[10px] text-faint uppercase tracking-wider mb-2">Tools</div>
          <div className="flex flex-wrap gap-1.5">
            {agent.tools.map((t) => (
              <span key={t} className="text-[10px] font-mono text-dim bg-elevated px-2 py-1 rounded border border-line">
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* Skills */}
        <div className="px-5 py-4 border-b border-line">
          <div className="text-[10px] text-faint uppercase tracking-wider mb-2">Skills</div>
          <div className="flex flex-wrap gap-1.5">
            {agent.skills.map((s) => (
              <span key={s} className="text-[10px] font-mono text-info bg-info-muted px-2 py-1 rounded">
                {s}
              </span>
            ))}
          </div>
        </div>

        {/* Account policy */}
        <div className="px-5 py-4 border-b border-line">
          <div className="text-[10px] text-faint uppercase tracking-wider mb-2">Account policy</div>
          <div className="flex gap-0.5 bg-elevated rounded-lg p-0.5">
            {(["Auto", "Preferred", "Pinned"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setAccountPolicy(p)}
                className={`flex-1 py-1 text-[10px] rounded-md transition-colors font-medium ${
                  accountPolicy === p ? "bg-hover text-fore" : "text-faint hover:text-dim"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Runtime mode */}
        <div className="px-5 py-4 border-b border-line">
          <div className="text-[10px] text-faint uppercase tracking-wider mb-2">Runtime mode</div>
          <div className="flex flex-wrap gap-1.5">
            {["Streaming", "Tool use", "Multi-turn"].map((m) => (
              <span key={m} className="text-[10px] text-ok bg-ok-muted px-1.5 py-0.5 rounded">
                {m}
              </span>
            ))}
          </div>
        </div>

        {/* Policies */}
        <div className="px-5 py-4 border-b border-line space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-faint">Context scope</span>
            <span className="text-xs text-dim">{agent.contextScope}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-faint">Fallback model</span>
            <span className="text-xs font-mono text-dim">{agent.fallback}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-faint">MCP servers</span>
            <span className="text-xs text-faint">None</span>
          </div>
        </div>
      </div>

      <div className="px-5 py-4 border-t border-line flex gap-2">
        <button
          onClick={onEdit}
          className="flex-1 px-3 py-2 text-xs font-medium border border-line text-dim hover:text-fore hover:bg-hover rounded-lg transition-colors"
        >
          Edit
        </button>
        <button
          onClick={onRemove}
          className="flex-1 px-3 py-2 text-xs font-medium border border-err-muted bg-err-muted text-err hover:bg-err hover:text-white rounded-lg transition-colors"
        >
          Remove
        </button>
      </div>
    </div>
  )
}

/* ---------- Configuration data (auth lives in Global Settings → Providers) ---------- */

const ROLES: Role[] = ["Coordinator", "Specialist", "Worker", "Reviewer"]
const PROVIDERS = ["Anthropic", "OpenAI", "Google", "Ollama"]
const ACCOUNTS: Record<string, string[]> = {
  Anthropic: ["Primary", "Secondary"],
  OpenAI: ["Account A", "Account B", "Account C"],
  Google: ["Default"],
  Ollama: [],
}

interface ModelInfo {
  id: string
  runtime: string
  context: string
  health: "Verified" | "Degraded" | "Unsupported"
  caps: string[]
}

const MODELS: Record<string, ModelInfo[]> = {
  Anthropic: [
    { id: "claude-opus-5", runtime: "Claude Opus", context: "200K", health: "Verified", caps: ["Tool use", "Streaming", "Reasoning", "Structured output", "Images"] },
    { id: "claude-sonnet-5", runtime: "Claude", context: "200K", health: "Verified", caps: ["Tool use", "Streaming", "Reasoning", "Structured output", "Images"] },
    { id: "claude-haiku-4-5", runtime: "Claude Haiku", context: "200K", health: "Verified", caps: ["Tool use", "Streaming", "Structured output"] },
  ],
  OpenAI: [
    { id: "codex-1", runtime: "Codex", context: "128K", health: "Verified", caps: ["Tool use", "Streaming", "Structured output"] },
    { id: "gpt-5", runtime: "GPT", context: "256K", health: "Verified", caps: ["Tool use", "Streaming", "Reasoning", "Structured output", "Images"] },
  ],
  Google: [
    { id: "gemini-2.0-pro", runtime: "Gemini 2.0 Pro", context: "2M", health: "Verified", caps: ["Tool use", "Streaming", "Reasoning", "Structured output", "Images"] },
    { id: "gemini-2.0-flash", runtime: "Gemini 2.0", context: "1M", health: "Degraded", caps: ["Tool use", "Streaming", "Structured output", "Images"] },
  ],
  Ollama: [
    { id: "llama-3.3-70b", runtime: "Ollama", context: "128K", health: "Unsupported", caps: ["Streaming"] },
  ],
}

const ALL_TOOLS = ["Read", "Write", "Edit", "Shell", "Git", "Browser", "Web", "MCP", "Office"]
const ALL_SKILLS = ["planning", "architecture", "coding", "code-review", "security-review", "frontend-design", "systematic-debugging", "test-driven-development"]
const ALL_MCP = ["Filesystem", "GitHub", "PostgreSQL", "Browser"]
const PERMISSION_PROFILES = ["Read-only", "Standard", "Elevated", "Full access"]

const ROLE_DEFAULT_TOOLS: Record<Role, string[]> = {
  Coordinator: ["Read", "Git", "Web", "MCP"],
  Specialist: ["Read", "Web", "MCP"],
  Worker: ["Read", "Write", "Edit", "Shell", "Git"],
  Reviewer: ["Read", "Git", "Web"],
}
const ROLE_RESTRICTED_TOOLS: Record<Role, string[]> = {
  Coordinator: ["Write", "Edit", "Shell"],
  Specialist: [],
  Worker: [],
  Reviewer: ["Write", "Edit", "Shell", "Browser", "Office"],
}
const ROLE_NOTE: Record<Role, string> = {
  Coordinator: "Coordinators orchestrate work. They cannot edit files or run destructive execution tools by default.",
  Specialist: "Specialists analyze and design. They can execute tools according to their permission profile.",
  Worker: "Workers can execute tools according to their permission profile.",
  Reviewer: "Reviewers are read-only by default and cannot modify the workspace.",
}
const ROLE_DEFAULT_PROFILE: Record<Role, string> = {
  Coordinator: "Standard",
  Specialist: "Standard",
  Worker: "Elevated",
  Reviewer: "Read-only",
}

const healthStyleTool = (h: string) =>
  h === "Verified" ? "bg-ok-muted text-ok" : h === "Degraded" ? "bg-warn-muted text-warn" : "bg-err-muted text-err"

interface FormState {
  name: string
  role: Role
  description: string
  runtimeType: "Model Runtime" | "Native Agent Runtime"
  provider: string
  accountPolicy: "Auto" | "Preferred" | "Pinned"
  account: string
  model: string
  tools: string[]
  skills: string[]
  mcp: string[]
  contextPolicy: string
  fallbackType: "None" | "Fallback agent" | "Fallback model"
  fallbackTarget: string
  permissionProfile: string
  maxSteps: number
  isolation: "Shared workspace" | "Git worktree"
}

function blankForm(): FormState {
  return {
    name: "",
    role: "Worker",
    description: "",
    runtimeType: "Model Runtime",
    provider: "Anthropic",
    accountPolicy: "Auto",
    account: "Primary",
    model: "claude-sonnet-5",
    tools: [...ROLE_DEFAULT_TOOLS.Worker],
    skills: ["coding"],
    mcp: ["Filesystem"],
    contextPolicy: "Task",
    fallbackType: "Fallback model",
    fallbackTarget: "claude-haiku-4-5",
    permissionProfile: ROLE_DEFAULT_PROFILE.Worker,
    maxSteps: 25,
    isolation: "Git worktree",
  }
}

function formFromAgent(a: Agent): FormState {
  return {
    name: a.name,
    role: a.role,
    description: a.description ?? "",
    runtimeType: a.runtimeType ?? "Model Runtime",
    provider: a.provider,
    accountPolicy: a.accountPolicy ?? "Auto",
    account: a.account ?? (ACCOUNTS[a.provider]?.[0] ?? ""),
    model: a.model,
    tools: [...a.tools],
    skills: [...a.skills],
    mcp: a.mcp ?? [],
    contextPolicy: a.contextScope,
    fallbackType: a.fallbackType ?? (a.fallback && a.fallback !== "None" ? "Fallback model" : "None"),
    fallbackTarget: a.fallbackTarget ?? a.fallback,
    permissionProfile: a.permissionProfile ?? ROLE_DEFAULT_PROFILE[a.role],
    maxSteps: a.maxSteps ?? 25,
    isolation: a.isolation ?? "Shared workspace",
  }
}

const FIELD_LABEL = "block text-[10px] font-semibold text-faint uppercase tracking-widest mb-1.5"
const INPUT = "w-full bg-elevated border border-line rounded-lg px-3 py-2 text-xs text-fore placeholder:text-faint focus:outline-none focus:border-[#3a3a44]"
const SELECT = "w-full bg-elevated border border-line rounded-lg px-3 py-2 text-xs text-dim focus:outline-none focus:border-[#3a3a44]"

function Seg<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-0.5 bg-elevated rounded-lg p-0.5">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`flex-1 py-1.5 text-[11px] rounded-md transition-colors font-medium ${
            value === o ? "bg-hover text-fore" : "text-faint hover:text-dim"
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

const STEPS = ["Identity", "Runtime", "Capabilities", "Policies", "Review"]

function AgentForm({
  editing,
  onClose,
  onSubmit,
  onDelete,
  onDuplicate,
}: {
  editing: Agent | null
  onClose: () => void
  onSubmit: (f: FormState) => void
  onDelete?: () => void
  onDuplicate?: () => void
}) {
  const [step, setStep] = useState(0)
  const [f, setF] = useState<FormState>(() => (editing ? formFromAgent(editing) : blankForm()))
  const set = (patch: Partial<FormState>) => setF((prev) => ({ ...prev, ...patch }))

  const models = MODELS[f.provider] ?? []
  const model = models.find((m) => m.id === f.model) ?? models[0]
  const restricted = ROLE_RESTRICTED_TOOLS[f.role]

  const changeRole = (role: Role) =>
    set({
      role,
      tools: [...ROLE_DEFAULT_TOOLS[role]],
      permissionProfile: ROLE_DEFAULT_PROFILE[role],
    })

  const changeProvider = (provider: string) => {
    const first = MODELS[provider]?.[0]
    set({
      provider,
      account: ACCOUNTS[provider]?.[0] ?? "",
      model: first?.id ?? "",
    })
  }

  const toggleIn = (key: "tools" | "skills" | "mcp", value: string) =>
    set({ [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value] } as Partial<FormState>)

  const canNext = step < STEPS.length - 1
  const submitLabel = editing ? "Save Changes" : "Create Agent"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-[640px] max-h-[88vh] flex flex-col bg-surface border border-line rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header + stepper */}
        <div className="px-6 pt-5 pb-4 border-b border-line">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-fore">{editing ? `Edit ${editing.name}` : "Add Agent"}</h2>
            <button onClick={onClose} className="text-faint hover:text-fore transition-colors text-lg leading-none">×</button>
          </div>
          <div className="flex items-center gap-1.5">
            {STEPS.map((s, i) => (
              <button
                key={s}
                onClick={() => setStep(i)}
                className="flex items-center gap-1.5 group"
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold transition-colors ${
                    i === step ? "bg-accent text-white" : i < step ? "bg-accent-muted text-accent" : "bg-elevated text-faint"
                  }`}
                >
                  {i + 1}
                </span>
                <span className={`text-[11px] font-medium transition-colors ${i === step ? "text-fore" : "text-faint group-hover:text-dim"}`}>
                  {s}
                </span>
                {i < STEPS.length - 1 && <span className="w-4 h-px bg-line mx-0.5" />}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* STEP 1 — Identity */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <label className={FIELD_LABEL}>Name</label>
                <input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="Backend Developer" className={INPUT} />
              </div>
              <div>
                <label className={FIELD_LABEL}>Role</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {ROLES.map((r) => (
                    <button
                      key={r}
                      onClick={() => changeRole(r)}
                      className={`py-2 text-[11px] rounded-lg border font-medium transition-colors ${
                        f.role === r ? "border-accent bg-accent-muted text-accent" : "border-line text-dim hover:bg-hover"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-start gap-2 text-[11px] text-faint leading-relaxed">
                  <span className="text-info mt-px">ⓘ</span>
                  <span>{ROLE_NOTE[f.role]}</span>
                </div>
              </div>
              <div>
                <label className={FIELD_LABEL}>Description</label>
                <textarea
                  rows={3}
                  value={f.description}
                  onChange={(e) => set({ description: e.target.value })}
                  placeholder="Implements API endpoints and backend services following project conventions."
                  className={`${INPUT} resize-none`}
                />
              </div>
            </div>
          )}

          {/* STEP 2 — Runtime */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className={FIELD_LABEL}>Runtime type</label>
                <Seg options={["Model Runtime", "Native Agent Runtime"] as const} value={f.runtimeType} onChange={(v) => set({ runtimeType: v })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={FIELD_LABEL}>Provider</label>
                  <select value={f.provider} onChange={(e) => changeProvider(e.target.value)} className={SELECT}>
                    {PROVIDERS.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className={FIELD_LABEL}>Account policy</label>
                  <Seg options={["Auto", "Preferred", "Pinned"] as const} value={f.accountPolicy} onChange={(v) => set({ accountPolicy: v })} />
                </div>
              </div>

              {f.accountPolicy !== "Auto" && (
                <div>
                  <label className={FIELD_LABEL}>Account</label>
                  {ACCOUNTS[f.provider]?.length ? (
                    <select value={f.account} onChange={(e) => set({ account: e.target.value })} className={SELECT}>
                      {ACCOUNTS[f.provider].map((a) => <option key={a}>{a}</option>)}
                    </select>
                  ) : (
                    <div className="text-[11px] text-faint">Local provider — no accounts. Manage auth in Settings → Providers.</div>
                  )}
                </div>
              )}

              <div>
                <label className={FIELD_LABEL}>Model</label>
                <select value={f.model} onChange={(e) => set({ model: e.target.value })} className={`${SELECT} font-mono`}>
                  {models.map((m) => <option key={m.id} value={m.id}>{m.id}</option>)}
                </select>
              </div>

              {model && (
                <div className="rounded-xl border border-line bg-elevated p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-faint uppercase tracking-wider">Model capabilities</span>
                    <span className="text-[10px] text-faint font-mono">{model.runtime}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {model.caps.map((c) => (
                      <span key={c} className="text-[10px] text-info bg-info-muted px-1.5 py-0.5 rounded">{c}</span>
                    ))}
                    <span className="text-[10px] text-dim bg-surface border border-line px-1.5 py-0.5 rounded">Context {model.context}</span>
                  </div>
                  <div className="flex items-center gap-2 pt-1 border-t border-line">
                    <span className="text-[10px] text-faint uppercase tracking-wider">Tool capability health</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${healthStyleTool(model.health)}`}>
                      {model.health}
                    </span>
                    {model.health === "Degraded" && <span className="text-[10px] text-warn">Intermittent tool-call failures</span>}
                    {model.health === "Unsupported" && <span className="text-[10px] text-err">No native tool use — choose Native Agent Runtime</span>}
                  </div>
                </div>
              )}

              <p className="text-[11px] text-faint leading-relaxed flex items-start gap-2">
                <span className="text-info mt-px">ⓘ</span>
                Provider authentication is managed centrally in Settings → Providers. This form only selects which connected provider to use.
              </p>
            </div>
          )}

          {/* STEP 3 — Capabilities */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <label className={FIELD_LABEL}>Tools</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {ALL_TOOLS.map((t) => {
                    const locked = restricted.includes(t)
                    const on = f.tools.includes(t)
                    return (
                      <button
                        key={t}
                        disabled={locked}
                        onClick={() => !locked && toggleIn("tools", t)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[11px] transition-colors ${
                          locked
                            ? "border-line bg-elevated text-faint cursor-not-allowed opacity-60"
                            : on
                            ? "border-accent bg-accent-muted text-accent"
                            : "border-line text-dim hover:bg-hover"
                        }`}
                      >
                        <span className={`w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 ${on && !locked ? "bg-accent border-accent" : "border-line"}`}>
                          {on && !locked && <span className="text-white text-[8px] leading-none">✓</span>}
                          {locked && <span className="text-faint text-[8px] leading-none">🔒</span>}
                        </span>
                        {t}
                      </button>
                    )
                  })}
                </div>
                {restricted.length > 0 && (
                  <div className="mt-2 flex items-start gap-2 text-[11px] text-warn leading-relaxed">
                    <span className="mt-px">⚠</span>
                    <span>{f.role} restricts {restricted.join(", ")} by default. {ROLE_NOTE[f.role]}</span>
                  </div>
                )}
              </div>

              <div>
                <label className={FIELD_LABEL}>Skills</label>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_SKILLS.map((s) => {
                    const on = f.skills.includes(s)
                    return (
                      <button
                        key={s}
                        onClick={() => toggleIn("skills", s)}
                        className={`text-[10px] font-mono px-2 py-1 rounded transition-colors ${
                          on ? "bg-info-muted text-info" : "bg-elevated text-faint hover:text-dim border border-line"
                        }`}
                      >
                        {s}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className={FIELD_LABEL}>MCP servers</label>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_MCP.map((m) => {
                    const on = f.mcp.includes(m)
                    return (
                      <button
                        key={m}
                        onClick={() => toggleIn("mcp", m)}
                        className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${
                          on ? "border-accent bg-accent-muted text-accent" : "border-line text-dim hover:bg-hover"
                        }`}
                      >
                        {m}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4 — Policies */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <label className={FIELD_LABEL}>Context policy</label>
                <Seg options={["Work Session", "Task", "Custom"] as const} value={f.contextPolicy as "Work Session" | "Task" | "Custom"} onChange={(v) => set({ contextPolicy: v })} />
              </div>

              <div>
                <label className={FIELD_LABEL}>Fallback</label>
                <Seg options={["None", "Fallback agent", "Fallback model"] as const} value={f.fallbackType} onChange={(v) => set({ fallbackType: v })} />
                {f.fallbackType === "Fallback model" && (
                  <select value={f.fallbackTarget} onChange={(e) => set({ fallbackTarget: e.target.value })} className={`${SELECT} font-mono mt-2`}>
                    {PROVIDERS.flatMap((p) => MODELS[p]).map((m) => <option key={m.id} value={m.id}>{m.id}</option>)}
                  </select>
                )}
                {f.fallbackType === "Fallback agent" && (
                  <select value={f.fallbackTarget} onChange={(e) => set({ fallbackTarget: e.target.value })} className={`${SELECT} mt-2`}>
                    {AGENTS.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
                  </select>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={FIELD_LABEL}>Permission profile</label>
                  <select value={f.permissionProfile} onChange={(e) => set({ permissionProfile: e.target.value })} className={SELECT}>
                    {PERMISSION_PROFILES.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className={FIELD_LABEL}>Maximum steps</label>
                  <input type="number" min={1} value={f.maxSteps} onChange={(e) => set({ maxSteps: +e.target.value })} className={INPUT} />
                </div>
              </div>

              <div>
                <label className={FIELD_LABEL}>Execution isolation</label>
                <Seg options={["Shared workspace", "Git worktree"] as const} value={f.isolation} onChange={(v) => set({ isolation: v })} />
              </div>
            </div>
          )}

          {/* STEP 5 — Review */}
          {step === 4 && (
            <div className="rounded-xl border border-line bg-elevated divide-y divide-line">
              {[
                { label: "Agent", value: f.name || "Untitled agent" },
                { label: "Role", value: f.role },
                { label: "Provider", value: `${f.provider} · ${f.accountPolicy}${f.accountPolicy !== "Auto" ? ` (${f.account})` : ""}` },
                { label: "Model", value: `${f.model}  ·  ${f.runtimeType}`, mono: true },
                { label: "Tools", value: f.tools.join(", ") || "None" },
                { label: "Skills", value: f.skills.join(", ") || "None" },
                { label: "MCP", value: f.mcp.join(", ") || "None" },
                { label: "Permissions", value: f.permissionProfile },
                { label: "Fallback", value: f.fallbackType === "None" ? "None" : `${f.fallbackType} → ${f.fallbackTarget}` },
                { label: "Isolation", value: f.isolation },
                { label: "Max steps", value: String(f.maxSteps) },
              ].map((r) => (
                <div key={r.label} className="flex items-start gap-4 px-4 py-2.5">
                  <span className="w-24 text-[11px] text-faint uppercase tracking-wider shrink-0">{r.label}</span>
                  <span className={`text-xs text-dim ${r.mono ? "font-mono" : ""}`}>{r.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-line flex items-center gap-2">
          {editing && step === STEPS.length - 1 && (
            <>
              <button onClick={onDuplicate} className="px-3 py-1.5 text-xs text-dim hover:text-fore border border-line hover:bg-hover rounded-lg transition-colors">
                Duplicate Agent
              </button>
              <button onClick={onDelete} className="px-3 py-1.5 text-xs text-err border border-err-muted hover:bg-err hover:text-white rounded-lg transition-colors">
                Delete Agent
              </button>
            </>
          )}
          <div className="flex-1" />
          {step > 0 && (
            <button onClick={() => setStep(step - 1)} className="px-3 py-1.5 text-xs text-dim hover:text-fore border border-line hover:bg-hover rounded-lg transition-colors">
              Back
            </button>
          )}
          {canNext ? (
            <button onClick={() => setStep(step + 1)} className="px-4 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:opacity-90 transition-opacity">
              Next
            </button>
          ) : (
            <button
              onClick={() => onSubmit(f)}
              disabled={!f.name.trim()}
              className="px-4 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {submitLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function formToAgent(f: FormState, base?: Agent): Agent {
  const model = (MODELS[f.provider] ?? []).find((m) => m.id === f.model)
  return {
    id: base?.id ?? `agent-${Date.now()}`,
    name: f.name.trim() || "New Agent",
    role: f.role,
    provider: f.provider,
    model: f.model,
    runtime: model?.runtime ?? f.provider,
    status: base?.status ?? "ready",
    caps: base?.caps ?? [],
    tools: f.tools.map((t) => t.toLowerCase().replace(/\s+/g, "_")),
    skills: f.skills,
    contextScope: f.contextPolicy,
    fallback: f.fallbackType === "None" ? "None" : f.fallbackTarget,
    description: f.description,
    runtimeType: f.runtimeType,
    accountPolicy: f.accountPolicy,
    account: f.account,
    mcp: f.mcp,
    permissionProfile: f.permissionProfile,
    maxSteps: f.maxSteps,
    isolation: f.isolation,
    fallbackType: f.fallbackType,
    fallbackTarget: f.fallbackTarget,
  }
}

export default function AgentsScreen() {
  const [agents, setAgents] = useState<Agent[]>(AGENTS)
  const [selectedId, setSelectedId] = useState<string>("backend")
  const [form, setForm] = useState<{ mode: "create" | "edit"; agent: Agent | null } | null>(null)
  const selected = agents.find((a) => a.id === selectedId)

  const handleSubmit = (f: FormState) => {
    if (form?.mode === "edit" && form.agent) {
      const updated = formToAgent(f, form.agent)
      setAgents((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
      setSelectedId(updated.id)
    } else {
      const created = formToAgent(f)
      setAgents((prev) => [...prev, created])
      setSelectedId(created.id)
    }
    setForm(null)
  }

  const handleDelete = () => {
    if (!form?.agent) return
    const id = form.agent.id
    setAgents((prev) => prev.filter((a) => a.id !== id))
    setSelectedId((prev) => (prev === id ? "backend" : prev))
    setForm(null)
  }

  const handleDuplicate = () => {
    if (!form?.agent) return
    const copy = { ...form.agent, id: `agent-${Date.now()}`, name: `${form.agent.name} Copy`, status: "ready" as const }
    setAgents((prev) => [...prev, copy])
    setSelectedId(copy.id)
    setForm(null)
  }

  const removeSelected = () => {
    if (!selected) return
    setAgents((prev) => prev.filter((a) => a.id !== selected.id))
    setSelectedId("backend")
  }

  return (
    <div className="h-full flex bg-base">
      {/* Agent list */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="px-6 py-5 border-b border-line bg-surface shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-base font-semibold text-fore">Project Agents</h1>
              <p className="text-xs text-faint mt-0.5">PMS — {agents.length} configured agents</p>
            </div>
            <button
              onClick={() => setForm({ mode: "create", agent: null })}
              className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:opacity-90 transition-opacity"
            >
              + Add Agent
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-2">
            {agents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => setSelectedId(agent.id)}
                className={`w-full text-left rounded-xl border p-4 transition-colors ${
                  selectedId === agent.id
                    ? "border-accent bg-accent-muted"
                    : "border-line bg-surface hover:border-[#3a3a44] hover:bg-hover"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                      agent.status === "running" ? "bg-ok animate-pulse" : "bg-faint"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-sm font-semibold text-fore">{agent.name}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${roleStyle[agent.role]}`}
                      >
                        {agent.role}
                      </span>
                      {agent.status === "running" && (
                        <span className="text-[10px] text-ok">Running</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {agent.caps.map((c) => (
                        <span key={c} className="text-[10px] text-faint bg-elevated px-1.5 py-0.5 rounded">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[10px] text-faint font-mono">{agent.runtime}</div>
                    <div className="text-[10px] text-faint opacity-60">{agent.provider}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Inspector */}
      {selected && (
        <div className="w-80 shrink-0">
          <AgentInspector
            agent={selected}
            onEdit={() => setForm({ mode: "edit", agent: selected })}
            onRemove={removeSelected}
          />
        </div>
      )}

      {form && (
        <AgentForm
          editing={form.mode === "edit" ? form.agent : null}
          onClose={() => setForm(null)}
          onSubmit={handleSubmit}
          onDelete={handleDelete}
          onDuplicate={handleDuplicate}
        />
      )}
    </div>
  )
}
