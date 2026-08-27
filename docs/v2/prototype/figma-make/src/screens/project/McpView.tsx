import { useState } from "react"

interface McpServer {
  id: string
  name: string
  transport: "stdio" | "HTTP"
  status: "Connected" | "Disabled" | "Error"
  command: string
  env: { key: string; value: string }[]
  tools: { name: string; desc: string }[]
}

const SERVERS: McpServer[] = [
  {
    id: "filesystem",
    name: "Filesystem",
    transport: "stdio",
    status: "Connected",
    command: "npx -y @modelcontextprotocol/server-filesystem /workspaces/PMS",
    env: [{ key: "ROOT", value: "/workspaces/PMS" }],
    tools: [
      { name: "read_file", desc: "Read a file's contents" },
      { name: "write_file", desc: "Write contents to a file" },
      { name: "list_directory", desc: "List entries in a directory" },
      { name: "search_files", desc: "Search files by glob pattern" },
    ],
  },
  {
    id: "github",
    name: "GitHub",
    transport: "HTTP",
    status: "Connected",
    command: "https://mcp.github.com/v1",
    env: [{ key: "GITHUB_TOKEN", value: "ghp_••••••••••••" }],
    tools: [
      { name: "list_prs", desc: "List pull requests" },
      { name: "create_pr", desc: "Open a pull request" },
      { name: "get_issue", desc: "Fetch issue details" },
    ],
  },
  {
    id: "postgres",
    name: "PostgreSQL",
    transport: "stdio",
    status: "Connected",
    command: "npx -y @modelcontextprotocol/server-postgres",
    env: [{ key: "DATABASE_URL", value: "postgres://••••@localhost:5432/pms" }],
    tools: [
      { name: "query", desc: "Run a read-only SQL query" },
      { name: "list_tables", desc: "List database tables" },
      { name: "describe_table", desc: "Describe a table schema" },
    ],
  },
  {
    id: "browser",
    name: "Browser",
    transport: "stdio",
    status: "Disabled",
    command: "npx -y @modelcontextprotocol/server-puppeteer",
    env: [],
    tools: [
      { name: "navigate", desc: "Open a URL" },
      { name: "screenshot", desc: "Capture the page" },
    ],
  },
]

const statusStyle: Record<string, string> = {
  Connected: "bg-ok-muted text-ok",
  Disabled: "bg-elevated text-faint",
  Error: "bg-err-muted text-err",
}

