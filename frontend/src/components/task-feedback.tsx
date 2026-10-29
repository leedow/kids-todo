import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import '../styles/task-feedback.css'

export type TaskFeedback = {
  id: number
  instanceId: string
  kind: 'complete' | 'undo'
  x: number
  y: number
}

let audioContext: AudioContext | undefined

// Resume during the click, before the network request, for mobile autoplay policies.
export function prepareTaskSound() {
  try {
    if (!audioContext || audioContext.state === 'closed') audioContext = new AudioContext()
    if (audioContext.state !== 'running') void audioContext.resume().catch(() => {})
  } catch {
    // Sound is optional; unavailable audio must never prevent saving a task.
  }
}

function playTaskSound(completed: boolean) {
  const context = audioContext
  if (!context || context.state !== 'running') return
  try {
    const notes = completed ? [659.25, 830.61, 1046.5] : [587.33, 440]
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const start = context.currentTime + index * 0.085
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(frequency, start)
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(completed ? 0.075 : 0.055, start + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22)
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.onended = () => {
        oscillator.disconnect()
        gain.disconnect()
      }
      oscillator.start(start)
      oscillator.stop(start + 0.24)
    })
  } catch {
    // The visual confirmation remains available if the audio device disappears.
  }
}

export function useTaskFeedback() {
  const [feedback, setFeedback] = useState<TaskFeedback | null>(null)
  const sequence = useRef(0)
  useEffect(() => {
    if (!feedback) return
    const timer = window.setTimeout(() => setFeedback(null), 1000)
    return () => window.clearTimeout(timer)
  }, [feedback])

  function confirm(instanceId: string, completed: boolean, rect: DOMRect) {
    playTaskSound(completed)
    setFeedback({
      id: ++sequence.current,
      instanceId,
      kind: completed ? 'complete' : 'undo',
      x: Math.max(76, Math.min(window.innerWidth - 76, rect.x + rect.width / 2)),
      y: Math.max(80, Math.min(window.innerHeight - 40, rect.y + rect.height / 2)),
    })
  }

  return { feedback, confirm }
}

export function TaskFeedbackEffect({ feedback }: { feedback: TaskFeedback | null }) {
  if (!feedback) return null
  return createPortal(
    <div
      key={feedback.id}
      className={`task-feedback task-feedback-${feedback.kind}`}
      style={{ left: feedback.x, top: feedback.y }}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="task-feedback-ring" aria-hidden="true" />
      {feedback.kind === 'complete' &&
        Array.from({ length: 8 }, (_, index) => (
          <span
            key={index}
            className="task-feedback-spark"
            style={{ '--angle': `${index * 45}deg` } as CSSProperties}
            aria-hidden="true"
          >
            {index % 2 ? '·' : '✦'}
          </span>
        ))}
      <span className="task-feedback-label">
        {feedback.kind === 'complete' ? '完成啦！' : '已恢复待完成'}
      </span>
    </div>,
    document.body,
  )
}
