import { randomUUID } from "node:crypto"
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test"

const backend = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL!

const collectErrors = (page: Page) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  return errors
}

/**
 * The operator's part, through the Admin API as Admin does it: invite a staff
 * member to the seeded Restaurant and copy the link. The operator browser
 * journey for invitations is in the storefront's e2e folder.
 */
async function inviteToSeededRestaurant(
  request: APIRequestContext,
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
  const list = await request.get(`${backend}/admin/restaurants`, {
    headers,
    params: { q: "Pizzeria Nørrebro" },
  })
  const restaurant = (await list.json()).restaurants.find(
    ({ contact_email }: { contact_email: string }) =>
      contact_email === "kontakt@pizzeria.example",
  )
  expect(restaurant).toBeDefined()
  // Adding a code the Restaurant already serves changes nothing.
  const area = await request.post(
    `${backend}/admin/restaurants/${restaurant.id}/delivery-area-postal-codes`,
    { headers, data: { postal_code: "2200" } },
  )
  expect(area.ok()).toBe(true)
  const invited = await request.post(
    `${backend}/admin/restaurants/${restaurant.id}/staff-invitations`,
    { headers, data: person },
  )
  expect(invited.ok()).toBe(true)
  return (await invited.json()).invitation.invite_link as string
}

test.describe("with a Danish browser", () => {
  test.use({ locale: "da-DK" })

  test("an invited staff member accepts, lands on the Overview, and the link stops working", async ({
    page,
    request,
  }, testInfo) => {
    expect(process.env.E2E_DISPOSABLE).toBe("1")
    const errors = collectErrors(page)
    const mette = {
      name: "Mette Jensen",
      email: `mette-${randomUUID()}@example.test`,
    }
    const link = await inviteToSeededRestaurant(request, mette)

    await page.goto(link)
    await expect(
      page.getByRole("heading", { name: "Accepter din invitation" }),
    ).toBeVisible()
    await expect(
      page.getByText(
        "MTOGO har inviteret dig til at drive Pizzeria Nørrebro.",
        { exact: false },
      ),
    ).toBeVisible()
    await expect(page.getByText(mette.name, { exact: true })).toBeVisible()
    await expect(page.getByText(mette.email, { exact: true })).toBeVisible()

    await page.getByLabel("Vælg adgangskode").fill("ci-only-invited-password")
    await page.getByRole("button", { name: "Accepter og log ind" }).click()

    await expect(page).toHaveURL(/\/overview$/)
    await expect(
      page.getByRole("heading", { level: 1, name: "Overblik" }),
    ).toBeVisible()
    await expect(
      page.getByRole("heading", { name: "Pizzeria Nørrebro" }),
    ).toBeVisible()
    await expect(page.getByText("Afventer aktivering af MTOGO")).toBeVisible()
    const details = page.getByRole("region", {
      name: "Restaurantens oplysninger",
    })
    await expect(details.getByText("Nørrebrogade 1")).toBeVisible()
    await expect(
      details.getByText("2200 København N", { exact: true }).first(),
    ).toBeVisible()
    await expect(details.getByText("+45 12 34 56 78")).toBeVisible()
    await expect(details.getByText("kontakt@pizzeria.example")).toBeVisible()
    await expect(
      details.getByRole("list", { name: "Leveringsområde" }),
    ).toContainText("2200 København N")
    // Read-only: staff cannot change their Restaurant's details.
    await expect(details.getByRole("textbox")).toHaveCount(0)
    await testInfo.attach("partner-overview-after-invitation", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    })

    await page.getByRole("button", { name: "Log ud" }).click()
    await page.goto(link)
    await expect(
      page.getByRole("status").filter({
        hasText: "Denne invitation er ikke længere gyldig. Bed MTOGO om en ny.",
      }),
    ).toBeVisible()
    await expect(page.getByLabel("Vælg adgangskode")).toHaveCount(0)

    // The new login works from the sign-in page as well.
    await page.goto("/sign-in")
    await page.getByLabel("E-mail").fill(mette.email)
    await page.getByLabel("Adgangskode").fill("ci-only-invited-password")
    await page.getByRole("button", { name: "Log ind" }).click()
    await expect(page).toHaveURL(/\/overview$/)
    expect(errors).toEqual([])
  })
})

test.describe("with an English browser", () => {
  test.use({ locale: "en-GB" })

  test("the invitation page and Overview are in English, and a short password is refused", async ({
    page,
    request,
  }) => {
    const errors = collectErrors(page)
    const jonas = {
      name: "Jonas Holm",
      email: `jonas-${randomUUID()}@example.test`,
    }
    await page.goto(await inviteToSeededRestaurant(request, jonas))
    await expect(
      page.getByRole("heading", { name: "Accept your invitation" }),
    ).toBeVisible()
    await expect(
      page.getByText("MTOGO has invited you to operate Pizzeria Nørrebro.", {
        exact: false,
      }),
    ).toBeVisible()

    await expect(page.getByText("At least 8 characters.")).toBeVisible()
    // The server checks the length too, not only the browser's minlength.
    const password = page.getByLabel("Choose a password")
    await password.evaluate((input) => input.removeAttribute("minlength"))
    await password.fill("short")
    await page.getByRole("button", { name: "Accept and sign in" }).click()
    await expect(
      page.getByRole("alert").filter({
        hasText: "The password must have at least 8 characters.",
      }),
    ).toBeVisible()

    await password.fill("ci-only-invited-password")
    await page.getByRole("button", { name: "Accept and sign in" }).click()
    await expect(page).toHaveURL(/\/overview$/)
    await expect(
      page.getByRole("heading", { level: 1, name: "Overview" }),
    ).toBeVisible()
    await expect(page.getByText("Awaiting activation by MTOGO")).toBeVisible()
    await expect(
      page.getByRole("region", { name: "Restaurant details" }),
    ).toContainText("Nørrebrogade 1")
    expect(errors).toEqual([])
  })

  test("an unknown invitation link shows the invalid message in English", async ({
    page,
  }) => {
    const errors = collectErrors(page)
    await page.goto("/invite?token=not-a-real-token")
    await expect(
      page.getByRole("status").filter({
        hasText: "This invitation is no longer valid. Ask MTOGO for a new one.",
      }),
    ).toBeVisible()
    await page.goto("/invite")
    await expect(
      page.getByRole("status").filter({
        hasText: "This invitation is no longer valid. Ask MTOGO for a new one.",
      }),
    ).toBeVisible()
    expect(errors).toEqual([])
  })
})
