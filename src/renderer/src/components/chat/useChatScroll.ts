import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type WheelEvent as ReactWheelEvent
} from 'react'
import {
  CHAT_TURN_TOP_INSET,
  anchorScrollTop,
  followScrollDelta,
  isInBottomFollowZone,
  nextChatScrollMode,
  shouldEnterManualForKey,
  tailSpacerHeight,
  type ChatScrollMode
} from './chat-scroll-geometry'

export interface ChatScrollController {
  feedRef: RefObject<HTMLDivElement | null>
  contentRef: RefObject<HTMLDivElement | null>
  latestRef: RefObject<HTMLDivElement | null>
  tailRef: RefObject<HTMLDivElement | null>
  endRef: RefObject<HTMLDivElement | null>
  showJumpToEnd: boolean
  startTurnAnchor(messageId: string): void
  replaceActiveAnchorId(messageId: string): void
  reconcile(): void
  pinSessionToEnd(): void
  jumpToEnd(): void
  onScroll(): void
  onWheel(event: ReactWheelEvent<HTMLDivElement>): void
  onTouchMove(): void
  onPointerDown(event: ReactPointerEvent<HTMLDivElement>): void
  onPointerUp(event: ReactPointerEvent<HTMLDivElement>): void
  onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void
}

const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])