function AddDialog({ onClose }: { onClose: () => void }) {
  const [transport, setTransport] = useState<"stdio" | "HTTP">("stdio")
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-[520px] bg-surface border border-line rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-line flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fore">Add MCP Server</h2>
          <button onClick={onClose} className="text-faint hover:text-fore transition-colors text-lg leading-none">×</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-[10px] font-semibold text-faint uppercase tracking-widest mb-1.5">Name</label>
            <input placeholder="my-server" className="w-full bg-elevated border border-line rounded-lg px-3 py-2 text-xs text-fore placeholder:text-faint focus:outline-none focus:border-[#3a3a44]" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-faint uppercase tracking-widest mb-1.5">Transport</label>
            <div className="flex gap-0.5 bg-elevated rounded-lg p-0.5">
              {(["stdio", "HTTP"] as const).map((t) => (
                <button key={t} onClick={() => setTransport(t)} className={`flex-1 py-1.5 text-[11px] rounded-md transition-colors font-medium ${transport === t ? "bg-hover text-fore" : "text-faint hover:text-dim"}`}>{t}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-faint uppercase tracking-widest mb-1.5">{transport === "stdio" ? "Command" : "URL"}</label>
            <input placeholder={transport === "stdio" ? "npx -y @scope/server" : "https://…"} className="w-full bg-elevated border border-line rounded-lg px-3 py-2 text-xs text-fore font-mono placeholder:text-faint focus:outline-none focus:border-[#3a3a44]" />
          </div>
          {transport === "stdio" && (
            <div>
              <label className="block text-[10px] font-semibold text-faint uppercase tracking-widest mb-1.5">Arguments</label>
              <input placeholder="--root /workspaces/PMS" className="w-full bg-elevated border border-line rounded-lg px-3 py-2 text-xs text-fore font-mono placeholder:text-faint focus:outline-none focus:border-[#3a3a44]" />
            </div>
          )}
          <div>
            <label className="block text-[10px] font-semibold text-faint uppercase tracking-widest mb-1.5">Environment variables</label>
            <textarea rows={3} placeholder="KEY=value" className="w-full bg-elevated border border-line rounded-lg px-3 py-2 text-xs text-fore font-mono placeholder:text-faint focus:outline-none focus:border-[#3a3a44] resize-none" />
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

function Inspector({ server, onClose }: { server: McpServer; onClose: () => void }) {
  return (
    <div className="w-96 shrink-0 h-full flex flex-col bg-surface border-l border-line">
      <div className="px-5 py-4 border-b border-line flex items-center gap-2">
        <h2 className="text-sm font-semibold text-fore">{server.name}</h2>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${statusStyle[server.status]}`}>{server.status}</span>
        <div className="flex-1" />
        <button onClick={onClose} className="text-faint hover:text-fore transition-colors text-lg leading-none">×</button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-5 py-4 border-b border-line">
          <div className="text-[10px] text-faint uppercase tracking-wider mb-2">{server.transport === "stdio" ? "Command" : "URL"}</div>
          <div className="text-xs font-mono text-dim bg-elevated border border-line rounded-lg px-3 py-2 break-all">{server.command}</div>
        </div>

        <div className="px-5 py-4 border-b border-line">
          <div className="text-[10px] text-faint uppercase tracking-wider mb-2">Environment variables</div>
          {server.env.length === 0 ? (
            <div className="text-xs text-faint">None</div>
          ) : (
            <div className="space-y-1.5">
              {server.env.map((e) => (
                <div key={e.key} className="flex items-center gap-2 text-xs font-mono">
                  <span className="text-info">{e.key}</span>
                  <span className="text-faint">=</span>
                  <span className="text-dim truncate">{e.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-b border-line">
          <div className="text-[10px] text-faint uppercase tracking-wider mb-2">Tools · {server.tools.length}</div>
          <div className="space-y-2">
            {server.tools.map((t) => (
              <div key={t.name} className="bg-elevated border border-line rounded-lg px-3 py-2">
                <div className="text-xs font-mono text-dim">{t.name}</div>
                <div className="text-[11px] text-faint mt-0.5">{t.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="text-[10px] text-faint uppercase tracking-wider mb-2">Connection status</div>
          <div className={`text-xs ${server.status === "Connected" ? "text-ok" : "text-faint"}`}>
            {server.status === "Connected" ? "● Handshake complete · tools discovered" : "○ Not connected"}
          </div>
        </div>
      </div>

      <div className="px-5 py-4 border-t border-line grid grid-cols-3 gap-2">
        <button className="px-2 py-2 text-[11px] font-medium bg-accent text-white rounded-lg hover:opacity-90 transition-opacity">
          {server.status === "Connected" ? "Disconnect" : "Connect"}
        </button>
        <button className="px-2 py-2 text-[11px] text-dim hover:text-fore border border-line hover:bg-hover rounded-lg transition-colors">Restart</button>
        <button className="px-2 py-2 text-[11px] text-err border border-err-muted hover:bg-err hover:text-white rounded-lg transition-colors">Remove</button>
      </div>
    </div>
  )
}

export default function McpView() {
  const [selected, setSelected] = useState<McpServer | null>(null)
  const [modal, setModal] = useState(false)

  return (
    <div className="h-full flex -m-6">
      <div className="flex-1 min-w-0 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-semibold text-fore">MCP Servers</h2>
              <p className="text-xs text-faint mt-0.5">{SERVERS.filter((s) => s.status === "Connected").length} connected in PMS</p>
            </div>
            <button onClick={() => setModal(true)} className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:opacity-90 transition-opacity">
              + Add MCP Server
            </button>
          </div>

          <div className="bg-surface border border-line rounded-xl overflow-hidden">
            <div className="grid grid-cols-[1fr_90px_110px_90px] gap-3 px-4 py-2.5 border-b border-line text-[10px] font-semibold text-faint uppercase tracking-wider">
              <span>Name</span>
              <span>Transport</span>
              <span>Status</span>
              <span>Tools</span>
            </div>
            {SERVERS.map((s, i) => (
              <div
                key={s.id}
                onClick={() => setSelected(s)}
                className={`grid grid-cols-[1fr_90px_110px_90px] gap-3 px-4 py-3 items-center cursor-pointer hover:bg-hover transition-colors ${
                  i < SERVERS.length - 1 ? "border-b border-line" : ""
                } ${selected?.id === s.id ? "bg-hover" : ""}`}
              >
                <span className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.status === "Connected" ? "bg-ok" : "bg-faint"}`} />
                  <span className="text-xs font-medium text-fore">{s.name}</span>
                </span>
                <span className="text-xs text-dim font-mono">{s.transport}</span>
                <span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${statusStyle[s.status]}`}>{s.status}</span>
                </span>
                <span className="text-xs text-faint font-mono">{s.tools.length} tools</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {selected && <Inspector server={selected} onClose={() => setSelected(null)} />}
      {modal && <AddDialog onClose={() => setModal(false)} />}
    </div>
  )
}
