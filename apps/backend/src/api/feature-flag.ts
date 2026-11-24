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
    const flags = req.scope.resolve<IFlagRouter>(
      ContainerRegistrationKeys.FEATURE_FLAG_ROUTER,
    )
    if (flags.isFeatureEnabled(key)) return next()
    next(new MedusaError(MedusaError.Types.NOT_FOUND, "Not found"))
  }
}
