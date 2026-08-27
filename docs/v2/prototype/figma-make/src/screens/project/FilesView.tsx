import { useState } from "react"

interface FileNode {
  name: string
  type: "file" | "folder"
  path: string
  children?: FileNode[]
  git?: "M" | "A" | "U"
  size?: string
  lang?: string
  modified?: string
}

const TREE: FileNode[] = [
  {
    name: "src",
    type: "folder",
    path: "src",
    children: [
      {
        name: "auth",
        type: "folder",
        path: "src/auth",
        children: [
          { name: "google.ts", type: "file", path: "src/auth/google.ts", git: "M", size: "4.2 KB", lang: "TypeScript", modified: "2m ago" },
          { name: "session.ts", type: "file", path: "src/auth/session.ts", git: "M", size: "1.8 KB", lang: "TypeScript", modified: "12m ago" },
          { name: "state.ts", type: "file", path: "src/auth/state.ts", git: "A", size: "0.9 KB", lang: "TypeScript", modified: "18m ago" },
        ],
      },
      {
        name: "routes",
        type: "folder",
        path: "src/routes",
        children: [
          { name: "auth.ts", type: "file", path: "src/routes/auth.ts", git: "M", size: "2.1 KB", lang: "TypeScript", modified: "9m ago" },
          { name: "index.ts", type: "file", path: "src/routes/index.ts", size: "0.6 KB", lang: "TypeScript", modified: "3d ago" },
        ],
      },
      {
        name: "services",
        type: "folder",
        path: "src/services",
        children: [
          { name: "db.ts", type: "file", path: "src/services/db.ts", size: "1.4 KB", lang: "TypeScript", modified: "5d ago" },
          { name: "cache.ts", type: "file", path: "src/services/cache.ts", size: "0.8 KB", lang: "TypeScript", modified: "5d ago" },
        ],
      },
    ],
  },
  {
    name: "tests",
    type: "folder",
    path: "tests",
    children: [
      { name: "google.test.ts", type: "file", path: "tests/google.test.ts", git: "A", size: "1.1 KB", lang: "TypeScript", modified: "16m ago" },
    ],
  },
  { name: "package.json", type: "file", path: "package.json", size: "1.3 KB", lang: "JSON", modified: "1d ago" },
  { name: "AGENTS.md", type: "file", path: "AGENTS.md", size: "2.7 KB", lang: "Markdown", modified: "4d ago" },
]

const PREVIEWS: Record<string, string> = {
  "src/auth/google.ts": `import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { createSession } from './session'
import bcrypt from 'bcrypt'
import { validateState } from './state'

export const googleStrategy = new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  callbackURL: process.env.GOOGLE_CALLBACK_URL,
}, async (accessToken, refreshToken, profile, done) => {
  const tokenHash = await bcrypt.hash(accessToken, 12)
  const session = await createSession({ userId: profile.id, tokenHash })
  return done(null, session)
})`,
  "src/auth/state.ts": `import { randomBytes } from 'crypto'

export function generateState(): string {
  return randomBytes(24).toString('hex')
}

export function validateState(sent: string, stored: string): void {
  if (!sent || sent !== stored) {
    throw new Error('Invalid OAuth state parameter')
  }
}`,
  "AGENTS.md": `# PMS — Agent Instructions

Use PostgreSQL for all data storage. Authentication must use
the existing session architecture. Never store OAuth tokens
in plaintext — hash with bcrypt before persisting.

Follow REST conventions for API routes. TypeScript strict
mode is required. All new code must have unit tests with at
least 80% coverage.`,
  "package.json": `{
  "name": "pms",
  "version": "2.4.0",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "test": "vitest",
    "build": "tsc -p ."
  }
}`,
}

function gitColor(g?: string) {
  if (g === "M") return "text-warn"
  if (g === "A") return "text-ok"
  if (g === "U") return "text-info"
  return "text-transparent"
}

