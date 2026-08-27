import { useState } from "react"

interface Session {
  id: string
  name: string
  status: "Executing" | "Planning" | "Completed" | "Review failed" | "Waiting"
  progress: number
  agents: number
  tasksDone: number
  tasksTotal: number
  runtime: string
  updated: string
}

const SESSIONS: Session[] = [
  { id: "s1", name: "Google OAuth Login", status: "Executing", progress: 63, agents: 3, tasksDone: 5, tasksTotal: 8, runtime: "18m 42s", updated: "2m ago" },
  { id: "s2", name: "API Performance Audit", status: "Planning", progress: 15, agents: 1, tasksDone: 1, tasksTotal: 6, runtime: "4m 09s", updated: "1h ago" },
  { id: "s3", name: "Session Store Refactor", status: "Completed", progress: 100, agents: 2, tasksDone: 7, tasksTotal: 7, runtime: "42m 18s", updated: "yesterday" },
  { id: "s4", name: "OAuth Regression Fix", status: "Review failed", progress: 82, agents: 2, tasksDone: 6, tasksTotal: 7, runtime: "31m 55s", updated: "3h ago" },
]

const FILTERS = ["All", "Running", "Waiting", "Completed", "Failed"] as const

const statusStyle: Record<Session["status"], string> = {
  Executing: "bg-ok-muted text-ok",
  Planning: "bg-info-muted text-info",
  Waiting: "bg-warn-muted text-warn",
  Completed: "bg-elevated text-dim",
  "Review failed": "bg-err-muted text-err",
}

function matchesFilter(s: Session, f: (typeof FILTERS)[number]) {
  if (f === "All") return true
  if (f === "Running") return s.status === "Executing" || s.status === "Planning"
  if (f === "Waiting") return s.status === "Waiting"
  if (f === "Completed") return s.status === "Completed"
  if (f === "Failed") return s.status === "Review failed"
  return true
}

function NewSessionModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<"Single Agent" | "Coordinated Team">("Coordinated Team")

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <label className="block text-[10px] font-semibold text-faint uppercase tracking-widest mb-1.5">
        {label}
      </label>
      {children}
    </div>
  )

  const select = "w-full bg-elevated border border-line rounded-lg px-3 py-2 text-xs text-dim focus:outline-none focus:border-[#3a3a44]"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-[520px] max-h-[85vh] overflow-y-auto bg-surface border border-line rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-line flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fore">New Work Session</h2>
          <button onClick={onClose} className="text-faint hover:text-fore transition-colors text-lg leading-none">
            ×
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <Field label="Goal">
            <textarea
              rows={3}
              defaultValue="Implement Google OAuth login with secure session storage and CSRF state validation."
              className="w-full bg-elevated border border-line rounded-lg px-3 py-2 text-xs text-fore placeholder:text-faint focus:outline-none focus:border-[#3a3a44] resize-none"
            />
          </Field>

          <Field label="Execution mode">
            <div className="flex gap-0.5 bg-elevated rounded-lg p-0.5">
              {(["Single Agent", "Coordinated Team"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 py-1.5 text-[11px] rounded-md transition-colors font-medium ${
                    mode === m ? "bg-hover text-fore" : "text-faint hover:text-dim"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label={mode === "Single Agent" ? "Agent" : "Team"}>
              <select className={select}>
                {mode === "Single Agent" ? (
                  <>
                    <option>Backend Developer</option>
                    <option>Frontend Developer</option>
                    <option>Architect</option>
                  </>
                ) : (
                  <>
                    <option>Full-Stack Team</option>
                    <option>Backend Team</option>
                    <option>Review Team</option>
                  </>
                )}
              </select>
            </Field>
            <Field label="Runtime policy">
              <select className={select}>
                <option>Auto (health-aware)</option>
                <option>Preferred provider</option>
                <option>Pinned model</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Review policy">
              <select className={select}>
                <option>Mechanical + AI review</option>
                <option>Mechanical checks only</option>
                <option>No review</option>
              </select>
            </Field>
            <Field label="Budget policy">
              <select className={select}>
                <option>Standard (up to $5)</option>
                <option>Extended (up to $20)</option>
                <option>Unlimited</option>
              </select>
            </Field>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-line flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-dim hover:text-fore border border-line hover:bg-hover rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:opacity-90 transition-opacity"
          >
            Create Session
          </button>
        </div>
      </div>
    </div>
  )
}

export default function WorkSessionsView({ onOpenWork }: { onOpenWork: () => void }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All")
  const [query, setQuery] = useState("")
  const [modal, setModal] = useState(false)
  const [menuFor, setMenuFor] = useState<string | null>(null)

  const rows = SESSIONS.filter(
    (s) => matchesFilter(s, filter) && s.name.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div className="max-w-5xl mx-auto" onClick={() => setMenuFor(null)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold text-fore">Work Sessions</h2>
          <p className="text-xs text-faint mt-0.5">{SESSIONS.length} sessions in PMS</p>
        </div>
        <button
          onClick={() => setModal(true)}
          className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:opacity-90 transition-opacity"
        >
          + New Work Session
        </button>
      </div>

      {/* Filters + search */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex gap-0.5 bg-elevated rounded-lg p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-[11px] rounded-md transition-colors font-medium ${
                filter === f ? "bg-hover text-fore" : "text-faint hover:text-dim"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sessions…"
          className="w-56 bg-elevated border border-line rounded-lg px-3 py-1.5 text-xs text-fore placeholder:text-faint focus:outline-none focus:border-[#3a3a44]"
        />
      </div>

      {/* Table */}
      <div className="bg-surface border border-line rounded-xl overflow-visible">
        <div className="grid grid-cols-[1fr_130px_120px_70px_70px_90px_90px_32px] gap-3 px-4 py-2.5 border-b border-line text-[10px] font-semibold text-faint uppercase tracking-wider">
          <span>Name</span>
          <span>Status</span>
          <span>Progress</span>
          <span>Agents</span>
          <span>Tasks</span>
          <span>Runtime</span>
          <span>Updated</span>
          <span />
        </div>

        {rows.length === 0 && (
          <div className="px-4 py-10 text-center text-xs text-faint">No sessions match this filter.</div>
        )}

        {rows.map((s, i) => (
          <div
            key={s.id}
            onClick={onOpenWork}
            className={`grid grid-cols-[1fr_130px_120px_70px_70px_90px_90px_32px] gap-3 px-4 py-3 items-center cursor-pointer hover:bg-hover transition-colors group ${
              i < rows.length - 1 ? "border-b border-line" : ""
            }`}
          >
            <span className="text-xs font-medium text-fore truncate">{s.name}</span>
            <span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${statusStyle[s.status]}`}>
                {s.status}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <span className="w-14 h-1 bg-elevated rounded-full overflow-hidden">
                <span
                  className={`block h-full rounded-full ${s.status === "Review failed" ? "bg-err" : "bg-accent"}`}
                  style={{ width: `${s.progress}%` }}
                />
              </span>
              <span className="text-[11px] text-faint font-mono">{s.progress}%</span>
            </span>
            <span className="text-xs text-dim font-mono">{s.agents}</span>
            <span className="text-xs text-dim font-mono">{s.tasksDone}/{s.tasksTotal}</span>
            <span className="text-xs text-faint font-mono">{s.runtime}</span>
            <span className="text-xs text-faint">{s.updated}</span>
            <span className="relative flex justify-end">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setMenuFor(menuFor === s.id ? null : s.id)
                }}
                className="w-6 h-6 flex items-center justify-center rounded-md text-faint hover:text-fore hover:bg-elevated transition-colors opacity-0 group-hover:opacity-100"
              >
                ⋯
              </button>
              {menuFor === s.id && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 top-7 z-10 w-36 bg-elevated border border-line rounded-lg shadow-xl py-1"
                >
                  {["Rename", "Duplicate", "Archive"].map((a) => (
                    <button
                      key={a}
                      onClick={() => setMenuFor(null)}
                      className="w-full text-left px-3 py-1.5 text-xs text-dim hover:text-fore hover:bg-hover transition-colors"
                    >
                      {a}
                    </button>
                  ))}
                  <div className="my-1 border-t border-line" />
                  <button
                    onClick={() => setMenuFor(null)}
                    className="w-full text-left px-3 py-1.5 text-xs text-err hover:bg-err-muted transition-colors"
                  >
                    Delete
                  </button>
                </div>
              )}
            </span>
          </div>
        ))}
      </div>

      {modal && <NewSessionModal onClose={() => setModal(false)} />}
    </div>
  )
}
