import { expect, test } from "@playwright/test"

test("administrator can load, edit and reload a seeded product", async ({
  page,
}, testInfo) => {
  expect(process.env.E2E_DISPOSABLE).toBe("1")
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  const backend = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL!

  await page.goto(`${backend}/app/login`)
  await page
    .getByPlaceholder("Email", { exact: true })
    .fill(process.env.E2E_ADMIN_EMAIL!)
  await page
    .getByPlaceholder("Password", { exact: true })
    .fill(process.env.E2E_ADMIN_PASSWORD!)
  await page.getByRole("button", { name: "Continue with email" }).click()
  await expect(page).not.toHaveURL(/\/login/)

  await page.getByRole("link", { name: "Products", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "Products", exact: true }),
  ).toBeVisible()
  await page.getByRole("row").filter({ hasText: "Medusa Sweatshirt" }).click()
  await expect(
    page.getByRole("heading", { name: "Medusa Sweatshirt", exact: true }),
  ).toBeVisible()

  const productUrl = page.url()
  const subtitle = `Browser smoke verified ${Date.now()}`
  await page.goto(`${productUrl}/edit`)
  await page.getByLabel("Subtitle", { exact: false }).fill(subtitle)
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect(page).toHaveURL(productUrl)
  await page.reload()
  await expect(page.getByText(subtitle, { exact: true })).toBeVisible()
  expect(errors).toEqual([])
  await testInfo.attach("admin-product", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  })
})