function TreeRow({
  node,
  depth,
  selected,
  onSelect,
}: {
  node: FileNode
  depth: number
  selected: string
  onSelect: (n: FileNode) => void
}) {
  const [open, setOpen] = useState(depth < 2)

  if (node.type === "folder") {
    return (
      <div>
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center gap-1.5 py-1 pr-2 text-xs text-dim hover:text-fore hover:bg-hover transition-colors"
          style={{ paddingLeft: 8 + depth * 14 }}
        >
          <svg
            width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" className={`text-faint shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          >
            <polyline points="3,1.5 6,4.5 3,7.5" />
          </svg>
          <span className="font-medium">{node.name}</span>
        </button>
        {open && node.children?.map((c) => (
          <TreeRow key={c.path} node={c} depth={depth + 1} selected={selected} onSelect={onSelect} />
        ))}
      </div>
    )
  }

  return (
    <button
      onClick={() => onSelect(node)}
      className={`w-full flex items-center gap-1.5 py-1 pr-2 text-xs font-mono transition-colors ${
        selected === node.path ? "bg-hover text-fore" : "text-dim hover:text-fore hover:bg-hover"
      }`}
      style={{ paddingLeft: 22 + depth * 14 }}
    >
      <span className="truncate">{node.name}</span>
      {node.git && <span className={`ml-auto text-[10px] font-bold ${gitColor(node.git)}`}>{node.git}</span>}
    </button>
  )
}

export default function FilesView() {
  const [selected, setSelected] = useState<FileNode>(TREE[0].children![0].children![0])
  const [treeQuery, setTreeQuery] = useState("")
  const preview = PREVIEWS[selected.path] ?? "// No preview available for this file."

  return (
    <div className="h-full flex -m-6">
      {/* Tree */}
      <div className="w-64 shrink-0 border-r border-line bg-surface flex flex-col">
        <div className="p-3 border-b border-line">
          <input
            value={treeQuery}
            onChange={(e) => setTreeQuery(e.target.value)}
            placeholder="Search files…"
            className="w-full bg-elevated border border-line rounded-lg px-3 py-1.5 text-xs text-fore placeholder:text-faint focus:outline-none focus:border-[#3a3a44]"
          />
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {TREE.map((n) => (
            <TreeRow key={n.path} node={n} depth={0} selected={selected.path} onSelect={setSelected} />
          ))}
        </div>
      </div>

      {/* Preview */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-line bg-surface shrink-0">
          <span className="text-xs font-mono text-dim">{selected.path}</span>
          {selected.git && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
              selected.git === "M" ? "bg-warn-muted text-warn" : selected.git === "A" ? "bg-ok-muted text-ok" : "bg-info-muted text-info"
            }`}>
              {selected.git === "M" ? "Modified" : selected.git === "A" ? "Added" : "Untracked"}
            </span>
          )}
          <div className="flex-1" />
          <button className="text-xs px-2.5 py-1 bg-elevated hover:bg-hover text-dim hover:text-fore border border-line rounded-lg transition-colors">
            Open in editor
          </button>
          <button className="text-xs px-2.5 py-1 bg-elevated hover:bg-hover text-dim hover:text-fore border border-line rounded-lg transition-colors">
            Copy path
          </button>
          <button className="text-xs px-2.5 py-1 bg-elevated hover:bg-hover text-dim hover:text-fore border border-line rounded-lg transition-colors">
            Search in project
          </button>
        </div>

        {/* Metadata bar */}
        <div className="flex items-center gap-5 px-5 py-2 border-b border-line bg-surface shrink-0 text-[11px] text-faint">
          <span>{selected.lang}</span>
          <span>{selected.size}</span>
          <span>Modified {selected.modified}</span>
          {selected.git && <span className="text-warn ml-auto">● Uncommitted changes</span>}
        </div>

        <div className="flex-1 overflow-auto">
          <pre className="font-mono text-xs leading-relaxed text-dim p-5">
            {preview.split("\n").map((line, i) => (
              <div key={i} className="flex gap-4">
                <span className="text-faint w-8 text-right shrink-0 select-none">{i + 1}</span>
                <span>{line}</span>
              </div>
            ))}
          </pre>
        </div>
      </div>
    </div>
  )
}
