import { useState } from "react"

interface Agent {
  id: string
  name: string
  role: "Coordinator" | "Specialist" | "Worker" | "Reviewer"
  provider: string
  model: string
  accountPolicy: string
  caps: string[]
  status: "running" | "ready" | "disabled"
  enabled: boolean
}

const INITIAL: Agent[] = [
  { id: "orchestrator", name: "Orchestrator", role: "Coordinator", provider: "Anthropic", model: "claude-opus-5", accountPolicy: "Auto", caps: ["Planning", "Task assignment", "Review coordination"], status: "ready", enabled: true },
  { id: "architect", name: "Architect", role: "Specialist", provider: "Anthropic", model: "claude-opus-5", accountPolicy: "Preferred", caps: ["Architecture", "Technical design", "Dependency planning"], status: "ready", enabled: true },
  { id: "backend", name: "Backend Developer", role: "Worker", provider: "OpenAI", model: "codex-1", accountPolicy: "Auto", caps: ["Code generation", "API implementation"], status: "running", enabled: true },
  { id: "frontend", name: "Frontend Developer", role: "Worker", provider: "OpenAI", model: "codex-1", accountPolicy: "Auto", caps: ["UI implementation", "React", "CSS"], status: "running", enabled: true },
  { id: "reviewer", name: "Reviewer", role: "Reviewer", provider: "Anthropic", model: "claude-sonnet-5", accountPolicy: "Auto", caps: ["Code review", "Best practices"], status: "ready", enabled: true },
  { id: "tester", name: "Tester", role: "Reviewer", provider: "Google", model: "gemini-2.0-flash", accountPolicy: "Pinned", caps: ["Security analysis", "OWASP", "Test coverage"], status: "disabled", enabled: false },
]

const roleStyle: Record<string, string> = {
  Coordinator: "text-accent bg-accent-muted",
  Specialist: "text-info bg-info-muted",
  Worker: "text-ok bg-ok-muted",
  Reviewer: "text-warn bg-warn-muted",
}

function Toggle({ on, onClick }: { on: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-8 h-[18px] rounded-full p-0.5 transition-colors shrink-0 ${on ? "bg-accent" : "bg-elevated"}`}
    >
      <span className={`block w-3.5 h-3.5 rounded-full bg-white transition-transform ${on ? "translate-x-[14px]" : ""}`} />
    </button>
  )
}

export default function ProjectAgentsView() {
  const [agents, setAgents] = useState(INITIAL)

  const toggle = (id: string) =>
    setAgents((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, enabled: !a.enabled, status: !a.enabled ? "ready" : "disabled" } : a
      )
    )

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold text-fore">Agents</h2>
          <p className="text-xs text-faint mt-0.5">
            Scoped to PMS · {agents.filter((a) => a.enabled).length} of {agents.length} enabled
          </p>
        </div>
        <button className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:opacity-90 transition-opacity">
          + Add Agent
        </button>
      </div>

      <div className="space-y-2">
        {agents.map((a) => (
          <div
            key={a.id}
            className={`rounded-xl border bg-surface p-4 transition-colors group ${
              a.enabled ? "border-line" : "border-line opacity-55"
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                a.status === "running" ? "bg-ok animate-pulse" : a.status === "disabled" ? "bg-faint" : "bg-dim"
              }`} />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-fore">{a.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${roleStyle[a.role]}`}>{a.role}</span>
                  {a.status === "running" && <span className="text-[10px] text-ok">Running</span>}
                  {a.status === "disabled" && <span className="text-[10px] text-faint">Disabled</span>}
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {a.caps.map((c) => (
                    <span key={c} className="text-[10px] text-faint bg-elevated px-1.5 py-0.5 rounded">{c}</span>
                  ))}
                </div>
                <div className="flex items-center gap-4 text-[11px] text-faint">
                  <span>Provider <span className="text-dim">{a.provider}</span></span>
                  <span>Model <span className="text-dim font-mono">{a.model}</span></span>
                  <span>Account <span className="text-dim">{a.accountPolicy}</span></span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="px-2.5 py-1 text-[10px] text-dim hover:text-fore border border-line hover:bg-hover rounded-md transition-colors">Edit</button>
                  <button className="px-2.5 py-1 text-[10px] text-err border border-err-muted hover:bg-err hover:text-white rounded-md transition-colors">Remove</button>
                </div>
                <Toggle on={a.enabled} onClick={(e) => { e.stopPropagation(); toggle(a.id) }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
