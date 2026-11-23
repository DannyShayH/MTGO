/**
 * The optional arrival tone (#149): two short notes made with Web Audio, so
 * no sound file or dependency is needed. Browsers only allow sound after a
 * click on the page, so staff switch it on themselves; the choice is
 * remembered, and after a reload the next click unlocks it again
 * (`arrival-sound-state.ts`). Every failure is reported as refused, and the
 * visual alert never depends on it.
 */
type AudioContextClass = typeof AudioContext

let context: AudioContext | null = null

const audioContextClass = (): AudioContextClass | undefined =>
  window.AudioContext ??
  (window as unknown as { webkitAudioContext?: AudioContextClass })
    .webkitAudioContext

/**
 * Whether the page has had a click, tap or key press. Without one, a
 * browser never lets audio start, and Chrome leaves `resume()` pending
 * instead of refusing, so it is not called at all.
 */
const hasUserActivation = () =>
  (navigator as { userActivation?: { hasBeenActive: boolean } }).userActivation
    ?.hasBeenActive ?? true

/** Resumes (or creates) the page's audio; true when sound may play now. */
async function resumeAudio(): Promise<boolean> {
  try {
    const AudioContextClass = audioContextClass()
    if (!AudioContextClass) return false
    if (context?.state !== "running" && !hasUserActivation()) return false
    context ??= new AudioContextClass()
    if (context.state !== "running")
      await Promise.race([
        context.resume(),
        new Promise((resolve) => setTimeout(resolve, 1000)),
      ])
    return context.state === "running"
  } catch {
    return false
  }
}

/**
 * Lets a remembered sound choice play again after a reload, without a
 * tone. Call it from a click, tap or key press, or once the page already
 * had one; true when sound may play now.
 */
export const unlockArrivalSound = resumeAudio

function playNotes(audio: AudioContext) {
  const start = audio.currentTime + 0.02
  for (const [offset, frequency] of [
    [0, 880],
    [0.18, 1320],
  ] as const) {
    const oscillator = audio.createOscillator()
    const gain = audio.createGain()
    oscillator.type = "sine"
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0.0001, start + offset)
    gain.gain.exponentialRampToValueAtTime(0.3, start + offset + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.3)
    oscillator.connect(gain).connect(audio.destination)
    oscillator.start(start + offset)
    oscillator.stop(start + offset + 0.32)
  }
}

/** Plays the arrival tone; false when the browser refused sound. */
export async function playArrivalTone(): Promise<boolean> {
  if (!(await resumeAudio()) || !context) return false
  try {
    playNotes(context)
    return true
  } catch {
    return false
  }
}
