import { expect, test } from "@playwright/test"
import type { APIRequestContext, Page } from "@playwright/test"

// Authentication traces can contain credentials; keep them disabled.
test.use({ trace: "off", screenshot: "off" })

type TestMailbox = {
  messages: Array<{ status: string; verification_url: string }>
}

async function readMailbox(request: APIRequestContext, email: string) {
  const backend =
    process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
  const response = await request.get(
    `${backend}/store/test-mailboxes?email=${encodeURIComponent(email)}`,
    {
      headers: {
        "x-publishable-api-key":
          process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY!,
        "x-test-mailbox-key": process.env.TEST_MAILBOX_KEY!,
      },
    },
  )

  return (await response.json()) as TestMailbox
}

async function verifyAndSignIn(
  page: Page,
  request: APIRequestContext,
  email: string,
  password: string,
) {
  await expect
    .poll(async () => (await readMailbox(request, email)).messages, {
      timeout: 10_000,
    })
    .toEqual([expect.objectContaining({ status: "success" })])
  const mailbox = await readMailbox(request, email)
  await page.goto(mailbox.messages[0].verification_url)
  await expect(page.getByTestId("verify-account-page")).toContainText(
    /Your email is verified|Din e-mail er bekræftet/,
  )
  await page.getByRole("link", { name: /Go to sign in|Gå til login/ }).click()
  await page.getByTestId("email-input").fill(email)
  await page.getByTestId("password-input").fill(password)
  await page.getByTestId("password-input").press("Enter")
}

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
    await expect(page.getByTestId("register-page")).toContainText(
      locale === "da" ? "Tjek din indbakke" : "Check your inbox",
    )
    await expect
      .poll(async () => (await readMailbox(request, email)).messages, {
        timeout: 10_000,
      })
      .toEqual([expect.objectContaining({ status: "success" })])
    const mailbox = await readMailbox(request, email)
    await page.goto(mailbox.messages[0].verification_url)
    await expect(page.getByTestId("verify-account-page")).toContainText(
      locale === "da" ? "Din e-mail er bekræftet" : "Your email is verified",
    )
    await page.goto(mailbox.messages[0].verification_url)
    await expect(page.getByTestId("verify-account-page")).toContainText(
      locale === "da" ? "ugyldigt eller udløbet" : "invalid or has expired",
    )
    await page
      .getByRole("link", {
        name: locale === "da" ? "Gå til login" : "Go to sign in",
      })
      .click()
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

    await page.goto("/dk/account/profile")
    const nameEditor = page.getByTestId("account-name-editor")
    await nameEditor.getByTestId("edit-button").press("Enter")
    await page.getByTestId("first-name-input").fill("   ")
    await page.getByTestId("last-name-input").fill("Jensen")
    await nameEditor.getByTestId("save-button").press("Enter")
    await expect(nameEditor.getByRole("alert")).toContainText(
      locale === "da" ? "Indtast" : "Enter",
    )
    await expect(page.getByTestId("first-name-input")).toHaveValue("   ")
    await page.getByTestId("first-name-input").fill("Maja")
    await page.getByTestId("last-name-input").fill("Jensen")
    await nameEditor.getByTestId("save-button").press("Enter")
    await expect(nameEditor.getByRole("status")).toContainText(
      locale === "da" ? "opdateret" : "updated",
    )

    const phoneEditor = page.getByTestId("account-phone-editor")
    await phoneEditor.getByTestId("edit-button").press("Enter")
    await expect(phoneEditor.getByRole("status")).toHaveCount(0)
    await phoneEditor.getByTestId("phone-input").fill("12345678")
    await phoneEditor.getByTestId("save-button").press("Enter")
    await expect(phoneEditor.getByRole("alert")).toContainText(
      locale === "da" ? "landekode" : "country code",
    )
    await expect(phoneEditor.getByTestId("phone-input")).toHaveValue("12345678")
    await phoneEditor.getByTestId("phone-input").fill("+45 12 34 56 78")
    await phoneEditor.getByTestId("save-button").press("Enter")
    await expect(phoneEditor.getByRole("status")).toContainText(
      locale === "da" ? "opdateret" : "updated",
    )
    await page.reload()
    await expect(
      page.getByTestId("account-name-editor").getByTestId("current-info"),
    ).toHaveText("Maja Jensen")
    await expect(
      page.getByTestId("account-phone-editor").getByTestId("current-info"),
    ).toHaveText("+45 12 34 56 78")

    await page.goto("/dk/account/addresses")
    const addresses = page.getByTestId("addresses-page-wrapper")
    await addresses.getByTestId("add-address-button").press("Enter")
    const addModal = page.getByTestId("add-address-modal")
    await addModal.getByTestId("first-name-input").fill("Maja")
    await addModal.getByTestId("last-name-input").fill("Jensen")
    await addModal.getByTestId("address-1-input").fill("!1")
    await addModal.getByTestId("postal-code-input").fill("2100")
    await addModal.getByTestId("city-input").fill("København")
    await addModal.getByTestId("country-select").selectOption("dk")
    await addModal.getByTestId("phone-input").fill("12345678")
    await addModal.getByTestId("save-button").press("Enter")
    await expect(addModal.getByTestId("address-error")).toContainText(
      locale === "da" ? "gade" : "street",
    )

    await addModal.getByTestId("first-name-input").fill("Maja")
    await addModal.getByTestId("last-name-input").fill("Jensen")
    await addModal.getByTestId("address-1-input").fill("Testvej 12")
    await addModal.getByTestId("postal-code-input").fill("2100")
    await addModal.getByTestId("city-input").fill("København")
    await addModal.getByTestId("country-select").selectOption("dk")
    await addModal.getByTestId("phone-input").fill("+45 12 34 56 78")
    await addModal.getByTestId("default-address-input").check()
    await addModal.getByTestId("save-button").press("Enter")
    await expect(addresses.getByTestId("address-container")).toHaveCount(1)

    await addresses.getByTestId("add-address-button").press("Enter")
    const secondAddModal = page.getByTestId("add-address-modal")
    await secondAddModal.getByTestId("first-name-input").fill("Maja")
    await secondAddModal.getByTestId("last-name-input").fill("Jensen")
    await secondAddModal.getByTestId("address-1-input").fill("Havnegade 4")
    await secondAddModal.getByTestId("postal-code-input").fill("8000")
    await secondAddModal.getByTestId("city-input").fill("Aarhus")
    await secondAddModal.getByTestId("country-select").selectOption("dk")
    await secondAddModal.getByTestId("phone-input").fill("+45 22 33 44 55")
    await secondAddModal.getByTestId("save-button").press("Enter")
    await expect(addresses.getByTestId("address-container")).toHaveCount(2)

    const firstAddress = addresses
      .getByTestId("address-container")
      .filter({ hasText: "Testvej 12" })
    await firstAddress.getByTestId("address-edit-button").click()
    const editModal = page.locator('[data-testid="edit-address-modal"]:visible')
    await editModal.getByTestId("city-input").fill("Odense")
    await editModal.getByTestId("save-button").press("Enter")
    await expect(firstAddress).toContainText("Odense")

    const secondAddress = addresses
      .getByTestId("address-container")
      .filter({ hasText: "Havnegade 4" })
    await secondAddress.getByTestId("address-default-button").press("Enter")
    await expect(secondAddress).toContainText(
      locale === "da" ? "Standardadresse" : "Default address",
    )
    await expect(firstAddress).not.toContainText(
      locale === "da" ? "Standardadresse" : "Default address",
    )
    await secondAddress.getByTestId("address-delete-button").press("Enter")
    await expect(addresses.getByTestId("address-container")).toHaveCount(1)
    await expect(firstAddress).not.toContainText(
      locale === "da" ? "Standardadresse" : "Default address",
    )
    await firstAddress.getByTestId("address-delete-button").press("Enter")
    await expect(addresses.getByTestId("address-container")).toHaveCount(0)
  })
}

