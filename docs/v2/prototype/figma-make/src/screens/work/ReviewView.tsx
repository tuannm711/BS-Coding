import { useState } from "react"

/*
 * Demonstrates the full intended lifecycle:
 * Goal → Plan → Tasks → Execution → Review → Rework → Re-review → Final Verification → Completed
 * Stages: 0 review fail · 1 rework created · 2 worker fixing · 3 fix applied / checks rerun
 *         4 security re-review pass · 5 final verification running · 6 completed
 */

const LIFECYCLE = ["Goal", "Plan", "Tasks", "Execution", "Review", "Rework", "Re-review", "Final Verification", "Completed"]

// current active lifecycle index per stage
const phaseForStage = [4, 5, 5, 6, 6, 7, 8]

const workflowStatus = (stage: number) =>
  stage === 0 ? { label: "Review", cls: "bg-info-muted text-info" }
    : stage <= 3 ? { label: "Rework", cls: "bg-warn-muted text-warn" }
    : stage === 4 ? { label: "Re-review", cls: "bg-info-muted text-info" }
    : stage === 5 ? { label: "Verifying", cls: "bg-accent-muted text-accent" }
    : { label: "Completed", cls: "bg-ok-muted text-ok" }

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="text-ok shrink-0">
      <circle cx="7.5" cy="7.5" r="6.5" fill="currentColor" opacity="0.15" />
      <polyline points="4.5,7.5 6.5,9.5 10.5,5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function ReviewView() {
  const [stage, setStage] = useState(0)

  const createRework = () => setStage(1)

  const simulate = () => {
    const steps = [2, 3, 4, 5, 6]
    steps.forEach((s, i) => setTimeout(() => setStage(s), (i + 1) * 900))
  }

  const wf = workflowStatus(stage)
  const activePhase = phaseForStage[stage]
  const securityPass = stage >= 4
  const finalDone = stage >= 6

  return (
    <div className="h-full overflow-y-auto px-6 py-6">
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Lifecycle timeline */}
        <section className="bg-surface border border-line rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-semibold text-faint uppercase tracking-widest">Workflow lifecycle</h3>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${wf.cls}`}>{wf.label}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
            {LIFECYCLE.map((p, i) => {
              const done = i < activePhase || finalDone
              const active = i === activePhase && !finalDone
              return (
                <div key={p} className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        done ? "bg-ok" : active ? "bg-accent animate-pulse" : "bg-faint"
                      }`}
                    />
                    <span className={`text-[11px] ${done ? "text-dim" : active ? "text-fore font-medium" : "text-faint"}`}>{p}</span>
                  </div>
                  {i < LIFECYCLE.length - 1 && <span className="text-line text-[10px]">→</span>}
                </div>
              )
            })}
          </div>
        </section>

        {/* Mechanical checks */}
        <section className="bg-surface border border-line rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-semibold text-faint uppercase tracking-widest">Mechanical checks</h3>
            {stage >= 3 && <span className="text-[10px] text-ok bg-ok-muted px-1.5 py-0.5 rounded font-medium">Re-ran after fix</span>}
          </div>
          <div className="space-y-2.5">
            {[
              { label: "Typecheck", detail: "" },
              { label: "Build", detail: "" },
              { label: "Unit tests", detail: stage >= 3 ? "49/49" : "48/48" },
              { label: "Lint", detail: "" },
            ].map((check) => (
              <div key={check.label} className="flex items-center gap-3">
                <CheckIcon />
                <span className="text-sm text-fore flex-1">{check.label}</span>
                {check.detail && <span className="text-xs text-faint">{check.detail}</span>}
                <span className="text-xs text-ok font-mono">pass</span>
              </div>
            ))}
          </div>
        </section>

        {/* AI Reviews */}
        <section className="bg-surface border border-line rounded-xl p-5">
          <h3 className="text-[10px] font-semibold text-faint uppercase tracking-widest mb-4">AI Reviews</h3>
          <div className="space-y-4">
            {/* Code Reviewer — PASS */}
            <div className="p-4 bg-ok-muted border border-ok rounded-xl">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-full bg-ok/20 flex items-center justify-center text-[10px] font-bold text-ok">CL</div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-fore">Code Reviewer</div>
                  <div className="text-[10px] text-faint">Claude · Reviewer agent</div>
                </div>
                <span className="text-sm font-bold text-ok">PASS</span>
              </div>
              <p className="text-xs text-dim mb-2">2 non-blocking suggestions:</p>
              <ul className="space-y-1.5">
                <li className="flex items-start gap-1.5 text-xs text-dim"><span className="text-faint mt-0.5">·</span> Consider extracting token hashing to a shared utility function for reuse</li>
                <li className="flex items-start gap-1.5 text-xs text-dim"><span className="text-faint mt-0.5">·</span> Add JSDoc comments to the OAuth callback handler</li>
              </ul>
            </div>

            {/* Security Reviewer — FAIL → PASS */}
            {!securityPass ? (
              <div className="p-4 bg-err-muted border border-err rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-err/20 flex items-center justify-center text-[10px] font-bold text-err">GM</div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-fore">Security Reviewer</div>
                    <div className="text-[10px] text-faint">Gemini 2.0 Pro · Reviewer agent</div>
                  </div>
                  <span className="text-sm font-bold text-err">{stage === 3 ? "RE-REVIEWING…" : "FAIL"}</span>
                </div>

                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold bg-err text-white px-1.5 py-0.5 rounded">HIGH</span>
                    <span className="text-xs font-semibold text-err">Missing OAuth state validation</span>
                  </div>
                  <div className="bg-base border border-err/30 rounded-lg p-3">
                    <p className="text-xs text-dim leading-relaxed">
                      "OAuth state validation is missing on callback. The{" "}
                      <code className="font-mono text-err bg-err-muted px-1 rounded">state</code>{" "}
                      parameter is generated but not validated on return, allowing CSRF attacks against the OAuth flow."
                    </p>
                  </div>
                </div>

                {stage === 0 && (
                  <div className="flex gap-2">
                    <button onClick={createRework} className="px-3 py-2 text-xs font-medium bg-accent text-white rounded-lg hover:opacity-90 transition-opacity">
                      Create Rework Task
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 bg-ok-muted border border-ok rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-full bg-ok/20 flex items-center justify-center text-[10px] font-bold text-ok">GM</div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-fore">Security Reviewer</div>
                    <div className="text-[10px] text-faint">Gemini 2.0 Pro · Reviewer agent · re-review</div>
                  </div>
                  <span className="text-sm font-bold text-ok">PASS</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-dim">
                  <CheckIcon /> OAuth state validation implemented and verified. No outstanding security findings.
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Rework task — appears after creation */}
        {stage >= 1 && (
          <section className="bg-surface border border-line rounded-xl p-5">
            <h3 className="text-[10px] font-semibold text-faint uppercase tracking-widest mb-4">Rework task</h3>
            <div className="rounded-xl border border-line bg-base p-4">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-[11px] font-mono text-faint">T09</span>
                <span className="text-sm font-medium text-fore flex-1">Fix OAuth state validation</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                    stage >= 4 ? "bg-ok-muted text-ok" : stage >= 2 ? "bg-accent-muted text-accent" : "bg-warn-muted text-warn"
                  }`}
                >
                  {stage >= 4 ? "Completed" : stage >= 3 ? "Verifying" : stage >= 2 ? "Running" : "Assigned"}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-faint">
                <span className="w-2 h-2 rounded-full bg-ok" />
                Backend Developer
                <span className="text-line">·</span>
                <span className="font-mono">Codex</span>
              </div>

              {stage >= 2 && (
                <div className="mt-3 pt-3 border-t border-line space-y-1.5">
                  {[
                    { t: "EDIT", f: "src/auth/google.ts — add state param validation", show: stage >= 2, done: stage >= 3 },
                    { t: "RUN", f: "npm test -- auth  (49 passed)", show: stage >= 3, done: stage >= 3 },
                  ].filter((x) => x.show).map((a, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className={`text-[10px] font-mono px-1 rounded shrink-0 ${a.t === "RUN" ? "bg-info-muted text-info" : "bg-warn-muted text-warn"}`}>{a.t}</span>
                      <span className="font-mono text-faint truncate flex-1">{a.f}</span>
                      {a.done ? (
                        <span className="text-ok shrink-0">✓</span>
                      ) : (
                        <div className="w-2.5 h-2.5 rounded-full border border-accent border-t-transparent animate-spin shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {stage === 1 && (
                <div className="mt-3 pt-3 border-t border-line">
                  <button onClick={simulate} className="px-3 py-1.5 text-xs font-medium bg-accent text-white rounded-lg hover:opacity-90 transition-opacity">
                    Simulate rework completion
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Final verification */}
        <section className="bg-surface border border-line rounded-xl p-5">
          <h3 className="text-[10px] font-semibold text-faint uppercase tracking-widest mb-4">Final Verification</h3>
          {finalDone ? (
            <div className="flex items-start gap-3 p-4 bg-ok-muted border border-ok rounded-xl">
              <CheckIcon />
              <div>
                <div className="text-xs font-semibold text-ok mb-1">Passed — all gates cleared</div>
                <div className="text-xs text-faint leading-relaxed">
                  Full test suite and build passed (49/49). All review gates cleared. The Work Session is complete.
                </div>
              </div>
            </div>
          ) : stage === 5 ? (
            <div className="flex items-start gap-3 p-4 bg-accent-muted border border-accent rounded-xl">
              <div className="w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin mt-0.5 shrink-0" />
              <div>
                <div className="text-xs font-semibold text-accent mb-1">Running — full suite + build</div>
                <div className="text-xs text-faint leading-relaxed">Executing final verification now that all review gates have passed.</div>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 p-4 bg-warn-muted border border-warn rounded-xl">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-warn shrink-0 mt-0.5">
                <path d="M8 2L14.5 14H1.5L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                <path d="M8 7V9.5M8 11.5V12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <div>
                <div className="text-xs font-semibold text-warn mb-1">Pending — required gates have not passed</div>
                <div className="text-xs text-faint leading-relaxed">
                  Security review must pass before final verification can run. No individual agent can mark this work
                  session complete — all review gates must clear first.
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
