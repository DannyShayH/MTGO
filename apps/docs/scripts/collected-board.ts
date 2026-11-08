import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

/** Where collect-board.ts saves the board dataset and build-flow-metrics.ts reads it */
export const COLLECTED_BOARD = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  ".cache",
  "board.json",
)
