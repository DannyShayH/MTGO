import { spawn, spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url))
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, "..")
const SETTINGS_PATH = join(REPOSITORY_ROOT, ".vscode/settings.json")
const TYPESCRIPT_PATH = join(
  REPOSITORY_ROOT,
  "apps/docs/scripts/devcontainer.test.ts",
)
const TIMEOUT_MS = 300_000

function fail(message) {
  throw new Error(message)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"))
}

function findExtensionDirectory() {
  if (process.env.SONARQUBE_VSCODE_EXTENSION_DIR) {
    return process.env.SONARQUBE_VSCODE_EXTENSION_DIR
  }

  const extensionRoot = join(
    process.env.HOME ?? "",
    ".vscode-server/extensions",
  )
  if (!existsSync(extensionRoot)) {
    fail(
      "SonarQube for IDE is not installed in the remote container. Rebuild and reopen it before running this check.",
    )
  }

  const matches = readdirSync(extensionRoot)
    .filter((entry) => entry.startsWith("sonarsource.sonarlint-vscode-"))
    .sort()

  if (matches.length === 0) {
    fail(
      "SonarQube for IDE is not installed in the remote container. Rebuild and reopen it before running this check.",
    )
  }

  return join(extensionRoot, matches.at(-1))
}

function verifyJava(javaHome) {
  const javaExecutable = join(javaHome, "bin/java")
  if (!existsSync(javaExecutable)) {
    fail(`The configured Java executable does not exist: ${javaExecutable}`)
  }

  const result = spawnSync(javaExecutable, ["-version"], {
    encoding: "utf8",
  })
  const versionOutput = `${result.stdout}${result.stderr}`
  const versionMatch = versionOutput.match(/version "(\d+)/)

  if (result.status !== 0 || !versionMatch) {
    fail(`Unable to read the Java version from ${javaExecutable}`)
  }

  const majorVersion = Number.parseInt(versionMatch[1], 10)
  if (majorVersion < 21) {
    fail(`SonarQube for IDE requires Java 21 or newer, found ${majorVersion}`)
  }

  return { javaExecutable, majorVersion }
}

function createLanguageServer(javaExecutable, extensionDirectory) {
  const serverJar = join(extensionDirectory, "server/sonarlint-ls.jar")
  const analyzerNames = [
    "sonargo.jar",
    "sonarjava.jar",
    "sonarjs.jar",
    "sonarphp.jar",
    "sonarpython.jar",
    "sonarhtml.jar",
    "sonarxml.jar",
    "sonartext.jar",
    "sonariac.jar",
    "sonarlintomnisharp.jar",
  ]
  const analyzerJars = analyzerNames.map((name) =>
    join(extensionDirectory, "analyzers", name),
  )

  for (const artifact of [serverJar, ...analyzerJars]) {
    if (!existsSync(artifact)) {
      fail(`The SonarQube for IDE artifact does not exist: ${artifact}`)
    }
  }

  const isolatedUserHome = mkdtempSync(join(tmpdir(), "mtogo-sonarqube-ide-"))

  return spawn(
    javaExecutable,
    [
      "-Dsonarlint.telemetry.disabled=true",
      `-Duser.home=${isolatedUserHome}`,
      "-jar",
      serverJar,
      "-stdio",
      "-analyzers",
      ...analyzerJars,
    ],
    {
      cwd: REPOSITORY_ROOT,
      stdio: ["pipe", "pipe", "pipe"],
    },
  )
}

function createProtocolClient(languageServer, extensionDirectory) {
  let buffer = Buffer.alloc(0)
  let nextRequestId = 1
  const pendingRequests = new Map()
  const notificationWaiters = new Set()
  const standardSettings = {
    automaticAnalysis: true,
    disableTelemetry: true,
    pathToNodeExecutable: process.execPath,
  }

  function send(message) {
    const body = JSON.stringify({ jsonrpc: "2.0", ...message })
    languageServer.stdin.write(
      `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
    )
  }

  function respond(id, result) {
    send({ id, result })
  }

  function respondToServerRequest(message) {
    switch (message.method) {
      case "workspace/configuration":
        respond(
          message.id,
          message.params.items.map((item) =>
            item.section === "sonarlint" ? standardSettings : null,
          ),
        )
        break
      case "sonarlint/filterOutExcludedFiles":
        respond(message.id, { fileUris: message.params.fileUris })
        break
      case "sonarlint/listFilesInFolder":
        respond(message.id, { foundFiles: [] })
        break
      case "sonarlint/isOpenInEditor":
        respond(message.id, true)
        break
      case "sonarlint/canShowMissingRequirementsNotification":
        respond(message.id, "DO_NOT_SHOW_AGAIN")
        break
      case "sonarlint/hasJoinedIdeLabs":
        respond(message.id, false)
        break
      case "workspace/applyEdit":
        respond(message.id, { applied: true })
        break
      default:
        respond(message.id, null)
    }
  }

  function handleMessage(message) {
    if (
      process.env.SONARQUBE_IDE_DEBUG === "1" &&
      message.method === "window/logMessage"
    ) {
      console.error(message.params.message)
    }

    if (message.id !== undefined && message.method) {
      respondToServerRequest(message)
      return
    }

    if (message.id !== undefined) {
      const pending = pendingRequests.get(message.id)
      if (!pending) {
        return
      }

      pendingRequests.delete(message.id)
      if (message.error) {
        pending.reject(
          new Error(
            `${message.error.message}: ${JSON.stringify(message.error.data)}`,
          ),
        )
      } else {
        pending.resolve(message.result)
      }
      return
    }

    for (const waiter of notificationWaiters) {
      if (waiter.matches(message)) {
        notificationWaiters.delete(waiter)
        waiter.resolve(message)
      }
    }
  }

  function consumeMessages() {
    while (true) {
      const headerEnd = buffer.indexOf("\r\n\r\n")
      if (headerEnd === -1) {
        return
      }

      const header = buffer.subarray(0, headerEnd).toString("ascii")
      const lengthMatch = header.match(/Content-Length: (\d+)/i)
      if (!lengthMatch) {
        fail(`Language server returned an invalid LSP header: ${header}`)
      }

      const contentLength = Number.parseInt(lengthMatch[1], 10)
      const messageEnd = headerEnd + 4 + contentLength
      if (buffer.length < messageEnd) {
        return
      }

      const body = buffer.subarray(headerEnd + 4, messageEnd).toString("utf8")
      buffer = buffer.subarray(messageEnd)
      handleMessage(JSON.parse(body))
    }
  }

  languageServer.stdout.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk])
    consumeMessages()
  })

  function request(method, params) {
    const id = nextRequestId
    nextRequestId += 1
    send({ id, method, params })

    return new Promise((resolveRequest, rejectRequest) => {
      pendingRequests.set(id, {
        reject: rejectRequest,
        resolve: resolveRequest,
      })
    })
  }

  function notify(method, params) {
    send({ method, params })
  }

  function waitForNotification(matches, description) {
    return new Promise((resolveNotification, rejectNotification) => {
      const waiter = { matches, resolve: resolveNotification }
      notificationWaiters.add(waiter)
      const timeout = setTimeout(() => {
        notificationWaiters.delete(waiter)
        rejectNotification(
          new Error(
            `Timed out waiting for ${description} after ${TIMEOUT_MS}ms`,
          ),
        )
      }, TIMEOUT_MS)

      waiter.resolve = (message) => {
        clearTimeout(timeout)
        resolveNotification(message)
      }
    })
  }

  const workspaceUri = pathToFileURL(REPOSITORY_ROOT).href
  const initializationOptions = {
    additionalAttributes: {},
    automaticAnalysis: true,
    clientNodePath: process.execPath,
    connections: { sonarcloud: [], sonarqube: [] },
    enableNotebooks: false,
    eslintBridgeServerPath: join(extensionDirectory, "eslint-bridge"),
    firstSecretDetected: false,
    focusOnNewCode: false,
    productKey: "mtogo-runtime-acceptance",
    productName: "MTOGO runtime acceptance",
    productVersion: "1",
    rules: {},
    showVerboseLogs: true,
    workspaceName: "MTOGO",
  }

  return {
    initialize: () =>
      request("initialize", {
        capabilities: {
          textDocument: { publishDiagnostics: {} },
          window: { workDoneProgress: true },
          workspace: { configuration: true, workspaceFolders: true },
        },
        clientInfo: { name: "MTOGO runtime acceptance", version: "1" },
        initializationOptions,
        processId: process.pid,
        rootUri: workspaceUri,
        trace: "messages",
        workspaceFolders: [{ name: "MTOGO", uri: workspaceUri }],
      }),
    notify,
    request,
    waitForNotification,
  }
}

async function run() {
  const settings = readJson(SETTINGS_PATH)
  const javaHome =
    process.env.SONARQUBE_IDE_JAVA_HOME ?? settings["sonarlint.ls.javaHome"]
  if (typeof javaHome !== "string" || javaHome.length === 0) {
    fail("sonarlint.ls.javaHome is not configured in .vscode/settings.json")
  }

  const expectedArchitecture = process.env.EXPECTED_ARCHITECTURE
  if (expectedArchitecture && process.arch !== expectedArchitecture) {
    fail(
      `Expected ${expectedArchitecture}, but the acceptance check is running on ${process.arch}`,
    )
  }

  const extensionDirectory = findExtensionDirectory()
  const { javaExecutable, majorVersion } = verifyJava(javaHome)
  const languageServer = createLanguageServer(
    javaExecutable,
    extensionDirectory,
  )
  let standardError = ""
  languageServer.stderr.on("data", (chunk) => {
    standardError += chunk.toString("utf8")
    if (process.env.SONARQUBE_IDE_DEBUG === "1") {
      process.stderr.write(chunk)
    }
  })

  const protocol = createProtocolClient(languageServer, extensionDirectory)
  let verificationComplete = false
  const unexpectedExit = new Promise((_, rejectExit) => {
    languageServer.once("exit", (code, signal) => {
      if (verificationComplete) {
        return
      }
      rejectExit(
        new Error(
          `Language server exited before verification (code ${code}, signal ${signal}).\n${standardError}`,
        ),
      )
    })
  })

  try {
    const initializeResult = await Promise.race([
      protocol.initialize(),
      unexpectedExit,
    ])
    if (initializeResult.serverInfo?.name !== "SonarLint Language Server") {
      fail("SonarQube for IDE did not return its expected language-server name")
    }

    const settingsApplied = protocol.waitForNotification(
      (message) => message.method === "sonarlint/settingsApplied",
      "SonarQube settings to be applied",
    )
    protocol.notify("initialized", {})
    await Promise.race([settingsApplied, unexpectedExit])

    const typescriptUri = pathToFileURL(TYPESCRIPT_PATH).href
    const diagnostics = protocol.waitForNotification(
      (message) =>
        message.method === "textDocument/publishDiagnostics" &&
        message.params.uri === typescriptUri,
      "TypeScript diagnostics",
    )
    protocol.notify("textDocument/didOpen", {
      textDocument: {
        languageId: "typescript",
        text: readFileSync(TYPESCRIPT_PATH, "utf8"),
        uri: typescriptUri,
        version: 1,
      },
    })
    await Promise.race([diagnostics, unexpectedExit])

    await protocol.request("shutdown", null)
    verificationComplete = true
    protocol.notify("exit", null)
    console.log(
      `SonarQube for IDE analyzed ${typescriptUri} with Java ${majorVersion} on ${process.arch}.`,
    )
  } finally {
    verificationComplete = true
    languageServer.kill()
  }
}

run().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
