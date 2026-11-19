"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/**
 * Reads the workspace again when the agent returns to it: after a phone
 * call, a screen lock or switching apps, and when the connection is back.
 * The server's projection, not the screen left behind, decides what shows.
 */
export function ReconcileOnReturn() {
  const router = useRouter()
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh()
    }
    document.addEventListener("visibilitychange", refresh)
    window.addEventListener("online", refresh)
    window.addEventListener("pageshow", refresh)
    return () => {
      document.removeEventListener("visibilitychange", refresh)
      window.removeEventListener("online", refresh)
      window.removeEventListener("pageshow", refresh)
    }
  }, [router])
  return null
}
