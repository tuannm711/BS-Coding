import { useState } from "react"

/* ---------- Primitives ---------- */

type Tone = "ok" | "warn" | "err" | "info" | "accent" | "neutral"

const toneStyle: Record<Tone, string> = {
  ok: "bg-ok-muted text-ok",
  warn: "bg-warn-muted text-warn",
  err: "bg-err-muted text-err",
  info: "bg-info-muted text-info",
  accent: "bg-accent-muted text-accent",
  neutral: "bg-elevated text-faint",
}

const dotColor: Record<Tone, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  err: "bg-err",
  info: "bg-info",
  accent: "bg-accent",
  neutral: "bg-faint",
}

function Pill({ tone, children, dot, pulse }: { tone: Tone; children: React.ReactNode; dot?: boolean; pulse?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] px-1.5 py-0.5 rounded font-medium ${toneStyle[tone]}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColor[tone]} ${pulse ? "animate-pulse" : ""}`} />}
      {children}
    </span>
  )
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-[10px] font-semibold text-faint uppercase tracking-widest">{title}</h2>
        {count != null && <span className="text-[10px] text-faint">· {count} states</span>}
      </div>
      {children}
    </section>
  )
}

// Labelled cell for a compact state component
function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2.5 flex items-center justify-between gap-3">
      <span className="text-xs text-dim capitalize">{label}</span>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">{children}</div>
}

/* ---------- Banner ---------- */

function Banner({
  tone,
  title,
  desc,
  actions,
}: {
  tone: Tone
  title: string
  desc: string
  actions?: { label: string; primary?: boolean }[]
}) {
  const borderTone =
    tone === "err" ? "border-err-muted" : tone === "warn" ? "border-warn-muted" : "border-line"
  return (
    <div className={`rounded-xl border ${borderTone} bg-surface px-4 py-3`}>
      <div className="flex items-start gap-3">
        <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${dotColor[tone]}`} />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-fore">{title}</div>
          <div className="text-[11px] text-faint mt-0.5 leading-relaxed">{desc}</div>
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">
            {actions.map((a) => (
              <button
                key={a.label}
                className={`px-3 py-1.5 text-[11px] rounded-lg transition-colors ${
                  a.primary
                    ? "bg-accent text-white hover:opacity-90 font-medium"
                    : "text-dim hover:text-fore border border-line hover:bg-hover"
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Compact empty-state card (inline, not a full page)
function EmptyCard({ title, desc, action }: { title: string; desc: string; action: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface px-6 py-8 text-center">
      <div className="text-sm font-medium text-dim">{title}</div>
      <div className="text-[11px] text-faint mt-1 mb-4">{desc}</div>
      <button className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:opacity-90 transition-opacity">
        {action}
      </button>
    </div>
  )
}

/* ---------- Rows ---------- */

function TaskRow({ id, label, tone, status, dot, pulse }: { id: string; label: string; tone: Tone; status: string; dot?: boolean; pulse?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2">
      <span className="text-[10px] font-mono text-faint w-9 shrink-0">{id}</span>
      <span className="flex-1 text-xs text-dim truncate">{label}</span>
      <Pill tone={tone} dot={dot} pulse={pulse}>{status}</Pill>
    </div>
  )
}

function AgentRow({ initials, name, role, tone, status, pulse }: { initials: string; name: string; role: string; tone: Tone; status: string; pulse?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2">
      <div className="w-7 h-7 rounded-full bg-elevated border border-line flex items-center justify-center text-[10px] font-bold text-dim shrink-0">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-fore truncate">{name}</div>
        <div className="text-[10px] text-faint truncate">{role}</div>
      </div>
      <Pill tone={tone} dot pulse={pulse}>{status}</Pill>
    </div>
  )
}

function ProviderRow({ name, model, tone, status, pulse }: { name: string; model: string; tone: Tone; status: string; pulse?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2">
      <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor[tone]} ${pulse ? "animate-pulse" : ""}`} />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-fore truncate">{name}</div>
        <div className="text-[10px] text-faint font-mono truncate">{model}</div>
      </div>
      <Pill tone={tone}>{status}</Pill>
    </div>
  )
}

/* ---------- Tool execution rows ---------- */

function ToolRow({
  type,
  file,
  tone,
  status,
  permission,
}: {
  type: "READ" | "EDIT" | "EXEC"
  file: string
  tone: Tone
  status: string
  permission?: boolean
}) {
  const typeStyle = type === "EXEC" ? "bg-info-muted text-info" : type === "EDIT" ? "bg-warn-muted text-warn" : "bg-elevated text-faint"
  return (
    <div className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${permission ? "border-info-muted bg-info-muted/30" : "border-line bg-base"}`}>
      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-medium shrink-0 ${typeStyle}`}>{type}</span>
      <span className="flex-1 text-xs font-mono text-dim truncate">{file}</span>
      {permission ? (
        <div className="flex items-center gap-1.5 shrink-0">
          <button className="px-2 py-1 text-[10px] font-medium bg-accent text-white rounded hover:opacity-90 transition-opacity">Allow</button>
          <button className="px-2 py-1 text-[10px] text-dim border border-line rounded hover:bg-hover transition-colors">Deny</button>
        </div>
      ) : (
        <Pill tone={tone}>{status}</Pill>
      )}
    </div>
  )
}

