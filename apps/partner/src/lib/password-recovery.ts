import { MIN_PASSWORD_LENGTH } from "./password.ts"

export type RecoveryActor = "restaurant_staff" | "delivery_agent" | "user"

export const RECOVERY_ACCOUNTS = {
  user: {
    provider: "emailpass",
    signIn: "/app/login",
    request: "/operator-forgot-password",
  },
  restaurant_staff: {
    provider: "emailpass",
    signIn: "/sign-in",
    request: "/forgot-password",
  },
  delivery_agent: {
    provider: "delivery-agent-emailpass",
    signIn: "/delivery-sign-in",
    request: "/delivery-forgot-password",
  },
} as const

export function validateRecoveryPassword(
  password: string,
  confirmation: string,
) {
  if (password.length < MIN_PASSWORD_LENGTH) return "too_short"
  if (password !== confirmation) return "mismatch"
  return null
}
