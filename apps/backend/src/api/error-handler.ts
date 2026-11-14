import {
  errorHandler,
  getHttpResponseFromError,
  MedusaErrorHandlerFunction,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import {
  correlatedRoute,
  initializeRequestCorrelation,
} from "./request-logging"
import { responseFieldsOf } from "../workflows/common/response-fields"

/**
 * Preserve Medusa responses and additional refusal fields. The correlated
 * sign-in path handles failures safely and logs once when the response ends.
 */
export function mtogoErrorHandler(): MedusaErrorHandlerFunction {
  const medusaErrorHandler = errorHandler()
  const stableErrorCodes = new Set([
    "customer_identity_exists",
    "customer_email_verification_required",
    "customer_credentials_invalid",
    "customer_sign_in_required",
    "customer_provider_not_allowed",
    "customer_verification_delivery_failed",
  ])
  return (error, req, res, next) => {
    if (error.message === "customer_identity_exists") {
      error.type = MedusaError.Types.CONFLICT
      error.code = error.message
    } else if (error.message === "customer_email_verification_required") {
      error.type = MedusaError.Types.FORBIDDEN
      error.code = error.message
    } else if (
      [
        "customer_credentials_invalid",
        "customer_sign_in_required",
        "customer_provider_not_allowed",
        "customer_verification_delivery_failed",
      ].includes(error.message)
    ) {
      error.code = error.message
    }
    const fields = responseFieldsOf(error)
    const { statusCode, body } = getHttpResponseFromError(error)
    const stableErrorCode = stableErrorCodes.has(error.message)
      ? error.message
      : undefined
    if (stableErrorCode) body.code = stableErrorCode
    // The demonstrated login path logs once on response finish. Delegating to
    // Medusa here would also log raw error messages/objects without correlation.
    if (correlatedRoute(req)) {
      // Medusa's body parser runs before application correlation middleware.
      initializeRequestCorrelation(req, res)
      if (statusCode >= 500) {
        res.locals.loggingError = error
        res.status(statusCode).json({
          type: "unknown_error",
          message: "An unknown error occurred.",
        })
      } else if (statusCode === 403 && body.code === "staff_access_revoked") {
        // This agreed domain refusal carries the Restaurant's public name.
        res.status(statusCode).json({
          ...fields,
          type: "forbidden",
          code: "staff_access_revoked",
          message: "staff_access_revoked",
        })
      } else {
        // Provider and validation messages are untrusted too. Preserve status
        // and Medusa's shape without returning credentials embedded in text.
        res.status(statusCode).json({
          type: body.type,
          message: "The request could not be completed.",
        })
      }
      return
    }
    if ((!fields && !stableErrorCode) || statusCode >= 500)
      return medusaErrorHandler(error, req, res, next)
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).info(error.message)
    res.status(statusCode).json({ ...fields, ...body })
  }
}
