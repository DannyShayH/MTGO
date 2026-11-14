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
import {
  ErrorResponseFields,
  responseFieldsOf,
} from "../workflows/common/response-fields"

const CATEGORY_ROUTE =
  /^\/partner\/restaurants\/[^/]+\/categories(?:\/[^/]+)?\/?$/
const CATEGORY_CONFLICT_CODES = new Set([
  "category_stale",
  "category_not_empty",
  "category_retry_conflict",
  "category_retry_removed",
])

/**
 * The stable partner category refusal, or nothing for any other error.
 * Validation middleware may reject before the category workflow runs, so a
 * 400 on a category route keeps one code without interpreting its message.
 */
function categoryRefusalBody(
  code: string | undefined,
  url: string,
  statusCode: number,
  body: { type?: string },
  fields: ErrorResponseFields | undefined,
) {
  if (statusCode === 400 && CATEGORY_ROUTE.test(url.split("?")[0])) {
    return {
      type: body.type,
      code: "category_input_invalid",
      message: "category_input_invalid",
    }
  }
  if (statusCode === 409 && code && CATEGORY_CONFLICT_CODES.has(code)) {
    return { ...fields, ...body, code, message: code }
  }
  return undefined
}

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
    const categoryBody = categoryRefusalBody(
      error.code,
      req.originalUrl,
      statusCode,
      body,
      fields,
    )
    if (categoryBody) {
      res.status(statusCode).json(categoryBody)
      return
    }
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
