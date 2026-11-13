import { expect, test } from "@playwright/test"

// Authentication traces can contain credentials; keep them disabled.
test.use({ trace: "off", screenshot: "off" })

for (const locale of ["da", "en"] as const) {
  test(`Customer can register and sign in using a keyboard (${locale})`, async ({
    page,
    request,
  }) => {
    expect(process.env.E2E_DISPOSABLE).toBe("1")
    const email = `customer-${locale}-${Date.now()}@example.test`
    const password = "ci-only-customer-password"
    const staffPassword = "ci-only-staff-password"
    const backend =
      process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
    // A same-email staff identity already exists before the visible registration.
    expect(
      (
        await request.post(
          `${backend}/auth/restaurant_staff/emailpass/register`,
          { data: { email, password: staffPassword } },
        )
      ).ok(),
    ).toBeTruthy()
    await page.goto("/dk/account")
    await page.getByRole("combobox").selectOption(locale)
    await page.getByTestId("register-button").focus()
    await page.keyboard.press("Enter")
    await expect(page.getByTestId("register-page")).toBeVisible()
    await expect(
      page.getByTestId("register-page").locator("input"),
    ).toHaveCount(2)
    await page.getByTestId("email-input").fill(email)
    await page.keyboard.press("Tab")
    await page.keyboard.type(password)
    await page.keyboard.press("Enter")
    await expect(page.getByTestId("logout-button").last()).toBeVisible()
    await page.getByTestId("logout-button").last().click()
    await expect(page.getByTestId("login-page")).toBeVisible()
    await page.getByRole("combobox").selectOption(locale)
    await page.getByTestId("email-input").fill(email)
    await page.getByTestId("password-input").fill(staffPassword)
    await page.getByTestId("password-input").press("Enter")
    await expect(page.getByTestId("login-page").getByRole("alert")).toHaveText(
      locale === "da"
        ? "E-mail eller adgangskode er forkert."
        : "The email or password is incorrect.",
    )
    await page.getByTestId("register-button").click()
    await page.getByTestId("email-input").fill(email)
    await page.getByTestId("password-input").fill(password)
    await page.getByTestId("password-input").press("Enter")
    await expect(
      page.getByTestId("register-page").getByRole("alert"),
    ).toContainText(locale === "da" ? "Der findes allerede" : "already exists")
    await page
      .getByTestId("register-page")
      .getByRole("button", {
        name: locale === "da" ? "Log ind" : "Sign in",
        exact: true,
      })
      .click()
    await page.getByTestId("email-input").fill(email)
    await page.getByTestId("password-input").fill(password)
    await page.getByTestId("password-input").press("Enter")
    await expect(page.getByTestId("logout-button").last()).toBeVisible()
    expect(
      (
        await request.post(`${backend}/auth/restaurant_staff/emailpass`, {
          data: { email, password: staffPassword },
        })
      ).ok(),
    ).toBeTruthy()
  })
}
