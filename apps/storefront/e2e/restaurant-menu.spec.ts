import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { resolve } from "node:path"
import { expect, test, type APIRequestContext } from "@playwright/test"

const backend = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL!
const staffPassword = "ci-only-menu-staff-password"

const TEXT = {
  da: {
    closed: "Lukket",
    open: "Åben",
    closedNote: "tager ikke imod bestillinger lige nu",
    drinks: "Drikkevarer",
    desserts: "Desserter",
    margherita: "Pizza Margherita (syntetisk)",
    pepperoni: "Pizza Pepperoni (syntetisk)",
    lemonade: "Hjemmelavet hyldeblomstlimonade (syntetisk)",
    description: "En syntetisk ret til demonstrationer. Ikke en rigtig ret.",
    prices: ["95,00 kr.", "109,50 kr.", "32,00 kr."],
    soldOut: "Udsolgt",
    allergens: "Allergener: ukendt",
    allergensNote: "Ukendt betyder aldrig allergenfri",
    priceNote: "inklusive moms og levering",
    notFound: "Vi kan ikke finde restauranten",
  },
  en: {
    closed: "Closed",
    open: "Open",
    closedNote: "is not taking Orders right now",
    drinks: "Drinks",
    desserts: "Desserts",
    margherita: "Pizza Margherita (synthetic)",
    pepperoni: "Pizza Pepperoni (synthetic)",
    lemonade: "Homemade elderflower lemonade (synthetic)",
    description:
      "A synthetic dish seeded for demonstrations. Not a real menu item.",
    prices: ["DKK 95.00", "DKK 109.50", "DKK 32.00"],
    soldOut: "Sold out",
    allergens: "Allergens: unknown",
    allergensNote: "Unknown never means allergen-free",
    priceNote: "include VAT and delivery",
    notFound: "We cannot find the Restaurant",
  },
} as const

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
 * A Restaurant of its own with a delivery area, terms and one authorized staff
 * member, set up through the APIs. It is inactive and has no menu yet.
 */
async function setUpRestaurant(request: APIRequestContext, name: string) {
  const headers = await adminHeaders(request)
  const created = await request.post(`${backend}/admin/restaurants`, {
    headers,
    data: {
      name,
      address_street: `Menu street ${randomUUID()}`,
      address_postal_code: "2200",
      address_city: "København N",
      contact_phone: "+45 12 34 56 78",
      contact_email: "kontakt@menu.example",
    },
  })
  expect(created.ok()).toBe(true)
  const id = (await created.json()).restaurant.id as string
  const path = `${backend}/admin/restaurants/${id}`
  for (const [at, data] of [
    ["delivery-area-postal-codes", { postal_code: "2200" }],
    ["commercial-terms", { terms_version: "common_mvp_v1" }],
  ] as const)
    expect((await request.post(`${path}/${at}`, { headers, data })).ok()).toBe(
      true,
    )
  const email = `menu-staff-${randomUUID()}@example.test`
  const invited = await request.post(`${path}/staff-invitations`, {
    headers,
    data: { name: "Sofie Jensen", email },
  })
  expect(invited.ok()).toBe(true)
  const token = new URL(
    (await invited.json()).invitation.invite_link,
  ).searchParams.get("token")
  const registered = await request.post(
    `${backend}/auth/restaurant_staff/emailpass/register`,
    { data: { email, password: staffPassword } },
  )
  expect(registered.ok()).toBe(true)
  const accepted = await request.post(
    `${backend}/partner/staff-invitations/accept`,
    {
      headers: {
        authorization: `Bearer ${(await registered.json()).token}`,
      },
      data: { token },
    },
  )
  expect(accepted.ok()).toBe(true)
  const signedIn = await request.post(
    `${backend}/auth/restaurant_staff/emailpass`,
    { data: { email, password: staffPassword } },
  )
  expect(signedIn.ok()).toBe(true)
  return {
    id,
    path,
    admin: headers,
    staff: { authorization: `Bearer ${(await signedIn.json()).token}` },
  }
}

/** The showcase menu stands in for staff publishing until Feature #44 delivers it. */
function seedShowcaseMenu(restaurantId: string) {
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
      "showcase",
    ],
    { cwd: resolve(process.cwd(), "../backend"), stdio: "inherit" },
  )
}

