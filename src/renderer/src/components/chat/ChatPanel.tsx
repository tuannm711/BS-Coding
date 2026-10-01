import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { AgentConfig, AgentMode, BsSettings, ChatEvent, ChatMessage, Command, ContextInfo, ImageAttachment, QuestionOption, QueuedMessage, QuickMessage, TodoItem, TodoStatus, ToolCallData, TurnExecutionSnapshot } from '@shared/types'
import { appendStreamDelta } from '@shared/text'
import { contextTokens, latestContextTokens } from '@shared/usage'
import ChatInput from './ChatInput'
import { buildQuestionAnswer } from './questionAnswer'
import ModelPicker from './ModelPicker'
import QuickMessageButtons from './QuickMessageButtons'
import AgentPicker from './AgentPicker'
import VariantPicker from './VariantPicker'
import ContextFooter from './ContextFooter'
import { FeedRow, feedItemKey, type FeedItem } from './FeedRow'
import { withNarrationNotices } from './transcript-notices'
import { acceptChatEvent, acceptUsageSnapshot } from './chat-event-scope'
import { useChatScroll } from './useChatScroll'
import { finalResponseIds, mergeTranscriptSnapshot } from './chat-presentation'

interface PendingPrompt {
  promptId: string
  promptType: 'permission' | 'question'
  call?: ToolCallData
  question?: string
  options?: QuestionOption[]
  multiple?: boolean
  custom?: boolean
}

interface Props {
  agentId: string
  agents: AgentConfig[]
  onAgentChange: (agentId: string) => void
  projectPath: string
  sessionId: string
  onSessionChange: (sessionId: string, agentId?: string) => void
  cwd: string
  mode?: AgentMode
  variant?: string
  onModeChange?: (mode: AgentMode) => void
  onVariantChange?: (variant: string | undefined) => void
}

