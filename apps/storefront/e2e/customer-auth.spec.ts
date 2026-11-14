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
      page.getByTestId("register-page").locator("input:visible"),
    ).toHaveCount(2)
    await page.getByTestId("email-input").fill(email)
    await page.keyboard.press("Tab")
    await page.keyboard.type(password)
    await page.keyboard.press("Enter")
    await expect(page.getByTestId("logout-button").last()).toBeVisible()
    await expect(page.getByTestId("account-language")).toHaveValue(locale)
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

for (const scenario of [
  {
    reason: "browser preference",
    browser: "en-GB",
    expected: "en",
    chosen: undefined,
  },
  {
    reason: "Danish fallback",
    browser: "fr-FR",
    expected: "da",
    chosen: undefined,
  },
  {
    reason: "remembered choice wins",
    browser: "en-GB",
    expected: "da",
    chosen: "da",
  },
]) {
  test(`signed-out language uses ${scenario.reason}`, async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({ locale: scenario.browser })
    try {
      if (scenario.chosen)
        await context.addCookies([
          { name: "_medusa_locale", value: scenario.chosen, url: baseURL! },
        ])
      const page = await context.newPage()
      await page.goto(`${baseURL}/dk/account`)
      await expect(page.getByRole("combobox")).toHaveValue(scenario.expected)
      const selected = scenario.expected === "en" ? "da" : "en"
      await page.getByRole("combobox").selectOption(selected)
      await expect(page.getByRole("combobox")).toBeEnabled()
      await expect(page.getByRole("combobox")).toHaveValue(selected)
      await expect
        .poll(
          async () =>
            (await context.cookies()).find(
              (cookie) => cookie.name === "_medusa_locale",
            )?.value,
        )
        .toBe(selected)
      await page.reload()
      await expect(page.getByRole("combobox")).toHaveValue(selected)
    } finally {
      await context.close()
    }
  })
}

test("registration and explicit account language follow the Customer across devices", async ({
  page,
  browser,
  baseURL,
}) => {
  expect(process.env.E2E_DISPOSABLE).toBe("1")
  const email = `language-${Date.now()}@example.test`
  const password = "ci-only-customer-password"
  await page.goto("/dk/account")
  await page.getByRole("combobox").selectOption("en")
  await page.getByTestId("register-button").click()
  await page.getByTestId("email-input").fill(email)
  await page.getByTestId("password-input").fill(password)
  await page.getByTestId("password-input").press("Enter")
  await expect(page.getByTestId("account-language")).toHaveValue("en")

  const device = await browser.newContext({ locale: "da-DK" })
  try {
    const second = await device.newPage()
    await second.goto(`${baseURL}/dk/account`)
    await expect(second.getByRole("combobox")).toHaveValue("da")
    await second.getByTestId("email-input").fill(email)
    await second.getByTestId("password-input").fill(password)
    await second.getByTestId("password-input").press("Enter")
    await expect(second.getByTestId("account-language")).toHaveValue("en")
    await second.getByTestId("account-language").focus()
    await second.keyboard.press("Home")
    await second.keyboard.press("Enter")
    await second.getByTestId("save-language").press("Enter")
    await expect(second.getByRole("status")).toHaveText("Dit sprog er gemt.")
    await second.reload()
    await expect(second.getByTestId("account-language")).toHaveValue("da")
  } finally {
    await device.close()
  }
  await page.getByTestId("logout-button").last().click()
  await page.getByRole("combobox").selectOption("en")
  await page.getByTestId("email-input").fill(email)
  await page.getByTestId("password-input").fill(password)
  await page.getByTestId("password-input").press("Enter")
  await expect(page.getByTestId("account-language")).toHaveValue("da")
})

test("account language failure keeps the selection and shows a translated retry message", async ({
  page,
  context,
  baseURL,
}) => {
  expect(process.env.E2E_DISPOSABLE).toBe("1")
  await page.goto("/dk/account")
  await page.getByRole("combobox").selectOption("en")
  await page.getByTestId("register-button").click()
  await page
    .getByTestId("email-input")
    .fill(`language-error-${Date.now()}@example.test`)
  await page.getByTestId("password-input").fill("ci-only-customer-password")
  await page.getByTestId("password-input").press("Enter")
  await expect(page.getByTestId("account-language")).toHaveValue("en")
  await context.addCookies([
    { name: "_medusa_jwt", value: "expired-session", url: baseURL! },
  ])
  await page.getByTestId("account-language").selectOption("da")
  await page.getByTestId("save-language").click()
  await expect(
    page.getByTestId("language-settings").getByRole("alert"),
  ).toHaveText("Your language could not be saved. Please try again.")
  await expect(page.getByTestId("account-language")).toHaveValue("da")
})