export function useChatScroll(): ChatScrollController {
  const feedRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const latestRef = useRef<HTMLDivElement>(null)
  const tailRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const modeRef = useRef<ChatScrollMode>('following')
  const activeAnchorIdRef = useRef<string | null>(null)
  const pendingAnchorIdRef = useRef<string | null>(null)
  const programmaticRef = useRef(false)
  const scrollbarDragRef = useRef(false)
  const trustedInteractionRef = useRef(false)
  const reconcileRafRef = useRef<number | null>(null)
  const pinRafRef = useRef<number | null>(null)
  const anchorRafRef = useRef<number | null>(null)
  const programmaticReleaseRafRef = useRef<number | null>(null)
  const [showJumpToEnd, setShowJumpToEnd] = useState(false)

  const isAtBottom = useCallback(() => {
    const feed = feedRef.current
    return feed !== null && isInBottomFollowZone({
      scrollHeight: feed.scrollHeight,
      scrollTop: feed.scrollTop,
      clientHeight: feed.clientHeight
    })
  }, [])

  const cancelPin = useCallback(() => {
    if (pinRafRef.current !== null) cancelAnimationFrame(pinRafRef.current)
    pinRafRef.current = null
  }, [])

  const cancelAnchorSettle = useCallback(() => {
    if (anchorRafRef.current !== null) cancelAnimationFrame(anchorRafRef.current)
    anchorRafRef.current = null
  }, [])

  const writeScrollTop = useCallback((top: number) => {
    const feed = feedRef.current
    if (!feed) return
    programmaticRef.current = true
    feed.scrollTop = top
    if (programmaticReleaseRafRef.current !== null) {
      cancelAnimationFrame(programmaticReleaseRafRef.current)
    }
    programmaticReleaseRafRef.current = requestAnimationFrame(() => {
      programmaticRef.current = false
      programmaticReleaseRafRef.current = null
    })
  }, [])

  const findAnchor = useCallback(() => {
    const id = activeAnchorIdRef.current
    if (!id) return null
    const rows = feedRef.current?.querySelectorAll<HTMLElement>('[data-chat-message-id]') ?? []
    return Array.from(rows).find(row => row.dataset.chatMessageId === id) ?? null
  }, [])

  const enterManual = useCallback(() => {
    cancelPin()
    cancelAnchorSettle()
    if (reconcileRafRef.current !== null) cancelAnimationFrame(reconcileRafRef.current)
    reconcileRafRef.current = null
    pendingAnchorIdRef.current = null
    modeRef.current = nextChatScrollMode(modeRef.current, 'user-away')
    setShowJumpToEnd(true)
  }, [cancelAnchorSettle, cancelPin])

  const reconcile = useCallback(() => {
    if (reconcileRafRef.current !== null) return
    reconcileRafRef.current = requestAnimationFrame(() => {
      reconcileRafRef.current = null
      if (modeRef.current === 'manual') return
      const feed = feedRef.current
      const latest = latestRef.current
      if (!feed || !latest) return

      const anchor = findAnchor()
      if (anchor && tailRef.current) {
        const anchorRect = anchor.getBoundingClientRect()
        const latestRect = latest.getBoundingClientRect()
        const height = tailSpacerHeight({
          clientHeight: feed.clientHeight,
          anchorTop: anchorRect.top,
          latestBottom: latestRect.bottom
        })
        const nextHeight = `${height}px`
        if (tailRef.current.style.height !== nextHeight) tailRef.current.style.height = nextHeight
      } else if (tailRef.current?.style.height !== '0px') {
        tailRef.current!.style.height = '0px'
      }

      if (pendingAnchorIdRef.current && anchor) {
        const feedRect = feed.getBoundingClientRect()
        const rowRect = anchor.getBoundingClientRect()
        writeScrollTop(anchorScrollTop({
          currentScrollTop: feed.scrollTop,
          feedTop: feedRect.top,
          rowTop: rowRect.top,
          scrollHeight: feed.scrollHeight,
          clientHeight: feed.clientHeight
        }))
        pendingAnchorIdRef.current = null
        modeRef.current = nextChatScrollMode(modeRef.current, 'anchor-applied')
        let frames = 0
        let stableFrames = 0
        const settle = () => {
          if (modeRef.current === 'manual') {
            anchorRafRef.current = null
            return
          }
          const currentFeed = feedRef.current
          const currentAnchor = findAnchor()
          if (!currentFeed || !currentAnchor) {
            anchorRafRef.current = null
            return
          }
          const feedRect = currentFeed.getBoundingClientRect()
          const rowRect = currentAnchor.getBoundingClientRect()
          const offset = rowRect.top - feedRect.top
          if (Math.abs(offset - CHAT_TURN_TOP_INSET) > 0.5) {
            stableFrames = 0
            writeScrollTop(anchorScrollTop({
              currentScrollTop: currentFeed.scrollTop,
              feedTop: feedRect.top,
              rowTop: rowRect.top,
              scrollHeight: currentFeed.scrollHeight,
              clientHeight: currentFeed.clientHeight
            }))
          } else {
            stableFrames += 1
          }
          frames += 1
          if (stableFrames >= 2 || frames >= 60) {
            anchorRafRef.current = null
            return
          }
          anchorRafRef.current = requestAnimationFrame(settle)
        }
        cancelAnchorSettle()
        anchorRafRef.current = requestAnimationFrame(settle)
        return
      }

      const feedRect = feed.getBoundingClientRect()
      const latestRect = latest.getBoundingClientRect()
      const delta = followScrollDelta({ feedBottom: feedRect.bottom, latestBottom: latestRect.bottom })
      if (delta > 0) writeScrollTop(feed.scrollTop + delta)
    })
  }, [cancelAnchorSettle, findAnchor, writeScrollTop])

  const startTurnAnchor = useCallback((messageId: string) => {
    cancelPin()
    cancelAnchorSettle()
    activeAnchorIdRef.current = messageId
    pendingAnchorIdRef.current = messageId
    modeRef.current = nextChatScrollMode(modeRef.current, 'start-turn')
    if (tailRef.current) tailRef.current.style.height = '0px'
    setShowJumpToEnd(false)
    reconcile()
  }, [cancelAnchorSettle, cancelPin, reconcile])

  const replaceActiveAnchorId = useCallback((messageId: string) => {
    if (!activeAnchorIdRef.current) return
    activeAnchorIdRef.current = messageId
    if (pendingAnchorIdRef.current) pendingAnchorIdRef.current = messageId
  }, [])

  const pinSessionToEnd = useCallback(() => {
    cancelPin()
    cancelAnchorSettle()
    activeAnchorIdRef.current = null
    pendingAnchorIdRef.current = null
    modeRef.current = nextChatScrollMode(modeRef.current, 'session-load')
    trustedInteractionRef.current = false
    scrollbarDragRef.current = false
    if (tailRef.current) tailRef.current.style.height = '0px'
    setShowJumpToEnd(false)
    let frames = 0
    const pin = () => {
      const feed = feedRef.current
      if (!feed || modeRef.current === 'manual') {
        pinRafRef.current = null
        return
      }
      writeScrollTop(feed.scrollHeight)
      frames += 1
      if (frames <= 60) pinRafRef.current = requestAnimationFrame(pin)
      else pinRafRef.current = null
    }
    pinRafRef.current = requestAnimationFrame(pin)
  }, [cancelAnchorSettle, cancelPin, writeScrollTop])

  const jumpToEnd = useCallback(() => {
    cancelPin()
    cancelAnchorSettle()
    modeRef.current = nextChatScrollMode(modeRef.current, 'jump-end')
    trustedInteractionRef.current = false
    const feed = feedRef.current
    if (feed) writeScrollTop(feed.scrollHeight)
    setShowJumpToEnd(false)
  }, [cancelAnchorSettle, cancelPin, writeScrollTop])

  const onScroll = useCallback(() => {
    if (programmaticRef.current) return
    if (isAtBottom()) {
      modeRef.current = nextChatScrollMode(modeRef.current, 'user-bottom')
      trustedInteractionRef.current = false
      setShowJumpToEnd(false)
      return
    }
    if (trustedInteractionRef.current || scrollbarDragRef.current) enterManual()
  }, [enterManual, isAtBottom])

  const onWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    trustedInteractionRef.current = true
    if (event.deltaY < 0 || !isAtBottom()) enterManual()
  }, [enterManual, isAtBottom])

  const onTouchMove = useCallback(() => {
    trustedInteractionRef.current = true
    enterManual()
  }, [enterManual])

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const feed = feedRef.current
    if (!feed) return
    const rect = feed.getBoundingClientRect()
    const gutter = Math.max(feed.offsetWidth - feed.clientWidth, 12)
    if (event.clientX < rect.right - gutter) return
    trustedInteractionRef.current = true
    scrollbarDragRef.current = true
    feed.setPointerCapture(event.pointerId)
  }, [])

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const feed = feedRef.current
    scrollbarDragRef.current = false
    trustedInteractionRef.current = false
    if (feed?.hasPointerCapture(event.pointerId)) feed.releasePointerCapture(event.pointerId)
  }, [])

  const onKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!SCROLL_KEYS.has(event.key)) return
    trustedInteractionRef.current = true
    if (shouldEnterManualForKey(event.key, isAtBottom())) enterManual()
  }, [enterManual, isAtBottom])

  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    const observer = new ResizeObserver(reconcile)
    observer.observe(content)
    return () => observer.disconnect()
  }, [reconcile])

  useEffect(() => () => {
    cancelPin()
    cancelAnchorSettle()
    if (reconcileRafRef.current !== null) cancelAnimationFrame(reconcileRafRef.current)
    if (programmaticReleaseRafRef.current !== null) cancelAnimationFrame(programmaticReleaseRafRef.current)
    reconcileRafRef.current = null
    programmaticReleaseRafRef.current = null
    programmaticRef.current = false
  }, [cancelAnchorSettle, cancelPin])

  return {
    feedRef,
    contentRef,
    latestRef,
    tailRef,
    endRef,
    showJumpToEnd,
    startTurnAnchor,
    replaceActiveAnchorId,
    reconcile,
    pinSessionToEnd,
    jumpToEnd,
    onScroll,
    onWheel,
    onTouchMove,
    onPointerDown,
    onPointerUp,
    onKeyDown
  }
}
