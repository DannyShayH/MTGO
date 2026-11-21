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
import {
  ACCEPTANCE_REFUSALS,
  ORDER_CHANGED,
  PROGRESS_REFUSALS,
} from "../workflows/order-operations/rules"
import {
  ASSIGNMENT_CONFLICTS,
  ASSIGNMENT_REFUSALS,
} from "../workflows/delivery/assignment-rules"
import {
  PICKUP_CONFLICTS,
  PICKUP_REFUSALS,
} from "../workflows/delivery/pickup-rules"
import {
  HANDOVER_CONFLICTS,
  HANDOVER_REFUSALS,
} from "../workflows/delivery/terminal-rules"
import {
  ARRIVAL_CONFLICTS,
  ARRIVAL_REFUSALS,
  CONTACT_ATTEMPT_CONFLICTS,
  CONTACT_ATTEMPT_REFUSALS,
} from "../workflows/delivery/arrival-rules"

const CATEGORY_ROUTE =
  /^\/partner\/restaurants\/[^/]+\/categories(?:\/[^/]+)?\/?$/
const CATEGORY_CONFLICT_CODES = new Set([
  "category_stale",
  "category_not_empty",
  "category_retry_conflict",
  "category_retry_removed",
])
const CUSTOMER_PROFILE_ROUTE = "/store/customers/me"

/**
 * Medusa's body validation reports the schema's refusal codes in the message
 * of the 400 it raises, so the message is the only place to find them.
 */
function customerProfileInputCode({ message }: { message: string }): string {
  if (message.includes("customer_phone_invalid"))
    return "customer_phone_invalid"
  if (message.includes("customer_name_required"))
    return "customer_name_required"
  return "customer_profile_input_invalid"
}

function customerProfileRefusalBody(
  error: { message: string },
  url: string,
  statusCode: number,
  body: { type?: string },
) {
  if (statusCode !== 400 || url.split("?")[0] !== CUSTOMER_PROFILE_ROUTE)
    return undefined
  const code = customerProfileInputCode(error)
  return { type: body.type, code, message: code }
}

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

function arrangementRefusalBody(
  error: { code?: string },
  url: string,
  statusCode: number,
  body: { type?: string },
  fields: ErrorResponseFields | undefined,
) {
  if (
    !/^\/partner\/restaurants\/[^/]+\/menu-arrangement\/?$/.test(
      url.split("?")[0],
    )
  )
    return undefined
  if (statusCode === 400)
    return {
      type: body.type,
      code: "menu_order_invalid",
      message: "menu_order_invalid",
    }
  if (
    statusCode === 409 &&
    ["menu_order_stale", "menu_order_invalid"].includes(error.code ?? "")
  )
    return { ...fields, type: body.type, code: error.code, message: error.code }
  return undefined
}

function dishRefusalBody(
  error: { code?: string; message: string },
  url: string,
  statusCode: number,
  body: { type?: string },
  fields: ErrorResponseFields | undefined,
) {
  if (
    (statusCode >= 500 && error.code !== "dish_publication_uncertain") ||
    !/^\/partner\/restaurants\/[^/]+\/dishes(?:\/[^/]+(?:\/availability)?)?\/?$/.test(
      url.split("?")[0],
    )
  )
    return undefined
  let code = error.code || error.message
  if (statusCode === 400) {
    if (
      error.code === "dish_allergens_invalid" ||
      error.code === "dish_food_labels_invalid"
    )
      code = error.code
    else code = "dish_input_invalid"
  }
  return { ...fields, type: body.type, code, message: code }
}

function photoRefusalBody(
  error: { code?: string },
  url: string,
  statusCode: number,
  body: { type?: string },
) {
  if (
    !/^\/partner\/restaurants\/[^/]+\/(?:cover|dishes\/[^/]+\/photo)\/?$/.test(
      url.split("?")[0],
    )
  )
    return undefined
  const code = statusCode === 400 && !error.code ? "photo_invalid" : error.code
  if (
    !code ||
    ![
      "photo_invalid",
      "photo_quota",
      "photo_rate_limit",
      "photo_stale",
      "photo_exists",
      "photo_retry_conflict",
      "photo_target_not_found",
      "photo_storage_failed",
      "staff_access_revoked",
    ].includes(code)
  )
    return undefined
  return { type: body.type, code, message: code }
}

/**
 * The agent's position must never be echoed or logged (#191). Medusa's
 * validation message repeats the rejected value and its handler logs it, so
 * every refusal before the route answers with one code and no log.
 */
function pickupDistancesRefusalBody(
  url: string,
  statusCode: number,
  body: { type?: string },
) {
  if (
    (statusCode !== 400 && statusCode !== 413) ||
    !/^\/partner\/delivery-agent\/pickup-distances\/?$/.test(url.split("?")[0])
  )
    return undefined
  const code = statusCode === 413 ? "position_too_large" : "position_invalid"
  return { type: body.type, code, message: code }
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
    "cart_customer_access_denied",
    "checkout_review_incomplete",
    "basket_other_restaurant",
    "basket_not_a_dish",
    "basket_review_required",
    "order_export_unavailable",
    "order_not_found",
    "order_placement_incomplete",
    ...ACCEPTANCE_REFUSALS,
    ...PROGRESS_REFUSALS,
    ORDER_CHANGED,
    "order_restaurant_mismatch",
    ...ASSIGNMENT_REFUSALS,
    ...ASSIGNMENT_CONFLICTS,
    ...PICKUP_REFUSALS,
    ...PICKUP_CONFLICTS,
    ...HANDOVER_REFUSALS,
    ...HANDOVER_CONFLICTS,
    ...ARRIVAL_REFUSALS,
    ...ARRIVAL_CONFLICTS,
    ...CONTACT_ATTEMPT_REFUSALS,
    ...CONTACT_ATTEMPT_CONFLICTS,
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
        "cart_customer_access_denied",
        "checkout_review_incomplete",
      ].includes(error.message)
    ) {
      error.code = error.message
    }
    const fields = responseFieldsOf(error)
    const { statusCode: originalStatus, body } = getHttpResponseFromError(error)
    const statusCode =
      error.code === "dish_publication_uncertain" ||
      error.code === "photo_storage_failed"
        ? 503
        : originalStatus
    const stableErrorCode = stableErrorCodes.has(error.message)
      ? error.message
      : undefined
    if (stableErrorCode) body.code = stableErrorCode
    const categoryBody =
      pickupDistancesRefusalBody(req.originalUrl, statusCode, body) ??
      photoRefusalBody(error, req.originalUrl, statusCode, body) ??
      arrangementRefusalBody(
        error,
        req.originalUrl,
        statusCode,
        body,
        fields,
      ) ??
      customerProfileRefusalBody(error, req.originalUrl, statusCode, body) ??
      dishRefusalBody(error, req.originalUrl, statusCode, body, fields) ??
      categoryRefusalBody(error.code, req.originalUrl, statusCode, body, fields)
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
