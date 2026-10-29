import { useCallback, useEffect, useRef, useState } from 'react'

type Cue = 'pick' | 'reveal' | 'fly' | 'collect'
const preferenceKey = 'kids-todo:draw-sound'

// Synthesized locally: short, quiet sounds with no downloads or loading delay.
class DrawSounds {
  private context = new AudioContext()
  private master = this.context.createGain()
  private voices = new Set<AudioScheduledSourceNode>()

  constructor() {
    this.master.gain.value = 0.45
    this.master.connect(this.context.destination)
  }

  private track(source: AudioScheduledSourceNode, ...nodes: AudioNode[]) {
    this.voices.add(source)
    source.onended = () => {
      this.voices.delete(source)
      source.disconnect()
      nodes.forEach((node) => node.disconnect())
    }
  }

  private note(frequency: number, delay: number, duration: number, volume: number) {
    const start = this.context.currentTime + delay
    const oscillator = this.context.createOscillator()
    const envelope = this.context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(frequency, start)
    envelope.gain.setValueAtTime(0, start)
    envelope.gain.linearRampToValueAtTime(volume, start + 0.012)
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    oscillator.connect(envelope).connect(this.master)
    this.track(oscillator, envelope)
    oscillator.start(start)
    oscillator.stop(start + duration + 0.02)
  }

  private swish(duration: number, ascending: boolean) {
    const start = this.context.currentTime
    const buffer = this.context.createBuffer(
      1,
      Math.ceil(this.context.sampleRate * duration),
      this.context.sampleRate,
    )
    const samples = buffer.getChannelData(0)
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1
    const source = this.context.createBufferSource()
    const filter = this.context.createBiquadFilter()
    const envelope = this.context.createGain()
    source.buffer = buffer
    filter.type = 'bandpass'
    filter.Q.value = 0.7
    filter.frequency.setValueAtTime(ascending ? 450 : 1800, start)
    filter.frequency.exponentialRampToValueAtTime(ascending ? 1800 : 450, start + duration)
    envelope.gain.setValueAtTime(0, start)
    envelope.gain.linearRampToValueAtTime(0.055, start + duration * 0.3)
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    source.connect(filter).connect(envelope).connect(this.master)
    this.track(source, filter, envelope)
    source.start(start)
    source.stop(start + duration)
  }

  play(cue: Cue) {
    if (this.context.state === 'suspended') void this.context.resume().catch(() => {})
    if (cue === 'pick') {
      this.note(440, 0, 0.1, 0.12)
      this.note(660, 0.035, 0.14, 0.07)
    } else if (cue === 'reveal') {
      this.swish(0.2, false)
      ;[659.25, 830.61, 987.77].forEach((frequency, i) =>
        this.note(frequency, 0.08 + i * 0.075, 0.55, 0.075),
      )
    } else if (cue === 'fly') {
      this.swish(0.45, true)
    } else {
      ;[523.25, 659.25, 783.99, 1046.5].forEach((frequency, i) =>
        this.note(frequency, i * 0.045, 0.5, 0.065),
      )
    }
  }

  silence() {
    this.voices.forEach((voice) => {
      try {
        voice.stop()
      } catch {
        /* A source may have already finished. */
      }
    })
  }

  dispose() {
    this.silence()
    void this.context.close().catch(() => {})
  }
}

export function useDrawSounds() {
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(preferenceKey) !== 'off'
    } catch {
      return true
    }
  })
  const enabledRef = useRef(enabled)
  const engine = useRef<DrawSounds | null>(null)

  const play = useCallback((cue: Cue) => {
    if (!enabledRef.current || document.hidden) return
    try {
      // Called first from the card click, unlocking audio on mobile browsers.
      engine.current ??= new DrawSounds()
      engine.current.play(cue)
    } catch {
      /* Sound support must never prevent drawing or collecting a card. */
    }
  }, [])

  const toggle = useCallback(() => {
    const next = !enabledRef.current
    enabledRef.current = next
    setEnabled(next)
    try {
      localStorage.setItem(preferenceKey, next ? 'on' : 'off')
    } catch {
      /* Storage may be unavailable. */
    }
    if (next) play('pick')
    else engine.current?.silence()
  }, [play])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) engine.current?.silence()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      engine.current?.dispose()
      engine.current = null
    }
  }, [])

  return { enabled, toggle, play }
}
