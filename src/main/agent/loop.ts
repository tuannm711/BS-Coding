import { randomUUID } from 'node:crypto'
import type { ModelMessage } from 'ai'
import type { ArtifactEntry, ChatEvent, ChatMessage, MessageTokens, PromptResponse, QuestionPrompt, QueuedMessage, TodoItem, ToolCallData } from '../../shared/types'
import { appendStreamDelta } from '../../shared/text'
import type { LlmClient, LlmStreamPart } from './llm'
import { formatLlmError } from './llm'
import { toLlmMessages } from './message'
import type { TranscriptItem } from './message'
import type { ToolContext, ToolDefinition } from './tools/types'
import type { PermissionDecision } from './permission'
import { selectHeadTail, serializeItems, buildCompactionPrompt, compactTranscript, COMPACTION_MARKER, pruneToolOutputs } from './compact'
import { instructionFilesForFile } from './instructions'
import type { CompactionSettings } from './compact'
import { estimateUsage } from './token'
import type { TruncationStore } from './truncation'
import type { SnapshotStore } from './snapshot'
import { validateToolInput } from './tool-input'
import { classifyProviderError } from '../../shared/provider-state'

export interface LoopDeps {
  agentId: string
  taskId?: string
  turn?: number
  model: string
  system: string
  /** Overrides llm, model and system for this step when present. */
  currentTarget?: () => { llm: LlmClient; model: string; system: string; variantOptions?: Record<string, unknown> } | undefined
  /** Returns true when another target took over and the turn should continue. */
  handoff?: (message: string) => Promise<boolean>
  // Appended at stream time, so the caller can vary it per turn. The shared
  // session uses this: its prompt is decided when the turn runs, not when the
  // runner is built and cached for the agent.
  systemSuffix?: () => string
  systemInstructionPaths?: ReadonlySet<string>
  cwd: string
  llm: LlmClient
  tools: Map<string, ToolDefinition>
  decidePermission: (toolName: string, input?: Record<string, unknown>) => PermissionDecision
  ask: (promptId: string, tool?: string) => Promise<PromptResponse | null>
  maxSteps?: number
  maxContextTokens?: number
  compaction?: CompactionSettings
  toolOutput?: { maxBytes: number; maxLines: number }
  truncation?: TruncationStore
  replaceItems?: (items: TranscriptItem[]) => void
  snapshots?: SnapshotStore
  snapshotScopeId?: () => string
  onEvent: (e: ChatEvent) => void
  onArtifact?: (entry: Omit<ArtifactEntry, 'id' | 'ts'>) => void
  getItems: () => TranscriptItem[]
  buildMessages?: (items: TranscriptItem[]) => ModelMessage[]
  appendMessage: (msg: ChatMessage) => void
  appendTool: (tool: ToolCallData) => void
  // Returns and clears all pending steered messages (injected at the next step
  // boundary while a turn is running, opencode-style).
  takeSteers?: () => QueuedMessage[]
  setTodos?: (todos: TodoItem[]) => void
  variantOptions?: Record<string, unknown>
  serviceTier?: 'priority'
  onUsage?: (tokens: MessageTokens) => void
  computeCost?: (usage: { input: number; output: number; cacheRead?: number; cacheWrite?: number }) => number
  diagnostics?: (filePath: string, text: string) => Promise<string>
}

const DEFAULT_MAX_STEPS = 50
const MAX_COMPACT_PER_RUN = 2
const MAX_STEPS_PROMPT = 'Final step: wrap up and provide your final answer now. Tool calls are disabled.'

export class SessionRunner {
  private readonly maxSteps: number
  private compactedThisRun = 0
  // Provider-reported usage of the last LLM call; overflow detection trusts it
  // over the transcript char estimate because it includes the system prompt and
  // tool definitions (see maybeCompact).
  private lastTokens: MessageTokens | undefined
  // AGENTS.md paths already attached to a read output this session; cross-message
  // dedupe so instructions are not repeated across turns (opencode claims set).
  private attachedInstructions = new Set<string>()

  constructor(private deps: LoopDeps) {
    this.maxSteps = deps.maxSteps ?? DEFAULT_MAX_STEPS
  }

