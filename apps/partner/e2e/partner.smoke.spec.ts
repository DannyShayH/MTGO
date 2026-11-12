import { expect, test, type Page } from "@playwright/test"

const email = process.env.SEED_STAFF_EMAIL!
const password = process.env.SEED_STAFF_PASSWORD!

const collectErrors = (page: Page) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  return errors
}

test.describe("with a Danish browser", () => {
  test.use({ locale: "da-DK" })

  test("staff sign in, switch to English, and sign out without touching a Customer session", async ({
    page,
    context,
  }, testInfo) => {
    expect(process.env.E2E_DISPOSABLE).toBe("1")
    const errors = collectErrors(page)
    // A Customer signed in to the storefront in the same browser. Cookies on
    // localhost are shared across ports, so this is the cookie that must survive.
    await context.addCookies([
      {
        name: "_medusa_jwt",
        value: "customer-session",
        url: process.env.NEXT_PUBLIC_BASE_URL!,
      },
    ])

    await page.goto("/")
    await expect(page).toHaveURL(/\/sign-in$/)
    await expect(
      page.getByRole("heading", { name: "Log ind", exact: true }),
    ).toBeVisible()

    await page.getByLabel("E-mail").fill(email)
    await page.getByLabel("Adgangskode").fill("not-the-password")
    await page.getByRole("button", { name: "Log ind" }).click()
    // Next.js renders an empty route announcer with role="alert" as well.
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "E-mail eller adgangskode er forkert." }),
    ).toBeVisible()
    await expect(page.getByLabel("E-mail")).toHaveValue(email)

    await page.getByLabel("Adgangskode").fill(password)
    await page.getByRole("button", { name: "Log ind" }).click()
    await expect(page).toHaveURL(/\/overview$/)
    await expect(
      page.getByRole("heading", { level: 1, name: "Overblik" }),
    ).toBeVisible()
    await expect(
      page.getByRole("heading", { name: "Pizzeria Nørrebro" }),
    ).toBeVisible()
    const navigation = page.getByRole("navigation", { name: "Hovedmenu" })
    await expect(navigation.getByRole("link")).toHaveText(["Overblik"])

    const token = (await context.cookies()).find(
      (cookie) => cookie.name === "mtogo_partner_token",
    )
    expect(token?.httpOnly).toBe(true)
    // The backend is called only from the partner app's server, so the
    // browser never gets Medusa's own session cookie.
    expect(
      await context.cookies(process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL!),
    ).not.toContainEqual(expect.objectContaining({ name: "connect.sid" }))

    await page.getByRole("button", { name: "English" }).click()
    await expect(
      page.getByRole("heading", { level: 1, name: "Overview" }),
    ).toBeVisible()
    await page.reload()
    await expect(
      page.getByRole("heading", { level: 1, name: "Overview" }),
    ).toBeVisible()
    await expect(page.locator("html")).toHaveAttribute("lang", "en")
    await testInfo.attach("partner-overview", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    })

    await page.getByRole("button", { name: "Sign out" }).click()
    await expect(page).toHaveURL(/\/sign-in\?message=signed_out$/)
    await expect(page.getByRole("status")).toHaveText("You are signed out.")
    await page.goto("/overview")
    await expect(page).toHaveURL(/\/sign-in$/)

    const cookies = await context.cookies()
    expect(cookies.map((cookie) => cookie.name)).not.toContain(
      "mtogo_partner_token",
    )
    expect(cookies).toContainEqual(
      expect.objectContaining({
        name: "_medusa_jwt",
        value: "customer-session",
      }),
    )
    expect(errors).toEqual([])
  })
})

for (const { locale, heading } of [
  { locale: "en-GB", heading: "Sign in" },
  { locale: "fr-FR", heading: "Log ind" },
]) {
  test.describe(`with a ${locale} browser`, () => {
    test.use({ locale })

    test(`shows the sign-in page as "${heading}" on the first visit`, async ({
      page,
    }) => {
      const errors = collectErrors(page)
      await page.goto("/sign-in")
      await expect(
        page.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible()
      expect(errors).toEqual([])
    })
  })
}

test.describe("with an English browser", () => {
  test.use({ locale: "en-GB" })

  test("an ended session clears the token and says so, and a wrong password fails in English", async ({
    page,
    context,
  }) => {
    const errors = collectErrors(page)
    // A token the backend no longer accepts, as after it expired.
    await context.addCookies([
      {
        name: "mtogo_partner_token",
        value: "expired-token",
        url: process.env.PARTNER_BASE_URL || "http://localhost:8100",
      },
    ])
    await page.goto("/overview")
    await expect(page).toHaveURL(/\/sign-in\?message=session_expired$/)
    await expect(page.getByRole("status")).toHaveText(
      "Your session has expired. Please sign in again.",
    )
    expect(
      (await context.cookies()).map((cookie) => cookie.name),
    ).not.toContain("mtogo_partner_token")

    await page.getByLabel("Email").fill(email)
    await page.getByLabel("Password").fill("not-the-password")
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "The email or password is incorrect." }),
    ).toBeVisible()
    expect(errors).toEqual([])
  })
})
