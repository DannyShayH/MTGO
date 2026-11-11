import { randomUUID } from "node:crypto"
import { expect, test } from "@playwright/test"

test("operator registers, finds and edits a Restaurant and sees a nonblocking address warning", async ({
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
  await page.getByRole("link", { name: "Restaurants", exact: true }).click()
  const runId = randomUUID()
  const name = `Operator journey kitchen ${runId}`
  const street = `Journey street ${runId}`
  await page.getByRole("button", { name: "Create", exact: true }).click()
  await page.getByLabel("Name", { exact: true }).fill(name)
  await page.getByLabel("Pickup street").fill(street)
  await page.getByLabel("Pickup postal code").fill("2200")
  await page.getByLabel("Pickup city").fill("København N")
  await page.getByLabel("Contact phone").fill("+45 12 34 56 78")
  await page.getByLabel("Contact email").fill("journey@pizzeria.example")
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible()
  await expect(page.getByText("Inactive · Closed")).toBeVisible()
  await page.reload()
  await expect(
    page.getByText("journey@pizzeria.example", { exact: true }),
  ).toBeVisible()
  await page.getByRole("button", { name: "Edit", exact: true }).click()
  await page.getByLabel("Contact phone").fill("+45 87 65 43 21")
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect(page.getByText("+45 87 65 43 21", { exact: true })).toBeVisible()
  await page.getByRole("link", { name: "Back to Restaurants" }).click()
  const search = page.getByPlaceholder("Search by name or postal code")
  await search.fill(name)
  await expect(page.getByRole("row").filter({ hasText: name })).toContainText(
    "Inactive",
  )
  await search.fill("2200")
  await expect(page.getByRole("row").filter({ hasText: name })).toContainText(
    "Closed",
  )
  await page.getByRole("button", { name: "Create", exact: true }).click()
  await page.getByLabel("Name", { exact: true }).fill("Separate kitchen")
  await page.getByLabel("Pickup street").fill(street)
  await page.getByLabel("Pickup postal code").fill("2200")
  await page.getByLabel("Pickup city").fill("København N")
  await page.getByLabel("Contact phone").fill("+45 12 34 56 78")
  await page.getByLabel("Contact email").fill("separate@pizzeria.example")
  await expect(
    page.getByText(/Another Restaurant has this pickup address/),
  ).toBeVisible()
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "Separate kitchen", exact: true }),
  ).toBeVisible()
  expect(errors).toEqual([])
  await testInfo.attach("restaurant-registration", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  })
})
