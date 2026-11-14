import { expect, test } from "@playwright/test"

test.use({ trace: "retain-on-failure" })

test("shopper can discover a product, update and remove cart items, and complete a manual-payment order", async ({
  page,
  request,
}, testInfo) => {
  expect(process.env.E2E_DISPOSABLE).toBe("1")
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))

  const shopperEmail = `shopper-${Date.now()}@example.test`
  const shopperPassword = "ci-only-customer-password"
  const backend =
    process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"
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
  await page.getByTestId("checkout-button").click()
  await expect(page).toHaveURL(/\/dk\/account\?next=/)
  await page.getByRole("combobox").selectOption("en")
  await page.getByTestId("register-button").click()
  await page.getByTestId("email-input").fill(shopperEmail)
  await page.getByTestId("password-input").fill(shopperPassword)
  await page.getByTestId("password-input").press("Enter")
  await expect(page.getByTestId("register-page")).toContainText(
    "Check your inbox",
  )
  const mailboxUrl = `${backend}/store/test-mailboxes?email=${encodeURIComponent(shopperEmail)}`
  const readMailbox = async () =>
    (
      await request.get(mailboxUrl, {
        headers: {
          "x-publishable-api-key":
            process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY!,
          "x-test-mailbox-key": process.env.TEST_MAILBOX_KEY!,
        },
      })
    ).json()
  await expect
    .poll(async () => (await readMailbox()).messages, { timeout: 10_000 })
    .toEqual([expect.objectContaining({ status: "success" })])
  const mailbox = await readMailbox()
  await page.goto(mailbox.messages[0].verification_url)
  await expect(page.getByTestId("verify-account-page")).toContainText(
    "Your email is verified",
  )
  await page.getByRole("link", { name: "Go to sign in" }).click()
  await page.getByTestId("email-input").fill(shopperEmail)
  await page.getByTestId("password-input").fill(shopperPassword)
  await page.getByTestId("password-input").press("Enter")
  await expect(page).toHaveURL(/\/dk\/checkout/)
  await expect(page.getByTestId("product-title")).toHaveText("Medusa T-Shirt")
  await page.goto("/dk/cart")
  await page
    .getByTestId("product-row")
    .getByRole("button", { name: "Remove item" })
    .click()

  await page.goto("/dk/store")
  await page
    .getByRole("link", { name: /Medusa T-Shirt/ })
    .first()
    .click()
  await expect(
    page.getByRole("heading", { name: "Medusa T-Shirt", exact: true }),
  ).toBeVisible()
  await page
    .getByRole("group", { name: "Select Size" })
    .getByText("S", { exact: true })
    .click()
  await page
    .getByRole("group", { name: "Select Color" })
    .getByText("Black", { exact: true })
    .click()
  await expect(page.getByTestId("add-product-button")).toBeEnabled()
  await page.getByTestId("add-product-button").click()
  await expect(page.getByTestId("nav-cart-link")).toHaveText("Cart (1)")
  await page.getByTestId("nav-cart-link").click()
  const row = page.getByTestId("product-row")
  await expect(row.getByTestId("product-title")).toHaveText("Medusa T-Shirt")
  await row.getByTestId("product-select-button").selectOption("2")
  await expect(page.getByTestId("cart-total").last()).toHaveText("€20.00")
  await page.reload()
  await expect(row.getByTestId("product-select-button")).toHaveValue("2")
  await row.getByRole("button", { name: "Remove item" }).click()
  await expect(page.getByTestId("empty-cart-message")).toBeVisible()

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
  await expect(page.getByTestId("nav-cart-link")).toHaveText("Cart (1)")
  await page.getByTestId("nav-cart-link").click()
  await page.getByTestId("checkout-button").click()
  await expect(page).toHaveURL(/\/dk\/checkout/)
  await expect(page.getByTestId("product-title")).toHaveText("Medusa T-Shirt")
  await expect(page.getByTestId("cart-total")).toHaveText("€10.00")
  await testInfo.attach("checkout-summary", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  })

  await page.getByTestId("shipping-first-name-input").fill("Browser")
  await page.getByTestId("shipping-last-name-input").fill("Smoke")
  await page.getByTestId("shipping-address-input").fill("Testvej 1")
  await page.getByTestId("shipping-postal-code-input").fill("2100")
  await page.getByTestId("shipping-city-input").fill("Copenhagen")
  await page.getByTestId("shipping-country-select").selectOption("dk")
  await page.getByTestId("shipping-email-input").fill(shopperEmail)
  await page.getByTestId("shipping-phone-input").fill("12345678")
  await page.getByTestId("submit-address-button").click()
  await page.getByTestId("delivery-option-radio").first().click()
  await page.getByTestId("submit-delivery-option-button").click()
  await page.getByRole("radio", { name: /Manual Payment/ }).click()
  await page.getByTestId("submit-payment-button").click()
  await expect(page.getByTestId("cart-total")).toHaveText("€20.00")
  await page.getByTestId("submit-order-button").click()
  await expect(page.getByTestId("order-complete-container")).toBeVisible()
  await expect(page.getByTestId("order-email")).toContainText(shopperEmail)
  await expect(page.getByTestId("order-id")).not.toBeEmpty()
  await expect(page.getByTestId("cart-total")).toHaveText("€20.00")
  await expect(page.getByTestId("payment-method")).toContainText(
    "Manual Payment",
  )
  expect(errors).toEqual([])
  await testInfo.attach("manual-order-confirmation", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  })
})
