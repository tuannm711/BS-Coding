import { useState } from "react"
import HomeScreen from "./screens/HomeScreen"
import ProjectScreen from "./screens/ProjectScreen"
import WorkSession from "./screens/WorkSession"
import AgentsScreen from "./screens/AgentsScreen"
import SettingsScreen from "./screens/SettingsScreen"
import StatesScreen from "./screens/StatesScreen"

type Screen = "home" | "project" | "work" | "agents" | "states" | "settings"

function IconHome() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 6.5L7.5 1.5L13.5 6.5V13.5H10V9H5V13.5H1.5V6.5Z" />
    </svg>
  )
}

function IconProjects() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 4H6L7.5 5.5H13.5V12.5H1.5V4Z" />
    </svg>
  )
}

function IconWork() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1.5,7.5 4,7.5 5.5,4 9.5,11 11,7.5 13.5,7.5" />
    </svg>
  )
}

function IconAgents() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5.5" cy="5" r="2.5" />
      <path d="M1 13.5C1 10.739 3.015 8.5 5.5 8.5C7.985 8.5 10 10.739 10 13.5" />
      <circle cx="11.5" cy="5" r="1.75" />
      <path d="M13.5 13.5C13.5 11.6 12.65 10.1 11.5 9.3" />
    </svg>
  )
}

function IconStates() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="2" width="12" height="3" rx="1" />
      <rect x="1.5" y="6.5" width="12" height="3" rx="1" />
      <rect x="1.5" y="11" width="12" height="2.5" rx="1" />
    </svg>
  )
}

function IconSettings() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="7.5" cy="7.5" r="2.25" />
      <path d="M7.5 1.5V3M7.5 12V13.5M13.5 7.5H12M3 7.5H1.5M11.55 3.45L10.48 4.52M4.52 10.48L3.45 11.55M11.55 11.55L10.48 10.48M4.52 4.52L3.45 3.45" />
    </svg>
  )
}

const NAV_ITEMS = [
  { id: "home", label: "Home", Icon: IconHome },
  { id: "project", label: "Projects", Icon: IconProjects },
  { id: "work", label: "Work", Icon: IconWork },
  { id: "agents", label: "Agents", Icon: IconAgents },
  { id: "settings", label: "Settings", Icon: IconSettings },
]

// StatesScreen is retained as an internal UX state reference catalog and is
// intentionally excluded from primary navigation and normal user flow.
void IconStates

const BOTTOM_TABS = ["Terminal", "Tests", "Problems", "Logs", "Output"] as const

