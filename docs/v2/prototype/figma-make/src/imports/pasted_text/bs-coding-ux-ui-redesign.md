Create a high-fidelity interactive desktop application prototype for **BS Coding**, an AI software engineering workspace. This is a complete UX/UI redesign; do not reuse the current terminal-pane-centric layout.

## Product concept

BS Coding allows users to work on software projects using one or multiple AI agents. Users should think in terms of:

**Project → Work Session → Goal → Plan → Tasks → Execution → Review → Result**

Providers, accounts, models, runtimes, tools, skills and terminals are supporting resources, not the primary navigation model.

The interface must feel like a polished modern developer product comparable in quality to Linear, Cursor, GitHub Desktop and modern AI coding tools, but have its own identity.

Target:

* Desktop first, 1440×960
* Dark UI
* Charcoal/near-black surfaces
* Warm orange/coral accent
* Excellent contrast and readability
* Compact but not cramped
* Minimal visual noise
* Avoid excessive borders and nested cards
* Use icons where their meaning is obvious
* Prefer progressive disclosure over showing all technical information at once
* Smooth, subtle interactions
* No decorative gradients unless extremely subtle

Use realistic sample content throughout.

---

# GLOBAL APP STRUCTURE

Create five primary navigation areas in a slim left navigation rail:

1. Home
2. Projects
3. Work
4. Agents
5. Settings

At the bottom:

* Current provider health indicator
* User/profile
* App status

The navigation should remain stable throughout the app.

---

# SCREEN 1 — HOME

Design a useful operational dashboard, not a marketing page.

Header:
**Good morning**
Subtitle: **Continue where you left off**

Sections:

### Active Work

Show 3 active/recent work sessions.

Example:

**PMS — Google OAuth Login**

* 63% complete
* 3 agents active
* 5 / 8 tasks completed
* 1 review issue
* Updated 2 minutes ago

**ODC Assistant — Telegram Reminder Refactor**

* Waiting for review
* 1 agent active

**BS Coding — Provider Runtime Architecture**

* Planning
* 2 tasks remaining

Each work item should allow “Open work session”.

### Needs Attention

Small focused list:

* Security review failed on PMS
* Codex account approaching quota
* 1 blocked task

### Recent Projects

Clean list/grid showing project name, git branch, last activity and active work count.

Avoid large analytics charts.

---

# SCREEN 2 — PROJECT

Open sample project:

**PMS**
Path: `D:\Projects\PMS`
Branch: `feature/google-oauth`

Project-level navigation:

* Overview
* Work Sessions
* Files
* Git
* Agents
* Skills
* MCP
* Project Settings

### Overview

Show:

* Active work sessions
* Recent changes
* Current project agents
* Git status
* Important project instructions

Project agents summary:

* Architect — Claude
* Backend Developer — Codex
* Frontend Developer — Codex
* Reviewer — Claude
* Tester — Gemini

Do not expose provider/account details prominently here; show them only on hover or details.

---

# SCREEN 3 — WORK SESSION — MAIN SCREEN

This is the most important screen of the prototype.

Open:

**PMS / Google OAuth Login**

Top header:

Google OAuth Login

Status:
**Executing**

Show compact metadata:

* Started 35 min ago
* 3 agents active
* 5/8 tasks complete
* Branch `feature/google-oauth`

Primary work-session tabs:

**Conversation | Plan | Tasks | Execution | Changes | Review**

Default selected tab: **Tasks**

Do NOT make Chat the entire application.

---

# TASKS VIEW

Use a clear workflow-oriented layout.

Left/center main area shows a task hierarchy:

### Plan

✓ T01 Analyze existing authentication architecture
✓ T02 Design OAuth backend flow
✓ T03 Design login UI
● T04 Implement OAuth backend
● T05 Implement login UI
○ T06 Integration
○ T07 Security & code review
○ T08 Final verification

Use:

* completed
* running
* queued
* blocked
* failed review

statuses with clear but restrained visual treatment.

Show dependency relationships subtly.

Top progress:

**5 / 8 tasks complete · 63%**

Show currently running:

**T04 Implement OAuth backend**
Assigned to: **Backend Developer**
Runtime: **Codex**
Elapsed: 08:42

