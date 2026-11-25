// No Node built-ins and no Winston: the Edge build of a Next.js app's
// instrumentation imports this, through "@dtc/logging/edge".
const { createLogRecord } = require("./record.cjs")
const { requestErrorFields } = require("./request-error.cjs")

/**
 * A Next.js `onRequestError` logger for the Edge runtime, where Winston cannot
 * run: the same safe `request.failed` record, as one JSON line on stdout.
 * Next.js reports a failed middleware run once.
 */
function createEdgeRequestErrorLogger(service, { env, write } = {}) {
  return (error, request, context) => {
    const fields = requestErrorFields(error, request, context)
    const record = createLogRecord(service, "request.failed", fields, env)
    const line = JSON.stringify(record)
    if (write) write(line)
    else console.log(line)
  }
}

module.exports = { createEdgeRequestErrorLogger }
