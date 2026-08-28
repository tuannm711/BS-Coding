import { useState } from "react"
import WorkSessionsView from "./project/WorkSessionsView"
import FilesView from "./project/FilesView"
import GitView from "./project/GitView"
import ProjectAgentsView from "./project/ProjectAgentsView"
import SkillsView from "./project/SkillsView"
import McpView from "./project/McpView"
import ProjectSettingsView from "./project/ProjectSettingsView"

interface Props {
  onOpenWork: () => void
}

const PROJECT_TABS = [
  "Overview",
  "Work Sessions",
  "Files",
  "Git",
  "Agents",
  "Skills",
  "MCP",
  "Project Settings",
]

const agents = [
  { name: "Architect", role: "Specialist", runtime: "Claude Opus", status: "ready" },
  { name: "Backend Developer", role: "Worker", runtime: "Codex", status: "running" },
  { name: "Frontend Developer", role: "Worker", runtime: "Codex", status: "running" },
  { name: "Reviewer", role: "Reviewer", runtime: "Claude", status: "ready" },
  { name: "Tester", role: "Reviewer", runtime: "Gemini", status: "ready" },
]

function ProjectOverview({ onOpenWork, onViewSessions }: { onOpenWork: () => void; onViewSessions: () => void }) {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 space-y-5">
          {/* Active sessions */}
          <section>
            <h3 className="text-[10px] font-semibold text-faint uppercase tracking-widest mb-3">
              Active Work Sessions
            </h3>
            <div className="space-y-2">
              {[
                { title: "Google OAuth Login", status: "Executing", progress: 63, tasks: "5/8", agents: 3, updated: "2 min ago" },
                { title: "API Performance Audit", status: "Planning", progress: 15, tasks: "1/6", agents: 1, updated: "1 hr ago" },
              ].map((s) => (
                <div key={s.title} className="bg-surface rounded-xl border border-line p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-fore">{s.title}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          s.status === "Executing" ? "bg-ok-muted text-ok" : "bg-info-muted text-info"
                        }`}
                      >
                        {s.status}
                      </span>
                    </div>
                    <button
                      onClick={s.title === "Google OAuth Login" ? onOpenWork : undefined}
                      className="text-xs text-dim hover:text-accent transition-colors"
                    >
                      Open
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex-1 h-1 bg-elevated rounded-full overflow-hidden">
                      <div className="h-full bg-accent rounded-full" style={{ width: `${s.progress}%` }} />
                    </div>
                    <span className="text-[11px] text-faint font-mono">{s.progress}%</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-faint">
                    <span>{s.tasks} tasks</span>
                    <span>{s.agents} agents</span>
                    <span className="ml-auto">{s.updated}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Git status */}
          <section>
            <h3 className="text-[10px] font-semibold text-faint uppercase tracking-widest mb-3">
              Git Status
            </h3>
            <div className="bg-surface rounded-xl border border-line p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-mono text-info bg-info-muted px-2 py-0.5 rounded">
                  feature/google-oauth
                </span>
                <span className="text-xs text-faint">12 commits ahead of main</span>
              </div>
              <div className="space-y-1.5 mb-3">
                {[
                  "src/auth/google.ts",
                  "src/routes/auth.ts",
                  "src/auth/session.ts",
                  "tests/auth/google.test.ts",
                ].map((f) => (
                  <div key={f} className="flex items-center gap-2">
                    <span className="text-ok text-xs font-mono w-3">M</span>
                    <span className="text-xs font-mono text-dim">{f}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-3 border-t border-line">
                <button className="text-xs px-3 py-1.5 bg-elevated hover:bg-hover text-dim hover:text-fore border border-line rounded-lg transition-colors">
                  View diff
                </button>
                <button className="text-xs px-3 py-1.5 bg-elevated hover:bg-hover text-dim hover:text-fore border border-line rounded-lg transition-colors">
                  Commit
                </button>
              </div>
            </div>
          </section>

          {/* Project instructions */}
          <section>
            <h3 className="text-[10px] font-semibold text-faint uppercase tracking-widest mb-3">
              Project Instructions
            </h3>
            <div className="bg-surface rounded-xl border border-line p-4 text-xs text-dim leading-relaxed space-y-2">
              <p>
                Use PostgreSQL for all data storage. Authentication must use the existing session
                architecture. Never store OAuth tokens in plaintext.
              </p>
              <p>
                Follow REST conventions for API routes. TypeScript strict mode is required. All new
                code must have unit tests with at least 80% coverage.
              </p>
            </div>
          </section>
        </div>

        {/* Right: agents */}
        <div className="space-y-5">
          <section>
            <h3 className="text-[10px] font-semibold text-faint uppercase tracking-widest mb-3">
              Project Agents
            </h3>
            <div className="bg-surface rounded-xl border border-line overflow-hidden">
              {agents.map((a, i) => (
                <div
                  key={a.name}
                  className={`flex items-center gap-3 px-4 py-3 group ${
                    i < agents.length - 1 ? "border-b border-line" : ""
                  }`}
                >
                  <div
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      a.status === "running" ? "bg-ok" : "bg-faint"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-fore">{a.name}</div>
                    <div className="text-[10px] text-faint">{a.role}</div>
                  </div>
                  <span className="text-[10px] text-faint font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                    {a.runtime}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-[10px] font-semibold text-faint uppercase tracking-widest mb-3">
              Quick Actions
            </h3>
            <div className="space-y-1.5">
              <button
                onClick={onOpenWork}
                className="w-full px-3 py-2.5 text-xs font-medium bg-accent text-white rounded-lg hover:opacity-90 transition-opacity text-left"
              >
                + New Work Session
              </button>
              <button
                onClick={onViewSessions}
                className="w-full px-3 py-2.5 text-xs text-dim hover:text-fore border border-line hover:bg-hover rounded-lg transition-colors text-left"
              >
                View all work sessions
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default function ProjectScreen({ onOpenWork }: Props) {
  const [tab, setTab] = useState("Overview")

  return (
    <div className="h-full flex flex-col bg-base">
      {/* Header */}
      <div className="bg-surface border-b border-line px-6 shrink-0">
        <div className="flex items-center gap-3 py-4">
          <div className="w-8 h-8 rounded-lg bg-elevated flex items-center justify-center text-sm font-bold text-fore">
            PM
          </div>
          <div>
            <h1 className="text-base font-semibold text-fore">PMS</h1>
            <div className="flex items-center gap-2 text-xs text-faint">
              <span className="font-mono">D:\Projects\PMS</span>
              <span>·</span>
              <span className="font-mono text-info">feature/google-oauth</span>
            </div>
          </div>
          <div className="flex-1" />
          <button
            onClick={onOpenWork}
            className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:opacity-90 transition-opacity"
          >
            Open Work Session
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center -mb-px">
          {PROJECT_TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                tab === t
                  ? "border-accent text-accent"
                  : "border-transparent text-faint hover:text-dim"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {tab === "Files" || tab === "Git" || tab === "MCP" ? (
        <div className="flex-1 min-h-0 p-6 overflow-hidden">
          {tab === "Files" && <FilesView />}
          {tab === "Git" && <GitView />}
          {tab === "MCP" && <McpView />}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6">
          {tab === "Overview" && <ProjectOverview onOpenWork={onOpenWork} onViewSessions={() => setTab("Work Sessions")} />}
          {tab === "Work Sessions" && <WorkSessionsView onOpenWork={onOpenWork} />}
          {tab === "Agents" && <ProjectAgentsView />}
          {tab === "Skills" && <SkillsView />}
          {tab === "Project Settings" && <ProjectSettingsView />}
        </div>
      )}
    </div>
  )
}