function BottomContent({ tab }: { tab: (typeof BOTTOM_TABS)[number] }) {
  if (tab === "Terminal") {
    return (
      <div className="font-mono text-xs text-dim">
        <div className="text-faint mb-1">~/Projects/PMS on feature/google-oauth</div>
        <div className="mt-1">$ npm test -- auth</div>
        <div className="text-ok">PASS tests/auth/google.test.ts</div>
        <div className="text-ok">PASS tests/auth/session.test.ts</div>
        <div className="mt-1 text-dim">12 tests passed, 0 failed (1.24s)</div>
        <div className="mt-2">$ git status</div>
        <div className="text-faint">On branch feature/google-oauth</div>
        <div className="text-faint">Changes not staged for commit:</div>
        <div className="text-warn">  modified: src/auth/google.ts</div>
        <div className="mt-3">$ <span className="animate-pulse">_</span></div>
      </div>
    )
  }

  if (tab === "Tests") {
    const suites = [
      { file: "tests/auth/google.test.ts", passed: 12, failed: 0, ms: 412 },
      { file: "tests/auth/session.test.ts", passed: 18, failed: 0, ms: 356 },
      { file: "tests/routes/auth.test.ts", passed: 11, failed: 0, ms: 208 },
      { file: "tests/components/GoogleButton.test.tsx", passed: 7, failed: 0, ms: 264 },
    ]
    return (
      <div className="text-xs">
        <div className="flex items-center gap-4 mb-3 font-mono">
          <span className="text-ok">✓ 48 passed</span>
          <span className="text-faint">0 failed</span>
          <span className="text-faint">4 suites · 1.24s</span>
        </div>
        <div className="space-y-1">
          {suites.map((s) => (
            <div key={s.file} className="flex items-center gap-3">
              <span className="text-ok shrink-0">✓</span>
              <span className="font-mono text-dim flex-1 truncate">{s.file}</span>
              <span className="text-faint shrink-0">{s.passed} passed</span>
              <span className="text-faint font-mono shrink-0 w-14 text-right">{s.ms}ms</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (tab === "Problems") {
    return (
      <div className="text-xs space-y-4">
        <div>
          <div className="text-[10px] font-semibold text-faint uppercase tracking-widest mb-2">Errors · 1</div>
          <div className="flex items-start gap-2">
            <span className="text-[9px] font-bold bg-err text-white px-1 rounded mt-0.5 shrink-0">SEC</span>
            <div>
              <span className="font-mono text-dim">src/auth/google.ts:42</span>
              <span className="text-dim"> — Missing OAuth state validation on callback (CSRF risk).</span>
            </div>
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold text-faint uppercase tracking-widest mb-2">Warnings · 2</div>
          <div className="space-y-1.5">
            <div className="flex items-start gap-2">
              <span className="text-[9px] font-bold bg-warn-muted text-warn px-1 rounded mt-0.5 shrink-0">TS</span>
              <div><span className="font-mono text-dim">src/auth/session.ts:18</span><span className="text-faint"> — 'expiresIn' is declared but never read.</span></div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-[9px] font-bold bg-warn-muted text-warn px-1 rounded mt-0.5 shrink-0">TS</span>
              <div><span className="font-mono text-dim">src/components/Auth/GoogleButton.tsx:7</span><span className="text-faint"> — Prop 'onError' implicitly has an 'any' type.</span></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (tab === "Logs") {
    const logs = [
      { t: "10:08:02", tone: "text-faint", tag: "SESSION", msg: "Work session started — Google OAuth Login" },
      { t: "10:09:14", tone: "text-info", tag: "AGENT", msg: "Backend Developer started task T04" },
      { t: "10:43:07", tone: "text-warn", tag: "RUNTIME", msg: "Runtime switched Claude Opus → Codex (epoch 2)" },
      { t: "10:44:51", tone: "text-dim", tag: "TOOL", msg: "Tool executed edit(src/auth/google.ts) — completed" },
      { t: "10:51:33", tone: "text-ok", tag: "TASK", msg: "Task T04 completed — 12/12 tests passing" },
      { t: "11:02:19", tone: "text-err", tag: "REVIEW", msg: "Security review failed — HIGH: missing OAuth state validation" },
    ]
    return (
      <div className="font-mono text-xs space-y-0.5">
        {logs.map((l, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className="text-faint shrink-0">{l.t}</span>
            <span className={`shrink-0 w-16 ${l.tone}`}>{l.tag}</span>
            <span className="text-dim">{l.msg}</span>
          </div>
        ))}
      </div>
    )
  }

  // Output
  return (
    <div className="text-xs space-y-3">
      <div className="font-mono text-[11px] text-faint">workflow · Google OAuth Login</div>
      <div className="space-y-1.5 font-mono text-[11px]">
        <div className="text-ok">▸ Plan approved — 8 tasks</div>
        <div className="text-ok">▸ Backend + Frontend implementation complete</div>
        <div className="text-ok">▸ Integration merged — candidate build prepared</div>
        <div className="text-ok">▸ Code review PASS — 2 non-blocking suggestions</div>
        <div className="text-err">▸ Security review FAIL — 1 HIGH finding</div>
        <div className="text-warn">▸ Rework required — awaiting fix before final verification</div>
      </div>
      <div className="text-[11px] text-faint pt-2 border-t border-line">
        System: Final verification is gated until all review gates pass. No individual agent can mark the session complete.
      </div>
    </div>
  )
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("home")
  const [navExpanded, setNavExpanded] = useState(false)
  const [bottomExpanded, setBottomExpanded] = useState(false)
  const [bottomTab, setBottomTab] = useState<(typeof BOTTOM_TABS)[number]>("Terminal")

  const navigate = (s: Screen) => setScreen(s)

  return (
    <div className="flex h-full bg-base text-fore select-none">
      {/* Left nav rail */}
      <nav
        className="flex flex-col shrink-0 bg-surface border-r border-line transition-all duration-200 ease-out overflow-hidden"
        style={{ width: navExpanded ? 192 : 56 }}
      >
        {/* Logo */}
        <div className="h-12 flex items-center border-b border-line px-3.5 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center font-bold text-[11px] text-white shrink-0">
              BS
            </div>
            {navExpanded && (
              <span className="text-sm font-semibold text-fore whitespace-nowrap">BS Coding</span>
            )}
          </div>
        </div>

        {/* Nav items */}
        <div className="flex-1 flex flex-col gap-0.5 p-2 pt-2.5">
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const active = screen === id
            return (
              <button
                key={id}
                onClick={() => navigate(id as Screen)}
                title={!navExpanded ? label : undefined}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md transition-colors whitespace-nowrap ${
                  active
                    ? "bg-accent-muted text-accent"
                    : "text-dim hover:text-fore hover:bg-hover"
                }`}
              >
                <span className="shrink-0"><Icon /></span>
                {navExpanded && <span className="text-xs font-medium">{label}</span>}
              </button>
            )
          })}
        </div>

        {/* Bottom section */}
        <div className="border-t border-line p-2 space-y-0.5 shrink-0">
          <div
            title={!navExpanded ? "All providers healthy" : undefined}
            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md"
          >
            <span className="w-2 h-2 rounded-full bg-ok shrink-0" />
            {navExpanded && (
              <span className="text-xs text-faint whitespace-nowrap">All providers healthy</span>
            )}
          </div>

          <button className="flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-md hover:bg-hover text-dim hover:text-fore transition-colors">
            <div className="w-5 h-5 rounded-full bg-elevated flex items-center justify-center text-[10px] font-semibold text-fore shrink-0 ring-1 ring-line">
              A
            </div>
            {navExpanded && (
              <span className="text-xs whitespace-nowrap">Alex Mitchell</span>
            )}
          </button>

          <button
            onClick={() => setNavExpanded(!navExpanded)}
            className="flex items-center justify-center w-full py-1.5 rounded-md hover:bg-hover text-faint hover:text-dim transition-colors"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              {navExpanded
                ? <polyline points="7,2 4,5.5 7,9" />
                : <polyline points="4,2 7,5.5 4,9" />
              }
            </svg>
          </button>
        </div>
      </nav>

      {/* Main + bottom panel */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 min-h-0">
          {screen === "home" && (
            <HomeScreen
              onOpenProject={() => navigate("project")}
              onOpenWork={() => navigate("work")}
            />
          )}
          {screen === "project" && (
            <ProjectScreen onOpenWork={() => navigate("work")} />
          )}
          {screen === "work" && <WorkSession />}
          {screen === "agents" && <AgentsScreen />}
          {screen === "states" && <StatesScreen />}
          {screen === "settings" && <SettingsScreen />}
        </div>

        {/* Bottom panel */}
        <div
          className="shrink-0 border-t border-line bg-surface transition-all duration-200 ease-out flex flex-col"
          style={{ height: bottomExpanded ? 260 : 32 }}
        >
          <div className="flex items-center h-8 px-1 shrink-0 gap-0">
            {BOTTOM_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => { setBottomTab(tab); setBottomExpanded(true) }}
                className={`flex items-center gap-1.5 px-3 h-full text-xs transition-colors border-r border-line ${
                  bottomTab === tab && bottomExpanded ? "text-fore" : "text-faint hover:text-dim"
                }`}
              >
                {tab}
                {tab === "Problems" && (
                  <span className="text-[9px] font-bold bg-err-muted text-err px-1 rounded">1</span>
                )}
              </button>
            ))}
            <div className="flex-1" />
            <button
              onClick={() => setBottomExpanded(!bottomExpanded)}
              className="px-3 h-full flex items-center text-faint hover:text-dim transition-colors"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                {bottomExpanded
                  ? <polyline points="2,6 5,3 8,6" />
                  : <polyline points="2,4 5,7 8,4" />
                }
              </svg>
            </button>
          </div>

          {bottomExpanded && (
            <div className="flex-1 overflow-auto p-3">
              <BottomContent tab={bottomTab} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
