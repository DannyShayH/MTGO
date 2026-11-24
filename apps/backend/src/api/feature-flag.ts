import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { IFlagRouter } from "@medusajs/framework/feature-flags"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"

/** Whether a Feature is released, as Medusa loaded its flag at boot (ADR-0022). */
export const isFeatureReleased = (scope: MedusaRequest["scope"], key: string) =>
  scope
    .resolve<IFlagRouter>(ContainerRegistrationKeys.FEATURE_FLAG_ROUTER)
    .isFeatureEnabled(key)

/**
 * Withholds a flagged Feature's route while its Feature flag is off
 * (ADR-0022): it answers `404` as if the route did not exist, before
 * authentication or validation can tell otherwise. The flag router is read
 * on every request, so the value Medusa loaded at boot decides.
 */
export function requireFeatureFlag(key: string) {
  return function featureFlagGate(
    req: MedusaRequest,
    _res: MedusaResponse,
    next: MedusaNextFunction,
  ) {
    if (isFeatureReleased(req.scope, key)) return next()
    next(new MedusaError(MedusaError.Types.NOT_FOUND, "Not found"))
  }
}

/**
 * `requireFeatureFlag` for only the paths a pattern matches, for a flagged
 * route under a matcher that authenticates a wider path first: placed
 * before that authentication, it still answers `404` first.
 */
export function requireFeatureFlagFor(key: string, path: RegExp) {
  const gate = requireFeatureFlag(key)
  return function pathFeatureFlagGate(
    req: MedusaRequest,
    res: MedusaResponse,
    next: MedusaNextFunction,
  ) {
    if (!path.test(req.originalUrl.split("?")[0])) return next()
    gate(req, res, next)
  }
}
