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

test("operator sets the delivery area and commercial terms and sees the readiness checklist update", async ({
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
  const name = `Setup journey kitchen ${randomUUID()}`
  await page.getByRole("button", { name: "Create", exact: true }).click()
  await page.getByLabel("Name", { exact: true }).fill(name)
  await page.getByLabel("Pickup street").fill(`Setup street ${randomUUID()}`)
  await page.getByLabel("Pickup postal code").fill("2200")
  await page.getByLabel("Pickup city").fill("København N")
  await page.getByLabel("Contact phone").fill("+45 12 34 56 78")
  await page.getByLabel("Contact email").fill("setup@pizzeria.example")
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible()

  const checklist = page.getByRole("list", { name: "Activation requirements" })
  const requirement = (label: string) =>
    checklist.getByRole("listitem").filter({ hasText: label })
  await expect(requirement("Delivery area")).toContainText("Missing")
  await expect(requirement("Commercial terms")).toContainText("Missing")

  const search = page.getByLabel("Find a town or postal code")
  const results = page.getByRole("list", { name: "Matching towns" })
  const area = page.getByRole("list", { name: "Delivery area towns" })
  await search.fill("København K")
  await expect(results.getByRole("listitem")).toHaveCount(1)
  await expect(results).toContainText("213 postal codes, 1050–1473")
  await results.getByRole("button", { name: "Add København K" }).click()
  await expect(area).toContainText("København K")
  await expect(results).toContainText("Added")
  await search.fill("2100")
  await results.getByRole("button", { name: "Add København Ø" }).click()
  await expect(page.getByText("214 postal codes in 2 towns.")).toBeVisible()
  await search.fill("Atlantis")
  await expect(
    page.getByText(/No Danish town or postal code matches/),
  ).toBeVisible()
  await expect(requirement("Delivery area")).toContainText("Met")

  await page.getByRole("button", { name: "Record agreement" }).click()
  await expect(
    page.getByText(/Agreed to Common MVP terms v1 on/),
  ).toContainText(`recorded by ${process.env.E2E_ADMIN_EMAIL}`)
  await expect(page.getByText(/Monthly service fee: DKK 100 per/)).toBeVisible()
  await expect(requirement("Commercial terms")).toContainText("Met")
  await expect(requirement("Authorized staff")).toContainText("Missing")
  await expect(requirement("Published menu")).toContainText("Missing")
  await expect(page.getByText("Menu: 0 published dishes")).toBeVisible()

  await page.reload()
  await expect(requirement("Delivery area")).toContainText("Met")
  await area.getByRole("button", { name: "Show codes" }).click()
  await area.getByRole("button", { name: "Remove 1050", exact: true }).click()
  await expect(page.getByText("213 postal codes in 2 towns.")).toBeVisible()
  await area.getByRole("button", { name: "Remove København K" }).click()
  await expect(page.getByText("1 postal code in 1 town.")).toBeVisible()
  await expect(area).toContainText("København Ø")
  expect(errors).toEqual([])
  await testInfo.attach("restaurant-setup", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  })
})

test("operator invites Restaurant staff, copies the link, resends, cancels and is refused an email with a login", async ({
  page,
  context,
}, testInfo) => {
  expect(process.env.E2E_DISPOSABLE).toBe("1")
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  const backend = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL!
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: backend,
  })
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
  const name = `Staff journey kitchen ${runId}`
  await page.getByRole("button", { name: "Create", exact: true }).click()
  await page.getByLabel("Name", { exact: true }).fill(name)
  await page.getByLabel("Pickup street").fill(`Staff street ${runId}`)
  await page.getByLabel("Pickup postal code").fill("2200")
  await page.getByLabel("Pickup city").fill("København N")
  await page.getByLabel("Contact phone").fill("+45 12 34 56 78")
  await page.getByLabel("Contact email").fill("staff@pizzeria.example")
  await page.getByRole("button", { name: "Save", exact: true }).click()
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible()

  const pending = page.getByRole("list", { name: "Pending invitations" })
  const invite = async (person: string, email: string) => {
    await page.getByRole("button", { name: "Invite", exact: true }).click()
    await page.getByLabel("Staff name").fill(person)
    await page.getByLabel("Staff email").fill(email)
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Invite", exact: true })
      .click()
  }
  await expect(page.getByText("No pending invitations.")).toBeVisible()
  await invite("Mette Jensen", `mette-${runId}@example.test`)
  const mette = pending
    .getByRole("listitem")
    .filter({ hasText: "Mette Jensen" })
  await expect(mette).toContainText("Pending")
  await expect(mette).toContainText("Expires")

  const copy = async () => {
    await page
      .getByRole("button", { name: "Copy invite link for Mette Jensen" })
      .click()
    await expect(page.getByText("Invite link copied").last()).toBeVisible()
    return page.evaluate(() => navigator.clipboard.readText())
  }
  const firstLink = await copy()
  // The harness sets PARTNER_PUBLIC_URL for the backend it starts.
  const partnerUrl = process.env.PARTNER_PUBLIC_URL || "http://localhost:8100"
  expect(firstLink.startsWith(`${partnerUrl}/invite?token=`)).toBe(true)

  // The HTTP suite checks that the expiry moves; here the link must change.
  await page
    .getByRole("button", { name: "Resend invitation for Mette Jensen" })
    .click()
  await expect(page.getByText(/New invite link created/).last()).toBeVisible()
  const secondLink = await copy()
  expect(secondLink).not.toBe(firstLink)

  await invite("Jonas Holm", `jonas-${runId}@example.test`)
  await page
    .getByRole("button", { name: "Cancel invitation for Jonas Holm" })
    .click()
  await page
    .getByRole("button", { name: "Cancel invitation", exact: true })
    .click()
  await expect(pending).not.toContainText("Jonas Holm")
  await expect(pending).toContainText("Mette Jensen")

  await invite("Operator Again", process.env.E2E_ADMIN_EMAIL!)
  await expect(
    page.getByRole("dialog").getByText(/already has an MTOGO login/),
  ).toBeVisible()
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click()
  await expect(pending).not.toContainText("Operator Again")
  await expect(page.getByText("No authorized staff yet.")).toBeVisible()
  await expect(page.getByText("No former staff.")).toBeVisible()
  await page.reload()
  await expect(mette).toContainText("Pending")
  expect(errors).toEqual([])
  await testInfo.attach("restaurant-staff", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  })
})
