"use client"

import { useEffect } from "react"
import { announceSignOut } from "@lib/session-ended"

/**
 * Rendered by the sign-in page after a sign-out, once the cookie is gone, so
 * this browser's other partner tabs end their open kitchen feed (#148). An
 * earlier announcement would send them to sign-in while still signed in.
 */
export function AnnounceSignOut() {
  useEffect(announceSignOut, [])
  return null
}
