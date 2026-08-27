interface Props {
  onOpenProject: () => void
  onOpenWork: () => void
}

const activeWork = [
  {
    id: "pms-oauth",
    project: "PMS",
    title: "Google OAuth Login",
    status: "Executing",
    progress: 63,
    agents: 3,
    tasks: { done: 5, total: 8 },
    issues: 1,
    updated: "2 min ago",
    branch: "feature/google-oauth",
  },
  {
    id: "odc-telegram",
    project: "ODC Assistant",
    title: "Telegram Reminder Refactor",
    status: "Review",
    progress: 88,
    agents: 1,
    tasks: { done: 6, total: 7 },
    issues: 0,
    updated: "18 min ago",
    branch: "refactor/telegram",
  },
  {
    id: "bsc-arch",
    project: "BS Coding",
    title: "Provider Runtime Architecture",
    status: "Planning",
    progress: 20,
    agents: 2,
    tasks: { done: 1, total: 6 },
    issues: 0,
    updated: "1 hr ago",
    branch: "feature/runtime-arch",
  },
]

const attention = [
  { id: 1, type: "err", text: "Security review failed on PMS", detail: "OAuth state validation missing" },
  { id: 2, type: "warn", text: "Codex account approaching quota", detail: "Account B — 62% used this week" },
  { id: 3, type: "info", text: "1 blocked task", detail: "T06 Integration — awaiting T04, T05" },
]

const projects = [
  { id: "pms", name: "PMS", branch: "feature/google-oauth", activity: "2 min ago", active: 2 },
  { id: "odc", name: "ODC Assistant", branch: "main", activity: "18 min ago", active: 1 },
  { id: "bsc", name: "BS Coding", branch: "main", activity: "1 hr ago", active: 1 },
  { id: "cms", name: "Content API", branch: "develop", activity: "3 days ago", active: 0 },
]

const statusStyle: Record<string, string> = {
  Executing: "text-ok bg-ok-muted",
  Review: "text-warn bg-warn-muted",
  Planning: "text-info bg-info-muted",
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusStyle[status] ?? "text-faint bg-elevated"}`}>
      {status}
    </span>
  )
}

export default function HomeScreen({ onOpenProject, onOpenWork }: Props) {
  return (
    <div className="h-full overflow-y-auto bg-base">
      <div className="max-w-5xl mx-auto px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-fore tracking-tight">Good morning</h1>
          <p className="text-sm text-dim mt-0.5">Continue where you left off</p>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Left 2/3 */}
          <div className="col-span-2 space-y-7">
            {/* Active Work */}
            <section>
              <h2 className="text-[10px] font-semibold text-faint uppercase tracking-widest mb-3">
                Active Work
              </h2>
              <div className="space-y-2">
                {activeWork.map((work) => (
                  <div
                    key={work.id}
                    className="bg-surface rounded-xl border border-line p-4 hover:border-[#3a3a44] transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[11px] text-faint font-mono">{work.project}</span>
                          <span className="text-faint text-xs">/</span>
                          <span className="text-sm font-medium text-fore">{work.title}</span>
                          <StatusBadge status={work.status} />
                        </div>
                        <div className="flex items-center gap-2 mb-2.5">
                          <div className="flex-1 h-1 bg-elevated rounded-full overflow-hidden">
                            <div
                              className="h-full bg-accent rounded-full"
                              style={{ width: `${work.progress}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-faint font-mono">{work.progress}%</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-faint flex-wrap">
                          <span>{work.tasks.done}/{work.tasks.total} tasks</span>
                          <span>{work.agents} agent{work.agents !== 1 ? "s" : ""} active</span>
                          {work.issues > 0 && (
                            <span className="text-err">{work.issues} review issue</span>
                          )}
                          <span className="font-mono text-[10px]">{work.branch}</span>
                          <span className="ml-auto">{work.updated}</span>
                        </div>
                      </div>
                      <button
                        onClick={work.id === "pms-oauth" ? onOpenWork : undefined}
                        className="shrink-0 px-3 py-1.5 text-xs font-medium text-dim hover:text-fore bg-elevated hover:bg-hover border border-line hover:border-[#3a3a44] rounded-lg transition-colors"
                      >
                        Open
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Recent Projects */}
            <section>
              <h2 className="text-[10px] font-semibold text-faint uppercase tracking-widest mb-3">
                Recent Projects
              </h2>
              <div className="bg-surface rounded-xl border border-line overflow-hidden">
                {projects.map((p, i) => (
                  <button
                    key={p.id}
                    onClick={p.id === "pms" ? onOpenProject : undefined}
                    className={`w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-hover transition-colors ${
                      i !== projects.length - 1 ? "border-b border-line" : ""
                    }`}
                  >
                    <div className="w-7 h-7 rounded-md bg-elevated flex items-center justify-center text-[11px] font-semibold text-fore shrink-0">
                      {p.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-fore">{p.name}</div>
                      <div className="text-[11px] text-faint font-mono">{p.branch}</div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-faint shrink-0">
                      {p.active > 0 && (
                        <span className="text-ok">{p.active} active</span>
                      )}
                      <span>{p.activity}</span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </div>

          {/* Right 1/3 */}
          <div className="space-y-7">
            {/* Needs Attention */}
            <section>
              <h2 className="text-[10px] font-semibold text-faint uppercase tracking-widest mb-3">
                Needs Attention
              </h2>
              <div className="space-y-2">
                {attention.map((item) => (
                  <div key={item.id} className="bg-surface rounded-xl border border-line p-3">
                    <div
                      className={`text-xs font-medium mb-0.5 ${
                        item.type === "err"
                          ? "text-err"
                          : item.type === "warn"
                          ? "text-warn"
                          : "text-info"
                      }`}
                    >
                      {item.text}
                    </div>
                    <div className="text-xs text-faint">{item.detail}</div>
                  </div>
                ))}
              </div>
            </section>

            {/* Today stats */}
            <section>
              <h2 className="text-[10px] font-semibold text-faint uppercase tracking-widest mb-3">
                Today
              </h2>
              <div className="bg-surface rounded-xl border border-line divide-y divide-line">
                {[
                  { label: "Tasks completed", value: "12", color: "text-ok" },
                  { label: "Files changed", value: "34", color: "text-info" },
                  { label: "Tests run", value: "127", color: "text-fore" },
                  { label: "Agent hours", value: "4.2h", color: "text-dim" },
                ].map((stat) => (
                  <div key={stat.label} className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs text-faint">{stat.label}</span>
                    <span className={`text-sm font-semibold font-mono ${stat.color}`}>
                      {stat.value}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