  async run(signal?: AbortSignal): Promise<void> {
    const { agentId } = this.deps
    let steps = 0
    this.compactedThisRun = 0
    const runUsage = { input: 0, output: 0, total: 0, cacheRead: 0, cacheWrite: 0 }
    while (true) {
      if (signal?.aborted) {
        this.deps.onEvent({ type: 'done', agentId, reason: 'stopped' })
        return
      }
      const steers = this.deps.takeSteers?.() ?? []
      if (steers.length > 0) {
        for (const s of steers) {
          const msg: ChatMessage = {
            id: s.id,
            role: 'user',
            text: s.text,
            displayText: s.displayText ?? s.text,
            images: s.images,
            createdAt: Date.now()
          }
          this.deps.appendMessage(msg)
          this.deps.onEvent({ type: 'user-message', agentId, message: msg })
        }
        // Fresh step budget for the continued work, like opencode's
        // currentStep reset after promoting steers.
        steps = 0
        continue
      }
      steps++
      const isLastStep = steps >= this.maxSteps
      let retriedOverflow = false
      let overflowRetry = false

      await this.compactIfOverThreshold(signal)

      const llmMessages = this.buildMessages(isLastStep)
      let hasToolCall = false
      let textBuffer = ''
      let reasoningBuffer = ''
      let tokens: MessageTokens | undefined
      const calls: ToolCallData[] = []
      const persistPartial = () => {
        if (!textBuffer && !reasoningBuffer) return
        this.deps.appendMessage({
          id: randomUUID(),
          role: 'assistant',
          text: textBuffer,
          reasoning: reasoningBuffer || undefined,
          tokens,
          createdAt: Date.now()
        })
      }
      try {
        // Resolved per step, so something above can change who answers without
        // the loop learning what an agent is.
        const target = this.deps.currentTarget?.()
        const stream = (target?.llm ?? this.deps.llm).stream({
          model: target?.model ?? this.deps.model,
          system: (target?.system ?? this.deps.system) + (this.deps.systemSuffix?.() ?? ''),
          messages: llmMessages,
          tools: isLastStep ? [] : this.visibleToolDefs(),
          signal,
          variantOptions: target?.variantOptions ?? this.deps.variantOptions,
          serviceTier: this.deps.serviceTier
        })
        for await (const part of stream) {
          if (signal?.aborted) {
            persistPartial()
            this.deps.onEvent({ type: 'done', agentId, reason: 'stopped' })
            return
          }
          if (part.kind === 'text') {
            const next = appendStreamDelta(textBuffer, part.text ?? '')
            const delta = next.slice(textBuffer.length)
            textBuffer = next
            this.deps.onEvent({ type: 'text-delta', agentId, delta })
          } else if (part.kind === 'reasoning') {
            const next = appendStreamDelta(reasoningBuffer, part.text ?? '')
            const delta = next.slice(reasoningBuffer.length)
            reasoningBuffer = next
            this.deps.onEvent({ type: 'reasoning-delta', agentId, delta })
          } else if (part.kind === 'tool-call') {
            hasToolCall = true
            const call: ToolCallData = {
              id: part.toolCallId ?? randomUUID(),
              tool: part.toolName ?? 'unknown',
              input: part.toolInput ?? {},
              thoughtSignature: part.thoughtSignature,
              permission: 'pending'
            }
            calls.push(call)
            this.deps.onEvent({ type: 'tool-start', agentId, call })
          } else if (part.kind === 'finish') {
            tokens = part.tokens
            if (part.tokens) {
              this.lastTokens = part.tokens
              runUsage.input += part.tokens.input
              runUsage.output += part.tokens.output
              runUsage.total += part.tokens.total
              runUsage.cacheRead += part.tokens.cacheRead ?? 0
              runUsage.cacheWrite += part.tokens.cacheWrite ?? 0
              // Báo usage ngay mỗi step: nếu user bấm Stop hoặc gặp lỗi giữa
              // chừng, chi phí đã tiêu vẫn được ghi nhận.
              this.deps.onUsage?.(part.tokens)
            }
          } else if (part.kind === 'error') {
            const message = part.error ?? 'llm error'
            if (await this.recoverFromOverflow(message, retriedOverflow, signal)) {
              retriedOverflow = true
              overflowRetry = true
              break
            }
            // Beside the overflow recovery that already lives here: another
            // target may be able to carry the same turn.
            if (await this.deps.handoff?.(message)) {
              overflowRetry = true
              break
            }
            persistPartial()
            this.deps.onEvent({ type: 'error', agentId, message })
            return
          }
        }
      } catch (err) {
        if (signal?.aborted) {
          persistPartial()
          this.deps.onEvent({ type: 'done', agentId, reason: 'stopped' })
          return
        }
        const message = formatLlmError(err)
        if (await this.recoverFromOverflow(message, retriedOverflow, signal)) {
          retriedOverflow = true
          overflowRetry = true
        } else if (await this.deps.handoff?.(message)) {
          overflowRetry = true
        } else {
          persistPartial()
          this.deps.onEvent({ type: 'error', agentId, message })
          return
        }
      }
      if (overflowRetry) continue

      if (signal?.aborted) {
        persistPartial()
        this.deps.onEvent({ type: 'done', agentId, reason: 'stopped' })
        return
      }

      if (textBuffer || calls.length > 0 || reasoningBuffer) {
        this.deps.appendMessage({
          id: randomUUID(),
          role: 'assistant',
          text: textBuffer,
          reasoning: reasoningBuffer || undefined,
          tokens,
          createdAt: Date.now()
        })
      }

      // Parallel tool execution like opencode: run auto-approved calls
      // concurrently; permission-asking calls run serially afterwards to avoid
      // two prompts at once.
      const askCalls = calls.filter(c => this.deps.decidePermission(c.tool, c.input) === 'ask')
      const autoCalls = calls.filter(c => this.deps.decidePermission(c.tool, c.input) !== 'ask')
      await Promise.all(autoCalls.map(call => this.executeCall(call, signal)))
      for (const call of askCalls) await this.executeCall(call, signal)

      if (!hasToolCall) {
        this.deps.onEvent({ type: 'done', agentId, reason: 'complete', tokens, cost: this.deps.computeCost?.(runUsage) })
        return
      }
      if (isLastStep) {
        this.deps.onEvent({ type: 'done', agentId, reason: 'max-steps', tokens, cost: this.deps.computeCost?.(runUsage) })
        return
      }
    }
  }

