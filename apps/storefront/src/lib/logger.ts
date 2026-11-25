import "server-only"
import { createApplicationLogger, type LogFields } from "@dtc/logging"
import { getRequestId } from "@lib/data/request-id"

const log = createApplicationLogger("storefront")

/**
 * Records a failed backend call under this request's ID, which the call carried
 * too. It does not delay its caller.
 */
export function logUpstreamFailure(fields: LogFields): void {
  void getRequestId().then((request_id) =>
    log("upstream.request.failed", { ...fields, request_id }),
  )
}