function ChatPanel({ agentId, agents, onAgentChange, projectPath, sessionId, onSessionChange, cwd, mode = 'build', variant, onModeChange, onVariantChange }: Props) {
  const [items, setItems] = useState<FeedItem[]>([])
  const [running, setRunning] = useState(false)
  const [activity, setActivity] = useState('Working')
  const [workingAgentId, setWorkingAgentId] = useState(agentId)
  const [quickMessages, setQuickMessages] = useState<QuickMessage[]>([])
  const [quickSending, setQuickSending] = useState(false)
  const quickSendingRef = useRef(false)
  const [sendError, setSendError] = useState('')
  useEffect(() => {
    let active = true
    const apply = (settings: BsSettings) => { if (active) setQuickMessages(settings.quickMessages ?? []) }
    void window.api.getSettings().then(apply)
    const saved = (event: Event) => apply((event as CustomEvent<BsSettings>).detail)
    window.addEventListener('bs:settings-saved', saved)
    return () => { active = false; window.removeEventListener('bs:settings-saved', saved) }
  }, [])
  const [currentMode, setCurrentMode] = useState<AgentMode>(mode)
  const [currentVariant, setCurrentVariant] = useState<string>(variant ?? '')
  // Keep local state in sync with the authoritative main-process config pushed
  // via EventAgentConfig; otherwise a remount reverts to the pre-change mode.
  useEffect(() => setCurrentMode(mode), [mode])
  useEffect(() => setCurrentVariant(variant ?? ''), [variant])
  const [availableVariants, setAvailableVariants] = useState<string[]>([])
  const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(null)
  const [selectedAction, setSelectedAction] = useState(0)
  const [questionText, setQuestionText] = useState('')
  const [selectedOptions, setSelectedOptions] = useState<string[]>([])
  const [customInput, setCustomInput] = useState(false)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [contextUsed, setContextUsed] = useState<number | null>(null)
  const [sessionCost, setSessionCost] = useState(0)
  const [sessionTokens, setSessionTokens] = useState<{ input: number; output: number } | null>(null)
  const [contextLimit, setContextLimit] = useState<number | null>(null)
  const [contextLimitSource, setContextLimitSource] = useState<ContextInfo['limitSource']>()
  const [compactThreshold, setCompactThreshold] = useState<number | null>(null)
  const [commands, setCommands] = useState<Command[]>([])
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [todosCollapsed, setTodosCollapsed] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [queue, setQueue] = useState<QueuedMessage[]>([])
  const queueRef = useRef<QueuedMessage[]>([])
  const [editTarget, setEditTarget] = useState<QueuedMessage | null>(null)
  const [liveTaskId, setLiveTaskId] = useState<string | null>(null)
  const scroll = useChatScroll()
  const { startTurnAnchor, replaceActiveAnchorId, pinSessionToEnd, reconcile } = scroll
  const promptRef = useRef<HTMLDivElement>(null)
  // Stream deltas are accumulated per animation frame: one setItems per frame
  // bounds markdown parsing and feed re-renders, which otherwise saturate the
  // UI thread on every token and make typing in the input lag.
  const deltaBufRef = useRef<{ text: string; reasoning: string }>({ text: '', reasoning: '' })
  const rafRef = useRef<number | null>(null)
  const streamRowSequence = useRef(0)
  const activeTurnIdRef = useRef<string | undefined>(undefined)
  const viewRevisionRef = useRef(0)
  const usageRequestRef = useRef(0)
  const contextInfoRequestRef = useRef(0)
  const contextUsageRevisionRef = useRef(0)
  const usageScopeRef = useRef({ projectPath, sessionId, agentId })
  usageScopeRef.current = { projectPath, sessionId, agentId }
  const historyRequestRef = useRef(0)
  const initialTranscriptRef = useRef(true)
  const viewScopeRef = useRef({ projectPath, sessionId })
  viewScopeRef.current = { projectPath, sessionId }

  const refreshVariants = useCallback(() => {
    void window.api.getAgentVariants(agentId).then(list => {
      setAvailableVariants(list)
      setCurrentVariant(current => {
        if (current && !list.includes(current)) {
          onVariantChange?.(undefined)
          return ''
        }
        return current
      })
    })
  }, [agentId, onVariantChange])

  const loadContextInfo = useCallback(() => {
    const scope = { projectPath, sessionId, agentId, revision: ++contextInfoRequestRef.current }
    void window.api.getContextInfo(agentId).then(info => {
      if (!acceptUsageSnapshot({ ...usageScopeRef.current, revision: contextInfoRequestRef.current }, scope)) return
      setContextLimit(info.limit)
      setContextLimitSource(info.limitSource)
      setCompactThreshold(info.compactThreshold)
    }).catch(() => {
      if (!acceptUsageSnapshot({ ...usageScopeRef.current, revision: contextInfoRequestRef.current }, scope)) return
      setContextLimit(null)
      setContextLimitSource(undefined)
      setCompactThreshold(null)
    })
  }, [agentId, projectPath, sessionId])

  const loadSessionUsage = useCallback(() => {
    const scope = { projectPath, sessionId, revision: ++usageRequestRef.current }
    void window.api.getSessionUsage(projectPath, sessionId).then(usage => {
      if (!acceptUsageSnapshot({ projectPath: usageScopeRef.current.projectPath, sessionId: usageScopeRef.current.sessionId, revision: usageRequestRef.current }, scope)) return
      setSessionCost(usage.cost)
      setSessionTokens({
        input: usage.input + usage.cacheRead + usage.cacheWrite,
        output: usage.output
      })
    }).catch(() => {
      if (!acceptUsageSnapshot({ projectPath: usageScopeRef.current.projectPath, sessionId: usageScopeRef.current.sessionId, revision: usageRequestRef.current }, scope)) return
      setSessionTokens(null)
    })
  }, [projectPath, sessionId])

  useEffect(() => { refreshVariants(); loadContextInfo() }, [refreshVariants, loadContextInfo])
  useEffect(() => {
    setContextUsed(null)
    setSessionCost(0)
    setSessionTokens(null)
    loadSessionUsage()
  }, [loadSessionUsage])

  useEffect(() => {
    const onModelChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ agentId: string }>).detail
      if (detail?.agentId === agentId) { refreshVariants(); loadContextInfo() }
    }
    window.addEventListener('bs:model-changed', onModelChanged)
    return () => window.removeEventListener('bs:model-changed', onModelChanged)
  }, [agentId, refreshVariants, loadContextInfo])

  useEffect(() => {
    if (pendingPrompt && pendingPrompt.promptType === 'permission') {
      promptRef.current?.focus()
    }
  }, [pendingPrompt])

  const loadTranscript = useCallback((merge = false) => {
    const request = ++historyRequestRef.current
    const revision = viewRevisionRef.current
    const usageRevision = contextUsageRevisionRef.current
    const initial = initialTranscriptRef.current
    void window.api.listSessionTranscript(projectPath, sessionId).then(items => {
      if (request !== historyRequestRef.current || viewScopeRef.current.projectPath !== projectPath || viewScopeRef.current.sessionId !== sessionId) return
      if (!initial && !merge && viewRevisionRef.current !== revision) return
      const snapshot = withNarrationNotices(items.map(it => it.kind === 'message'
        ? {
            kind: 'message', id: it.message.id, role: it.message.role,
            text: it.message.displayText ?? it.message.text,
            reasoning: it.message.reasoning, images: it.message.images, execution: it.message.execution, turnId: it.message.turnId
          }
        : { kind: 'tool', id: it.tool.id, call: { ...it.tool } }
      ))
      setItems(previous => merge || viewRevisionRef.current !== revision ? mergeTranscriptSnapshot(snapshot, previous) : snapshot)
      if (!activeTurnIdRef.current && viewRevisionRef.current === revision && initial) {
        const active = [...items].reverse().find(item => (item.kind === 'message' ? item.message.execution : item.tool.execution)?.status === 'running')
        if (active) activeTurnIdRef.current = active.kind === 'message' ? active.message.turnId : active.tool.turnId
      }
      if (contextUsageRevisionRef.current === usageRevision) setContextUsed(latestContextTokens(items))
      if (initialTranscriptRef.current) { pinSessionToEnd(); initialTranscriptRef.current = false }
    })
  }, [projectPath, sessionId, pinSessionToEnd])

  const loadTodos = useCallback(() => {
    void window.api.getSessionTodos(projectPath, sessionId).then(setTodos)
  }, [projectPath, sessionId])

  const resetView = useCallback(() => {
    initialTranscriptRef.current = true
    viewRevisionRef.current++
    activeTurnIdRef.current = undefined
    deltaBufRef.current = { text: '', reasoning: '' }
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    setItems([])
    setRunning(false)
    setActivity('Working')
    setPendingPrompt(null)
    setSelectedAction(0)
    setQuestionText('')
    setSelectedOptions([])
    setCustomInput(false)
    setContextUsed(null)
    setSessionCost(0)
    setSessionTokens(null)
    loadContextInfo()
    loadSessionUsage()
    setTodos([])
    setQueue([])
    queueRef.current = []
    setEditTarget(null)
    setLiveTaskId(null)
    loadTranscript()
    loadTodos()
  }, [loadTranscript, loadTodos, loadContextInfo, loadSessionUsage])

  useEffect(() => {
    activeTurnIdRef.current = undefined
    initialTranscriptRef.current = true
    deltaBufRef.current = { text: '', reasoning: '' }
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    viewRevisionRef.current++
    setItems([])
    setPendingPrompt(null)
    setActivity('Working')
    loadTranscript()
    loadTodos()
    void window.api.listCommands(cwd).then(setCommands)
    // The agent may already be mid-turn from before a project switch/remount;
    // restore the running state so the Stop button and indicator come back.
    const runningRevision = viewRevisionRef.current
    void window.api.isSessionChatRunning(projectPath, sessionId).then(value => {
      if (viewScopeRef.current.projectPath === projectPath && viewScopeRef.current.sessionId === sessionId && viewRevisionRef.current === runningRevision) setRunning(value)
    })
    const off = window.api.onChatEvent(e => applyEvent(e))
    return off
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath, sessionId, cwd])

  const openFile = useCallback((p: string) => {
    void window.api.openFile({ path: p, root: cwd })
  }, [cwd])

  useLayoutEffect(() => {
    reconcile()
  }, [items, running, queue, reconcile])

  // Applies deltas accumulated during one animation frame. Copy-on-write keeps
  // the updater pure and gives memoized rows a fresh object with new text.
  const flushDeltas = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    const { text, reasoning } = deltaBufRef.current
    if (!text && !reasoning) return
    deltaBufRef.current = { text: '', reasoning: '' }
    const turnId = activeTurnIdRef.current
    setItems(prev => {
      const next = [...prev]
      if (text) {
        const last = next[next.length - 1]
        if (last && last.kind === 'message' && last.role === 'assistant') {
          next[next.length - 1] = { ...last, text: appendStreamDelta(last.text, text) }
        } else {
          next.push({ kind: 'message', id: `a-${Date.now()}-${++streamRowSequence.current}`, role: 'assistant', text, turnId })
        }
      }
      if (reasoning) {
        const last = next[next.length - 1]
        if (last && last.kind === 'message' && last.role === 'assistant') {
          next[next.length - 1] = { ...last, reasoning: appendStreamDelta(last.reasoning ?? '', reasoning) }
        } else {
          next.push({ kind: 'message', id: `a-${Date.now()}-${++streamRowSequence.current}`, role: 'assistant', text: '', reasoning, turnId })
        }
      }
      return next
    })
  }, [setItems])

  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
  }, [])

  // Close the subagent live popup on Escape only (backdrop click no longer closes).
  useEffect(() => {
    if (!liveTaskId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLiveTaskId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [liveTaskId])

  const applyEvent = useCallback((e: ChatEvent) => {
    if (!acceptChatEvent({ projectPath, sessionId, turnId: activeTurnIdRef.current }, e)) return
    if (e.turnId && !activeTurnIdRef.current && (e.type === 'text-delta' || e.type === 'reasoning-delta' || e.type === 'tool-start' || e.type === 'tool-result' || e.type === 'prompt-request')) {
      activeTurnIdRef.current = e.turnId
      setRunning(true)
      setWorkingAgentId(e.agentId)
    }
    // Commit prose before a tool/notice boundary so rAF batching cannot move
    // an earlier progress message below a later tool call.
    if (e.type !== 'text-delta' && e.type !== 'reasoning-delta') flushDeltas()
    if (e.type !== 'usage' && e.type !== 'queue-updated') viewRevisionRef.current++
    if (e.type === 'turn-finished') {
      flushDeltas()
      setItems(previous => previous.map(item => {
        if (item.kind === 'message' && (item.turnId ?? item.execution?.turnId) === e.execution.turnId) return { ...item, execution: e.execution }
        if (item.kind === 'tool' && (item.call.turnId ?? item.call.execution?.turnId) === e.execution.turnId) return { ...item, call: { ...item.call, execution: e.execution } }
        return item
      }))
      // The live rows already contain the full response. Preserve their IDs
      // (and Copy state) instead of replacing them with disk IDs mid-click.
      loadTranscript(true)
      loadSessionUsage()
      return
    }
    if (e.type === 'turn-started' || e.type === 'queue-updated' || e.type === 'done' || e.type === 'error') {
      quickSendingRef.current = false
      setQuickSending(false)
    }
    if (e.type === 'subagent-event') {
      setItems(prev => {
        const idx = prev.findIndex(i => i.kind === 'subagent' && i.taskId === e.taskId)
        const base: FeedItem & { kind: 'subagent' } = idx >= 0
          ? prev[idx] as FeedItem & { kind: 'subagent' }
          : { kind: 'subagent', taskId: e.taskId, text: '', tools: [], state: 'running' }
        const next = { ...base }
        if (e.sub === 'delta' && e.text) next.text += e.text
        if (e.sub === 'delta' && e.reasoning) next.reasoning = (next.reasoning ?? '') + e.reasoning
        if (e.sub === 'tool' && e.tool && !next.tools.includes(e.tool)) next.tools = [...next.tools, e.tool]
        if (e.sub === 'start' && e.subagentType) next.subagentType = e.subagentType
        if (e.sub === 'start' && e.background) next.background = true
        if (e.sub === 'done') {
          next.state = e.state ?? 'completed'
          if (e.result) next.result = e.result
        }
        const arr = [...prev]
        if (idx >= 0) arr[idx] = next
        else arr.push(next)
        return arr
      })
      return
    }
    if (e.type === 'todo-updated') {
      setTodos(e.todos)
      return
    }
    if (e.type === 'queue-updated') {
      queueRef.current = e.queue
      setQueue(e.queue)
      return
    }
    if (e.type === 'user-message') {
      replaceActiveAnchorId(e.message.id)
      setItems(prev => {
        // The desktop UI adds user rows optimistically (local send, 'u-' ids)
        // and via queue-updated. The echo is the truth for that send: replace
        // the pending optimistic row wherever it sits. Text may differ (a
        // slash command's raw text resolves to a different prompt), so don't
        // compare content — an unreplaced 'u-' row is the one to replace.
        // Never drop two identical remote messages (store ids are UUIDs).
        let idx = -1
        for (let i = prev.length - 1; i >= 0; i--) {
          const it = prev[i]
          if (it.kind === 'message' && it.role === 'user' && it.id.startsWith('u-')) {
            idx = i
            break
          }
        }
        const row = { kind: 'message' as const, id: e.message.id, role: 'user' as const, text: e.message.displayText ?? e.message.text, images: e.message.images, turnId: e.message.turnId, execution: e.message.execution }
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = row
          return next
        }
        return [...prev, row]
      })
      return
    }
    if (e.type === 'usage') {
      usageRequestRef.current++
      contextUsageRevisionRef.current++
      setContextUsed(contextTokens(e.tokens))
      setSessionCost(e.sessionCost)
      setSessionTokens(e.sessionTokens)
      return
    }
    if (e.type === 'compacted') {
      setItems(prev => [...prev, { kind: 'compaction', id: 'c-' + Date.now() }])
      return
    }
    if (e.type === 'compaction-failed') {
      setItems(prev => [...prev, { kind: 'compaction', id: 'c-' + Date.now(), failed: true }])
      return
    }
    if (e.type === 'agent-fallback') {
      setWorkingAgentId(e.toAgentId)
      setItems(prev => [...prev, {
        kind: 'notice',
        id: 'f-' + Date.now(),
        // The pool is named because two agents on different models can draw on
        // one, and without it the choice reads as arbitrary.
        text: `${e.reason}${e.pool ? ` on ${e.pool}` : ''} — continuing on ${e.toAgentName}.`
      }])
      return
    }
    if (e.type === 'narrated-tool-call') {
      setItems(prev => [...prev, {
        kind: 'notice',
        id: 'n-' + Date.now(),
        text: 'The model wrote out a tool call instead of making one. Nothing ran.'
      }])
      return
    }
    if (e.type === 'message-removed') {
      setItems(prev => prev.filter(i =>
        !(i.kind === 'message' && (i.id === e.messageId || i.id === 'u-' + e.messageId))
      ))
      return
    }
    if (e.type === 'done' || e.type === 'error') {
      flushDeltas()
      setRunning(false)
      setPendingPrompt(null)
      activeTurnIdRef.current = undefined
      if (e.type === 'error') {
        setItems(prev => [...prev, { kind: 'error', id: 'err-' + Date.now(), text: e.message }])
      }
      if (e.type === 'done' && e.reason !== 'stopped') {
        contextUsageRevisionRef.current++
        setContextUsed(e.tokens ? contextTokens(e.tokens) : null)
      }
      if (e.type === 'error' || (e.type === 'done' && e.reason === 'stopped')) {
        contextUsageRevisionRef.current++
        setContextUsed(null)
        loadTranscript(true)
      }
      loadSessionUsage()
      return
    }
    if (e.type === 'session-created') {
      resetView()
        return
    }
    if (e.type === 'turn-started') {
      activeTurnIdRef.current = (e as ChatEvent & { turnId?: string }).turnId
      setRunning(true)
      setWorkingAgentId(e.agentId)
      contextUsageRevisionRef.current++
      setContextUsed(null)
      setActivity('Working')
      return
    }
    if (e.type === 'prompt-request') {
      setActivity(e.kind === 'permission' ? 'Waiting for approval' : 'Waiting for your answer')
      setPendingPrompt({
        promptId: e.promptId,
        promptType: e.kind,
        call: e.call,
        question: e.question,
        options: e.options,
        multiple: e.multiple,
        custom: e.custom
      })
      setSelectedAction(0)
      setSelectedOptions([])
      setCustomInput(false)
      setQuestionText('')
      setQuestionIndex(0)
      return
    }
    if (e.type === 'text-delta' || e.type === 'reasoning-delta') {
      setActivity(e.type === 'reasoning-delta' ? 'Thinking' : 'Responding')
      const buf = deltaBufRef.current
      if (e.type === 'text-delta') buf.text += e.delta
      else buf.reasoning += e.delta
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null
          flushDeltas()
        })
      }
      return
    }
    if (e.type === 'tool-start') setActivity(`Working · ${e.call.tool}`)
    else if (e.type === 'tool-result') setActivity('Working')
    setItems(prev => {
      const next = [...prev]
      if (e.type === 'tool-start') {
        next.push({ kind: 'tool', id: e.call.id, call: { ...e.call, turnId: e.turnId ?? e.call.turnId } })
      } else if (e.type === 'tool-result') {
        const idx = next.findIndex(i => i.kind === 'tool' && i.id === e.call.id)
        const row: FeedItem = { kind: 'tool', id: e.call.id, call: { ...e.call, turnId: e.turnId ?? e.call.turnId } }
        if (idx >= 0) next[idx] = row
        else next.push(row)
      }
      return next
    })
  }, [projectPath, sessionId, flushDeltas, resetView, loadTranscript, loadSessionUsage, startTurnAnchor, replaceActiveAnchorId])

  const send = useCallback((text: string, images?: ImageAttachment[]) => {
    const trimmed = text.trim()
    if (!trimmed && (!images || images.length === 0)) return Promise.resolve()
    setSendError('')
    let optimisticId: string | undefined
    // Running messages wait in the session queue until the next step accepts them.
    if (!running) {
      optimisticId = 'u-' + Date.now()
      const messageId = optimisticId
      startTurnAnchor(messageId)
      setItems(prev => [...prev, {
        kind: 'message', id: messageId, role: 'user', text: trimmed, images
      }])
      setRunning(true)
    }
    return window.api.sendSessionChat(projectPath, sessionId, agentId, trimmed, images).catch(error => {
      setSendError(String(error))
      if (optimisticId) {
        setItems(previous => previous.filter(item => !(item.kind === 'message' && item.id === optimisticId)))
        setRunning(false)
      }
    })
  }, [projectPath, sessionId, agentId, running, startTurnAnchor])

  const sendQuickMessage = useCallback((text: string) => {
    if (quickSendingRef.current) return
    quickSendingRef.current = true
    setQuickSending(true)
    void send(text).finally(() => { quickSendingRef.current = false; setQuickSending(false) })
  }, [send])

  const handleStop = useCallback(() => {
    void window.api.stopSessionChat(projectPath, sessionId)
  }, [projectPath, sessionId])

  const pickerLocked = running || pendingPrompt !== null || queue.length > 0
  const handleAgentChange = useCallback((nextAgentId: string) => {
    if (pickerLocked || nextAgentId === agentId) return
    void window.api.selectProjectSessionAgent(projectPath, sessionId, nextAgentId).then(() => {
      onAgentChange(nextAgentId)
    })
  }, [pickerLocked, agentId, projectPath, sessionId, onAgentChange])

  const handleUndo = useCallback(() => {
    void window.api.undoSessionChat(projectPath, sessionId).then(result => {
      if (result) {
        loadTranscript()
        loadTodos()
      }
    })
  }, [projectPath, sessionId, loadTranscript, loadTodos])

  const handleRedo = useCallback(() => {
    void window.api.redoSessionChat(projectPath, sessionId).then(result => {
      if (result) {
        loadTranscript()
        loadTodos()
      }
    })
  }, [projectPath, sessionId, loadTranscript, loadTodos])

  const respond = useCallback((promptId: string, allow: boolean, text?: string, always = false) => {
    void window.api.respondPrompt(agentId, promptId, { allow, text, always })
    setPendingPrompt(null)
    setSelectedAction(0)
    setQuestionText('')
    setSelectedOptions([])
    setCustomInput(false)
    setQuestionIndex(0)
  }, [agentId])

  const toggleOption = useCallback((label: string) => {
    setSelectedOptions(prev => prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label])
  }, [])

  const submitQuestion = useCallback(() => {
    if (!pendingPrompt || pendingPrompt.promptType !== 'question') return
    const text = buildQuestionAnswer({
      options: pendingPrompt.options,
      customInput,
      questionText,
      selectedOptions
    })
    if (!text.trim()) return
    respond(pendingPrompt.promptId, true, text)
  }, [pendingPrompt, customInput, questionText, selectedOptions, respond])

  const startCustomInput = useCallback(() => {
    setCustomInput(v => !v)
    if (pendingPrompt && !pendingPrompt.multiple) setSelectedOptions([])
  }, [pendingPrompt])

  const switchMode = useCallback((m: AgentMode) => {
    setCurrentMode(m)
    onModeChange?.(m)
  }, [onModeChange])

  const cycleAction = useCallback((delta: number) => {
    setSelectedAction(prev => (prev + delta + 3) % 3)
  }, [])

  const runSelected = useCallback(() => {
    if (!pendingPrompt || pendingPrompt.promptType !== 'permission') return
    if (selectedAction === 0) respond(pendingPrompt.promptId, true)
    else if (selectedAction === 1) respond(pendingPrompt.promptId, true, undefined, true)
    else respond(pendingPrompt.promptId, false)
  }, [pendingPrompt, selectedAction, respond])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!pendingPrompt || pendingPrompt.promptType !== 'permission') return
      const t = e.target as HTMLElement
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return
      if (e.key === 'Tab') { e.preventDefault(); cycleAction(e.shiftKey ? -1 : 1) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); cycleAction(1) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); cycleAction(-1) }
      else if (e.key === 'Enter') { e.preventDefault(); runSelected() }
      else if (e.key === '1') { e.preventDefault(); respond(pendingPrompt.promptId, true) }
      else if (e.key === '2') { e.preventDefault(); respond(pendingPrompt.promptId, true, undefined, true) }
      else if (e.key === '3') { e.preventDefault(); respond(pendingPrompt.promptId, false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pendingPrompt, cycleAction, runSelected, respond])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!pendingPrompt || pendingPrompt.promptType !== 'question') return
      const t = e.target as HTMLElement
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return
      const optionCount = pendingPrompt.options?.length ?? 0
      const custom = pendingPrompt.custom !== false
      const submit = pendingPrompt.multiple && !customInput && optionCount > 0
      const total = optionCount + (custom ? 1 : 0) + (submit ? 1 : 0)
      if (total === 0) return
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault()
        setQuestionIndex(prev => (prev + 1) % total)
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault()
        setQuestionIndex(prev => (prev - 1 + total) % total)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (questionIndex < optionCount) {
          const opt = pendingPrompt.options![questionIndex]
          if (pendingPrompt.multiple) {
            toggleOption(opt.label)
          } else {
            respond(pendingPrompt.promptId, true, opt.label)
          }
        } else if (custom && questionIndex === optionCount) {
          startCustomInput()
        } else if (submit) {
          submitQuestion()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pendingPrompt, questionIndex, toggleOption, respond, startCustomInput])

  const onPanelKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return
    if (pendingPrompt && pendingPrompt.promptType === 'permission') return
    e.preventDefault()
    // Build and Plan only. Coordinate is given in Fleet, and a shortcut that
    // also granted it would be the second control the single place exists to
    // avoid. A coordinator is left alone rather than cycled to build: losing a
    // project-wide role to a stray keypress is not a thing Tab should do.
    if (currentMode === 'coordinate') return
    const order: AgentMode[] = ['build', 'plan']
    switchMode(order[(order.indexOf(currentMode) + 1) % order.length])
  }, [pendingPrompt, currentMode, switchMode])

  const permissionActions = [
    { label: 'Allow', key: '1', run: () => pendingPrompt && respond(pendingPrompt.promptId, true) },
    { label: 'Always', key: '2', run: () => pendingPrompt && respond(pendingPrompt.promptId, true, undefined, true) },
    { label: 'Deny', key: '3', run: () => pendingPrompt && respond(pendingPrompt.promptId, false) }
  ]

  const todoMark = (status: TodoStatus): string => {
    switch (status) {
      case 'completed': return '✓'
      case 'in_progress': return '◐'
      case 'cancelled': return '✕'
      default: return '□'
    }
  }

  const doneCount = todos.filter(t => t.status === 'completed' || t.status === 'cancelled').length
  const finals = useMemo(() => finalResponseIds(items), [items])
  const workingName = agents.find(agent => agent.id === workingAgentId)?.name ?? 'Agent'

  return (
    <div className="chat-panel" data-testid="chat-panel" data-project-path={projectPath} data-session-id={sessionId} onKeyDown={onPanelKeyDown}>
      {lightboxUrl && (
        <div className="chat-lightbox" onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="preview" />
        </div>
      )}
      {liveTaskId && (() => {
        const live = items.find(i => i.kind === 'subagent' && i.taskId === liveTaskId) as FeedItem & { kind: 'subagent' } | undefined
        if (!live) return null
        return (
          <div className="dialog-backdrop">
            <div className="dialog subagent-live">
              <h3>sub-agent{live.subagentType ? ` (${live.subagentType})` : ''}{live.background ? ' · background' : ''}</h3>
              <button className="dialog-close" aria-label="Close" onClick={() => setLiveTaskId(null)}>✕</button>
              <div className="subagent-live-state">
                <span className={`subagent-state state-${live.state}`}>{live.state}</span>
                {live.tools.length > 0 && live.tools.map(t => <code key={t}>{t}</code>)}
              </div>
              {live.reasoning && <details className="chat-reasoning"><summary>Thinking</summary><div className="chat-reasoning-text">{live.reasoning}</div></details>}
              <div className="subagent-live-text">{live.text || (live.state === 'running' ? '…' : '')}</div>
              {live.result && <div className="subagent-live-result">{live.result}</div>}
            </div>
          </div>
        )
      })()}
      <div className="chat-history-actions">
        <button className="btn small" title="Undo last turn" onClick={handleUndo} disabled={running}>Undo</button>
        <button className="btn small" title="Redo undone turn" onClick={handleRedo} disabled={running}>Redo</button>
      </div>
      {todos.length > 0 && (
        <div className="chat-todos">
          <div className="chat-todos-head">
            <span className="chat-todos-title">TODO LIST</span>
            <span className="chat-todos-count">{doneCount}/{todos.length}</span>
            <button
              className={`chat-todos-toggle ${todosCollapsed ? 'collapsed' : ''}`}
              title={todosCollapsed ? 'Expand' : 'Collapse'}
              aria-label={todosCollapsed ? 'Expand todo list' : 'Collapse todo list'}
              onClick={() => setTodosCollapsed(v => !v)}
            >
              <ChevronDown size={12} aria-hidden="true" />
            </button>
          </div>
          {!todosCollapsed && (
          <ul className="chat-todos-list">
            {todos.map((t, i) => (
              <li key={i} className={`chat-todo status-${t.status}`}>
                <span className="chat-todo-mark">{todoMark(t.status)}</span>
                <span className="chat-todo-content">{t.content}</span>
              </li>
            ))}
          </ul>
          )}
        </div>
      )}
      <div className="chat-feed-wrap">
        <div
          className="chat-feed"
          ref={scroll.feedRef}
          tabIndex={0}
          onScroll={scroll.onScroll}
          onWheel={scroll.onWheel}
          onTouchMove={scroll.onTouchMove}
          onPointerDown={scroll.onPointerDown}
          onPointerUp={scroll.onPointerUp}
          onKeyDown={scroll.onKeyDown}
        >
        <div className="chat-feed-content" ref={scroll.contentRef}>
        {items.map(item => (
          <FeedRow
            key={feedItemKey(item)}
            item={item}
            isFinal={finals.has(feedItemKey(item))}
            commands={commands}
            onOpenImage={setLightboxUrl}
            onOpenFile={openFile}
            onOpenSubagent={setLiveTaskId}
          />
        ))}
        {running && <div className="chat-running" role="status"><span className="chat-activity-dot" aria-hidden="true" /><strong>{activity}</strong><span>{workingName}</span></div>}
        {queue.length > 0 && (
          <div className="chat-queue">
            {queue.map(q => (
              <div key={q.id} className="chat-queue-item">
                <span className="chat-queue-badge">{q.assigned ? 'queued' : 'steer pending'}</span>
                <button type="button" className="chat-queue-text" onClick={() => setEditTarget({ ...q, text: q.displayText ?? q.text })} title="Edit pending message">{q.displayText ?? q.text}</button>
                <button
                  className="chat-queue-remove"
                  aria-label={`remove queued ${q.displayText ?? q.text}`}
                  onClick={() => void window.api.removeSessionQueued(projectPath, sessionId, q.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="chat-latest-boundary" ref={scroll.latestRef} aria-hidden="true" />
        <div className="chat-turn-tail" ref={scroll.tailRef} aria-hidden="true" />
        <div ref={scroll.endRef} aria-hidden="true" />
        </div>
        </div>
        {scroll.showJumpToEnd && (
          <button className="chat-jump-to-end" onClick={scroll.jumpToEnd} title="Scroll to end" aria-label="Scroll to end">
            <ChevronDown size={14} aria-hidden="true" />
            <span>Scroll to end</span>
          </button>
        )}
      </div>
      <div className="chat-composer">
        {pendingPrompt && (
          <div className="chat-prompt" ref={pendingPrompt.promptType === 'permission' ? promptRef : undefined}
            tabIndex={pendingPrompt.promptType === 'permission' ? -1 : undefined}>
            {pendingPrompt.promptType === 'permission' ? (
              <>
                <div className="chat-prompt-text">
                  Bs wants to run <code>{pendingPrompt.call?.tool}</code>:
                </div>
                <div className="chat-prompt-actions">
                  {permissionActions.map((a, i) => (
                    <button
                      key={a.label}
                      className={[
                        i === 0 ? 'allow' : '',
                        i === 1 ? 'always' : '',
                        selectedAction === i ? 'selected' : ''
                      ].filter(Boolean).join(' ')}
                      onClick={a.run}
                    >
                      {a.label} <kbd>{a.key}</kbd>
                    </button>
                  ))}
                </div>
                <div className="chat-prompt-hint">←/→ or Tab to select, Enter to confirm</div>
              </>
            ) : (
              <>
                <div className="chat-prompt-text">
                  {pendingPrompt.question}
                  {pendingPrompt.multiple && <span className="chat-prompt-multi-hint"> (select all that apply)</span>}
                </div>
                {pendingPrompt.options && pendingPrompt.options.length > 0 && (
                  <div className="chat-options">
                    {pendingPrompt.options.map((opt, i) => {
                      const selected = selectedOptions.includes(opt.label)
                      const mark = pendingPrompt.multiple ? (selected ? '[✓]' : '[ ]') : `${i + 1}.`
                      return (
                        <button
                          key={opt.label + i}
                          className={`chat-option ${selected ? 'selected' : ''} ${questionIndex === i ? 'focused' : ''}`}
                          onClick={() => (pendingPrompt.multiple
                            ? toggleOption(opt.label)
                            : respond(pendingPrompt.promptId, true, opt.label))}
                        >
                          <span className="chat-option-mark">{mark}</span>
                          <span className="chat-option-text">
                            <span className="chat-option-label">{opt.label}</span>
                            {opt.description && <span className="chat-option-desc">{opt.description}</span>}
                          </span>
                        </button>
                      )
                    })}
                    {pendingPrompt.custom !== false && (
                      <button
                        className={`chat-option custom ${customInput ? 'selected' : ''} ${questionIndex === (pendingPrompt.options?.length ?? 0) ? 'focused' : ''}`}
                        onClick={startCustomInput}
                      >
                        <span className="chat-option-mark">
                          {pendingPrompt.multiple
                            ? (customInput ? '[✓]' : '[ ]')
                            : `${(pendingPrompt.options?.length ?? 0) + 1}.`}
                        </span>
                        <span className="chat-option-text">
                          <span className="chat-option-label">Type your own answer</span>
                        </span>
                      </button>
                    )}
                  </div>
                )}
                {(customInput || !pendingPrompt.options?.length) && (
                  <div className="chat-prompt-actions">
                    <input
                      autoFocus
                      className="chat-prompt-input"
                      value={questionText}
                      placeholder="Answer..."
                      onChange={e => setQuestionText(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          submitQuestion()
                        }
                      }}
                    />
                    <button onClick={submitQuestion}>Send</button>
                  </div>
                )}
                {!!pendingPrompt.options?.length && pendingPrompt.multiple && !customInput && (
                  <div className="chat-prompt-actions">
                    <button
                      className={questionIndex === (pendingPrompt.options?.length ?? 0) + (pendingPrompt.custom !== false ? 1 : 0) ? 'focused' : ''}
                      onClick={submitQuestion}
                      disabled={selectedOptions.length === 0}
                    >
                      Send
                    </button>
                  </div>
                )}
                {!!pendingPrompt.options?.length && !customInput && (
                  <div className="chat-prompt-hint">↑/↓ to navigate, Enter to select</div>
                )}
              </>
            )}
          </div>
        )}
      {sendError && <p className="settings-error" role="alert">{sendError}</p>}
      <div className="chat-mode">
          <span className="chat-mode-label">mode</span>
          <button
            className={`btn small mode-build ${currentMode === 'build' ? 'active' : ''}`}
            onClick={() => switchMode('build')}
          >
            Build
          </button>
          <button
            className={`btn small mode-plan ${currentMode === 'plan' ? 'active' : ''}`}
            onClick={() => switchMode('plan')}
          >
            Plan
          </button>
          {/* Coordinate is not here. Build and Plan are what this agent is
              doing; who coordinates the project is a property of the project,
              and it is given in the Fleet panel. Mixing the two scopes in one
              row is what let a project end up with two coordinators. */}
          {currentMode === 'plan' && <span className="chat-mode-hint">read-only — edits denied</span>}
          {currentMode === 'coordinate' && <span className="chat-mode-hint">coordinating — set in Fleet</span>}
          <div className="chat-mode-tools">
            <AgentPicker
              agents={agents}
              value={agentId}
              onChange={handleAgentChange}
              disabled={pickerLocked}
              disabledReason={pickerLocked ? 'Agent locked while running' : undefined}
            />
            <ModelPicker agentId={agentId} disabled={pickerLocked} />
            {availableVariants.length > 0 && (
              <VariantPicker
                variants={availableVariants}
                value={currentVariant}
                onChange={v => {
                  setCurrentVariant(v)
                  onVariantChange?.(v === '' ? undefined : v)
                }}
              />
            )}
          </div>
        </div>
        <QuickMessageButtons messages={quickMessages} onSend={sendQuickMessage} disabled={pendingPrompt !== null || quickSending} />
        <ChatInput
          agentId={agentId}
          running={running}
          mode={currentMode}
          commands={commands}
          editTarget={editTarget}
          onSubmit={send}
          onEditSubmit={(id, text) => {
            void window.api.editSessionQueued(projectPath, sessionId, id, text)
            setEditTarget(null)
          }}
          onEditCancel={() => setEditTarget(null)}
          onStop={handleStop}
        />
        <ContextFooter
          tokens={contextUsed}
          limit={contextLimit}
          limitSource={contextLimitSource}
          compactThreshold={compactThreshold}
          cost={sessionCost}
          sessionTokens={sessionTokens}
        />
      </div>
    </div>
  )
}

export default memo(ChatPanel)
