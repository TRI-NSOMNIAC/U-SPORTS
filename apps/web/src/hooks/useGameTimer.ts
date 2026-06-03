import { useState, useRef, useCallback, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export type TimerMode = 'countdown' | 'stopwatch'

export interface TimerState {
  /** Remaining seconds (countdown) or elapsed seconds (stopwatch) */
  seconds: number
  running: boolean
}

interface UseGameTimerOptions {
  matchId: string
  mode: TimerMode
  /** Initial seconds for countdown (e.g. 600 for a 10-min quarter) */
  initialSeconds?: number
  /** When false, no realtime channel (e.g. volleyball / table tennis — no shot clock) */
  enabled?: boolean
}

export function useGameTimer({
  matchId,
  mode,
  initialSeconds = 600,
  enabled = true,
}: UseGameTimerOptions) {
  const [seconds, setSeconds] = useState(mode === 'countdown' ? initialSeconds : 0)
  const [running, setRunning] = useState(false)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const secondsRef = useRef(seconds)
  secondsRef.current = seconds

  const channelName = `timer-${matchId}`

  const broadcast = useCallback((state: TimerState) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'timer_sync',
      payload: state,
    })
  }, [])

  // Main clock tick
  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSeconds((prev) => {
          const next = mode === 'countdown' ? Math.max(0, prev - 1) : prev + 1
          if (mode === 'countdown' && next === 0) {
            setRunning(false)
          }
          return next
        })
      }, 1000)
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [running, mode])

  // Push every tick to jumbotron — do NOT use a separate interval tied to getState
  // (that pattern cleared the interval every time seconds changed and killed live updates).
  useEffect(() => {
    if (!running) return
    broadcast({ seconds, running })
  }, [seconds, running, broadcast])

  useEffect(() => {
    if (!enabled || !matchId) return
    const channel = supabase.channel(channelName)
    channel.subscribe()
    channelRef.current = channel
    return () => {
      channel.unsubscribe()
      channelRef.current = null
    }
  }, [channelName, enabled, matchId])

  const start = useCallback(() => {
    setRunning(true)
    broadcast({ seconds: secondsRef.current, running: true })
  }, [broadcast])

  const pause = useCallback(() => {
    setRunning(false)
    broadcast({ seconds: secondsRef.current, running: false })
  }, [broadcast])

  const resetMainClock = useCallback(
    (newSeconds?: number) => {
      const val = newSeconds ?? (mode === 'countdown' ? initialSeconds : 0)
      setSeconds(val)
      setRunning(false)
      broadcast({ seconds: val, running: false })
    },
    [mode, initialSeconds, broadcast],
  )

  const totalElapsed = mode === 'stopwatch' ? seconds : undefined

  const formatTime = useCallback((s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }, [])

  return {
    seconds,
    running,
    start,
    pause,
    resetMainClock,
    totalElapsed,
    formatTime,
    broadcast,
  }
}

/** Listener hook for jumbotron / read-only consumers */
export function useTimerListener(matchId: string, enabled = true) {
  const [timerState, setTimerState] = useState<TimerState | null>(null)
  const channelName = `timer-${matchId}`

  useEffect(() => {
    if (!enabled || !matchId) {
      setTimerState(null)
      return
    }
    const channel = supabase
      .channel(channelName)
      .on('broadcast', { event: 'timer_sync' }, (msg) => {
        setTimerState(msg.payload as TimerState)
      })
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [channelName, enabled, matchId])

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }

  return { timerState, formatTime }
}
