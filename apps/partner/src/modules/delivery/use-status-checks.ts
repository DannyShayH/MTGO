"use client"

import { useEffect } from "react"

/** Bounded backoff for status checks while an action's outcome is unknown. */
const CHECK_DELAYS_MS = [2000, 5000, 10000, 30000]

/**
 * While `active`, reconciles an action whose outcome is unknown: `check`
 * runs on a timer with backoff, when the page becomes visible again (after
 * a call or screen lock) and when the browser comes back online. It keeps
 * going while `check` answers "uncertain".
 */
export function useStatusChecks(active: boolean, check: () => Promise<string>) {
  useEffect(() => {
    if (!active) return
    let attempt = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let running = true
    const schedule = () => {
      timer = setTimeout(async () => {
        if (!running) return
        if ((await check()) === "uncertain" && running) {
          attempt = Math.min(attempt + 1, CHECK_DELAYS_MS.length - 1)
          schedule()
        }
      }, CHECK_DELAYS_MS[attempt])
    }
    const onReturn = () => {
      if (document.visibilityState === "visible") void check()
    }
    schedule()
    document.addEventListener("visibilitychange", onReturn)
    window.addEventListener("online", onReturn)
    return () => {
      running = false
      clearTimeout(timer)
      document.removeEventListener("visibilitychange", onReturn)
      window.removeEventListener("online", onReturn)
    }
  }, [active, check])
}

/**
 * A request can wait up to ten seconds for the backend's locks and still
 * commit, so an unchanged server view only means "not recorded" after this.
 */
export const SETTLED_AFTER_MS = 15000