for (const locale of ["da", "en"] as const) {
  test(`Customer reads a Restaurant's menu: hidden while inactive, closed, open and hidden again (${locale})`, async ({
    page,
    context,
    request,
    baseURL,
  }, testInfo) => {
    expect(process.env.E2E_DISPOSABLE).toBe("1")
    test.setTimeout(180_000)
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    const text = TEXT[locale]
    const name = `Menu journey kitchen ${randomUUID()}`
    const restaurant = await setUpRestaurant(request, name)
    const menuUrl = `/dk/restaurants/${restaurant.id}`
    await context.addCookies([
      { name: "_medusa_locale", value: locale, url: baseURL! },
    ])

    // Inactive: hidden from public browsing, even with a published menu.
    seedShowcaseMenu(restaurant.id)
    await page.goto(menuUrl)
    await expect(page.getByTestId("restaurant-menu-not_found")).toContainText(
      text.notFound,
    )
    await expect(page.getByText(text.margherita)).toHaveCount(0)

    // Active and closed: readable, and clearly not taking Orders.
    expect(
      (
        await request.post(`${restaurant.path}/activate`, {
          headers: restaurant.admin,
          data: {},
        })
      ).ok(),
    ).toBe(true)
    await page.reload()
    const menu = page.getByTestId("restaurant-menu")
    await expect(menu.getByRole("heading", { level: 1, name })).toBeVisible()
    await expect(
      page.locator(`div[lang="${locale}"] [data-testid="restaurant-menu"]`),
    ).toBeVisible()
    await expect(page.getByTestId("restaurant-status")).toHaveText(text.closed)
    await expect(page.getByTestId("restaurant-not-receiving")).toContainText(
      text.closedNote,
    )
    await expect(menu).toContainText(text.priceNote)

    // Categories and dishes in the Restaurant's order; the empty category is left out.
    await expect(menu.getByRole("heading", { level: 2 })).toHaveText([
      "Pizza",
      text.drinks,
    ])
    await expect(menu.getByText(text.desserts)).toHaveCount(0)
    await expect(menu.getByRole("heading", { level: 3 })).toHaveText([
      text.margherita,
      text.pepperoni,
      text.lemonade,
    ])
    await expect(menu).toContainText(text.description)
    // Playwright compares with whitespace normalized, so Intl's no-break space matches.
    await expect(menu.getByTestId("menu-dish-price")).toHaveText([
      ...text.prices,
    ])

    // The published single-title product is not a valid dish.
    await expect(menu.getByText(/Single-title product/)).toHaveCount(0)
    await expect(menu.getByTestId("menu-dish")).toHaveCount(3)

    // Sold out stays visible and is labelled in words, not by colour alone.
    const soldOut = menu.locator(
      '[data-testid="menu-dish"][data-sold-out="true"]',
    )
    await expect(soldOut).toHaveCount(1)
    await expect(soldOut).toContainText(text.pepperoni)
    await expect(soldOut).toContainText(text.soldOut)

    // Every dish without a photo gets the same placeholder.
    await expect(menu.getByTestId("menu-dish-placeholder")).toHaveCount(3)
    await expect(menu.locator("img")).toHaveCount(0)

    // Unknown allergen information is stated, and its explanation opens by keyboard.
    const information = menu.getByTestId("menu-dish-food-information").first()
    await expect(information).toContainText(text.allergens)
    await information.locator("summary").focus()
    await page.keyboard.press("Enter")
    await expect(information).toContainText(text.allergensNote)

    // The category links move by keyboard to their section.
    await menu.getByRole("link", { name: text.drinks }).focus()
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(/#mcat_/)

    // A phone-width screen wraps the long Danish names instead of scrolling sideways.
    await page.setViewportSize({ width: 360, height: 740 })
    await expect(
      menu.getByRole("heading", { level: 3, name: text.lemonade }),
    ).toBeVisible()
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true)
    await page.evaluate(() => window.scrollTo(0, 0))
    await testInfo.attach(`restaurant-menu-closed-narrow-${locale}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    })
    await page.setViewportSize({ width: 1280, height: 800 })

    // Opened by staff: the next fetch shows it.
    expect(
      (
        await request.post(
          `${backend}/partner/restaurants/${restaurant.id}/open`,
          { headers: restaurant.staff, data: {} },
        )
      ).ok(),
    ).toBe(true)
    await page.reload()
    await expect(menu.getByRole("heading", { level: 1, name })).toBeVisible()
    await expect(page.getByTestId("restaurant-status")).toHaveText(text.open)
    await expect(page.getByTestId("restaurant-not-receiving")).toHaveCount(0)
    await expect(menu.getByTestId("menu-dish")).toHaveCount(3)
    await page.evaluate(() => window.scrollTo(0, 0))
    await expect(menu.getByRole("heading", { level: 1, name })).toBeInViewport()
    await testInfo.attach(`restaurant-menu-open-wide-${locale}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    })

    // Deactivated: hidden again on the next fetch.
    expect(
      (
        await request.post(`${restaurant.path}/deactivate`, {
          headers: restaurant.admin,
          data: { reason: "Menu journey finished" },
        })
      ).ok(),
    ).toBe(true)
    await page.reload()
    await expect(page.getByTestId("restaurant-menu-not_found")).toContainText(
      text.notFound,
    )
    expect(errors).toEqual([])
  })
}

