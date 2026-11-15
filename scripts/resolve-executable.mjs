import { accessSync, constants } from "node:fs"
import { delimiter, join } from "node:path"

/**
 * The absolute path of a command on PATH, so child processes start a fixed
 * file instead of searching PATH themselves (Sonar S4036).
 */
export function resolveExecutable(name) {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (!directory) continue
    const candidate = join(directory, name)
    try {
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch {
      // not in this directory
    }
  }
  throw new Error(`${name} was not found on PATH`)
}
