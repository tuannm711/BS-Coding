import { useState } from "react"

interface Skill {
  id: string
  name: string
  description: string
  source: "Built-in" | "Marketplace" | "Project"
  version: string
  enabled: boolean
  group: "enabled" | "available" | "project"
  instructions: string
}

const INITIAL: Skill[] = [
  { id: "planning", name: "planning", description: "Break goals into structured, dependency-aware task plans.", source: "Built-in", version: "1.4.0", enabled: true, group: "enabled", instructions: "When invoked, decompose the stated goal into a hierarchy of epics, tasks, and subtasks. Identify dependencies between tasks and produce an execution order. Never begin implementation before the plan is approved." },
  { id: "architecture", name: "architecture", description: "Analyze system structure and propose technical designs.", source: "Built-in", version: "1.2.1", enabled: true, group: "enabled", instructions: "Inspect existing modules before proposing changes. Prefer designs that reuse current abstractions. Document trade-offs and surface risks explicitly." },
  { id: "coding", name: "coding", description: "Implement changes matching existing code conventions.", source: "Built-in", version: "2.0.3", enabled: true, group: "enabled", instructions: "Match the surrounding code style, naming, and idioms. Write focused edits; avoid unrelated refactors. Run the relevant tests after each change." },
  { id: "code-review", name: "code-review", description: "Review diffs for correctness, style, and regressions.", source: "Built-in", version: "1.6.0", enabled: true, group: "enabled", instructions: "Review changed code for correctness, reuse, and efficiency. Rank findings by severity. Verify each finding against a concrete failure scenario before reporting." },
  { id: "security-review", name: "security-review", description: "Audit code for vulnerabilities and unsafe patterns.", source: "Marketplace", version: "0.9.4", enabled: false, group: "available", instructions: "Scan for injection, broken auth, secret exposure, and insecure defaults. Map findings to OWASP categories. Never suggest evasion techniques." },
  { id: "frontend-design", name: "frontend-design", description: "Produce polished, accessible UI following the design system.", source: "Marketplace", version: "1.1.0", enabled: false, group: "available", instructions: "Reuse existing design tokens and components. Ensure contrast and keyboard accessibility. Commit to a clear aesthetic stance." },
  { id: "systematic-debugging", name: "systematic-debugging", description: "Isolate root causes with reproducible hypotheses.", source: "Marketplace", version: "1.0.2", enabled: false, group: "available", instructions: "Reproduce the failure first. Form a hypothesis, add a probe, and verify before fixing. Keep changes minimal until the cause is confirmed." },
  { id: "tdd", name: "test-driven-development", description: "Write failing tests before implementation.", source: "Project", version: "0.3.0", enabled: true, group: "project", instructions: "Write a failing test that captures the requirement. Implement the minimum code to pass. Refactor with the test suite green. Target 80% coverage per project policy." },
]

const sourceStyle: Record<string, string> = {
  "Built-in": "bg-elevated text-dim",
  Marketplace: "bg-info-muted text-info",
  Project: "bg-accent-muted text-accent",
}

function AddSkillModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-[520px] bg-surface border border-line rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-line flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fore">Add Custom Skill</h2>
          <button onClick={onClose} className="text-faint hover:text-fore transition-colors text-lg leading-none">×</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-[10px] font-semibold text-faint uppercase tracking-widest mb-1.5">Name</label>
            <input placeholder="my-skill" className="w-full bg-elevated border border-line rounded-lg px-3 py-2 text-xs text-fore placeholder:text-faint focus:outline-none focus:border-[#3a3a44]" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-faint uppercase tracking-widest mb-1.5">Description</label>
            <input placeholder="What this skill does" className="w-full bg-elevated border border-line rounded-lg px-3 py-2 text-xs text-fore placeholder:text-faint focus:outline-none focus:border-[#3a3a44]" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-faint uppercase tracking-widest mb-1.5">SKILL.md content</label>
            <textarea rows={5} placeholder="# Instructions&#10;&#10;When invoked, …" className="w-full bg-elevated border border-line rounded-lg px-3 py-2 text-xs text-fore font-mono placeholder:text-faint focus:outline-none focus:border-[#3a3a44] resize-none" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-faint uppercase tracking-widest mb-1.5">Scope</label>
            <div className="text-xs text-dim bg-elevated border border-line rounded-lg px-3 py-2">Project — PMS</div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-line flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-dim hover:text-fore border border-line hover:bg-hover rounded-lg transition-colors">Cancel</button>
          <button onClick={onClose} className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:opacity-90 transition-opacity">Save</button>
        </div>
      </div>
    </div>
  )
}

