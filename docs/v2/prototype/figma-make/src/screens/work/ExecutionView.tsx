import { useState } from "react"

type NodeStatus = "done" | "running" | "queued"

interface ExecNodeData {
  id: string
  label: string
  agent: string
  task: string
  status: NodeStatus
  elapsed: string
}

const NODES: ExecNodeData[] = [
  { id: "arch", label: "Architect", agent: "Architect", task: "T01-T03 Analysis & Design", status: "done", elapsed: "12:30" },
  { id: "backend", label: "Backend Dev", agent: "Backend Developer", task: "T04 OAuth backend", status: "running", elapsed: "08:42" },
  { id: "frontend", label: "Frontend Dev", agent: "Frontend Developer", task: "T05 Login UI", status: "running", elapsed: "05:18" },
  { id: "integration", label: "Integration", agent: "Backend Developer", task: "T06 Integration", status: "queued", elapsed: "--:--" },
  { id: "reviewer", label: "Code Reviewer", agent: "Reviewer", task: "T07 Code review", status: "queued", elapsed: "--:--" },
  { id: "security", label: "Security Audit", agent: "Tester", task: "T07 Security review", status: "queued", elapsed: "--:--" },
  { id: "final", label: "Final Verify", agent: "Orchestrator", task: "T08 Verification", status: "queued", elapsed: "--:--" },
]

const statusConfig: Record<NodeStatus, { border: string; bg: string; text: string; dot: string }> = {
  done: { border: "border-ok", bg: "bg-ok-muted", text: "text-ok", dot: "bg-ok" },
  running: { border: "border-accent", bg: "bg-accent-muted", text: "text-accent", dot: "bg-accent" },
  queued: { border: "border-line", bg: "bg-elevated", text: "text-faint", dot: "bg-faint" },
}