test("verification delivery failure keeps checkout verification pending", async ({
  page,
  request,
}) => {
  expect(process.env.E2E_DISPOSABLE).toBe("1")
  const email = "delivery-failure@example.test"
  const password = "ci-only-customer-password"
  const backend =
    process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"

  await page.goto("/dk/account")
  await page.getByRole("combobox").selectOption("en")
  await page.getByTestId("register-button").click()
  await page.getByTestId("email-input").fill(email)
  await page.getByTestId("password-input").fill(password)
  await page.getByTestId("password-input").press("Enter")
  await expect(page.getByTestId("register-page")).toContainText(
    "could not deliver",
  )
  await expect
    .poll(
      async () =>
        (
          await request.get(
            `${backend}/store/test-mailboxes?email=${encodeURIComponent(email)}`,
            {
              headers: {
                "x-publishable-api-key":
                  process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY!,
                "x-test-mailbox-key": process.env.TEST_MAILBOX_KEY!,
              },
            },
          )
        ).json(),
      { timeout: 2_000 },
    )
    .toEqual({ messages: [] })

  await page
    .getByTestId("register-page")
    .getByRole("button", { name: "Sign in" })
    .click()
  await page.getByTestId("email-input").fill(email)
  await page.getByTestId("password-input").fill(password)
  await page.getByTestId("password-input").press("Enter")
  await expect(page.getByTestId("login-page")).toContainText(
    "could not deliver",
  )
})

