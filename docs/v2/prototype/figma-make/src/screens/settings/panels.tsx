import { useState } from "react"

/* ---------- Shared primitives ---------- */

export function Panel({
  title,
  desc,
  children,
  wide,
}: {
  title: string
  desc?: string
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className={wide ? "max-w-3xl" : "max-w-2xl"}>
      <h2 className="text-base font-semibold text-fore mb-1">{title}</h2>
      {desc && <p className="text-xs text-faint mb-6 leading-relaxed">{desc}</p>}
      <div className="space-y-6">{children}</div>
    </div>
  )
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[10px] font-semibold text-faint uppercase tracking-widest mb-3">{title}</h3>
      <div className="bg-surface border border-line rounded-xl divide-y divide-line">{children}</div>
    </section>
  )
}

export function Row({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-4 px-5 py-3.5">
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-fore">{label}</div>
        {hint && <div className="text-[11px] text-faint mt-0.5 leading-relaxed">{hint}</div>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  )
}

export function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-9 h-5 rounded-full p-0.5 transition-colors shrink-0 ${on ? "bg-accent" : "bg-elevated"}`}
    >
      <span className={`block w-4 h-4 rounded-full bg-white transition-transform ${on ? "translate-x-4" : ""}`} />
    </button>
  )
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
}: {
  options: readonly T[]
  value: T
  onChange: (v: T) => void
  size?: "sm" | "md"
}) {
  return (
    <div className="flex gap-0.5 bg-elevated rounded-lg p-0.5">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={`${size === "sm" ? "px-2.5 py-1 text-[10px]" : "px-3 py-1.5 text-[11px]"} rounded-md transition-colors font-medium ${
            value === o ? "bg-hover text-fore" : "text-faint hover:text-dim"
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

const inputCls =
  "bg-elevated border border-line rounded-lg px-3 py-1.5 text-xs text-fore focus:outline-none focus:border-[#3a3a44]"
const btnGhost =
  "px-3 py-1.5 text-xs text-dim hover:text-fore border border-line hover:bg-hover rounded-lg transition-colors"
const btnDanger =
  "px-3 py-1.5 text-xs text-err border border-err-muted hover:bg-err hover:text-white rounded-lg transition-colors"

/* A toggle row helper */
function ToggleRow({
  label,
  hint,
  initial,
}: {
  label: string
  hint?: string
  initial: boolean
}) {
  const [on, setOn] = useState(initial)
  return (
    <Row label={label} hint={hint}>
      <Toggle on={on} onClick={() => setOn(!on)} />
    </Row>
  )
}

/* ---------- Application ---------- */

export function ApplicationPanel() {
  return (
    <Panel title="Application" desc="Control how BS Coding starts, runs in the background, and stores files.">
      <Section title="Startup">
        <ToggleRow label="Launch at startup" hint="Open BS Coding when you sign in" initial={false} />
        <ToggleRow label="Restore last project" initial={true} />
        <ToggleRow label="Restore active work sessions" hint="Resume running and paused sessions on launch" initial={true} />
      </Section>

      <Section title="Behavior">
        <ToggleRow label="Confirm before stopping running workflows" initial={true} />
        <ToggleRow label="Keep running in tray" hint="Minimize to the system tray instead of quitting" initial={true} />
        <ToggleRow label="Desktop notifications" hint="Notify on task completion, review results, and errors" initial={true} />
      </Section>

      <Section title="Files & paths">
        <Row label="Default projects folder">
          <div className="flex items-center gap-2">
            <input defaultValue="D:\Projects" className={`${inputCls} w-56 font-mono`} />
            <button className={btnGhost}>Open folder</button>
          </div>
        </Row>
        <Row label="Logs folder">
          <div className="flex items-center gap-2">
            <input defaultValue="D:\Projects\.bscoding\logs" className={`${inputCls} w-56 font-mono`} />
            <button className={btnGhost}>Open folder</button>
          </div>
        </Row>
      </Section>

      <Section title="Developer">
        <ToggleRow label="Enable diagnostic logging" hint="Capture verbose runtime traces for troubleshooting" initial={false} />
        <Row label="Diagnostics" hint="Inspect or share local diagnostic output">
          <div className="flex items-center gap-2">
            <button className={btnGhost}>Open logs</button>
            <button className={btnGhost}>Export diagnostics</button>
          </div>
        </Row>
      </Section>
    </Panel>
  )
}

/* ---------- Appearance ---------- */

const ACCENTS = [
  { name: "Ember", value: "#f47328" },
  { name: "Violet", value: "#8b7cf6" },
  { name: "Ocean", value: "#4a9eff" },
  { name: "Mint", value: "#3ecf8e" },
  { name: "Rose", value: "#f45b8f" },
  { name: "Amber", value: "#f4c228" },
]

export function AppearancePanel() {
  const [theme, setTheme] = useState<"Dark" | "Light" | "System">("Dark")
  const [accent, setAccent] = useState(ACCENTS[0].value)
  const [density, setDensity] = useState<"Comfortable" | "Compact">("Comfortable")
  const [uiSize, setUiSize] = useState(13)
  const [codeSize, setCodeSize] = useState(12)
  const [wordWrap, setWordWrap] = useState(true)
  const [minimap, setMinimap] = useState(false)

  return (
    <div className="max-w-4xl">
      <h2 className="text-base font-semibold text-fore mb-1">Appearance</h2>
      <p className="text-xs text-faint mb-6 leading-relaxed">
        Customize theme, accent, density, and editor typography. The dark Studio theme is the default.
      </p>

      <div className="grid grid-cols-[1fr_320px] gap-6">
        {/* Controls */}
        <div className="space-y-6">
          <Section title="Theme">
            <Row label="Color theme">
              <Segmented options={["Dark", "Light", "System"] as const} value={theme} onChange={setTheme} />
            </Row>
            <Row label="Accent color">
              <div className="flex items-center gap-1.5">
                {ACCENTS.map((a) => (
                  <button
                    key={a.value}
                    title={a.name}
                    onClick={() => setAccent(a.value)}
                    className={`w-5 h-5 rounded-full transition-transform ${accent === a.value ? "ring-2 ring-offset-2 ring-offset-surface ring-fore scale-110" : "hover:scale-110"}`}
                    style={{ backgroundColor: a.value }}
                  />
                ))}
              </div>
            </Row>
            <Row label="Density">
              <Segmented options={["Comfortable", "Compact"] as const} value={density} onChange={setDensity} />
            </Row>
          </Section>

          <Section title="Font">
            <Row label="UI font size" hint={`${uiSize}px`}>
              <input type="range" min={11} max={16} value={uiSize} onChange={(e) => setUiSize(+e.target.value)} className="w-40 accent-[#f47328]" />
            </Row>
            <Row label="Code font size" hint={`${codeSize}px`}>
              <input type="range" min={10} max={16} value={codeSize} onChange={(e) => setCodeSize(+e.target.value)} className="w-40 accent-[#f47328]" />
            </Row>
          </Section>

          <Section title="Editor">
            <Row label="Word wrap">
              <Toggle on={wordWrap} onClick={() => setWordWrap(!wordWrap)} />
            </Row>
            <Row label="Minimap">
              <Toggle on={minimap} onClick={() => setMinimap(!minimap)} />
            </Row>
          </Section>
        </div>

        {/* Live preview */}
        <div className="sticky top-0">
          <h3 className="text-[10px] font-semibold text-faint uppercase tracking-widest mb-3">Live preview</h3>
          <div
            className="rounded-xl border border-line overflow-hidden"
            style={{ backgroundColor: theme === "Light" ? "#f5f5f7" : "#16161a" }}
          >
            <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: theme === "Light" ? "#e0e0e4" : "#2c2c33" }}>
              <span className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold text-white" style={{ backgroundColor: accent }}>BS</span>
              <span className="text-xs font-semibold" style={{ color: theme === "Light" ? "#1a1a1f" : "#e4e4ed", fontSize: uiSize }}>work_session.ts</span>
              <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: accent + "22", color: accent }}>Executing</span>
            </div>
            <pre
              className="font-mono p-3 leading-relaxed overflow-hidden"
              style={{ fontSize: codeSize, color: theme === "Light" ? "#3a3a42" : "#878794", whiteSpace: wordWrap ? "pre-wrap" : "pre" }}
            >
{`export async function run(task) {
  const agent = pool.assign(task)
  const result = await agent.execute()
  return review(result)  // AI + mechanical checks`}
            </pre>
            <div className="flex items-center gap-3 px-3 py-2 border-t text-[10px]" style={{ borderColor: theme === "Light" ? "#e0e0e4" : "#2c2c33", color: theme === "Light" ? "#8a8a92" : "#52525a", padding: density === "Compact" ? "4px 12px" : "8px 12px" }}>
              <span>{density}</span>
              <span>·</span>
              <span>Word wrap {wordWrap ? "on" : "off"}</span>
              <span>·</span>
              <span>Minimap {minimap ? "on" : "off"}</span>
            </div>
          </div>
          <p className="text-[11px] text-faint mt-3 leading-relaxed">
            Preview reflects theme, accent, density, and font sizes. Changes apply after you save.
          </p>
        </div>
      </div>
    </div>
  )
}

