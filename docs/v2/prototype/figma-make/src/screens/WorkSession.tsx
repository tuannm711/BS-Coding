import { useState } from "react"
import TasksView from "./work/TasksView"
import ConversationView from "./work/ConversationView"
import PlanView from "./work/PlanView"
import ExecutionView from "./work/ExecutionView"
import ChangesView from "./work/ChangesView"
import ReviewView from "./work/ReviewView"
import {
  RUNTIMES,
  RuntimeSelector,
  SwitchConfirmModal,
  RuntimeHistoryPanel,
  type Runtime,
  type Epoch,
  type RuntimeEvent,
} from "./work/runtime"

type WorkTab = "conversation" | "plan" | "tasks" | "execution" | "changes" | "review"
type SessionStatus = "executing" | "paused" | "cancelled"

const STATUS_META: Record<SessionStatus, { label: string; cls: string }> = {
  executing: { label: "Executing", cls: "bg-ok-muted text-ok" },
  paused: { label: "Paused", cls: "bg-warn-muted text-warn" },
  cancelled: { label: "Cancelled", cls: "bg-elevated text-faint" },
}

function StopConfirmModal({ onConfirm, onClose }: { onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-[440px] bg-surface border border-line rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-line flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fore">Stop Work Session?</h2>
          <button onClick={onClose} className="text-faint hover:text-fore transition-colors text-lg leading-none">×</button>
        </div>
        <div className="px-6 py-5">
          <ul className="space-y-2">
            <li className="flex items-start gap-2 text-xs text-dim"><span className="text-err mt-px">•</span> Running agent executions will be cancelled.</li>
            <li className="flex items-start gap-2 text-xs text-dim"><span className="text-ok mt-px">•</span> Completed task results will be preserved.</li>
            <li className="flex items-start gap-2 text-xs text-dim"><span className="text-faint mt-px">•</span> The Work Session can be reviewed but will no longer execute automatically.</li>
          </ul>
        </div>
        <div className="px-6 py-4 border-t border-line flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-dim hover:text-fore border border-line hover:bg-hover rounded-lg transition-colors">Cancel</button>
          <button onClick={onConfirm} className="px-4 py-1.5 text-xs font-medium text-err border border-err-muted bg-err-muted hover:bg-err hover:text-white rounded-lg transition-colors">Stop Session</button>
        </div>
      </div>
    </div>
  )
}

function nowLabel() {
  return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
}

const SEED_EPOCHS: Epoch[] = [
  { n: 1, runtimeId: "claude-opus", start: "10:08 AM", end: "10:43 AM", executions: 12, status: "Completed" },
  { n: 2, runtimeId: "codex", start: "10:43 AM", end: "Now", executions: 7, status: "Running" },
]

const TABS: { id: WorkTab; label: string; badge?: { text: string; type: "err" | "neutral" } }[] = [
  { id: "conversation", label: "Conversation" },
  { id: "plan", label: "Plan" },
  { id: "tasks", label: "Tasks", badge: { text: "2", type: "neutral" } },
  { id: "execution", label: "Execution" },
  { id: "changes", label: "Changes", badge: { text: "4", type: "neutral" } },
  { id: "review", label: "Review", badge: { text: "!", type: "err" } },
]