**T05 Implement login UI**
Assigned to: **Frontend Developer**
Runtime: **Codex**
Elapsed: 05:18

Clicking a task opens a right-side task inspector.

---

# TASK INSPECTOR

For T04 show:

### Implement OAuth backend

Status: Running

Assigned agent:
**Backend Developer**

Objective:
Implement Google OAuth backend authentication.

Scope:

* Auth routes
* OAuth callback
* Session creation

Acceptance criteria:

* OAuth login succeeds
* Invalid callback rejected
* Tokens are never stored in plaintext
* Authentication tests pass

Dependencies:
T02

Live activity:

* Read `src/auth/index.ts`
* Read `src/routes/auth.ts`
* Edited `src/auth/google.ts`
* Running tests

Files changed: 4
Tests: 12 passed / 0 failed

Buttons:

* Open agent activity
* Stop task
* Reassign

Do not show raw chain-of-thought.

---

# CONVERSATION VIEW

Create a clean conversation interface between user and the work-session coordinator.

The coordinator represents the work session rather than an individual model.

Example:

User:
“Implement Google OAuth login using the existing session architecture.”

Coordinator:
“I analyzed the project and created an 8-task implementation plan. Backend and frontend implementation can run in parallel.”

Then show a compact embedded plan card.

Messages should include execution status where relevant.

Do not show every worker conversation inline.

Worker activity can be opened from a task.

---

# RUNTIME EPOCH BEHAVIOR — VERY IMPORTANT

Demonstrate the new runtime switching concept.

Within the conversation create a visible but subtle separator:

**Runtime changed**
Claude Opus → Codex
10:43 AM
**Context transferred successfully**

Tooltip/help text:
“A new runtime started using normalized work-session context.”

Before the separator show responses produced under Claude.

After the separator show Codex continuing the same Work Session.

Do NOT make it look like the same raw model conversation continued invisibly.

Internally represent the concept as:

Work Session

* Runtime Epoch 1 — Claude
* Runtime Epoch 2 — Codex

The user should understand continuity of work without needing to understand provider protocols.

---

# TOOL EXECUTION UX

Real tool executions must visually differ from normal assistant text.

Tool actions should appear as compact activity rows/cards:

Read file
`src/auth/google.ts`
Completed

Run tests
`npm test -- auth`
12 passed

Edit file
`src/routes/auth.ts`
Completed

Never represent a fake text description such as:

“Calling read({ ... })”

as an executed tool.

If a model attempts to narrate a tool instead of sending a valid structured tool call, show a system-level execution event:

**Tool protocol retry**
The runtime described a tool action instead of invoking it.
Retrying with structured tool execution…

If retry fails:

**Runtime tool capability degraded**
[Switch runtime] [Continue without tools]

This should look like a system/runtime event, not an assistant message.

---

# PLAN VIEW

Show the coordinator-generated implementation plan.

Sections:

* Goal
* Technical approach
* Task breakdown
* Dependencies
* Acceptance criteria
* Risks

Provide buttons:

* Approve & Execute
* Edit plan
* Regenerate

Plan approval should be visually distinct from normal chat.

---

# EXECUTION VIEW

Create an execution dashboard based on tasks, not multiple chat windows.

Top summary:

* 3 agents running
* 2 waiting
* 5 tasks complete
* 1 review pending

Display an execution graph:

Architect
↓
Backend + Frontend running in parallel
↓
Integration
↓
Reviewer + Tester
↓
Final Verification

Also provide a list view toggle.

Each node shows:

* agent
* task
* status
* elapsed time

Click a node to inspect details.

Do not build a matrix of full agent chat panes.

---

# CHANGES VIEW

Developer-focused change review.

Left:
Changed files tree.

Center:
Diff viewer.

Example:

* `src/auth/google.ts`
* `src/routes/auth.ts`
* `src/auth/session.ts`
* `tests/auth/google.test.ts`

Header:
**4 files changed · +183 −27**

Actions:

* Review changes
* Revert task
* Open in editor

---

# REVIEW VIEW

Show automated verification in three layers.

### Mechanical checks

✓ Typecheck
✓ Build
✓ Unit tests 48/48
✓ Lint

### AI Reviews

**Code Reviewer — Claude**
PASS with 2 suggestions

