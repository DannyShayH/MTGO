import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url))
const JAVA_FEATURE = "ghcr.io/devcontainers/features/java:1"
const JAVA_HOME = "/usr/local/sdkman/candidates/java/current"
const SONARQUBE_FOR_IDE = "SonarSource.sonarlint-vscode"
const PYTHON_FEATURE = "ghcr.io/devcontainers/features/python"
const PYTHON_EXTENSIONS = ["ms-python.python", "ms-python.vscode-pylance"]

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(join(REPO_ROOT, path), "utf8")) as T
}

describe("development container", () => {
  it("declares Java 21 for the SonarQube for IDE language server", () => {
    const devcontainer = readJson<{
      features: Record<string, { version?: string }>
    }>(".devcontainer/devcontainer.json")
    const settings = readJson<Record<string, unknown>>(".vscode/settings.json")

    expect(devcontainer.features[JAVA_FEATURE]).toEqual({ version: "21" })
    expect(settings["sonarlint.ls.javaHome"]).toBe(JAVA_HOME)
  })

  it("recommends SonarQube for IDE instead of installing it for everyone", () => {
    const devcontainer = readJson<{
      customizations: { vscode: { extensions: string[] } }
    }>(".devcontainer/devcontainer.json")
    const recommendations = readJson<{ recommendations: string[] }>(
      ".vscode/extensions.json",
    )

    expect(devcontainer.customizations.vscode.extensions).not.toContain(
      SONARQUBE_FOR_IDE,
    )
    expect(recommendations.recommendations).toContain(SONARQUBE_FOR_IDE)
  })

  it("keeps Python for TakT without installing Pylance", () => {
    const devcontainer = readJson<{
      features: Record<string, unknown>
      customizations: { vscode: { extensions: string[] } }
    }>(".devcontainer/devcontainer.json")
    const lockfile = readJson<{ features: Record<string, unknown> }>(
      ".devcontainer/devcontainer-lock.json",
    )

    for (const features of [devcontainer.features, lockfile.features]) {
      expect(Object.keys(features)).toContain(PYTHON_FEATURE)
    }
    for (const extension of PYTHON_EXTENSIONS) {
      expect(devcontainer.customizations.vscode.extensions).toContain(
        `-${extension}`,
      )
    }
  })

  it("pins the Java feature to an immutable artifact", () => {
    const lockfile = readJson<{
      features: Record<
        string,
        { version: string; resolved: string; integrity: string }
      >
    }>(".devcontainer/devcontainer-lock.json")
    const lockedFeature = lockfile.features[JAVA_FEATURE]

    expect(lockedFeature.version).toBe("1.8.3")
    expect(lockedFeature.resolved).toMatch(
      /^ghcr\.io\/devcontainers\/features\/java@sha256:[a-f0-9]{64}$/,
    )
    expect(lockedFeature.integrity).toBe(
      lockedFeature.resolved.replace(
        "ghcr.io/devcontainers/features/java@",
        "",
      ),
    )
  })

  it("runs the language server against TypeScript on x64 and ARM64", () => {
    const devcontainer = readJson<{
      features: Record<string, { version?: string }>
    }>(".devcontainer/devcontainer.json")
    const acceptanceContainer = readJson<{
      features: Record<string, { version?: string }>
      image: string
    }>(".devcontainer/runtime-acceptance.json")
    const compose = readFileSync(
      join(REPO_ROOT, ".devcontainer/compose.yaml"),
      "utf8",
    )
    const workflow = readFileSync(
      join(REPO_ROOT, ".github/workflows/devcontainer-runtime.yml"),
      "utf8",
    )

    for (const feature of [
      JAVA_FEATURE,
      "ghcr.io/devcontainers/features/node:2.1.1",
    ]) {
      expect(acceptanceContainer.features[feature]).toEqual(
        devcontainer.features[feature],
      )
    }
    expect(compose).toContain(`image: ${acceptanceContainer.image}`)
    expect(workflow).toContain("runs-on: ubuntu-latest")
    expect(workflow).toContain("platform: linux/amd64")
    expect(workflow).toContain("platform: linux/arm64")
    expect(workflow).toContain(".devcontainer/runtime-acceptance.json")
    expect(workflow).toContain("scripts/verify-sonarqube-ide.mjs")
  })
})