export default function WorkSession() {
  const [tab, setTab] = useState<WorkTab>("tasks")

  // Runtime epoch state
  const [current, setCurrent] = useState("codex")
  const [epochs, setEpochs] = useState<Epoch[]>(SEED_EPOCHS)
  const [extraEvents, setExtraEvents] = useState<RuntimeEvent[]>([])
  const [menuOpen, setMenuOpen] = useState(false)
  const [pending, setPending] = useState<Runtime | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [textOnly, setTextOnly] = useState(false)

  // Session lifecycle
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("executing")
  const [stopConfirm, setStopConfirm] = useState(false)
  const status = STATUS_META[sessionStatus]

  const currentRuntime = RUNTIMES[current]
  const degraded = currentRuntime.toolHealth !== "Verified"

  function confirmSwitch() {
    if (!pending) return
    const from = currentRuntime
    const to = pending
    const time = nowLabel()
    setEpochs((prev) => {
      const closed = prev.map((e) =>
        e.status === "Running" ? { ...e, end: time, status: "Completed" as const } : e
      )
      return [
        ...closed,
        { n: prev.length + 1, runtimeId: to.id, start: time, end: "Now", executions: 0, status: "Running" },
      ]
    })
    setExtraEvents((prev) => [...prev, { id: `${to.id}-${time}-${prev.length}`, from, to, time }])
    setCurrent(to.id)
    setTextOnly(false)
    setPending(null)
    setTab("conversation")
  }

  return (
    <div className="h-full flex flex-col bg-base">
      {/* Header */}
      <div className="bg-surface border-b border-line px-6 shrink-0">
        <div className="flex items-start gap-4 py-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-faint">PMS</span>
              <span className="text-faint text-sm">/</span>
              <h1 className="text-base font-semibold text-fore">Google OAuth Login</h1>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${status.cls}`}>
                {status.label}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-faint">
              <span>Started 35 min ago</span>
              <span className="text-line">·</span>
              <span>
                {sessionStatus === "executing" ? "3 agents active" : sessionStatus === "paused" ? "3 agents paused" : "0 agents active"}
              </span>
              <span className="text-line">·</span>
              <span>5/8 tasks</span>
              <span className="text-line">·</span>
              <span className="font-mono text-info">feature/google-oauth</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 mt-0.5">
            {sessionStatus !== "cancelled" && (
              <RuntimeSelector
                current={currentRuntime}
                open={menuOpen}
                setOpen={setMenuOpen}
                onPick={(r) => setPending(r)}
              />
            )}
            <button
              onClick={() => setShowHistory(true)}
              className="px-3 py-1.5 text-xs text-dim hover:text-fore border border-line rounded-lg hover:bg-hover transition-colors"
              title="Runtime history"
            >
              History
            </button>
            <span className="w-px h-6 bg-line mx-0.5" />
            {sessionStatus === "cancelled" ? (
              <>
                <button className="px-3 py-1.5 text-xs text-dim hover:text-fore border border-line rounded-lg hover:bg-hover transition-colors">
                  Duplicate Session
                </button>
                <button
                  onClick={() => setSessionStatus("executing")}
                  className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:opacity-90 transition-opacity"
                >
                  Resume as New Run
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setSessionStatus(sessionStatus === "paused" ? "executing" : "paused")}
                  className="px-3 py-1.5 text-xs text-dim hover:text-fore border border-line rounded-lg hover:bg-hover transition-colors"
                >
                  {sessionStatus === "paused" ? "Resume" : "Pause"}
                </button>
                <button
                  onClick={() => setStopConfirm(true)}
                  className="px-3 py-1.5 text-xs font-medium text-err border border-err-muted bg-err-muted hover:bg-err hover:text-white rounded-lg transition-colors"
                >
                  Stop
                </button>
              </>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center -mb-px">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? "border-accent text-accent"
                  : "border-transparent text-faint hover:text-dim"
              }`}
            >
              {t.label}
              {t.badge && (
                <span
                  className={`text-[9px] font-bold px-1 rounded ${
                    t.badge.type === "err"
                      ? "bg-err-muted text-err"
                      : "bg-elevated text-faint"
                  }`}
                >
                  {t.badge.text}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0">
        {tab === "tasks" && <TasksView sessionStatus={sessionStatus} />}
        {tab === "conversation" && (
          <ConversationView
            extraEvents={extraEvents}
            degraded={degraded}
            degradedRuntime={currentRuntime}
            textOnly={textOnly}
            onRetry={() => {}}
            onSwitch={() => setMenuOpen(true)}
            onTextOnly={() => setTextOnly(true)}
          />
        )}
        {tab === "plan" && <PlanView />}
        {tab === "execution" && <ExecutionView />}
        {tab === "changes" && <ChangesView />}
        {tab === "review" && <ReviewView />}
      </div>

      {pending && (
        <SwitchConfirmModal
          from={currentRuntime}
          to={pending}
          onConfirm={confirmSwitch}
          onClose={() => setPending(null)}
        />
      )}
      {showHistory && <RuntimeHistoryPanel epochs={epochs} onClose={() => setShowHistory(false)} />}
      {stopConfirm && (
        <StopConfirmModal
          onConfirm={() => { setSessionStatus("cancelled"); setStopConfirm(false) }}
          onClose={() => setStopConfirm(false)}
        />
      )}
    </div>
  )
}