  private async executeCall(call: ToolCallData, signal?: AbortSignal): Promise<void> {
    const { agentId } = this.deps
    const decision = this.deps.decidePermission(call.tool, call.input)
    let allowed: boolean
    if (decision === 'allow') {
      allowed = true
    } else if (decision === 'deny') {
      allowed = false
    } else {
      const promptId = randomUUID()
      this.deps.onEvent({ type: 'prompt-request', agentId, promptId, kind: 'permission', call })
      const resp = await this.deps.ask(promptId, call.tool)
      allowed = resp?.allow ?? false
    }

    if (!allowed) {
      call.permission = 'denied'
      const deniedReason = this.deps.decidePermission(call.tool, call.input)
      call.error = deniedReason === 'deny'
        ? `tool "${call.tool}" is not permitted in the current mode`
        : 'permission denied by user'
    } else {
      call.permission = 'allowed'
      const def = this.deps.tools.get(call.tool)
      if (!def) {
        call.error = `unknown tool: ${call.tool}`
      } else {
        const toolCtx: ToolContext = {
          cwd: this.deps.cwd,
          signal,
          agentId: this.deps.agentId,
          snapshotScopeId: this.deps.snapshotScopeId?.(),
          toolCallId: call.id,
          taskId: this.deps.taskId,
          turn: this.deps.turn,
          snapshots: this.deps.snapshots,
          diagnostics: this.deps.diagnostics,
          setTodos: (todos) => this.deps.setTodos?.(todos),
          emitSubagent: (taskId, e) => this.deps.onEvent({
            type: 'subagent-event',
            agentId: this.deps.agentId,
            taskId,
            parentTaskId: e.parentTaskId,
            sub: e.sub,
            subagentType: e.subagentType,
            text: e.text,
            tool: e.tool,
            state: e.state
          }),
          ask: async (question: QuestionPrompt) => {
            const promptId = randomUUID()
            this.deps.onEvent({
              type: 'prompt-request',
              agentId,
              promptId,
              kind: 'question',
              question: question.question,
              options: question.options,
              multiple: question.multiple,
              custom: question.custom
            })
            const resp = await this.deps.ask(promptId)
            return resp?.text ?? null
          },
          onFileRead: (filePath) => {
            const skip = new Set([...this.attachedInstructions, ...(this.deps.systemInstructionPaths ?? [])])
            const files = instructionFilesForFile(filePath, skip)
            if (files.length === 0) return ''
            for (const f of files) this.attachedInstructions.add(f.path)
            return `<system-reminder>\n${files.map(f => `Instructions from: ${f.path}\n${f.content}`).join('\n\n')}\n</system-reminder>`
          },
          onArtifact: (entry) => this.deps.onArtifact?.(entry)
        }
        const validated = validateToolInput(def, call.input)
        if (!validated.ok) {
          call.error = validated.error
        } else {
          call.input = validated.input
          try {
            const r = await def.run(validated.input, toolCtx)
            call.output = r.output
            call.error = r.error
          } catch (err) {
            call.error = String(err)
          }
        }
      }
    }
    this.deps.appendTool(call)
    this.deps.onEvent({ type: 'tool-result', agentId, call })
  }

  private visibleToolDefs(): ToolDefinition[] {
    return [...this.deps.tools.values()]
      .filter(t => this.deps.decidePermission(t.name) !== 'deny')
  }

