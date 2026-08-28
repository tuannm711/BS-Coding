import { useState } from "react"

type TaskStatus = "done" | "running" | "queued" | "blocked" | "failed"

interface Task {
  id: string
  title: string
  status: TaskStatus
  agent?: string
  runtime?: string
  elapsed?: string
  deps?: string[]
  objective?: string
  scope?: string[]
  criteria?: string[]
}

const TASKS: Task[] = [
  { id: "T01", title: "Analyze existing authentication architecture", status: "done" },
  { id: "T02", title: "Design OAuth backend flow", status: "done" },
  { id: "T03", title: "Design login UI", status: "done" },
  {
    id: "T04",
    title: "Implement OAuth backend",
    status: "running",
    agent: "Backend Developer",
    runtime: "Codex",
    elapsed: "08:42",
    deps: ["T02"],
    objective: "Implement Google OAuth backend authentication using Passport.js.",
    scope: ["Auth routes", "OAuth callback handler", "Session creation"],
    criteria: [
      "OAuth login succeeds end-to-end",
      "Invalid callback rejected with 401",
      "Tokens are never stored in plaintext",
      "Authentication tests pass",
    ],
  },
  {
    id: "T05",
    title: "Implement login UI",
    status: "running",
    agent: "Frontend Developer",
    runtime: "Codex",
    elapsed: "05:18",
    deps: ["T03"],
    objective: "Build the Google OAuth login button and callback redirect handling.",
    scope: ["Login page component", "OAuth redirect handler", "Session state management"],
    criteria: [
      "Google login button renders correctly",
      "Redirects to OAuth provider on click",
      "Handles callback and stores session",
    ],
  },
  { id: "T06", title: "Integration", status: "queued", deps: ["T04", "T05"] },
  { id: "T07", title: "Security & code review", status: "queued", deps: ["T06"] },
  { id: "T08", title: "Final verification", status: "queued", deps: ["T07"] },
]

function StatusIcon({ status }: { status: TaskStatus }) {
  if (status === "done") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-ok">
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
        <polyline points="5,8 7,10 11,6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (status === "running") {
    return (
      <div className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin" />
    )
  }
  if (status === "blocked" || status === "failed") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-err">
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6 6L10 10M10 6L6 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <div className="w-4 h-4 rounded-full border-2 border-line" />
  )
}

