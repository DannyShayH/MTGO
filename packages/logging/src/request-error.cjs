const { knownRequestId } = require("./request-id.cjs")

/**
 * The route pattern of a Next.js route file path: no route groups, parallel
 * slots or file name, and parameters as `:name`. Never the requested path.
 */
function routePattern(routePath) {
  if (typeof routePath !== "string" || !routePath.startsWith("/"))
    return undefined
  const segments = routePath
    .replace(/\/(?:page|route)$/, "")
    .split("/")
    .filter((segment) => segment && !/^(?:\(.*\)|@.*)$/.test(segment))
    .map((segment) =>
      segment
        .replace(/^\[{1,2}\.{3}(\w+)\]{1,2}$/, ":$1*")
        .replace(/^\[(\w+)\]$/, ":$1"),
    )
  return `/${segments.join("/")}`
}

/**
 * The `request.failed` fields of an error Next.js handed to `onRequestError`.
 * It reads the method, the validated request ID and the route file path only:
 * never the URL, the other headers, or the error's message, stack or digest.
 */
function requestErrorFields(error, request, context) {
  const request_id = knownRequestId(request?.headers?.["x-request-id"])
  return {
    ...(request_id && { request_id }),
    route: routePattern(context?.routePath),
    method: request?.method,
    err: error,
  }
}

module.exports = { requestErrorFields }