  // Token-based overflow detection (modeled on opencode session/compaction.ts):
  // when the estimated request size approaches the model context limit, run an
  // LLM compaction that summarizes the older head and keeps the recent tail
  // verbatim.
  // A provider that rejects a request for length is telling us the proactive
  // estimate was wrong. Compacting and retrying the step once turns that from a
  // dead turn into a slower one. The retry is capped per step and the compaction
  // is still bounded by MAX_COMPACT_PER_RUN, so a request that overflows again
  // fails exactly as it did before.
  private async recoverFromOverflow(message: string, alreadyRetried: boolean, signal?: AbortSignal): Promise<boolean> {
    if (alreadyRetried || signal?.aborted) return false
    if (classifyProviderError(undefined, message).kind !== 'context-overflow') return false
    if (this.compactedThisRun >= MAX_COMPACT_PER_RUN) return false
    const before = this.compactedThisRun
    await this.compactIfOverThreshold(signal, true)
    // Retrying an identical request would just overflow again.
    return this.compactedThisRun > before
  }

  async compactIfOverThreshold(signal?: AbortSignal, force = false): Promise<void> {
    const { compaction, maxContextTokens, replaceItems } = this.deps
    if (!compaction?.auto || !maxContextTokens || maxContextTokens <= 0 || !replaceItems) return
    const usable = maxContextTokens - compaction.buffer
    if (usable <= 0) return
    let items = this.deps.getItems()
    const opts = { toolOutputMaxChars: compaction.toolOutputMaxChars, ...this.truncationOpts() }
    // Trust the provider-reported usage when available (mirrors opencode's
    // overflow check): it covers the system prompt + tool definitions, which
    // the transcript char estimate never counts. Fall back to the estimate
    // only before the first response arrives.
    const usedTokens = this.lastTokens
      ? this.lastTokens.total ||
        this.lastTokens.input + this.lastTokens.output +
        (this.lastTokens.cacheRead ?? 0) + (this.lastTokens.cacheWrite ?? 0)
      : estimateUsage(toLlmMessages(items, opts))
    if (!force && usedTokens < usable) return

    // Prune old tool outputs first (cheap) before spending an LLM compact call.
    const pruned = pruneToolOutputs(items, compaction)
    if (pruned) {
      replaceItems(items)
      const afterPrune = this.lastTokens
        ? usedTokens
        : estimateUsage(toLlmMessages(items, opts))
      if (!force && afterPrune < usable) return
    }

    const { head, tail } = selectHeadTail(items, compaction.keepTokens, compaction.tailTurns)
    if (head.length === 0) return
    if (this.compactedThisRun >= MAX_COMPACT_PER_RUN) return
    const previousSummary = this.findPreviousSummary(items)
    const prompt = buildCompactionPrompt(previousSummary, serializeItems(head, compaction.toolOutputMaxChars))
    const summary = await compactTranscript({ llm: this.deps.llm, model: this.deps.model, prompt, signal })
    if (signal?.aborted) return
    if (!summary) {
      // Surface silent failures: a failed compaction LLM call must not leave
      // the user stuck at an over-limit context with no feedback.
      this.deps.onEvent({ type: 'compaction-failed', agentId: this.deps.agentId })
      return
    }
    this.compactedThisRun++

    // Render the compaction like opencode: a user marker followed by the summary
    // as an assistant message, then the verbatim recent tail.
    const now = Date.now()
    const markerItem: TranscriptItem = {
      kind: 'message',
      message: { id: randomUUID(), role: 'user', text: COMPACTION_MARKER, createdAt: now }
    }
    const summaryItem: TranscriptItem = {
      kind: 'message',
      message: { id: randomUUID(), role: 'assistant', text: summary, createdAt: now }
    }
    replaceItems([markerItem, summaryItem, ...tail])
    this.deps.onEvent({ type: 'compacted', agentId: this.deps.agentId, summary })
  }

  private truncationOpts(): { truncate?: (toolId: string, text: string) => string } {
    const store = this.deps.truncation
    const cfg = this.deps.toolOutput
    if (!store || !cfg) return {}
    const { maxBytes, maxLines } = cfg
    return { truncate: (toolId, text) => store.truncate(this.deps.agentId, toolId, text, { maxBytes, maxLines }) }
  }

  private findPreviousSummary(items: TranscriptItem[]): string | undefined {
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i]
      if (item.kind !== 'message' || item.message.role !== 'user') continue
      if (item.message.text !== COMPACTION_MARKER) continue
      const next = items[i + 1]
      if (next?.kind === 'message' && next.message.role === 'assistant') return next.message.text
    }
    return undefined
  }

  private buildMessages(isLastStep = false): ReturnType<typeof toLlmMessages> {
    const items = this.deps.getItems()
    const toolOutputMaxChars = this.deps.compaction?.toolOutputMaxChars
    const messages = this.deps.buildMessages
      ? this.deps.buildMessages(items)
      : toLlmMessages(items, { toolOutputMaxChars, ...this.truncationOpts() })
    return isLastStep ? [...messages, { role: 'user', content: MAX_STEPS_PROMPT }] : messages
  }
}
