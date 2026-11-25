// Shared by the checks that drive disposable containers (#178, #179).
import { execFileSync } from "node:child_process"
import { setTimeout as sleep } from "node:timers/promises"

/** Commands of one disposable Compose project. */
export function createProject(file, env = {}) {
  const compose = (args, input) =>
    execFileSync("docker", ["compose", "-f", file, ...args], {
      encoding: "utf8",
      env: { ...process.env, ...env },
      input,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["pipe", "pipe", "inherit"],
    })
  return {
    compose,
    start: (...services) => compose(["up", "-d", "--no-deps", ...services]),
    removeProject: () => compose(["down", "--volumes", "--remove-orphans"]),
  }
}

/** Polls until `read` returns something truthy, and returns that. */
export async function waitFor(what, read, minutes = 5) {
  const deadline = Date.now() + minutes * 60_000
  let cause
  while (Date.now() < deadline) {
    try {
      const value = read()
      if (value) return value
    } catch (error) {
      // Not up yet, perhaps; the deadline decides.
      cause = error
    }
    await sleep(3000)
  }
  throw new Error(`Timed out waiting for ${what}`, { cause })
}

/** The sum of a counter's series whose labels contain `label`. */
export const sumCounter = (metrics, name, label = "") =>
  metrics
    .split("\n")
    .filter((sample) => sample.startsWith(name) && sample.includes(label))
    .reduce((sum, sample) => sum + Number(sample.split(" ").at(-1)), 0)

export const report = (text) => console.log(`ok - ${text}`)
