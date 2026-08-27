import { useState } from "react"

const FILES = [
  { path: "src/auth/google.ts", additions: 87, deletions: 12 },
  { path: "src/routes/auth.ts", additions: 43, deletions: 8 },
  { path: "src/auth/session.ts", additions: 28, deletions: 4 },
  { path: "tests/auth/google.test.ts", additions: 25, deletions: 3 },
]

type DiffLine = { lineNo: number; type: "added" | "removed" | "context"; content: string }

const DIFFS: Record<string, DiffLine[]> = {
  "src/auth/google.ts": [
    { lineNo: 1, type: "context", content: "import { Strategy as GoogleStrategy } from 'passport-google-oauth20'" },
    { lineNo: 2, type: "context", content: "import { createSession } from './session'" },
    { lineNo: 3, type: "context", content: "" },
    { lineNo: 4, type: "added", content: "import bcrypt from 'bcrypt'" },
    { lineNo: 5, type: "added", content: "import { validateState } from './state'" },
    { lineNo: 6, type: "context", content: "" },
    { lineNo: 7, type: "context", content: "export const googleStrategy = new GoogleStrategy({" },
    { lineNo: 8, type: "context", content: "  clientID: process.env.GOOGLE_CLIENT_ID," },
    { lineNo: 9, type: "removed", content: '  callbackURL: "/auth/google/callback",' },
    { lineNo: 10, type: "added", content: "  callbackURL: process.env.GOOGLE_CALLBACK_URL," },
    { lineNo: 11, type: "context", content: "}, async (accessToken, refreshToken, profile, done) => {" },
    { lineNo: 12, type: "removed", content: "  const token = accessToken" },
    { lineNo: 13, type: "added", content: "  const tokenHash = await bcrypt.hash(accessToken, 12)" },
    { lineNo: 14, type: "added", content: "  const session = await createSession({ userId: profile.id, tokenHash })" },
    { lineNo: 15, type: "context", content: "  return done(null, session)" },
    { lineNo: 16, type: "context", content: "})" },
  ],
  "src/routes/auth.ts": [
    { lineNo: 1, type: "context", content: "import express from 'express'" },
    { lineNo: 2, type: "context", content: "import passport from 'passport'" },
    { lineNo: 3, type: "added", content: "import { generateState, validateState } from '../auth/state'" },
    { lineNo: 4, type: "context", content: "" },
    { lineNo: 5, type: "context", content: "const router = express.Router()" },
    { lineNo: 6, type: "context", content: "" },
    { lineNo: 7, type: "removed", content: "router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }))" },
    { lineNo: 8, type: "added", content: "router.get('/auth/google', (req, res, next) => {" },
    { lineNo: 9, type: "added", content: "  const state = generateState()" },
    { lineNo: 10, type: "added", content: "  req.session.oauthState = state" },
    { lineNo: 11, type: "added", content: "  passport.authenticate('google', { scope: ['profile', 'email'], state })(req, res, next)" },
    { lineNo: 12, type: "added", content: "})" },
    { lineNo: 13, type: "context", content: "" },
    { lineNo: 14, type: "context", content: "router.get('/auth/google/callback', passport.authenticate('google'))" },
  ],
  "src/auth/session.ts": [
    { lineNo: 1, type: "context", content: "import { db } from '../db'" },
    { lineNo: 2, type: "added", content: "import { hashToken } from './utils'" },
    { lineNo: 3, type: "context", content: "" },
    { lineNo: 4, type: "context", content: "export async function createSession(userId: string, token: string) {" },
    { lineNo: 5, type: "removed", content: "  return db.sessions.create({ userId, token })" },
    { lineNo: 6, type: "added", content: "  const tokenHash = await hashToken(token)" },
    { lineNo: 7, type: "added", content: "  return db.sessions.create({ userId, tokenHash })" },
    { lineNo: 8, type: "context", content: "}" },
  ],
  "tests/auth/google.test.ts": [
    { lineNo: 1, type: "context", content: "import { describe, it, expect } from 'vitest'" },
    { lineNo: 2, type: "added", content: "import { validateState } from '../../src/auth/state'" },
    { lineNo: 3, type: "context", content: "" },
    { lineNo: 4, type: "added", content: "describe('OAuth state validation', () => {" },
    { lineNo: 5, type: "added", content: "  it('rejects invalid state', () => {" },
    { lineNo: 6, type: "added", content: "    expect(() => validateState('invalid')).toThrow()" },
    { lineNo: 7, type: "added", content: "  })" },
    { lineNo: 8, type: "added", content: "})" },
  ],
}