function GraphNode({ node, onClick }: { node: ExecNodeData; onClick: () => void }) {
  const cfg = statusConfig[node.status]
  return (
    <button
      onClick={onClick}
      className={`border rounded-xl px-5 py-3 text-center w-44 transition-opacity hover:opacity-90 ${cfg.border} ${cfg.bg}`}
    >
      <div className="flex items-center justify-center gap-1.5 mb-0.5">
        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot} ${node.status === "running" ? "animate-pulse" : ""}`} />
        <div className={`text-xs font-semibold ${cfg.text}`}>{node.label}</div>
      </div>
      <div className="text-[10px] text-faint mt-0.5">{node.task}</div>
      <div className="text-[10px] font-mono text-faint mt-1">{node.elapsed}</div>
    </button>
  )
}

function Arrow() {
  return (
    <div className="flex flex-col items-center my-1">
      <div className="w-px h-4 bg-line" />
      <svg width="8" height="6" viewBox="0 0 8 6" className="text-line" fill="currentColor">
        <polygon points="0,0 8,0 4,6" />
      </svg>
    </div>
  )
}

function ParallelArrows() {
  return (
    <div className="flex flex-col items-center my-1">
      <div className="flex items-start gap-[176px]">
        <div className="flex flex-col items-center">
          <div className="w-px h-3 bg-line" />
          <svg width="8" height="6" viewBox="0 0 8 6" className="text-line" fill="currentColor">
            <polygon points="0,0 8,0 4,6" />
          </svg>
        </div>
        <div className="flex flex-col items-center">
          <div className="w-px h-3 bg-line" />
          <svg width="8" height="6" viewBox="0 0 8 6" className="text-line" fill="currentColor">
            <polygon points="0,0 8,0 4,6" />
          </svg>
        </div>
      </div>
    </div>
  )
}

function MergeArrow() {
  return (
    <div className="flex flex-col items-center my-1">
      <div className="w-px h-3 bg-line" />
      <svg width="8" height="6" viewBox="0 0 8 6" className="text-line" fill="currentColor">
        <polygon points="0,0 8,0 4,6" />
      </svg>
    </div>
  )
}

export default function ExecutionView() {
  const [view, setView] = useState<"graph" | "list">("graph")
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <div className="h-full flex flex-col">
      {/* Summary */}
      <div className="flex items-center gap-6 px-6 py-4 border-b border-line bg-surface shrink-0">
        {[
          { label: "Running", value: 3, color: "text-accent" },
          { label: "Waiting", value: 2, color: "text-faint" },
          { label: "Complete", value: 5, color: "text-ok" },
          { label: "Review pending", value: 1, color: "text-warn" },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <span className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</span>
            <span className="text-xs text-faint">{s.label}</span>
          </div>
        ))}
        <div className="flex-1" />
        <div className="flex items-center bg-elevated rounded-lg p-0.5 gap-0.5">
          {(["graph", "list"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1 text-xs rounded-md capitalize transition-colors ${
                view === v ? "bg-hover text-fore" : "text-faint hover:text-dim"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        {view === "graph" ? (
          <div className="flex flex-col items-center">
            {/* Architect */}
            <GraphNode node={NODES[0]} onClick={() => setSelected(NODES[0].id)} />
            <Arrow />

            {/* Branch to parallel */}
            <div className="flex items-start">
              <div className="flex flex-col items-end mr-0">
                <div className="flex items-center">
                  <div className="h-px w-[89px] bg-line" />
                  <div className="flex flex-col items-center">
                    <div className="w-px h-3 bg-line" />
                    <svg width="8" height="6" viewBox="0 0 8 6" className="text-line" fill="currentColor">
                      <polygon points="0,0 8,0 4,6" />
                    </svg>
                  </div>
                </div>
              </div>
              <div className="w-px h-3 bg-line mx-0 mt-0" />
              <div className="flex items-center">
                <div className="flex flex-col items-center">
                  <div className="w-px h-3 bg-line" />
                  <svg width="8" height="6" viewBox="0 0 8 6" className="text-line" fill="currentColor">
                    <polygon points="0,0 8,0 4,6" />
                  </svg>
                </div>
                <div className="h-px w-[89px] bg-line" />
              </div>
            </div>

            {/* Parallel nodes row */}
            <div className="flex items-start gap-8">
              <GraphNode node={NODES[1]} onClick={() => setSelected(NODES[1].id)} />
              <GraphNode node={NODES[2]} onClick={() => setSelected(NODES[2].id)} />
            </div>

            {/* Merge and continue */}
            <div className="flex items-start gap-8">
              <div className="flex flex-col items-center">
                <div className="w-px h-3 bg-line" />
              </div>
              <div className="flex flex-col items-center">
                <div className="w-px h-3 bg-line" />
              </div>
            </div>
            <div className="flex items-center">
              <div className="h-px w-[89px] bg-line" />
              <div className="flex flex-col items-center">
                <div className="w-px h-3 bg-line" />
                <svg width="8" height="6" viewBox="0 0 8 6" className="text-line" fill="currentColor">
                  <polygon points="0,0 8,0 4,6" />
                </svg>
              </div>
              <div className="h-px w-[89px] bg-line" />
            </div>

            <GraphNode node={NODES[3]} onClick={() => setSelected(NODES[3].id)} />
            <Arrow />

            {/* Parallel reviewer + security */}
            <div className="flex items-center">
              <div className="h-px w-[89px] bg-line" />
              <div className="flex flex-col items-center">
                <div className="w-px h-3 bg-line" />
                <svg width="8" height="6" viewBox="0 0 8 6" className="text-line" fill="currentColor">
                  <polygon points="0,0 8,0 4,6" />
                </svg>
              </div>
              <div className="h-px w-[89px] bg-line" />
            </div>
            <div className="flex items-start gap-8">
              <GraphNode node={NODES[4]} onClick={() => setSelected(NODES[4].id)} />
              <GraphNode node={NODES[5]} onClick={() => setSelected(NODES[5].id)} />
            </div>
            <div className="flex items-center">
              <div className="h-px w-[89px] bg-line" />
              <div className="flex flex-col items-center">
                <div className="w-px h-3 bg-line" />
                <svg width="8" height="6" viewBox="0 0 8 6" className="text-line" fill="currentColor">
                  <polygon points="0,0 8,0 4,6" />
                </svg>
              </div>
              <div className="h-px w-[89px] bg-line" />
            </div>

            <GraphNode node={NODES[6]} onClick={() => setSelected(NODES[6].id)} />
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-2">
            {NODES.map((node) => {
              const cfg = statusConfig[node.status]
              return (
                <button
                  key={node.id}
                  onClick={() => setSelected(selected === node.id ? null : node.id)}
                  className={`w-full flex items-center gap-4 bg-surface border rounded-xl px-4 py-3 text-left transition-colors hover:border-[#3a3a44] ${cfg.border}`}
                >
                  <div className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot} ${node.status === "running" ? "animate-pulse" : ""}`} />
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium ${cfg.text}`}>{node.label}</div>
                    <div className="text-xs text-faint">{node.task} · {node.agent}</div>
                  </div>
                  <span className="text-xs font-mono text-faint">{node.elapsed}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
