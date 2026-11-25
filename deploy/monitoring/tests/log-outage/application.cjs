// Stand-in application of the log outage check (#179). Each request logs
// `count` genuine records to stdout and is answered only after they are
// written, so a blocking log driver would show as a slow or failed request.
const { createServer } = require("node:http")
const { createLogRecord } = require("/logging/record.cjs")
const { createRecordLine } = require("../record-line.cjs")

const createLine = (requestId) =>
  createRecordLine(createLogRecord, process.env.SERVICE, requestId) + "\n"

createServer((request, response) => {
  const { searchParams } = new URL(request.url, "http://localhost")
  const id = searchParams.get("id")
  const count = Number(searchParams.get("count") ?? 1)
  const ids =
    count === 1 ? [id] : Array.from({ length: count }, (_, i) => `${id}-${i}`)
  process.stdout.write(ids.map(createLine).join(""), () => response.end("ok"))
}).listen(3000)
