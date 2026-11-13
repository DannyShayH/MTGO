import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { resolve } from "node:path"
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test"

const backend = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL!
const password = "ci-only-opening-password"

const collectErrors = (page: Page) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  return errors
}

async function adminHeaders(request: APIRequestContext) {
  const login = await request.post(`${backend}/auth/user/emailpass`, {
    data: {
      email: process.env.E2E_ADMIN_EMAIL,
      password: process.env.E2E_ADMIN_PASSWORD,
    },
  })
  expect(login.ok()).toBe(true)
  return { authorization: `Bearer ${(await login.json()).token}` }
}

/**
 * A Restaurant of its own with every activation requirement but staff and the
 * menu, set up through the Admin API; the operator journey for setting one up
 * is in the storefront's e2e folder.
 */
async function setUpRestaurant(
  request: APIRequestContext,
  headers: { authorization: string },
  name: string,
  person: { name: string; email: string },
) {
  const created = await request.post(`${backend}/admin/restaurants`, {
    headers,
    data: {
      name,
      address_street: `Opening street ${randomUUID()}`,
      address_postal_code: "2200",
      address_city: "København N",
      contact_phone: "+45 12 34 56 78",
      contact_email: "kontakt@opening.example",
    },
  })
  expect(created.ok()).toBe(true)
  const { restaurant } = await created.json()
  const path = `${backend}/admin/restaurants/${restaurant.id}`
  for (const [at, data] of [
    ["delivery-area-postal-codes", { postal_code: "2200" }],
    ["commercial-terms", { terms_version: "common_mvp_v1" }],
  ] as const)
    expect((await request.post(`${path}/${at}`, { headers, data })).ok()).toBe(
      true,
    )
  const invited = await request.post(`${path}/staff-invitations`, {
    headers,
    data: person,
  })
  expect(invited.ok()).toBe(true)
  return {
    path,
    restaurantId: restaurant.id as string,
    link: (await invited.json()).invitation.invite_link as string,
  }
}

/** The menu seed stands in for menu editing until Feature #44. */
function seedMenu(restaurantId: string) {
  execFileSync(
    "npm",
    [
      "exec",
      "--no",
      "--",
      "medusa",
      "exec",
      "./src/scripts/seed-demo-menu.ts",
      restaurantId,
    ],
    { cwd: resolve(process.cwd(), "../backend"), stdio: "inherit" },
  )
}

async function signInToAdmin(page: Page) {
  await page.goto(`${backend}/app/login`)
  await page
    .getByPlaceholder("Email", { exact: true })
    .fill(process.env.E2E_ADMIN_EMAIL!)
  await page
    .getByPlaceholder("Password", { exact: true })
    .fill(process.env.E2E_ADMIN_PASSWORD!)
  await page.getByRole("button", { name: "Continue with email" }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

test.describe("with a Danish browser", () => {
  test.use({ locale: "da-DK" })

  test("staff open and close their active Restaurant, Admin shows the same status, and a stale switch shows the refusal and the real state", async ({
    page,
    context,
    request,
  }, testInfo) => {
    expect(process.env.E2E_DISPOSABLE).toBe("1")
    const errors = collectErrors(page)
    const headers = await adminHeaders(request)
    const restaurantName = `Opening kitchen ${randomUUID().slice(0, 8)}`
    const { path, restaurantId, link } = await setUpRestaurant(
      request,
      headers,
      restaurantName,
      { name: "Mette Jensen", email: `mette-${randomUUID()}@example.test` },
    )
    await page.goto(link)
    await page.getByLabel("Vælg adgangskode").fill(password)
    await page.getByRole("button", { name: "Accepter og log ind" }).click()
    await expect(page).toHaveURL(/\/overview$/)

    const status = page.getByRole("region", { name: restaurantName })
    const openSwitch = status.getByRole("switch", {
      name: "Restauranten er åben",
    })
    // Inactive: the switch is disabled with its reason.
    await expect(openSwitch).toBeDisabled()
    await expect(openSwitch).toHaveAccessibleDescription(
      "Du kan åbne restauranten, når MTOGO har aktiveret den.",
    )
    await expect(
      status.getByText(
        "Modtager ikke nye bestillinger, fordi restauranten ikke er aktiv",
      ),
    ).toBeVisible()

    seedMenu(restaurantId)
    expect(
      (await request.post(`${path}/activate`, { headers, data: {} })).ok(),
    ).toBe(true)
    await page.reload()
    await expect(openSwitch).toBeEnabled()
    await expect(openSwitch).not.toBeChecked()
    await expect(
      status.getByText(
        "Modtager ikke nye bestillinger, fordi restauranten er lukket",
      ),
    ).toBeVisible()

    await openSwitch.click()
    await expect(openSwitch).toBeChecked()
    await expect(status.getByText("Åben", { exact: true })).toBeVisible()
    await expect(
      status.getByText("Modtager nye bestillinger", { exact: true }),
    ).toBeVisible()
    await testInfo.attach("partner-restaurant-open", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    })

    const admin = await context.newPage()
    const adminErrors = collectErrors(admin)
    await signInToAdmin(admin)
    await admin.goto(`${backend}/app/restaurants/${restaurantId}`)
    await expect(admin.getByText("Active · Open")).toBeVisible()
    await expect(admin.getByText("Receiving new Orders: Yes")).toBeVisible()

    await openSwitch.click()
    await expect(openSwitch).not.toBeChecked()
    await expect(status.getByText("Lukket", { exact: true })).toBeVisible()
    await expect(
      status.getByText(
        "Modtager ikke nye bestillinger, fordi restauranten er lukket",
      ),
    ).toBeVisible()
    await admin.reload()
    await expect(admin.getByText("Active · Closed")).toBeVisible()
    await expect(
      admin.getByText("Receiving new Orders: No — Restaurant is closed"),
    ).toBeVisible()
    // History names the staff member for both changes.
    const history = admin.getByRole("list", { name: "Restaurant history" })
    await expect(history.getByRole("listitem")).toContainText([
      "Closed by Mette Jensen",
      "Opened by Mette Jensen",
      "Activated by",
    ])
    await testInfo.attach("admin-restaurant-after-closing", {
      body: await admin.screenshot({ fullPage: true }),
      contentType: "image/png",
    })

    // An operator deactivates while the partner page is still showing Closed.
    expect(
      (
        await request.post(`${path}/deactivate`, {
          headers,
          data: { reason: "Hygiene inspection" },
        })
      ).ok(),
    ).toBe(true)
    await openSwitch.click()
    await expect(
      page.getByRole("alert").filter({
        hasText: "Restauranten kan ikke åbnes, før MTOGO har aktiveret den.",
      }),
    ).toBeVisible()
    await expect(openSwitch).not.toBeChecked()
    await expect(openSwitch).toBeDisabled()
    await expect(
      status.getByText(
        "Modtager ikke nye bestillinger, fordi restauranten ikke er aktiv",
      ),
    ).toBeVisible()

    await page.getByRole("button", { name: "English" }).click()
    await expect(
      status.getByRole("switch", { name: "Restaurant is open" }),
    ).toBeDisabled()
    await expect(
      status.getByText(
        "Not receiving new Orders, because the Restaurant is not active",
      ),
    ).toBeVisible()
    await testInfo.attach("partner-restaurant-deactivated", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    })
    await admin.close()
    expect(errors).toEqual([])
    expect(adminErrors).toEqual([])
  })
})