test("preserves the basket through sign-in and clears it on explicit sign-out", async ({
  page,
  context,
  request,
}) => {
  expect(process.env.E2E_DISPOSABLE).toBe("1")
  const email = `basket-session-${Date.now()}@example.test`
  const password = "ci-only-customer-password"

  await page.goto("/dk/products/t-shirt")
  await page
    .getByRole("group", { name: "Select Size" })
    .getByText("S", { exact: true })
    .click()
  await page
    .getByRole("group", { name: "Select Color" })
    .getByText("Black", { exact: true })
    .click()
  await page.getByTestId("add-product-button").click()
  await page.getByTestId("nav-cart-link").click()
  const row = page.getByTestId("product-row")
  await expect(row.getByTestId("product-title")).toHaveText("Medusa T-Shirt")
  await page.getByTestId("checkout-button").click()
  await expect(page).toHaveURL(/\/dk\/account\?next=/)

  await page.getByRole("combobox").selectOption("en")
  await page.getByTestId("register-button").click()
  await page.getByTestId("email-input").fill(email)
  await page.getByTestId("password-input").fill(password)
  await page.getByTestId("password-input").press("Enter")
  await verifyAndSignIn(page, request, email, password)

  await expect(page).toHaveURL(/\/dk\/checkout/)
  await expect(
    page.getByTestId("product-row").getByTestId("product-title"),
  ).toHaveText("Medusa T-Shirt")
  await page.reload()
  await expect(
    page.getByTestId("product-row").getByTestId("product-title"),
  ).toHaveText("Medusa T-Shirt")

  await page.goto("/dk/account")
  await page.getByTestId("logout-button").last().click()
  await expect(page.getByTestId("login-page")).toBeVisible()
  await expect(
    (await context.cookies()).find(
      (cookie) => cookie.name === "_medusa_cart_id",
    ),
  ).toBeUndefined()

  await page.goto("/dk/cart")
  await expect(page.getByTestId("empty-cart-message")).toBeVisible()
})

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
  request,
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
  await verifyAndSignIn(page, request, email, password)
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
  request,
}) => {
  expect(process.env.E2E_DISPOSABLE).toBe("1")
  const email = `language-error-${Date.now()}@example.test`
  const password = "ci-only-customer-password"
  await page.goto("/dk/account")
  await page.getByRole("combobox").selectOption("en")
  await page.getByTestId("register-button").click()
  await page.getByTestId("email-input").fill(email)
  await page.getByTestId("password-input").fill(password)
  await page.getByTestId("password-input").press("Enter")
  await verifyAndSignIn(page, request, email, password)
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