/* ---------- Review + verification ---------- */

function ReviewCard({ tone, title, desc, count }: { tone: Tone; title: string; desc: string; count: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between mb-1.5">
        <Pill tone={tone} dot>{title}</Pill>
        <span className="text-[10px] font-mono text-faint">{count}</span>
      </div>
      <p className="text-[11px] text-faint leading-relaxed">{desc}</p>
    </div>
  )
}

function VerifyRow({ tone, label, detail, pulse, bar }: { tone: Tone; label: string; detail: string; pulse?: boolean; bar?: number }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2.5">
      <div className="flex items-center gap-3">
        <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor[tone]} ${pulse ? "animate-pulse" : ""}`} />
        <span className="flex-1 text-xs text-dim">{label}</span>
        <span className="text-[10px] text-faint font-mono">{detail}</span>
      </div>
      {bar != null && (
        <div className="mt-2 h-1 rounded-full bg-elevated overflow-hidden">
          <div className={`h-full rounded-full ${tone === "err" ? "bg-err" : tone === "ok" ? "bg-ok" : "bg-accent"}`} style={{ width: `${bar}%` }} />
        </div>
      )}
    </div>
  )
}

/* ---------- Live dialogs ---------- */

function PermissionDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-[420px] bg-surface border border-line rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-line">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-info" />
            <h2 className="text-sm font-semibold text-fore">Permission requested</h2>
          </div>
        </div>
        <div className="px-6 py-5">
          <p className="text-xs text-dim mb-3">
            <span className="font-medium text-fore">Backend Developer</span> wants to run a shell command:
          </p>
          <div className="rounded-lg bg-base border border-line px-3 py-2 font-mono text-xs text-dim mb-3">
            $ npm install passport-google-oauth20
          </div>
          <label className="flex items-center gap-2 text-[11px] text-faint">
            <input type="checkbox" className="accent-[#f47328]" /> Remember for this session
          </label>
        </div>
        <div className="px-6 py-4 border-t border-line flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-dim hover:text-fore border border-line hover:bg-hover rounded-lg transition-colors">Deny</button>
          <button onClick={onClose} className="px-4 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:opacity-90 transition-opacity">Allow</button>
        </div>
      </div>
    </div>
  )
}

function ProtocolDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-[460px] bg-surface border border-err-muted rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-line">
          <div className="flex items-center gap-2">
            <span className="text-err">⚠</span>
            <h2 className="text-sm font-semibold text-err">Tool protocol violation</h2>
          </div>
        </div>
        <div className="px-6 py-5">
          <p className="text-xs text-dim leading-relaxed mb-3">
            The model described a tool action instead of issuing a structured tool call.
          </p>
          <div className="rounded-lg bg-base border border-dashed border-line px-3 py-2 mb-1">
            <div className="text-[10px] text-faint uppercase tracking-wider mb-1">Narrated — not executed</div>
            <p className="text-xs font-mono text-faint italic">"I'll now edit src/auth/google.ts to add the callback…"</p>
          </div>
          <p className="text-[11px] text-faint mt-3">
            Narrated text is never executed as a real tool action. Retry the structured call, switch to a verified runtime, or stop the session.
          </p>
        </div>
        <div className="px-6 py-4 border-t border-line flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs font-medium text-err border border-err-muted bg-err-muted hover:bg-err hover:text-white rounded-lg transition-colors">Stop</button>
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-dim hover:text-fore border border-line hover:bg-hover rounded-lg transition-colors">Switch runtime</button>
          <button onClick={onClose} className="px-4 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:opacity-90 transition-opacity">Retry structured call</button>
        </div>
      </div>
    </div>
  )
}

/* ---------- Screen ---------- */

export default function StatesScreen() {
  const [dialog, setDialog] = useState<null | "permission" | "protocol">(null)

  return (
    <div className="h-full flex flex-col bg-base">
      <div className="bg-surface border-b border-line px-8 py-5 shrink-0">
        <h1 className="text-base font-semibold text-fore">System States</h1>
        <p className="text-xs text-faint mt-0.5">
          Reference catalog of every application state — compact inline states, banners and dialogs.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-10 max-w-5xl">
        {/* HOME */}
        <Section title="Home" count={3}>
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <EmptyCard title="No projects yet" desc="Create or clone a repository to get started." action="New project" />
              <EmptyCard title="No active work" desc="Start a work session to see live agent activity." action="Start work session" />
            </div>
            <Banner
              tone="warn"
              title="Provider attention needed"
              desc="OpenAI quota is running low and one account token expires in 2 days."
              actions={[{ label: "Review providers", primary: true }]}
            />
          </div>
        </Section>

        {/* PROJECT */}
        <Section title="Project" count={3}>
          <div className="space-y-3">
            <EmptyCard title="This project is empty" desc="No files, sessions or agents configured yet." action="Add files" />
            <Banner
              tone="warn"
              title="Repository not detected"
              desc="No Git repository found in this project. Connect one to enable diffs, commits and branches."
              actions={[{ label: "Connect repository", primary: true }]}
            />
            <Banner
              tone="err"
              title="Branch conflict"
              desc="feature/google-oauth has diverged from main. 3 files conflict and must be resolved before merge."
              actions={[{ label: "View conflicts" }, { label: "Resolve", primary: true }]}
            />
          </div>
        </Section>

        {/* WORK SESSION */}
        <Section title="Work Session" count={8}>
          <Grid>
            <Cell label="planning"><Pill tone="info" dot pulse>Planning</Pill></Cell>
            <Cell label="waiting for plan approval"><Pill tone="warn" dot>Awaiting approval</Pill></Cell>
            <Cell label="running"><Pill tone="ok" dot pulse>Running</Pill></Cell>
            <Cell label="paused"><Pill tone="neutral" dot>Paused</Pill></Cell>
            <Cell label="blocked"><Pill tone="warn" dot>Blocked</Pill></Cell>
            <Cell label="failed"><Pill tone="err" dot>Failed</Pill></Cell>
            <Cell label="completed"><Pill tone="ok">Completed</Pill></Cell>
            <Cell label="cancelled"><Pill tone="neutral">Cancelled</Pill></Cell>
          </Grid>
        </Section>

        {/* TASK */}
        <Section title="Task" count={9}>
          <div className="space-y-2">
            <TaskRow id="T01" label="Analyze session architecture" tone="neutral" status="Queued" />
            <TaskRow id="T02" label="Design OAuth data model" tone="info" status="Assigned" dot />
            <TaskRow id="T03" label="Implement callback handler" tone="ok" status="Running" dot pulse />
            <TaskRow id="T04" label="Register auth routes" tone="warn" status="Waiting dependency" dot />
            <TaskRow id="T05" label="Add Google button" tone="warn" status="Waiting approval" dot />
            <TaskRow id="T06" label="Wire session tokens" tone="err" status="Blocked" dot />
            <TaskRow id="T07" label="Integration tests" tone="err" status="Review failed" dot />
            <TaskRow id="T08" label="Refine error handling" tone="warn" status="Rework" dot />
            <TaskRow id="T09" label="Verify build" tone="ok" status="Completed" />
          </div>
        </Section>

        {/* AGENT */}
        <Section title="Agent" count={7}>
          <div className="space-y-2">
            <AgentRow initials="CO" name="Coordinator" role="Claude Opus · Anthropic" tone="ok" status="Ready" />
            <AgentRow initials="BE" name="Backend Developer" role="Codex · OpenAI" tone="accent" status="Running" pulse />
            <AgentRow initials="FE" name="Frontend Developer" role="Codex · OpenAI" tone="warn" status="Waiting" />
            <AgentRow initials="QA" name="Test Engineer" role="Gemini · Google" tone="neutral" status="Unavailable" />
            <AgentRow initials="DB" name="Data Modeler" role="GPT · OpenAI" tone="err" status="Quota exhausted" />
            <AgentRow initials="RV" name="Reviewer" role="Gemini Flash · Google" tone="warn" status="Degraded tool capability" />
            <AgentRow initials="SC" name="Security Auditor" role="Ollama · local" tone="err" status="Disconnected provider" />
          </div>
        </Section>

        {/* PROVIDER */}
        <Section title="Provider" count={7}>
          <div className="space-y-2">
            <ProviderRow name="Anthropic" model="claude-opus-5" tone="info" status="Authenticating" pulse />
            <ProviderRow name="OpenAI · Team" model="codex-1" tone="ok" status="Connected" />
            <ProviderRow name="OpenAI · Personal" model="gpt-5" tone="err" status="Token expired" />
            <ProviderRow name="Google" model="gemini-2.0-pro" tone="warn" status="Quota warning" />
            <ProviderRow name="OpenAI · CI" model="gpt-5-mini" tone="err" status="Quota exhausted" />
            <ProviderRow name="Anthropic · Batch" model="claude-haiku" tone="warn" status="Cooldown" />
            <ProviderRow name="Ollama" model="llama-3.3-70b" tone="neutral" status="Unavailable" />
          </div>
        </Section>

        {/* TOOL EXECUTION */}
        <Section title="Tool Execution" count={5}>
          <div className="space-y-2">
            <ToolRow type="EXEC" file="npm install passport-google-oauth20" tone="info" status="Permission requested" permission />
            <ToolRow type="EDIT" file="src/auth/google.ts" tone="accent" status="Running" />
            <ToolRow type="READ" file="src/routes/auth.ts" tone="ok" status="Completed" />
            <ToolRow type="EXEC" file="npm test -- auth" tone="err" status="Failed" />
            <ToolRow type="EDIT" file="src/config/secrets.ts" tone="neutral" status="Denied" />
          </div>
        </Section>

        {/* PROTOCOL FAILURE */}
        <Section title="Protocol Failure">
          <div className="rounded-xl border border-err-muted bg-err-muted/30 px-4 py-3.5">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-err">⚠</span>
              <span className="text-xs font-semibold text-err">Tool protocol violation</span>
            </div>
            <p className="text-[11px] text-dim leading-relaxed mb-3">
              The model described a tool action instead of issuing a structured tool call. Narrated text is never
              executed as a real tool action.
            </p>
            <div className="flex items-center gap-2">
              <button className="px-3 py-1.5 text-[11px] font-medium bg-accent text-white rounded-lg hover:opacity-90 transition-opacity">Retry structured call</button>
              <button className="px-3 py-1.5 text-[11px] text-dim hover:text-fore border border-line hover:bg-hover rounded-lg transition-colors">Switch runtime</button>
              <button className="px-3 py-1.5 text-[11px] font-medium text-err border border-err-muted hover:bg-err hover:text-white rounded-lg transition-colors">Stop</button>
            </div>
          </div>
        </Section>

        {/* REVIEW */}
        <Section title="Review" count={4}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ReviewCard tone="ok" title="Pass" desc="All checks satisfied. No changes requested." count="0 issues" />
            <ReviewCard tone="info" title="Pass with suggestions" desc="Approved. 3 non-blocking improvements noted for follow-up." count="3 notes" />
            <ReviewCard tone="err" title="Fail" desc="Blocking issues found. Session cannot proceed to verification." count="2 blockers" />
            <ReviewCard tone="warn" title="Rework required" desc="Returned to Backend Developer for changes before re-review." count="5 items" />
          </div>
        </Section>

        {/* FINAL VERIFICATION */}
        <Section title="Final Verification" count={4}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <VerifyRow tone="neutral" label="Full test suite + build" detail="Pending" />
            <VerifyRow tone="accent" label="Full test suite + build" detail="Running · 62%" pulse bar={62} />
            <VerifyRow tone="ok" label="Full test suite + build" detail="Passed · 128/128" bar={100} />
            <VerifyRow tone="err" label="Full test suite + build" detail="Failed · 3 errors" bar={100} />
          </div>
        </Section>

        {/* Live dialogs */}
        <Section title="Dialogs">
          <div className="flex items-center gap-2">
            <button onClick={() => setDialog("permission")} className="px-3 py-1.5 text-xs text-dim hover:text-fore border border-line hover:bg-hover rounded-lg transition-colors">
              Preview permission request
            </button>
            <button onClick={() => setDialog("protocol")} className="px-3 py-1.5 text-xs text-dim hover:text-fore border border-line hover:bg-hover rounded-lg transition-colors">
              Preview protocol violation
            </button>
          </div>
        </Section>
      </div>

      {dialog === "permission" && <PermissionDialog onClose={() => setDialog(null)} />}
      {dialog === "protocol" && <ProtocolDialog onClose={() => setDialog(null)} />}
    </div>
  )
}
