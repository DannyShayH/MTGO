import { appendFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { collectBoard } from "./board-collector.ts"
import { COLLECTED_BOARD } from "./collected-board.ts"

// Reads Project #2 with PROJECT_READER and saves the board dataset where
// build-flow-metrics.ts picks it up. Without the token nothing is saved, and the
// build falls back to board-sample.json with the "sample data" banner (ADR-0003).
// Any failure, an expired token included, stops the run: a delivery must never
// ship sample or silently empty numbers when the real board was expected.

// In GitHub Actions a "::notice::" or "::error::" line becomes an annotation on the
// run page, and the step summary is shown there too. Locally it is a plain log line.
const inActions = process.env.GITHUB_ACTIONS === "true"
// GitHub's escaping for workflow commands, so a multi-line message stays whole
const escapeData = (text: string) =>
  text.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A")
const escapeProperty = (text: string) =>
  escapeData(text).replaceAll(":", "%3A").replaceAll(",", "%2C")
function report(level: "notice" | "error", title: string, message: string) {
  const log = level === "error" ? console.error : console.log
  log(
    inActions
      ? `::${level} title=${escapeProperty(title)}::${escapeData(message)}`
      : message,
  )
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### ${title}\n\n${message}\n`,
    )
}

rmSync(COLLECTED_BOARD, { force: true })

const token = process.env.PROJECT_READER
if (!token) {
  report(
    "notice",
    "Sample data",
    "PROJECT_READER is not set, the site will use the sample data.",
  )
} else {
  try {
    const dataset = await collectBoard({ token })
    mkdirSync(dirname(COLLECTED_BOARD), { recursive: true })
    writeFileSync(COLLECTED_BOARD, JSON.stringify(dataset, null, 2) + "\n")
    console.log(`Collected ${dataset.items.length} issues from Project #2.`)
  } catch (error) {
    // Messages are masked by the collector, so the token never reaches the log
    report("error", "Board collection failed", (error as Error).message)
    process.exitCode = 1
  }
}
