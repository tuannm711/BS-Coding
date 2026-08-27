import { useState } from "react"

type Section = "Changes" | "Commits" | "Branches"

interface GitFile {
  path: string
  state: "staged" | "unstaged" | "untracked"
  status: "M" | "A" | "U"
  additions: number
  deletions: number
}

const FILES: GitFile[] = [
  { path: "src/auth/google.ts", state: "staged", status: "M", additions: 87, deletions: 12 },
  { path: "src/auth/state.ts", state: "staged", status: "A", additions: 24, deletions: 0 },
  { path: "src/routes/auth.ts", state: "unstaged", status: "M", additions: 43, deletions: 8 },
  { path: "src/auth/session.ts", state: "unstaged", status: "M", additions: 28, deletions: 4 },
  { path: "tests/google.test.ts", state: "untracked", status: "U", additions: 25, deletions: 0 },
]

type DiffLine = { lineNo: number; type: "added" | "removed" | "context"; content: string }

const DIFF: Record<string, DiffLine[]> = {
  "src/auth/google.ts": [
    { lineNo: 3, type: "context", content: "" },
    { lineNo: 4, type: "added", content: "import bcrypt from 'bcrypt'" },
    { lineNo: 5, type: "added", content: "import { validateState } from './state'" },
    { lineNo: 6, type: "context", content: "" },
    { lineNo: 9, type: "removed", content: '  callbackURL: "/auth/google/callback",' },
    { lineNo: 10, type: "added", content: "  callbackURL: process.env.GOOGLE_CALLBACK_URL," },
    { lineNo: 12, type: "removed", content: "  const token = accessToken" },
    { lineNo: 13, type: "added", content: "  const tokenHash = await bcrypt.hash(accessToken, 12)" },
  ],
}

const COMMITS = [
  { hash: "a3f9c21", msg: "Hash OAuth tokens before persisting sessions", author: "Backend Developer", when: "2m ago", ahead: true },
  { hash: "7b2e4d8", msg: "Add CSRF state validation to OAuth flow", author: "Backend Developer", when: "18m ago", ahead: true },
  { hash: "c9d1a05", msg: "Introduce state.ts for OAuth state generation", author: "Architect", when: "24m ago", ahead: true },
  { hash: "e4f7b33", msg: "Scaffold Google OAuth strategy", author: "Backend Developer", when: "1h ago", ahead: true },
  { hash: "1a8c9e2", msg: "Merge session store refactor", author: "Alex Mitchell", when: "yesterday", ahead: false },
]

const BRANCHES = {
  current: "feature/google-oauth",
  local: ["main", "develop", "feature/api-audit"],
  remote: ["origin/main", "origin/develop", "origin/feature/google-oauth"],
}

const stateGroups: { key: GitFile["state"]; label: string }[] = [
  { key: "staged", label: "Staged Changes" },
  { key: "unstaged", label: "Unstaged Changes" },
  { key: "untracked", label: "Untracked Files" },
]

