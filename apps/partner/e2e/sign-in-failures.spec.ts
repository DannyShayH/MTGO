import { createServer, type Server } from "node:http"
import { spawn, type ChildProcess } from "node:child_process"
import { createRequire } from "node:module"
import { once } from "node:events"
import { expect, test } from "@playwright/test"

const resolveDependency = createRequire(`${process.cwd()}/package.json`)
let backend: Server
let partner: ChildProcess
let origin: string
let failurePath = ""
let failureStatus = 503

test.beforeAll(async () => {
  // Browser interception cannot affect server-side SDK calls. Give a separate
  // production app its own backend stub instead of changing the real backend.
  backend = createServer((request, response) => {
    if (request.url === failurePath && failureStatus === 0) {
      request.socket.destroy()
      return
    }
    response.setHeader("content-type", "application/json")
    if (request.url === failurePath) {
      response.writeHead(failureStatus)
      response.end(JSON.stringify({ message: "backend failure" }))
      return
    }
    response.end(JSON.stringify({ token: "test-staff-token" }))
  })
  backend.listen(0, "127.0.0.1")
  await once(backend, "listening")
  const backendAddress = backend.address()
  if (!backendAddress || typeof backendAddress === "string")
    throw new Error("Backend stub did not bind a TCP port")

  const portProbe = createServer()
  portProbe.listen(0, "127.0.0.1")
  await once(portProbe, "listening")
  const partnerAddress = portProbe.address()
  if (!partnerAddress || typeof partnerAddress === "string")
    throw new Error("Partner port probe did not bind a TCP port")
  await new Promise<void>((resolve, reject) =>
    portProbe.close((error) => (error ? reject(error) : resolve())),
  )
  origin = `http://localhost:${partnerAddress.port}`
  partner = spawn(
    process.execPath,
    [
      resolveDependency.resolve("next/dist/bin/next"),
      "start",
      "-p",
      String(partnerAddress.port),
    ],
    {
      env: {
        ...process.env,
        NODE_ENV: "production",
        MEDUSA_BACKEND_URL: `http://127.0.0.1:${backendAddress.port}`,
      },
      stdio: "ignore",
    },
  )
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(`${origin}/sign-in`)).status
        } catch {
          return 0
        }
      },
      { timeout: 30_000 },
    )
    .toBe(200)
})

test.afterAll(async () => {
  if (partner && partner.exitCode === null) {
    const exited = once(partner, "exit")
    partner.kill()
    await exited
  }
  if (backend) {
    backend.closeAllConnections()
    await new Promise<void>((resolve) => backend.close(() => resolve()))
  }
})

for (const { locale, emailLabel, passwordLabel, signInLabel, message } of [
  {
    locale: "da-DK",
    emailLabel: "E-mail",
    passwordLabel: "Adgangskode",
    signInLabel: "Log ind",
    message: "Noget gik galt. Prøv igen om lidt.",
  },
  {
    locale: "en-GB",
    emailLabel: "Email",
    passwordLabel: "Password",
    signInLabel: "Sign in",
    message: "Something went wrong. Please try again shortly.",
  },
]) {
  test.describe(`backend failures with a ${locale} browser`, () => {
    test.use({ locale })
    for (const path of ["/auth/restaurant_staff/emailpass", "/partner/me"]) {
      for (const status of [0, 503]) {
        test(`shows a localized error for ${path} with ${status || "a dropped connection"}`, async ({
          page,
          context,
        }) => {
          failurePath = path
          failureStatus = status
          const errors: string[] = []
          page.on("pageerror", (error) => errors.push(error.message))
          await page.goto(`${origin}/sign-in`)
          await page.getByLabel(emailLabel).fill("staff@example.test")
          await page.getByLabel(passwordLabel).fill("test-password")
          await page.getByRole("button", { name: signInLabel }).click()
          await expect(
            page.getByRole("alert").filter({ hasText: message }),
          ).toBeVisible()
          await expect(page).toHaveURL(`${origin}/sign-in`)
          expect(await context.cookies()).not.toContainEqual(
            expect.objectContaining({ name: "mtogo_partner_token" }),
          )
          expect(errors).toEqual([])
        })
      }
    }
  })
}

test.describe("ended sessions on direct sign-in visits", () => {
  test.use({ locale: "en-GB" })
  for (const { status, code, message } of [
    {
      status: 401,
      code: "session_expired",
      message: "Your session has expired. Please sign in again.",
    },
    {
      status: 403,
      code: "staff_access_revoked",
      message:
        "Your access to the Restaurant has ended. Contact MTOGO if this is a mistake.",
    },
  ]) {
    test(`clears the cookie and explains ${code}`, async ({
      page,
      context,
    }) => {
      failurePath = "/partner/me"
      failureStatus = status
      await context.addCookies([
        { name: "mtogo_partner_token", value: "ended-token", url: origin },
      ])
      await page.goto(`${origin}/sign-in`)
      await expect(page).toHaveURL(`${origin}/sign-in?message=${code}`)
      await expect(page.getByRole("status")).toHaveText(message)
      expect(await context.cookies()).not.toContainEqual(
        expect.objectContaining({ name: "mtogo_partner_token" }),
      )
    })
  }
})