/* ---------- Security ---------- */

export function SecurityPanel() {
  const [retention, setRetention] = useState("30 days")
  return (
    <Panel title="Security" desc="Manage stored credentials, execution safety confirmations, and session privacy.">
      <Section title="Credentials">
        <div className="px-5 py-4">
          <p className="text-xs text-dim leading-relaxed mb-3">
            Secrets and provider tokens are stored securely in your operating system credential store
            (Keychain, Credential Manager, or Secret Service). BS Coding never writes them to disk in plaintext.
          </p>
          <div className="flex items-center gap-2">
            <button className={btnGhost}>Open credential status</button>
            <button className={btnDanger}>Clear stored credentials</button>
          </div>
        </div>
      </Section>

      <Section title="Execution safety">
        <ToggleRow label="Confirm destructive shell commands" hint="Prompt before rm, DROP, and similar operations" initial={true} />
        <ToggleRow label="Confirm external network actions" initial={true} />
        <ToggleRow label="Confirm Git push" initial={true} />
        <ToggleRow label="Confirm file deletion" initial={true} />
      </Section>

      <Section title="Browser Bridge">
        <ToggleRow label="Enable browser bridge" hint="Allow agents to drive a controlled browser session" initial={false} />
        <Row label="Localhost-only" hint="Bridge accepts connections from this machine only">
          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-ok-muted text-ok">Enforced</span>
        </Row>
        <ToggleRow label="Pairing required" hint="Require a pairing code before a browser can attach" initial={true} />
      </Section>

      <Section title="Session privacy">
        <Row label="Session retention" hint="How long local session transcripts are kept">
          <Segmented options={["7 days", "30 days", "90 days", "Forever"] as const} value={retention} onChange={setRetention} size="sm" />
        </Row>
        <Row label="Local session data" hint="Remove cached transcripts, plans, and diffs from this device">
          <button className={btnDanger}>Clear local session data</button>
        </Row>
      </Section>
    </Panel>
  )
}