function ChangesSection() {
  const [selected, setSelected] = useState("src/auth/google.ts")
  const [checked, setChecked] = useState<Record<string, boolean>>({ "src/auth/google.ts": true, "src/auth/state.ts": true })
  const [message, setMessage] = useState("")
  const diff = DIFF[selected] ?? DIFF["src/auth/google.ts"]

  return (
    <div className="flex h-full -m-6">
      {/* File list */}
      <div className="w-64 shrink-0 border-r border-line bg-surface flex flex-col">
        <div className="flex-1 overflow-y-auto py-2">
          {stateGroups.map((g) => {
            const items = FILES.filter((f) => f.state === g.key)
            if (items.length === 0) return null
            return (
              <div key={g.key} className="mb-2">
                <div className="px-4 py-1.5 text-[10px] font-semibold text-faint uppercase tracking-wider">
                  {g.label} · {items.length}
                </div>
                {items.map((f) => (
                  <div
                    key={f.path}
                    onClick={() => setSelected(f.path)}
                    className={`flex items-center gap-2 px-4 py-1.5 cursor-pointer transition-colors ${
                      selected === f.path ? "bg-hover" : "hover:bg-hover"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={!!checked[f.path]}
                      onChange={(e) => { e.stopPropagation(); setChecked({ ...checked, [f.path]: e.target.checked }) }}
                      onClick={(e) => e.stopPropagation()}
                      className="accent-[#f47328] w-3 h-3 shrink-0"
                    />
                    <span className={`text-[10px] font-bold w-3 shrink-0 ${
                      f.status === "M" ? "text-warn" : f.status === "A" ? "text-ok" : "text-info"
                    }`}>
                      {f.status}
                    </span>
                    <span className={`text-xs font-mono truncate ${selected === f.path ? "text-fore" : "text-dim"}`}>
                      {f.path.split("/").pop()}
                    </span>
                    <span className="ml-auto flex gap-1 text-[10px] shrink-0">
                      <span className="text-ok">+{f.additions}</span>
                      {f.deletions > 0 && <span className="text-err">-{f.deletions}</span>}
                    </span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>

        <div className="border-t border-line p-3 space-y-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            <button className="px-2 py-1.5 text-[11px] text-dim hover:text-fore border border-line hover:bg-hover rounded-lg transition-colors">Stage</button>
            <button className="px-2 py-1.5 text-[11px] text-dim hover:text-fore border border-line hover:bg-hover rounded-lg transition-colors">Unstage</button>
          </div>
          <button className="w-full px-2 py-1.5 text-[11px] text-err border border-err-muted bg-err-muted hover:bg-err hover:text-white rounded-lg transition-colors">Discard</button>
        </div>
      </div>

      {/* Diff + commit */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center px-5 py-3 border-b border-line bg-surface shrink-0">
          <span className="text-xs font-mono text-dim">{selected}</span>
        </div>
        <div className="flex-1 overflow-auto font-mono text-xs leading-relaxed">
          {diff.map((line, i) => (
            <div
              key={i}
              className={`flex gap-4 px-4 py-0.5 ${
                line.type === "added" ? "bg-ok-muted" : line.type === "removed" ? "bg-err-muted" : "hover:bg-surface"
              }`}
            >
              <span className="text-faint w-8 text-right shrink-0 select-none">{line.lineNo}</span>
              <span className={`shrink-0 w-3 ${line.type === "added" ? "text-ok" : line.type === "removed" ? "text-err" : "text-transparent"}`}>
                {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
              </span>
              <span className={line.type === "added" ? "text-ok" : line.type === "removed" ? "text-err" : "text-dim"}>
                {line.content}
              </span>
            </div>
          ))}
        </div>

        {/* Commit area */}
        <div className="border-t border-line bg-surface p-4 shrink-0 flex items-center gap-3">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Commit message…"
            className="flex-1 bg-elevated border border-line rounded-lg px-3 py-2 text-xs text-fore placeholder:text-faint focus:outline-none focus:border-[#3a3a44]"
          />
          <button
            disabled={!message}
            className="px-4 py-2 text-xs font-medium bg-accent text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            Commit
          </button>
        </div>
      </div>
    </div>
  )
}

function CommitsSection() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-surface border border-line rounded-xl overflow-hidden">
        {COMMITS.map((c, i) => (
          <div key={c.hash} className={`flex items-start gap-3 px-4 py-3 ${i < COMMITS.length - 1 ? "border-b border-line" : ""}`}>
            <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-accent" style={{ opacity: c.ahead ? 1 : 0.3 }} />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-fore">{c.msg}</div>
              <div className="text-[11px] text-faint mt-0.5">{c.author} · {c.when}</div>
            </div>
            <span className="text-[10px] font-mono text-faint bg-elevated px-1.5 py-0.5 rounded shrink-0">{c.hash}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function BranchesSection() {
  const item = (name: string, current = false) => (
    <div key={name} className="flex items-center gap-3 px-4 py-2.5 border-b border-line last:border-0 group">
      <span className={`text-xs font-mono ${current ? "text-info" : "text-dim"}`}>{name}</span>
      {current && <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-info-muted text-info">current</span>}
      <div className="flex-1" />
      <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button className="px-2 py-0.5 text-[10px] text-dim hover:text-fore border border-line hover:bg-hover rounded-md transition-colors">Checkout</button>
        <button className="px-2 py-0.5 text-[10px] text-dim hover:text-fore border border-line hover:bg-hover rounded-md transition-colors">Merge</button>
      </div>
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex justify-end">
        <button className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:opacity-90 transition-opacity">
          + Create branch
        </button>
      </div>
      <section>
        <h3 className="text-[10px] font-semibold text-faint uppercase tracking-widest mb-3">Local branches</h3>
        <div className="bg-surface border border-line rounded-xl overflow-hidden">
          {item(BRANCHES.current, true)}
          {BRANCHES.local.map((b) => item(b))}
        </div>
      </section>
      <section>
        <h3 className="text-[10px] font-semibold text-faint uppercase tracking-widest mb-3">Remote branches</h3>
        <div className="bg-surface border border-line rounded-xl overflow-hidden">
          {BRANCHES.remote.map((b) => item(b))}
        </div>
      </section>
    </div>
  )
}

export default function GitView() {
  const [section, setSection] = useState<Section>("Changes")
  const modified = FILES.length

  return (
    <div className="h-full flex flex-col -m-6">
      {/* Header */}
      <div className="px-6 pt-5 pb-3 border-b border-line bg-surface shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-mono text-info bg-info-muted px-2 py-0.5 rounded">{BRANCHES.current}</span>
          <span className="text-xs text-faint">12 commits ahead of main</span>
          <span className="text-xs text-faint">·</span>
          <span className="text-xs text-faint">{modified} modified files</span>
        </div>
        <div className="flex items-center gap-1">
          {(["Changes", "Commits", "Branches"] as Section[]).map((s) => (
            <button
              key={s}
              onClick={() => setSection(s)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                section === s ? "bg-hover text-fore" : "text-faint hover:text-dim"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className={`flex-1 min-h-0 ${section === "Changes" ? "" : "overflow-y-auto p-6"}`}>
        {section === "Changes" && <div className="h-full p-6"><ChangesSection /></div>}
        {section === "Commits" && <CommitsSection />}
        {section === "Branches" && <BranchesSection />}
      </div>
    </div>
  )
}
