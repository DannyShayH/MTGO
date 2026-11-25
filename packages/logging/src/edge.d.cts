import type { Service } from "./index.cjs"

/** An Edge `onRequestError` logger: the same safe `request.failed` record. */
export function createEdgeRequestErrorLogger(
  service: Service,
  options?: { env?: string; write?: (line: string) => void },
): (
  error: unknown,
  request: {
    method?: string
    headers?: Record<string, string | string[] | undefined>
  },
  context: { routePath?: string },
) => void