/* ---------- Default Permissions ---------- */

type Perm = "Allow" | "Ask" | "Deny"
const PERM_ROWS: { label: string; def: Perm }[] = [
  { label: "Read files", def: "Allow" },
  { label: "Write files", def: "Ask" },
  { label: "Edit files", def: "Ask" },
  { label: "Run shell", def: "Ask" },
  { label: "Git read", def: "Allow" },
  { label: "Git write", def: "Ask" },
  { label: "Browser", def: "Deny" },
  { label: "Web search", def: "Allow" },
  { label: "MCP tools", def: "Ask" },
  { label: "Office tools", def: "Deny" },
]

function PermControl({ value, onChange }: { value: Perm; onChange: (v: Perm) => void }) {
  const styles: Record<Perm, string> = {
    Allow: "bg-ok-muted text-ok",
    Ask: "bg-warn-muted text-warn",
    Deny: "bg-err-muted text-err",
  }
  return (
    <div className="flex gap-0.5 bg-elevated rounded-lg p-0.5">
      {(["Allow", "Ask", "Deny"] as Perm[]).map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`px-3 py-1 text-[11px] rounded-md transition-colors font-medium w-16 ${
            value === p ? styles[p] : "text-faint hover:text-dim"
          }`}
        >
          {p}
        </button>
      ))}
    </div>
  )
}

export function PermissionsPanel() {
  const [perms, setPerms] = useState<Record<string, Perm>>(
    () => Object.fromEntries(PERM_ROWS.map((r) => [r.label, r.def]))
  )
  const reset = () => setPerms(Object.fromEntries(PERM_ROWS.map((r) => [r.label, r.def])))

  return (
    <Panel
      title="Default Permissions"
      wide
      desc="Baseline capability policy for new work. Project or agent settings can override these global defaults."
    >
      <Section title="Capability matrix">
        <div className="grid grid-cols-[1fr_auto] gap-4 px-5 py-2.5 border-b border-line text-[10px] font-semibold text-faint uppercase tracking-wider">
          <span>Capability</span>
          <span className="w-52 text-center">Allow · Ask · Deny</span>
        </div>
        {PERM_ROWS.map((r) => (
          <Row key={r.label} label={r.label}>
            <PermControl value={perms[r.label]} onChange={(v) => setPerms({ ...perms, [r.label]: v })} />
          </Row>
        ))}
      </Section>

      <div className="flex items-center gap-2">
        <button onClick={reset} className={btnGhost}>Reset defaults</button>
        <button className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:opacity-90 transition-opacity">
          Apply to new projects
        </button>
        <span className="text-[11px] text-faint ml-auto">Overridable per project and per agent</span>
      </div>
    </Panel>
  )
}