function SkillRow({ skill, onToggle, onView }: { skill: Skill; onToggle: () => void; onView: () => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-line last:border-0 group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-mono font-medium text-fore">{skill.name}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${sourceStyle[skill.source]}`}>{skill.source}</span>
          <span className="text-[10px] text-faint font-mono">v{skill.version}</span>
        </div>
        <div className="text-[11px] text-faint truncate">{skill.description}</div>
      </div>
      <button
        onClick={onView}
        className="px-2.5 py-1 text-[10px] text-dim hover:text-fore border border-line hover:bg-hover rounded-md transition-colors opacity-0 group-hover:opacity-100"
      >
        View instructions
      </button>
      <button
        onClick={onToggle}
        className={`px-2.5 py-1 text-[10px] rounded-md transition-colors font-medium shrink-0 ${
          skill.enabled
            ? "text-dim hover:text-fore border border-line hover:bg-hover"
            : "bg-accent text-white hover:opacity-90"
        }`}
      >
        {skill.enabled ? "Disable" : "Enable"}
      </button>
    </div>
  )
}

export default function SkillsView() {
  const [skills, setSkills] = useState(INITIAL)
  const [modal, setModal] = useState(false)
  const [detail, setDetail] = useState<Skill | null>(null)

  const toggle = (id: string) => setSkills((p) => p.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)))

  const enabled = skills.filter((s) => s.enabled)
  const available = skills.filter((s) => !s.enabled && s.source !== "Project")
  const project = skills.filter((s) => s.source === "Project")

  const Section = ({ title, list }: { title: string; list: Skill[] }) => (
    <section>
      <h3 className="text-[10px] font-semibold text-faint uppercase tracking-widest mb-3">{title} · {list.length}</h3>
      <div className="bg-surface border border-line rounded-xl overflow-hidden">
        {list.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-faint">Nothing here yet.</div>
        ) : (
          list.map((s) => <SkillRow key={s.id} skill={s} onToggle={() => toggle(s.id)} onView={() => setDetail(s)} />)
        )}
      </div>
    </section>
  )

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-fore">Skills</h2>
          <p className="text-xs text-faint mt-0.5">{enabled.length} active in PMS</p>
        </div>
        <button onClick={() => setModal(true)} className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:opacity-90 transition-opacity">
          + Add custom skill
        </button>
      </div>

      <Section title="Enabled Skills" list={enabled} />
      <Section title="Available Skills" list={available} />
      <Section title="Project Skills" list={project} />

      {modal && <AddSkillModal onClose={() => setModal(false)} />}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDetail(null)}>
          <div className="w-[560px] bg-surface border border-line rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-line flex items-center gap-2">
              <h2 className="text-sm font-mono font-semibold text-fore">{detail.name}</h2>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${sourceStyle[detail.source]}`}>{detail.source}</span>
              <span className="text-[10px] text-faint font-mono">v{detail.version}</span>
              <div className="flex-1" />
              <button onClick={() => setDetail(null)} className="text-faint hover:text-fore transition-colors text-lg leading-none">×</button>
            </div>
            <div className="px-6 py-5">
              <div className="text-[10px] font-semibold text-faint uppercase tracking-widest mb-2">SKILL.md</div>
              <pre className="bg-elevated border border-line rounded-lg p-4 text-xs text-dim font-mono leading-relaxed whitespace-pre-wrap">{detail.instructions}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
