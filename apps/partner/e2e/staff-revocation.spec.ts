import { randomUUID } from "node:crypto"
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test"

const backend = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL!
const password = "ci-only-revoked-password"

const collectErrors = (page: Page) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  return errors
}

/**
 * A Restaurant of its own, so the invited person is its only authorized staff
 * member and Admin shows the last-staff warning. Created through the Admin API;
 * the operator journey for creating one is in the storefront's e2e folder.
 */
async function inviteToNewRestaurant(
  request: APIRequestContext,
  restaurantName: string,
  person: { name: string; email: string },
) {
  const login = await request.post(`${backend}/auth/user/emailpass`, {
    data: {
      email: process.env.E2E_ADMIN_EMAIL,
      password: process.env.E2E_ADMIN_PASSWORD,
    },
  })
  expect(login.ok()).toBe(true)
  const headers = { authorization: `Bearer ${(await login.json()).token}` }
  const created = await request.post(`${backend}/admin/restaurants`, {
    headers,
    data: {
      name: restaurantName,
      address_street: `Revocation street ${randomUUID()}`,
      address_postal_code: "2200",
      address_city: "København N",
      contact_phone: "+45 12 34 56 78",
      contact_email: "kontakt@revocation.example",
    },
  })
  expect(created.ok()).toBe(true)
  const { restaurant } = await created.json()
  const invited = await request.post(
    `${backend}/admin/restaurants/${restaurant.id}/staff-invitations`,
    { headers, data: person },
  )
  expect(invited.ok()).toBe(true)
  return {
    restaurantId: restaurant.id as string,
    link: (await invited.json()).invitation.invite_link as string,
  }
}

async function revokeInAdmin(page: Page, restaurantId: string, name: string) {
  await page.goto(`${backend}/app/login`)
  await page
    .getByPlaceholder("Email", { exact: true })
    .fill(process.env.E2E_ADMIN_EMAIL!)
  await page
    .getByPlaceholder("Password", { exact: true })
    .fill(process.env.E2E_ADMIN_PASSWORD!)
  await page.getByRole("button", { name: "Continue with email" }).click()
  await expect(page).not.toHaveURL(/\/login/)
  await page.goto(`${backend}/app/restaurants/${restaurantId}`)
  await page.getByRole("button", { name: `Revoke access for ${name}` }).click()
  const prompt = page.getByRole("alertdialog")
  await expect(prompt).toContainText(
    "This is the last authorized staff member.",
  )
  await expect(prompt).toContainText("Consider deactivating the Restaurant")
  await prompt.getByRole("button", { name: "Revoke access" }).click()
  const former = page.getByRole("list", { name: "Former staff" })
  await expect(former).toContainText(name)
  await expect(former).toContainText(`by ${process.env.E2E_ADMIN_EMAIL}`, {
    ignoreCase: true,
  })
  await expect(page.getByText("No authorized staff yet.")).toBeVisible()
}

test.describe("with a Danish browser", () => {
  test.use({ locale: "da-DK" })

  test("revoked staff are signed out on their next action and told their access ended, also when signing in again", async ({
    page,
    context,
    request,
  }, testInfo) => {
    expect(process.env.E2E_DISPOSABLE).toBe("1")
    const errors = collectErrors(page)
    const restaurantName = `Revocation kitchen ${randomUUID().slice(0, 8)}`
    const mette = {
      name: "Mette Jensen",
      email: `mette-${randomUUID()}@example.test`,
    }
    const { restaurantId, link } = await inviteToNewRestaurant(
      request,
      restaurantName,
      mette,
    )
    await page.goto(link)
    await page.getByLabel("Vælg adgangskode").fill(password)
    await page.getByRole("button", { name: "Accepter og log ind" }).click()
    await expect(page).toHaveURL(/\/overview$/)

    const admin = await context.newPage()
    const adminErrors = collectErrors(admin)
    await revokeInAdmin(admin, restaurantId, mette.name)
    await testInfo.attach("admin-former-staff-after-revocation", {
      body: await admin.screenshot({ fullPage: true }),
      contentType: "image/png",
    })
    await admin.close()

    const ended = `Din adgang til ${restaurantName} er ophørt. Kontakt MTOGO, hvis det er en fejl.`
    // The token has not expired; the next request still ends the session.
    // A reload always asks the backend again, unlike a soft navigation to the
    // page that is already open.
    await page.reload()
    await expect(page).toHaveURL(/\/sign-in\?message=staff_access_revoked$/)
    await expect(page.getByRole("status")).toHaveText(ended)
    expect(await context.cookies()).not.toContainEqual(
      expect.objectContaining({ name: "mtogo_partner_token" }),
    )

    await page.getByLabel("E-mail").fill(mette.email)
    await page.getByLabel("Adgangskode").fill(password)
    await page.getByRole("button", { name: "Log ind" }).click()
    // Next.js adds its own empty role="alert" route announcer, so filter by text.
    await expect(
      page.getByRole("alert").filter({ hasText: ended }),
    ).toBeVisible()
    await expect(page).not.toHaveURL(/\/overview/)

    await page.getByRole("button", { name: "English" }).click()
    await page.getByLabel("Email").fill(mette.email)
    await page.getByLabel("Password").fill(password)
    await page.getByRole("button", { name: "Sign in" }).click()
    await expect(
      page.getByRole("alert").filter({
        hasText: `Your access to ${restaurantName} has ended. Contact MTOGO if this is a mistake.`,
      }),
    ).toBeVisible()
    await testInfo.attach("partner-access-ended", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    })
    expect(errors).toEqual([])
    expect(adminErrors).toEqual([])
  })
})