/* ---------- Updates ---------- */

export function UpdatesPanel() {
  const [channel, setChannel] = useState<"Stable" | "Beta">("Beta")
  return (
    <Panel title="Updates" desc="Manage the update channel and how new versions are delivered.">
      <Section title="Version">
        <div className="flex items-center gap-4 px-5 py-4">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center text-sm font-bold text-white shrink-0">BS</div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-fore">BS Coding vNext Preview</div>
            <div className="text-[11px] text-faint mt-0.5 font-mono">v0.9.2 · build 20260827</div>
          </div>
          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-ok-muted text-ok">Up to date</span>
        </div>
      </Section>

      <Section title="Update channel">
        <Row label="Channel" hint={channel === "Beta" ? "Preview builds with the latest features" : "Fully tested, stable releases"}>
          <Segmented options={["Stable", "Beta"] as const} value={channel} onChange={setChannel} />
        </Row>
      </Section>

      <Section title="Automatic updates">
        <ToggleRow label="Check automatically" hint="Look for new versions in the background" initial={true} />
        <ToggleRow label="Download automatically" hint="Fetch updates when available, install on restart" initial={false} />
      </Section>

      <div className="flex items-center gap-2">
        <button className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:opacity-90 transition-opacity">
          Check for updates
        </button>
        <button className={btnGhost}>View release notes</button>
      </div>
    </Panel>
  )
}

/* ---------- Remote Control ---------- */

export function RemoteControlPanel() {
  const [enabled, setEnabled] = useState(false)
  return (
    <Panel title="Remote Control" desc="Pair a phone or another device to monitor and steer work sessions remotely.">
      <Section title="Status">
        <Row label="Remote control" hint={enabled ? "Accepting paired devices" : "Remote access is turned off"}>
          <div className="flex items-center gap-3">
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${enabled ? "bg-ok-muted text-ok" : "bg-elevated text-faint"}`}>
              {enabled ? "Enabled" : "Disabled"}
            </span>
            <Toggle on={enabled} onClick={() => setEnabled(!enabled)} />
          </div>
        </Row>
        <Row label="Relay server">
          <span className="text-xs font-mono text-dim">wss://example-relay.local</span>
        </Row>
      </Section>

      {enabled && (
        <Section title="Pairing">
          <div className="px-5 py-5">
            <div className="flex items-center gap-5">
              <div className="flex gap-2">
                {["4", "8", "2", "7", "3", "1"].map((d, i) => (
                  <span
                    key={i}
                    className={`w-10 h-12 rounded-lg bg-elevated border border-line flex items-center justify-center text-lg font-mono font-semibold text-fore ${i === 2 ? "mr-3" : ""}`}
                  >
                    {d}
                  </span>
                ))}
              </div>
              <div className="flex-1">
                <div className="text-xs text-dim">Enter this code on your device to pair.</div>
                <div className="text-[11px] text-warn mt-1">Expires in 4:32</div>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <button className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:opacity-90 transition-opacity">
                Generate pairing code
              </button>
              <button className={btnGhost}>Copy pairing code</button>
              <button className={btnDanger}>Revoke pairing</button>
            </div>
          </div>
        </Section>
      )}

      <Section title="Connected devices">
        <div className="px-5 py-6 text-center">
          <div className="text-xs text-faint">No devices connected</div>
          {enabled && (
            <button className={`${btnGhost} mt-3 inline-block`}>Disconnect all devices</button>
          )}
        </div>
      </Section>

      <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-info-muted border border-line">
        <span className="text-info text-sm leading-none mt-0.5">ⓘ</span>
        <p className="text-[11px] text-dim leading-relaxed">
          The relay stores no project content and cannot interpret encrypted payloads. All session data is
          end-to-end encrypted between your devices.
        </p>
      </div>
    </Panel>
  )
}
