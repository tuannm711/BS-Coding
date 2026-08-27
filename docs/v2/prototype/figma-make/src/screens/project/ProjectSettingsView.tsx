import { useState } from "react"

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`w-9 h-5 rounded-full p-0.5 transition-colors shrink-0 ${on ? "bg-accent" : "bg-elevated"}`}>
      <span className={`block w-4 h-4 rounded-full bg-white transition-transform ${on ? "translate-x-4" : ""}`} />
    </button>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[10px] font-semibold text-faint uppercase tracking-widest mb-3">{title}</h3>
      <div className="bg-surface border border-line rounded-xl divide-y divide-line">{children}</div>
    </section>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 px-5 py-3.5">
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-fore">{label}</div>
        {hint && <div className="text-[11px] text-faint mt-0.5">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

const input = "bg-elevated border border-line rounded-lg px-3 py-1.5 text-xs text-fore focus:outline-none focus:border-[#3a3a44]"
const select = "bg-elevated border border-line rounded-lg px-3 py-1.5 text-xs text-dim focus:outline-none focus:border-[#3a3a44]"

export default function ProjectSettingsView() {
  const [worktree, setWorktree] = useState(true)
  const [autoBranch, setAutoBranch] = useState(true)
  const [includeInstructions, setIncludeInstructions] = useState(true)
  const [editInstr, setEditInstr] = useState(false)

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-base font-semibold text-fore">Project Settings</h2>
        <p className="text-xs text-faint mt-0.5">PMS — project-scoped configuration</p>
      </div>

      <Section title="General">
        <Row label="Project name">
          <input defaultValue="PMS" className={`${input} w-52`} />
        </Row>
        <Row label="Project path">
          <input defaultValue="D:\Projects\PMS" className={`${input} w-52 font-mono`} />
        </Row>
        <Row label="Default branch">
          <input defaultValue="main" className={`${input} w-52 font-mono`} />
        </Row>
      </Section>

      <Section title="Instructions">
        <Row label="AGENTS.md location" hint="Repository root — auto-detected">
          <span className="text-xs font-mono text-dim">./AGENTS.md</span>
        </Row>
        <div className="px-5 py-3.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-fore">Project instructions</span>
            <button
              onClick={() => setEditInstr(!editInstr)}
              className="px-2.5 py-1 text-[10px] text-dim hover:text-fore border border-line hover:bg-hover rounded-md transition-colors"
            >
              {editInstr ? "Done" : "Edit instructions"}
            </button>
          </div>
          {editInstr ? (
            <textarea
              rows={5}
              defaultValue={"Use PostgreSQL for all data storage. Authentication must use the existing session architecture. Never store OAuth tokens in plaintext.\n\nFollow REST conventions. TypeScript strict mode required. 80% test coverage minimum."}
              className="w-full bg-elevated border border-line rounded-lg px-3 py-2 text-xs text-fore leading-relaxed focus:outline-none focus:border-[#3a3a44] resize-none"
            />
          ) : (
            <div className="bg-elevated border border-line rounded-lg px-3 py-2.5 text-[11px] text-dim leading-relaxed">
              Use PostgreSQL for all data storage. Authentication must use the existing session architecture. Never store OAuth tokens in plaintext. Follow REST conventions. TypeScript strict mode required. 80% test coverage minimum.
            </div>
          )}
        </div>
      </Section>

      <Section title="Work defaults">
        <Row label="Default agent / team">
          <select className={`${select} w-52`} defaultValue="Full-Stack Team">
            <option>Full-Stack Team</option>
            <option>Backend Developer</option>
            <option>Review Team</option>
          </select>
        </Row>
        <Row label="Default workflow">
          <select className={`${select} w-52`} defaultValue="Plan → Execute → Review">
            <option>Plan → Execute → Review</option>
            <option>Execute → Review</option>
            <option>Plan only</option>
          </select>
        </Row>
        <Row label="Default review policy">
          <select className={`${select} w-52`} defaultValue="Mechanical + AI">
            <option>Mechanical + AI</option>
            <option>Mechanical only</option>
            <option>None</option>
          </select>
        </Row>
        <Row label="Runtime switching policy" hint="Allow agents to switch providers mid-session">
          <select className={`${select} w-52`} defaultValue="Health-aware">
            <option>Health-aware</option>
            <option>Manual only</option>
            <option>Locked</option>
          </select>
        </Row>
      </Section>

      <Section title="Git">
        <Row label="Default branch">
          <input defaultValue="main" className={`${input} w-52 font-mono`} />
        </Row>
        <Row label="Worktree isolation" hint="Run each session in an isolated git worktree">
          <Toggle on={worktree} onClick={() => setWorktree(!worktree)} />
        </Row>
        <Row label="Auto-create task branches" hint="Create a branch per task automatically">
          <Toggle on={autoBranch} onClick={() => setAutoBranch(!autoBranch)} />
        </Row>
      </Section>

      <Section title="Context">
        <Row label="Default context strategy">
          <select className={`${select} w-52`} defaultValue="Adaptive (summarize)">
            <option>Adaptive (summarize)</option>
            <option>Full history</option>
            <option>Recent window</option>
          </select>
        </Row>
        <Row label="Include project instructions" hint="Prepend AGENTS.md to agent context">
          <Toggle on={includeInstructions} onClick={() => setIncludeInstructions(!includeInstructions)} />
        </Row>
        <Row label="Context file exclusions" hint="Glob patterns excluded from context">
          <input defaultValue="node_modules/**, dist/**, *.lock" className={`${input} w-52 font-mono`} />
        </Row>
      </Section>

      {/* Danger zone */}
      <section>
        <h3 className="text-[10px] font-semibold text-err uppercase tracking-widest mb-3">Danger Zone</h3>
        <div className="bg-surface border border-err-muted rounded-xl divide-y divide-line">
          <div className="flex items-center gap-4 px-5 py-3.5">
            <div className="flex-1">
              <div className="text-xs font-medium text-fore">Reset project configuration</div>
              <div className="text-[11px] text-faint mt-0.5">Restore agents, skills, and settings to defaults</div>
            </div>
            <button className="px-3 py-1.5 text-xs text-err border border-err-muted hover:bg-err hover:text-white rounded-lg transition-colors shrink-0">Reset</button>
          </div>
          <div className="flex items-center gap-4 px-5 py-3.5">
            <div className="flex-1">
              <div className="text-xs font-medium text-fore">Remove project from BS Coding</div>
              <div className="text-[11px] text-faint mt-0.5">Detach the workspace — files on disk are untouched</div>
            </div>
            <button className="px-3 py-1.5 text-xs text-white bg-err hover:opacity-90 rounded-lg transition-opacity shrink-0">Remove project</button>
          </div>
        </div>
      </section>
    </div>
  )
}
