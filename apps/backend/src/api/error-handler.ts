import {
  errorHandler,
  getHttpResponseFromError,
  MedusaErrorHandlerFunction,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { responseFieldsOf } from "../workflows/common/response-fields"

/**
 * Medusa's error handler, unchanged, except that a 4xx refusal carrying
 * response fields gets them next to `type`, `code` and `message`. Medusa's
 * fields win, so the response keeps Medusa's shape (coding standard 7.1).
 */
export function mtogoErrorHandler(): MedusaErrorHandlerFunction {
  const medusaErrorHandler = errorHandler()
  return (error, req, res, next) => {
    const fields = responseFieldsOf(error)
    const { statusCode, body } = getHttpResponseFromError(error)
    if (!fields || statusCode >= 500)
      return medusaErrorHandler(error, req, res, next)
    req.scope.resolve(ContainerRegistrationKeys.LOGGER).info(error.message)
    res.status(statusCode).json({ ...fields, ...body })
  }
}
