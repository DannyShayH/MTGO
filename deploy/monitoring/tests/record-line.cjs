// A genuine record line for the disposable checks (#178, #179). The record
// builder is passed in: it has another path inside a container.
/** `age` is how long ago the application wrote it. */
exports.createRecordLine = (createLogRecord, service, requestId, age = 0) =>
  JSON.stringify({
    ...createLogRecord(
      service,
      "access.denied",
      { request_id: requestId, status: 401 },
      "production",
    ),
    time: new Date(Date.now() - age).toISOString(),
  })
