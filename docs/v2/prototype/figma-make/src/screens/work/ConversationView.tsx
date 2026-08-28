import { useState } from "react"
import {
  RUNTIMES,
  RuntimeChangeEvent,
  DegradedBanner,
  NarratedNotExecuted,
  type Runtime,
  type RuntimeEvent,
} from "./runtime"

const SEED_EVENT: RuntimeEvent = {
  id: "seed",
  from: RUNTIMES["claude-opus"],
  to: RUNTIMES["codex"],
  time: "10:43 AM",
}

const toolEvents = [
  { type: "read", file: "src/auth/index.ts", result: "Completed" },
  { type: "read", file: "src/routes/auth.ts", result: "Completed" },
  { type: "edit", file: "src/auth/google.ts", result: "Completed" },
  { type: "exec", file: "npm test -- auth", result: "12 passed" },
]

function ToolCard({ type, file, result }: { type: string; file: string; result: string }) {
  const isTest = type === "exec"
  const isEdit = type === "edit"
  return (
    <div className="flex items-center gap-3 bg-base border border-line rounded-lg px-3 py-2">
      <span
        className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-medium shrink-0 ${
          isTest
            ? "bg-info-muted text-info"
            : isEdit
            ? "bg-warn-muted text-warn"
            : "bg-elevated text-faint"
        }`}
      >
        {type === "read" ? "READ" : type === "edit" ? "EDIT" : "EXEC"}
      </span>
      <span className="flex-1 text-xs font-mono text-dim truncate">{file}</span>
      <span className={`text-xs shrink-0 ${isTest ? "text-ok" : "text-faint"}`}>{result}</span>
    </div>
  )
}

interface ConversationViewProps {
  extraEvents?: RuntimeEvent[]
  degraded?: boolean
  degradedRuntime?: Runtime
  textOnly?: boolean
  onRetry?: () => void
  onSwitch?: () => void
  onTextOnly?: () => void
}

export default function ConversationView({
  extraEvents = [],
  degraded = false,
  degradedRuntime,
  textOnly = false,
  onRetry = () => {},
  onSwitch = () => {},
  onTextOnly = () => {},
}: ConversationViewProps) {
  const [message, setMessage] = useState("")

  return (
    <div className="h-full flex flex-col bg-base">
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {/* Epoch 1 marker */}
        <div className="text-[10px] text-faint text-center font-mono">
          Runtime Epoch 1 · Claude Opus · 10:08 AM
        </div>

        {/* User message */}
        <div className="flex justify-end">
          <div className="max-w-md bg-elevated border border-line rounded-xl rounded-tr-sm px-4 py-3">
            <p className="text-sm text-fore">
              Implement Google OAuth login using the existing session architecture.
            </p>
            <div className="text-[10px] text-faint mt-1.5 text-right">10:08 AM</div>
          </div>
        </div>

        {/* Coordinator response */}
        <div className="flex gap-3">
          <div className="w-7 h-7 rounded-full bg-surface border border-line flex items-center justify-center text-[10px] font-bold text-accent shrink-0 mt-0.5">
            C
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-medium text-dim">Coordinator</span>
              <span className="text-[10px] text-faint">10:09 AM</span>
            </div>
            <div className="bg-surface border border-line rounded-xl rounded-tl-sm px-4 py-3">
              <p className="text-sm text-fore mb-3">
                I analyzed the project and created an 8-task implementation plan. Backend and
                frontend implementation can run in parallel once the design tasks complete.
              </p>
              {/* Embedded plan card */}
              <div className="bg-base border border-line rounded-lg p-3">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-semibold text-fore">
                    Google OAuth Login — Plan
                  </span>
                  <span className="text-[10px] text-ok bg-ok-muted px-1.5 py-0.5 rounded font-medium">
                    Approved
                  </span>
                </div>
                <div className="space-y-1.5">
                  {[
                    { id: "T01-T03", label: "Analysis & Design", status: "done" },
                    { id: "T04+T05", label: "Backend + Frontend parallel", status: "running" },
                    { id: "T06-T08", label: "Integration, Review, Verify", status: "queued" },
                  ].map((phase) => (
                    <div key={phase.id} className="flex items-center gap-2 text-xs">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          phase.status === "done"
                            ? "bg-ok"
                            : phase.status === "running"
                            ? "bg-accent"
                            : "bg-faint"
                        }`}
                      />
                      <span className="text-faint font-mono w-16 shrink-0">{phase.id}</span>
                      <span className="text-dim">{phase.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Runtime epoch separator */}
        <RuntimeChangeEvent event={SEED_EVENT} />

        {/* Epoch 2 marker */}
        <div className="text-[10px] text-faint text-center font-mono">
          Runtime Epoch 2 · Codex · 10:43 AM
        </div>

        {/* Tool execution block */}
        <div className="flex gap-3">
          <div className="w-7 h-7 rounded-full bg-surface border border-line flex items-center justify-center text-[10px] font-bold text-info shrink-0 mt-0.5">
            CX
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-medium text-dim">Codex · Backend Developer · T04</span>
              <span className="text-[10px] text-faint">10:44 AM</span>
            </div>
            <div className="space-y-1.5">
              {toolEvents.map((e, i) => (
                <ToolCard key={i} {...e} />
              ))}
              <div className="bg-surface border border-line rounded-xl rounded-tl-sm px-4 py-3 mt-2">
                <p className="text-sm text-fore">
                  OAuth callback handler implemented. Session tokens are hashed with bcrypt.
                  All 12 tests passing. Proceeding to route registration.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Frontend agent message */}
        <div className="flex gap-3">
          <div className="w-7 h-7 rounded-full bg-surface border border-line flex items-center justify-center text-[10px] font-bold text-ok shrink-0 mt-0.5">
            CX
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-medium text-dim">Codex · Frontend Developer · T05</span>
              <span className="text-[10px] text-faint">10:47 AM</span>
            </div>
            <div className="space-y-1.5">
              <ToolCard type="read" file="src/components/Auth/LoginPage.tsx" result="Completed" />
              <ToolCard type="edit" file="src/components/Auth/GoogleButton.tsx" result="In progress" />
            </div>
          </div>
        </div>

        {/* Dynamic runtime switches */}
        {extraEvents.map((ev) => (
          <div key={ev.id} className="space-y-5">
            <RuntimeChangeEvent event={ev} />
            <div className="text-[10px] text-faint text-center font-mono">
              Runtime Epoch {extraEvents.indexOf(ev) + 3} · {ev.to.label} · {ev.time}
            </div>
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-surface border border-line flex items-center justify-center text-[10px] font-bold text-accent shrink-0 mt-0.5">
                {ev.to.label.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-medium text-dim">{ev.to.label} · Coordinator</span>
                  <span className="text-[10px] text-faint">{ev.time}</span>
                </div>
                <div className="bg-surface border border-line rounded-xl rounded-tl-sm px-4 py-3">
                  <p className="text-sm text-fore">
                    Normalized context loaded — resuming from task T05. Tool execution records and task
                    state carried over from the previous epoch.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Degraded runtime handling */}
        {degraded && degradedRuntime && !textOnly && (
          <DegradedBanner
            runtime={degradedRuntime}
            onRetry={onRetry}
            onSwitch={onSwitch}
            onTextOnly={onTextOnly}
          />
        )}
        {textOnly && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg bg-warn-muted border border-line px-3 py-2">
              <span className="text-warn text-[11px]">⚠</span>
              <p className="text-[11px] text-warn">
                Text-only mode active — coding execution is disabled. This runtime can discuss changes but
                cannot run tools.
              </p>
            </div>
            <NarratedNotExecuted />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-line px-6 py-4 shrink-0">
        {textOnly && (
          <div className="text-[10px] text-faint mb-2">
            Coding execution disabled in text-only mode. Switch to a verified runtime to resume tool use.
          </div>
        )}
        <div className="flex items-end gap-3 bg-surface border border-line rounded-xl px-4 py-3 focus-within:border-[#3a3a44] transition-colors">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={textOnly ? "Text-only mode — discussion only, no execution…" : "Message the coordinator..."}
            rows={1}
            className="flex-1 bg-transparent text-sm text-fore placeholder:text-faint resize-none outline-none"
          />
          <button
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-opacity shrink-0 ${
              textOnly
                ? "bg-elevated text-faint cursor-not-allowed"
                : "bg-accent hover:opacity-90 text-white"
            }`}
          >
            {textOnly ? "Text only" : "Send"}
          </button>
        </div>
      </div>
    </div>
  )
}