**Security Reviewer — Gemini**
FAIL — 1 high severity issue

Finding:
“OAuth state validation is missing on callback.”

Actions:

* Create rework task
* Assign to Backend Developer

### Final Verification

Pending until required gates pass.

Clearly communicate that a worker cannot mark the whole Work Session completed by itself.

---

# BOTTOM PANEL

Add a collapsible IDE-style bottom panel.

Tabs:

**Terminal | Tests | Problems | Logs | Output**

Terminal is a supporting tool, not the main application.

Keep it collapsed by default.

When expanded it should occupy approximately 30% of vertical space.

---

# SCREEN 4 — AGENTS

Create a dedicated project Agent Management screen.

Header:
**Project Agents**

Show agents as clean rows or cards:

### Orchestrator

Role: Coordinator
Model: Claude Opus
Status: Ready

Capabilities:
Planning · Task assignment · Review coordination

### Architect

Role: Specialist
Model: Claude Opus
Status: Ready

### Backend Developer

Role: Worker
Runtime: Codex
Status: Running

### Frontend Developer

Role: Worker
Runtime: Codex
Status: Running

### Reviewer

Role: Reviewer
Model: Claude
Status: Ready

### Tester

Role: Reviewer
Model: Gemini
Status: Ready

Click agent → right inspector.

Agent configuration contains:

* Name
* Role
* Provider
* Model
* Runtime mode
* Tools
* Skills
* MCP
* Permissions
* Context policy
* Fallback policy

Use clear hierarchy:

Provider → Account → Model → Agent

but do not require users to think about account selection during ordinary work.

Support account policy:

* Auto
* Preferred
* Pinned

Default: Auto.

---

# SCREEN 5 — SETTINGS / PROVIDERS

Global Settings should contain only app-wide configuration.

Tabs:

* Application
* Appearance
* Providers
* Security
* Default Permissions
* Updates
* Remote Control

Do NOT put project agent configuration here.

### Providers

Show provider cards:

OpenAI
Connected
3 accounts
Healthy

Anthropic
Connected
2 accounts
Healthy

Google
Connected
1 account

Ollama
Local

Click OpenAI.

Display accounts:

Account A
ChatGPT Pro
Healthy
Weekly quota 74% remaining

Account B
ChatGPT Plus
Healthy
Weekly quota 38% remaining

Account C
ChatGPT Pro
Cooldown

Models available underneath each account only when expanded.

Include:

* Connect account
* Refresh
* Disable account

Avoid “active account” as an exclusive concept.

Multiple accounts can be enabled simultaneously.

---

# UX SCOPE RULES

Make scope visually consistent:

### Global

Providers
Application
Security
Updates

### Project

Agents
Skills
MCP
Instructions
Git configuration

### Work Session

Goal
Plan
Tasks
Execution
Review
Runtime policy

Never mix these scopes.

---

# INTERACTIVE PROTOTYPE

Make important interactions functional:

1. Home → open PMS project
2. Project → open Google OAuth work session
3. Switch Work Session tabs
4. Click a task → task inspector opens
5. Click “Open agent activity”
6. Expand/collapse bottom Terminal panel
7. Switch Tasks ↔ Execution ↔ Review
8. Create a simulated “Runtime changed: Claude → Codex” event
9. Agents → open agent inspector
10. Settings → Providers → expand OpenAI account
11. Collapse/expand left navigation
12. Show hover tooltips for technical metadata

Use realistic microinteractions, selected states, loading/running states and tooltips.

---

# VISUAL PRIORITIES

Prioritize in this order:

1. Work Session / Tasks
2. Work Session / Execution
3. Work Session / Review
4. Project
5. Agents
6. Providers
7. Home

The prototype should immediately communicate:

**“I give BS Coding a goal, it plans the work, distributes tasks to AI agents, executes them, cross-checks the result, and shows me exactly where the work stands.”**

Avoid:

* terminal-first layouts
* many simultaneous chat panes
* excessive cards
* large empty dashboard widgets
* excessive metrics
* deeply nested modals
* provider/account details in normal work views
* technical implementation concepts dominating the main UX
* fake tool calls displayed as successful executions

Create the result as a polished, cohesive, production-quality interactive prototype rather than a collection of disconnected screens.
