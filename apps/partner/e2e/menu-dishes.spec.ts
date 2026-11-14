import { randomUUID } from "node:crypto"
import { expect, test } from "@playwright/test"

const backend = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL!
const customerBase = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:8000"
const password = "ci-only-dish-password"

for (const locale of ["da", "en"] as const) {
  test(`staff publish their first dish and Customers read it (${locale})`, async ({
    page,
    context,
    request,
    baseURL,
  }, testInfo) => {
    expect(process.env.E2E_DISPOSABLE).toBe("1")
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    const login = await request.post(`${backend}/auth/user/emailpass`, {
      data: {
        email: process.env.E2E_ADMIN_EMAIL,
        password: process.env.E2E_ADMIN_PASSWORD,
      },
    })
    expect(login.ok()).toBe(true)
    const admin = { authorization: `Bearer ${(await login.json()).token}` }
    const created = await request.post(`${backend}/admin/restaurants`, {
      headers: admin,
      data: {
        name: `Real dish kitchen ${randomUUID()}`,
        address_street: `Dish street ${randomUUID()}`,
        address_postal_code: "2200",
        address_city: "København N",
        contact_phone: "+45 12 34 56 78",
        contact_email: "dish@example.test",
      },
    })
    expect(created.ok()).toBe(true)
    const id: string = (await created.json()).restaurant.id
    const path = `${backend}/admin/restaurants/${id}`
    for (const [suffix, data] of [
      ["commercial-terms", { terms_version: "common_mvp_v1" }],
      ["delivery-area-postal-codes", { postal_code: "2200" }],
    ] as const)
      expect(
        (
          await request.post(`${path}/${suffix}`, { headers: admin, data })
        ).ok(),
      ).toBe(true)
    const email = `dish-${randomUUID()}@example.test`
    const invited = await request.post(`${path}/staff-invitations`, {
      headers: admin,
      data: { name: "Sofie", email },
    })
    expect(invited.ok()).toBe(true)
    const token = new URL(
      (await invited.json()).invitation.invite_link,
    ).searchParams.get("token")
    const registered = await request.post(
      `${backend}/auth/restaurant_staff/emailpass/register`,
      { data: { email, password } },
    )
    expect(registered.ok()).toBe(true)
    expect(
      (
        await request.post(`${backend}/partner/staff-invitations/accept`, {
          headers: {
            authorization: `Bearer ${(await registered.json()).token}`,
          },
          data: { token },
        })
      ).ok(),
    ).toBe(true)
    expect(
      (
        await request.post(`${path}/activate`, { headers: admin, data: {} })
      ).status(),
    ).toBe(400)
    await context.addCookies([
      { name: "mtogo_partner_locale", value: locale, url: baseURL! },
    ])
    await page.goto("/sign-in")
    await page
      .getByLabel(locale === "da" ? "E-mail" : "Email", { exact: true })
      .fill(email)
    await page
      .getByLabel(locale === "da" ? "Adgangskode" : "Password", { exact: true })
      .fill(password)
    await page
      .getByRole("button", {
        name: locale === "da" ? "Log ind" : "Sign in",
        exact: true,
      })
      .click()
    await page
      .getByRole("link", {
        name: locale === "da" ? "Kategorier" : "Categories",
        exact: true,
      })
      .click()
    await page
      .getByRole("button", {
        name: locale === "da" ? "Opret kategori" : "Create category",
        exact: true,
      })
      .click()
    await page
      .getByLabel(locale === "da" ? "Dansk navn" : "Danish name", {
        exact: true,
      })
      .fill("Mad")
    await page
      .getByLabel(locale === "da" ? "Engelsk navn" : "English name", {
        exact: true,
      })
      .fill("Food")
    await page
      .getByRole("button", {
        name: locale === "da" ? "Gem kategori" : "Save category",
        exact: true,
      })
      .click()
    await expect(page.getByRole("status")).toContainText(
      locale === "da" ? "Kategorien er gemt." : "Category saved.",
    )
    await page.getByRole("link", { name: "Menu", exact: true }).click()
    await page
      .getByRole("link", {
        name: locale === "da" ? "Opret ret" : "Create dish",
        exact: true,
      })
      .click()
    await page
      .getByLabel(
        locale === "da" ? "Rettens danske navn" : "Dish name in Danish",
      )
      .fill("Dagens ret")
    await page
      .getByLabel(
        locale === "da" ? "Rettens engelske navn" : "Dish name in English",
      )
      .fill("Dish of the day")
    await page
      .getByLabel(locale === "da" ? "Pris i DKK" : "Price in DKK")
      .fill("95.555")
    const save = page.getByRole("button", {
      name: locale === "da" ? "Gem ret" : "Save dish",
      exact: true,
    })
    await save.click()
    await expect(page.locator("main").getByRole("alert")).toContainText(
      locale === "da" ? "to decimaler" : "two decimal places",
    )
    await expect(
      page.getByLabel(
        locale === "da" ? "Rettens engelske navn" : "Dish name in English",
      ),
    ).toHaveValue("Dish of the day")
    page.once("dialog", (dialog) => dialog.dismiss())
    await page
      .getByRole("link", {
        name: locale === "da" ? "Overblik" : "Overview",
        exact: true,
      })
      .click()
    await expect(page).toHaveURL(/\/menu\/new$/)
    await page
      .getByLabel(locale === "da" ? "Pris i DKK" : "Price in DKK")
      .fill(locale === "da" ? "95,50" : "95.50")
    // Publish on the server, then lose the action response; retry must reconcile.
    await page.route("**/menu/new", async (route) => {
      if (
        route.request().method() === "POST" &&
        route.request().headers()["next-action"]
      ) {
        await route.fetch()
        await route.abort("failed")
        await page.unroute("**/menu/new")
      } else await route.continue()
    })
    await save.click()
    const retry = page.getByRole("button", {
      name: locale === "da" ? "Kontrollér og prøv igen" : "Check and retry",
      exact: true,
    })
    await expect(retry).toBeVisible()
    await expect(
      page.getByLabel(locale === "da" ? "Pris i DKK" : "Price in DKK"),
    ).toBeDisabled()
    await retry.click()
    await expect(
      page.getByText(locale === "da" ? "Dagens ret" : "Dish of the day", {
        exact: true,
      }),
    ).toBeVisible()
    const detail = await request.get(path, { headers: admin })
    expect((await detail.json()).restaurant.menu.published_dish_count).toBe(1)
    expect(
      (
        await request.post(`${path}/activate`, { headers: admin, data: {} })
      ).ok(),
    ).toBe(true)
    for (const width of [1280, 320]) {
      await page.setViewportSize({ width, height: 900 })
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
      await testInfo.attach(`published-dish-${locale}-${width}`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      })
    }
    const customer = await context.newPage()
    await context.addCookies([
      { name: "_medusa_locale", value: locale, url: customerBase },
    ])
    await customer.goto(`${customerBase}/dk/restaurants/${id}`)
    await expect(customer.getByTestId("restaurant-menu")).toContainText(
      locale === "da" ? "Dagens ret" : "Dish of the day",
    )
    await expect(customer.getByTestId("restaurant-menu")).toContainText(
      locale === "da" ? "95,50" : "95.50",
    )
    await expect(customer.getByTestId("restaurant-menu")).toContainText(
      locale === "da" ? "Allergener: ukendt" : "Allergens: unknown",
    )
    await page
      .getByRole("link", { name: locale === "da" ? "Rediger" : "Edit" })
      .click()
    await page
      .getByLabel(
        locale === "da"
          ? "Beskrivelse på dansk (valgfri)"
          : "Description in Danish (optional)",
      )
      .fill("Tomat")
    await page
      .getByLabel(
        locale === "da"
          ? "Beskrivelse på engelsk (valgfri)"
          : "Description in English (optional)",
      )
      .fill("Tomato")
    await page
      .getByLabel(locale === "da" ? "Pris i DKK" : "Price in DKK")
      .fill("105")
    await page
      .getByRole("button", {
        name: locale === "da" ? "Gem ændringer" : "Save changes",
      })
      .click()
    await expect(page).toHaveURL(/\/menu\?saved=1/)
    await customer.reload()
    await expect(customer.getByTestId("restaurant-menu")).toContainText(
      locale === "da" ? "Tomat" : "Tomato",
    )
    await expect(customer.getByTestId("restaurant-menu")).toContainText("105")
    await page
      .getByRole("link", { name: locale === "da" ? "Rediger" : "Edit" })
      .click()
    await page
      .getByLabel(
        locale === "da" ? "Rettens danske navn" : "Dish name in Danish",
      )
      .fill("Annas ret")
    await page
      .getByLabel(locale === "da" ? "Pris i DKK" : "Price in DKK")
      .fill("110")
    page.once("dialog", (dialog) => dialog.dismiss())
    await page
      .getByRole("link", {
        name: locale === "da" ? "Overblik" : "Overview",
        exact: true,
      })
      .click()
    await expect(
      page.getByLabel(
        locale === "da" ? "Rettens danske navn" : "Dish name in Danish",
      ),
    ).toHaveValue("Annas ret")
    const partnerToken = (await context.cookies(baseURL)).find(
      ({ name }) => name === "mtogo_partner_token",
    )?.value
    expect(partnerToken).toBeTruthy()
    const currentMenu = await request.get(
      `${backend}/partner/restaurants/${id}/dishes`,
      {
        headers: { authorization: `Bearer ${partnerToken}` },
      },
    )
    const currentDish = (await currentMenu.json()).categories[0].dishes[0]
    const colleague = await request.post(
      `${backend}/partner/restaurants/${id}/dishes/${currentDish.id}`,
      {
        headers: { authorization: `Bearer ${partnerToken}` },
        data: {
          request_id: randomUUID(),
          revision: 2,
          name: { da: "Bos ret", en: "Bo's dish" },
          description: { da: "Tomat", en: "Tomato" },
          price: "115",
        },
      },
    )
    expect(colleague.ok()).toBe(true)
    await page
      .getByRole("button", {
        name: locale === "da" ? "Gem ændringer" : "Save changes",
      })
      .click()
    await expect(page.locator("main").getByRole("alert")).toContainText(
      locale === "da" ? "kollega" : "colleague",
    )
    await expect(
      page.getByLabel(
        locale === "da" ? "Rettens danske navn" : "Dish name in Danish",
      ),
    ).toHaveValue("Annas ret")
    await expect(
      page.getByRole("button", {
        name: locale === "da" ? "Gem ændringer" : "Save changes",
      }),
    ).toBeDisabled()
    await page
      .getByRole("button", {
        name:
          locale === "da"
            ? "Jeg har gennemgået den nyeste version"
            : "I have reviewed the latest version",
      })
      .click()
    await page
      .getByRole("button", {
        name: locale === "da" ? "Gem ændringer" : "Save changes",
      })
      .click()
    await expect(page).toHaveURL(/\/menu\?saved=1/)
    await customer.reload()
    await expect(customer.getByTestId("restaurant-menu")).toContainText("110")
    await customer.close()
    expect(errors).toEqual([])
  })
}