function TaskRow({
  task,
  selected,
  onClick,
}: {
  task: Task
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-colors border-l-2 ${
        selected
          ? "bg-hover border-l-accent"
          : "hover:bg-hover border-l-transparent"
      }`}
    >
      <div className="flex items-center justify-center w-4 shrink-0">
        <StatusIcon status={task.status} />
      </div>
      <span className="text-[11px] font-mono text-faint shrink-0 w-7">{task.id}</span>
      <span
        className={`text-sm flex-1 min-w-0 truncate ${
          task.status === "done"
            ? "text-faint line-through"
            : task.status === "running"
            ? "text-fore"
            : "text-dim"
        }`}
      >
        {task.title}
      </span>
      {task.status === "running" && (
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-faint font-mono">{task.elapsed}</span>
          <span className="text-[10px] text-accent bg-accent-muted px-1.5 py-0.5 rounded font-medium">
            {task.runtime}
          </span>
        </div>
      )}
      {task.deps && task.status !== "done" && task.status !== "running" && (
        <div className="flex gap-1 shrink-0">
          {task.deps.map((d) => (
            <span key={d} className="text-[10px] font-mono text-faint bg-elevated px-1 py-0.5 rounded">
              {d}
            </span>
          ))}
        </div>
      )}
    </button>
  )
}

function TaskInspector({ task, onClose }: { task: Task; onClose: () => void }) {
  const liveActivity = [
    { type: "read", file: "src/auth/index.ts", done: true },
    { type: "read", file: "src/routes/auth.ts", done: true },
    { type: "edit", file: "src/auth/google.ts", done: true },
    { type: "exec", file: "npm test -- auth", done: task.id === "T04" },
  ]

  return (
    <div className="h-full flex flex-col bg-surface border-l border-line">
      <div className="px-5 py-4 border-b border-line flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-mono text-faint">{task.id}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-muted text-accent font-medium capitalize">
              {task.status}
            </span>
          </div>
          <h2 className="text-sm font-semibold text-fore">{task.title}</h2>
        </div>
        <button onClick={onClose} className="text-faint hover:text-dim transition-colors mt-0.5 shrink-0">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2 2L12 12M12 2L2 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {task.agent && (
          <div className="px-5 py-4 border-b border-line">
            <div className="text-[10px] text-faint uppercase tracking-wider mb-2">Assigned agent</div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-ok" />
              <span className="text-sm font-medium text-fore">{task.agent}</span>
              <span className="text-[10px] text-faint font-mono ml-auto">{task.runtime}</span>
            </div>
          </div>
        )}

        {task.objective && (
          <div className="px-5 py-4 border-b border-line">
            <div className="text-[10px] text-faint uppercase tracking-wider mb-2">Objective</div>
            <p className="text-sm text-dim leading-relaxed">{task.objective}</p>
          </div>
        )}

        {task.scope && (
          <div className="px-5 py-4 border-b border-line">
            <div className="text-[10px] text-faint uppercase tracking-wider mb-2">Scope</div>
            <ul className="space-y-1.5">
              {task.scope.map((s) => (
                <li key={s} className="flex items-center gap-2 text-sm text-dim">
                  <span className="w-1 h-1 rounded-full bg-faint shrink-0" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {task.criteria && (
          <div className="px-5 py-4 border-b border-line">
            <div className="text-[10px] text-faint uppercase tracking-wider mb-2">
              Acceptance criteria
            </div>
            <ul className="space-y-2">
              {task.criteria.map((c) => (
                <li key={c} className="flex items-start gap-2 text-xs text-dim">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="mt-0.5 shrink-0 text-line">
                    <rect x="1" y="1" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.25" />
                  </svg>
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )}

        {task.deps && (
          <div className="px-5 py-4 border-b border-line">
            <div className="text-[10px] text-faint uppercase tracking-wider mb-2">Dependencies</div>
            <div className="flex gap-1.5">
              {task.deps.map((d) => (
                <span key={d} className="text-xs font-mono px-2 py-0.5 bg-elevated rounded text-dim border border-line">
                  {d}
                </span>
              ))}
            </div>
          </div>
        )}

        {task.status === "running" && (
          <>
            <div className="px-5 py-4 border-b border-line">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] text-faint uppercase tracking-wider">Live activity</div>
                <div className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse" />
              </div>
              <div className="space-y-2">
                {liveActivity.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span
                      className={`text-[10px] font-mono px-1 rounded shrink-0 ${
                        a.type === "exec"
                          ? "bg-info-muted text-info"
                          : a.type === "edit"
                          ? "bg-warn-muted text-warn"
                          : "bg-elevated text-faint"
                      }`}
                    >
                      {a.type === "exec" ? "RUN" : a.type.toUpperCase()}
                    </span>
                    <span className="font-mono text-faint truncate">{a.file}</span>
                    {a.done && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-ok shrink-0 ml-auto">
                        <polyline points="2,5 4,7 8,3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                    {!a.done && (
                      <div className="w-2 h-2 rounded-full border border-accent border-t-transparent animate-spin ml-auto" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="px-5 py-4 border-b border-line">
              <div className="flex gap-6">
                <div>
                  <div className="text-[10px] text-faint">Files changed</div>
                  <div className="text-2xl font-bold font-mono text-fore mt-0.5">4</div>
                </div>
                <div>
                  <div className="text-[10px] text-faint">Tests</div>
                  <div className="text-2xl font-bold font-mono text-ok mt-0.5">
                    12
                    <span className="text-sm text-faint font-normal"> passed</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="px-5 py-4 border-t border-line flex flex-col gap-2">
        <button className="w-full px-3 py-2 text-xs font-medium text-dim hover:text-fore border border-line hover:bg-hover rounded-lg transition-colors text-left">
          Open agent activity
        </button>
        <div className="flex gap-2">
          <button className="flex-1 px-3 py-2 text-xs font-medium text-err border border-err-muted bg-err-muted hover:bg-err hover:text-white rounded-lg transition-colors">
            Stop task
          </button>
          <button className="flex-1 px-3 py-2 text-xs font-medium text-dim border border-line hover:bg-hover rounded-lg transition-colors">
            Reassign
          </button>
        </div>
      </div>
    </div>
  )
}

type SessionStatus = "executing" | "paused" | "cancelled"

export default function TasksView({ sessionStatus = "executing" }: { sessionStatus?: SessionStatus }) {
  const [selectedId, setSelectedId] = useState<string>("T04")
  const selected = TASKS.find((t) => t.id === selectedId)
  const running = TASKS.filter((t) => t.status === "running")
  const runLabel = sessionStatus === "paused" ? "Paused" : sessionStatus === "cancelled" ? "Cancelled" : null

  return (
    <div className="h-full flex">
      {/* Left: task list */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Progress */}
        <div className="px-6 py-4 border-b border-line shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-fore">5 / 8 tasks complete</span>
            <span className="text-sm font-semibold font-mono text-accent">63%</span>
          </div>
          <div className="h-1.5 bg-elevated rounded-full overflow-hidden">
            <div className="h-full bg-accent rounded-full" style={{ width: "63%" }} />
          </div>
        </div>

        {/* Running tasks */}
        {running.length > 0 && (
          <div className="px-5 py-2.5 border-b border-line bg-surface flex gap-5 shrink-0">
            {running.map((t) => (
              <div key={t.id} className="flex items-center gap-2 text-xs">
                {runLabel ? (
                  <span className={`w-2 h-2 rounded-full ${sessionStatus === "paused" ? "bg-warn" : "bg-faint"}`} />
                ) : (
                  <div className="w-2 h-2 rounded-full border-2 border-accent border-t-transparent animate-spin" />
                )}
                <span className="font-mono text-faint">{t.id}</span>
                <span className="text-dim font-medium">{t.agent}</span>
                {runLabel ? (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${sessionStatus === "paused" ? "bg-warn-muted text-warn" : "bg-elevated text-faint"}`}>
                    {runLabel}
                  </span>
                ) : (
                  <>
                    <span className="text-faint">via {t.runtime}</span>
                    <span className="font-mono text-faint">{t.elapsed}</span>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Tasks */}
        <div className="flex-1 overflow-y-auto py-1">
          {TASKS.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              selected={selectedId === task.id}
              onClick={() => setSelectedId(task.id)}
            />
          ))}
        </div>
      </div>

      {/* Right: inspector */}
      {selected && (
        <div className="w-80 shrink-0">
          <TaskInspector task={selected} onClose={() => setSelectedId("")} />
        </div>
      )}
    </div>
  )
}
