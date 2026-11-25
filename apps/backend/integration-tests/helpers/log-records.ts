import winston from "winston"

/**
 * The backend's approved records of the current test, read from the final
 * formatted output. Winston can use Jest's buffered console instead of
 * process.stdout in multi-suite runs, so the output is observed at its
 * transport, preserving the real logger, formatting and console write.
 */
export function captureLogRecords() {
  let output = ""
  beforeEach(() => {
    output = ""
    const write = winston.transports.Console.prototype.log
    jest
      .spyOn(winston.transports.Console.prototype, "log")
      .mockImplementation(function (info, callback) {
        const formatted = info as Record<symbol, string>
        output += `${formatted[Symbol.for("message")]}\n`
        write.call(this, info, callback)
      })
  })
  afterEach(() => {
    jest.restoreAllMocks()
  })
  return {
    output: () => output,
    records: () =>
      output
        .split("\n")
        .filter((line) => line.startsWith("{"))
        .map((line) => JSON.parse(line))
        .filter((record) => record.service === "backend"),
  }
}
