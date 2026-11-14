export type VerificationRequested = {
  entity_id: string
  code?: string
  expires_at?: string | Date
  auth_identity_id: string
  metadata?: Record<string, unknown>
}
