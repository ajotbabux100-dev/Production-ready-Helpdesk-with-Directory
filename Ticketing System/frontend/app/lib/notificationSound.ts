// Client-only, per-browser preference (not tied to the account) for whether
// new-notification toasts should chime - deliberately simple localStorage
// rather than a backend field, since this is a "this device" annoyance
// setting, not something a user needs synced across machines.
const SOUND_PREF_KEY = 'notif_sound_enabled'

export function isNotificationSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true
  return window.localStorage.getItem(SOUND_PREF_KEY) !== 'false'
}

export function setNotificationSoundEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SOUND_PREF_KEY, enabled ? 'true' : 'false')
}

let audioCtx: AudioContext | null = null

// A short two-tone chime synthesised with the Web Audio API instead of a
// shipped audio file - keeps this dependency-free and avoids adding a media
// asset just for a ~0.3s ding.
export function playNotificationSound() {
  if (!isNotificationSoundEnabled()) return
  if (typeof window === 'undefined') return
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext
    if (!Ctx) return
    if (!audioCtx) audioCtx = new Ctx()
    if (audioCtx.state === 'suspended') audioCtx.resume()

    const now = audioCtx.currentTime
    const notes = [{ freq: 880, start: 0 }, { freq: 1174.66, start: 0.11 }]
    notes.forEach(({ freq, start }) => {
      const osc = audioCtx!.createOscillator()
      const gain = audioCtx!.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, now + start)
      gain.gain.linearRampToValueAtTime(0.18, now + start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + 0.28)
      osc.connect(gain)
      gain.connect(audioCtx!.destination)
      osc.start(now + start)
      osc.stop(now + start + 0.3)
    })
  } catch {
    // Autoplay policies or an unsupported browser - silently skip, the
    // visual toast still shows either way.
  }
}