test("an unknown Restaurant shows the same message as an inactive one", async ({
  page,
  context,
  baseURL,
}) => {
  expect(process.env.E2E_DISPOSABLE).toBe("1")
  await context.addCookies([
    { name: "_medusa_locale", value: "en", url: baseURL! },
  ])
  await page.goto("/dk/restaurants/res_unknown")
  await expect(page.getByTestId("restaurant-menu-not_found")).toContainText(
    TEXT.en.notFound,
  )
})

test("twenty simultaneous Customers browse a menu with at least 95% of requests within two seconds", async ({
  request,
}, testInfo) => {
  expect(process.env.E2E_DISPOSABLE).toBe("1")
  test.setTimeout(180_000)
  const restaurant = await setUpRestaurant(
    request,
    `Menu workload kitchen ${randomUUID()}`,
  )
  seedShowcaseMenu(restaurant.id)
  for (const [url, headers] of [
    [`${restaurant.path}/activate`, restaurant.admin],
    [`${backend}/partner/restaurants/${restaurant.id}/open`, restaurant.staff],
  ] as const)
    expect((await request.post(url, { headers, data: {} })).ok()).toBe(true)

  const menuUrl = `/dk/restaurants/${restaurant.id}`
  // One warm-up visit, so the measurement is of browsing and not of first compilation.
  expect((await request.get(menuUrl)).ok()).toBe(true)

  const durations: number[] = []
  const visit = async (locale: "da" | "en") => {
    const started = performance.now()
    const response = await request.get(menuUrl, {
      headers: { cookie: `_medusa_locale=${locale}` },
    })
    durations.push(performance.now() - started)
    expect(response.status()).toBe(200)
    expect(await response.text()).toContain(TEXT[locale].lemonade)
  }
  // One journey: open the menu in Danish, switch to English, fetch it once more.
  const journey = async () => {
    await visit("da")
    await visit("en")
    await visit("da")
  }
  await Promise.all(Array.from({ length: 20 }, journey))

  durations.sort((a, b) => a - b)
  const percentile = (share: number) =>
    Math.round(durations[Math.ceil(durations.length * share) - 1])
  const withinTwoSeconds =
    durations.filter((duration) => duration <= 2000).length / durations.length
  const summary = {
    journeys: 20,
    requests: durations.length,
    p50_ms: percentile(0.5),
    p95_ms: percentile(0.95),
    max_ms: Math.round(durations[durations.length - 1]),
    share_within_2s: withinTwoSeconds,
    conditions:
      "production builds on one host, disposable PostgreSQL, 3 valid dishes in 2 categories, menu fetched with no-store on every request",
  }
  console.info("menu browsing workload", JSON.stringify(summary))
  await testInfo.attach("menu-browsing-workload", {
    body: JSON.stringify(summary, null, 2),
    contentType: "application/json",
  })
  expect(durations).toHaveLength(60)
  expect(withinTwoSeconds).toBeGreaterThanOrEqual(0.95)
})
