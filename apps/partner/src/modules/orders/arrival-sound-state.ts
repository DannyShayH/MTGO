/**
 * The arrival sound switch's states. Staff's choice is remembered on the
 * device (`mtogo_partner_arrival_sound`), but browsers only play sound after
 * a click or tap on the page, so after a reload a remembered choice is
 * `waiting` until the first interaction unlocks it. The switch shows the
 * choice; the visual alert never depends on the sound.
 */
export type Sound = "off" | "waiting" | "on" | "blocked"

export type SoundEvent =
  | { type: "unlocked" }
  | { type: "switched_on"; isPlayed: boolean }
  | { type: "switched_off" }
  | { type: "play_failed" }

export const ARRIVAL_SOUND_COOKIE = "mtogo_partner_arrival_sound"

export const initialSound = (isRemembered: boolean): Sound =>
  isRemembered ? "waiting" : "off"

export function nextSound(sound: Sound, event: SoundEvent): Sound {
  switch (event.type) {
    case "unlocked":
      return sound === "waiting" ? "on" : sound
    case "switched_on":
      return event.isPlayed ? "on" : "blocked"
    case "switched_off":
      return "off"
    case "play_failed":
      return sound === "on" || sound === "waiting" ? "waiting" : sound
  }
}

export const isSwitchOn = (sound: Sound) =>
  sound === "on" || sound === "waiting"

export const isRemembered = isSwitchOn