export default function ChangesView() {
  const [selectedFile, setSelectedFile] = useState(FILES[0].path)
  const diff = DIFFS[selectedFile] ?? DIFFS["src/auth/google.ts"]
  const meta = FILES.find((f) => f.path === selectedFile)

  return (
    <div className="h-full flex">
      {/* File tree */}
      <div className="w-56 shrink-0 border-r border-line bg-surface flex flex-col">
        <div className="px-4 py-3 border-b border-line">
          <div className="text-xs font-semibold text-fore">4 files changed</div>
          <div className="text-xs text-faint mt-0.5">
            <span className="text-ok">+183</span>
            <span className="text-faint mx-1">/</span>
            <span className="text-err">-27</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {FILES.map((f) => (
            <button
              key={f.path}
              onClick={() => setSelectedFile(f.path)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                selectedFile === f.path ? "bg-hover" : "hover:bg-hover"
              }`}
            >
              <div className="flex-1 min-w-0">
                <div
                  className={`text-xs font-mono truncate ${
                    selectedFile === f.path ? "text-fore" : "text-dim"
                  }`}
                >
                  {f.path.split("/").pop()}
                </div>
                <div className="text-[10px] text-faint font-mono truncate">
                  {f.path.split("/").slice(0, -1).join("/")}
                </div>
              </div>
              <div className="flex gap-1 text-[10px] shrink-0">
                <span className="text-ok">+{f.additions}</span>
                <span className="text-err">-{f.deletions}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="border-t border-line p-3 flex flex-col gap-1.5">
          <button className="w-full px-3 py-2 text-xs text-dim hover:text-fore border border-line hover:bg-hover rounded-lg transition-colors">
            Review changes
          </button>
          <button className="w-full px-3 py-2 text-xs text-err border border-err-muted bg-err-muted hover:bg-err hover:text-white rounded-lg transition-colors">
            Revert task
          </button>
          <button className="w-full px-3 py-2 text-xs text-dim hover:text-fore border border-line hover:bg-hover rounded-lg transition-colors">
            Open in editor
          </button>
        </div>
      </div>

      {/* Diff viewer */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center px-5 py-3 border-b border-line bg-surface shrink-0">
          <span className="text-xs font-mono text-dim">{selectedFile}</span>
          <div className="flex gap-2 ml-auto text-xs">
            <span className="text-ok">+{meta?.additions}</span>
            <span className="text-err">-{meta?.deletions}</span>
          </div>
        </div>
        <div className="flex-1 overflow-auto font-mono text-xs leading-relaxed">
          {diff.map((line, i) => (
            <div
              key={i}
              className={`flex gap-4 px-4 py-0.5 ${
                line.type === "added"
                  ? "bg-ok-muted"
                  : line.type === "removed"
                  ? "bg-err-muted"
                  : "hover:bg-surface"
              }`}
            >
              <span className="text-faint w-8 text-right shrink-0 select-none">{line.lineNo}</span>
              <span
                className={`shrink-0 w-3 ${
                  line.type === "added"
                    ? "text-ok"
                    : line.type === "removed"
                    ? "text-err"
                    : "text-transparent"
                }`}
              >
                {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
              </span>
              <span
                className={
                  line.type === "added"
                    ? "text-ok"
                    : line.type === "removed"
                    ? "text-err"
                    : "text-dim"
                }
              >
                {line.content}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
