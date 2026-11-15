import { randomUUID } from "node:crypto"
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test"

const backend = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL!
const staffPassword = "ci-only-browsing-staff-password"

const TEXT = {
  da: {
    heading: "Mad fra restauranter nær dig",
    searchLabel: "Hvor skal vi levere?",
    open: "Åben",
    closed: "Lukket",
    closedNote: "Du kan se menuen, men ikke bestille lige nu.",
    copenhagenK: "København K",
    copenhagenKCodes: "213 postnumre",
    selectedTown: "Leverer til København K",
    partOfTown: "Leverer til 2 af 213 postnumre i København K",
    selectedCode: "Leverer til 2200 København N",
    servesCode: "Leverer til 2200",
    showAll: "Vis alle restauranter",
    unknownCode: "9998 er ikke et dansk postnummer",
    unknownTown: "Vi kender ikke byen “Atlantis”",
    noMatches: "Ingen dansk by eller postnummer matcher “Atlantis”.",
    emptyLocation: "Ingen restauranter leverer til Allinge lige nu",
    chooseLocation: "Vælg et sted",
    back: "Tilbage til restauranterne",
    restaurants: "Restauranter",
    account: "Konto",
    basket: "Kurv",
  },
  en: {
    heading: "Food from Restaurants near you",
    searchLabel: "Where should we deliver?",
    open: "Open",
    closed: "Closed",
    closedNote: "You can read the menu but not order right now.",
    copenhagenK: "København K",
    copenhagenKCodes: "213 postcodes",
    selectedTown: "Delivering to København K",
    partOfTown: "Delivers to 2 of 213 postcodes in København K",
    selectedCode: "Delivering to 2200 København N",
    servesCode: "Delivers to 2200",
    showAll: "Show all Restaurants",
    unknownCode: "9998 is not a Danish postcode",
    unknownTown: "We do not know the town “Atlantis”",
    noMatches: "No Danish town or postcode matches “Atlantis”.",
    emptyLocation: "No Restaurants deliver to Allinge right now",
    chooseLocation: "Choose a location",
    back: "Back to the Restaurants",
    restaurants: "Restaurants",
    account: "Account",
    basket: "Basket",
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

type Fixture = {
  name: string
  postalCode: string
  city: string
  deliveryArea: string[]
  state: "inactive" | "closed" | "open"
}

/**
 * A Restaurant set up through the operator and partner APIs: delivery area,
 * terms, one staff member who accepted an invitation and one real published
 * dish, then activated and opened as the fixture says.
 */
async function setUpRestaurant(request: APIRequestContext, fixture: Fixture) {
  const admin = await adminHeaders(request)
  const created = await request.post(`${backend}/admin/restaurants`, {
    headers: admin,
    data: {
      name: fixture.name,
      address_street: `Browsing street ${randomUUID()}`,
      address_postal_code: fixture.postalCode,
      address_city: fixture.city,
      contact_phone: "+45 12 34 56 78",
      contact_email: "kontakt@browsing.example",
    },
  })
  expect(created.ok()).toBe(true)
  const id = (await created.json()).restaurant.id as string
  const path = `${backend}/admin/restaurants/${id}`
  for (const [at, data] of [
    ["delivery-area-postal-codes/batch", { add: fixture.deliveryArea }],
    ["commercial-terms", { terms_version: "common_mvp_v1" }],
  ] as const)
    expect(
      (await request.post(`${path}/${at}`, { headers: admin, data })).ok(),
    ).toBe(true)
  const email = `browsing-staff-${randomUUID()}@example.test`
  const invited = await request.post(`${path}/staff-invitations`, {
    headers: admin,
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
      headers: { authorization: `Bearer ${(await registered.json()).token}` },
      data: { token },
    },
  )
  expect(accepted.ok()).toBe(true)
  const signedIn = await request.post(
    `${backend}/auth/restaurant_staff/emailpass`,
    { data: { email, password: staffPassword } },
  )
  expect(signedIn.ok()).toBe(true)
  const staff = { authorization: `Bearer ${(await signedIn.json()).token}` }
  const partner = `${backend}/partner/restaurants/${id}`
  const category = await request.post(`${partner}/categories`, {
    headers: staff,
    data: {
      request_id: `category-${randomUUID()}`,
      revision: 0,
      name: { da: "Mad", en: "Food" },
    },
  })
  expect(category.ok()).toBe(true)
  const catalogue = await request.get(`${backend}/partner/food-catalogue`, {
    headers: staff,
  })
  expect(catalogue.ok()).toBe(true)
  const foodLabels = (await catalogue.json()).food_labels.map(
    (label: { id: string }) => ({ food_label_id: label.id, state: "unknown" }),
  )
  const dish = await request.post(`${partner}/dishes`, {
    headers: staff,
    data: {
      request_id: `dish-${randomUUID()}`,
      category_id: (await category.json()).category.id,
      name: { da: "Dagens ret", en: "Dish of the day" },
      price: "95",
      allergens: { status: "unknown" },
      food_labels: foodLabels,
    },
  })
  expect(dish.ok()).toBe(true)
  if (fixture.state !== "inactive") {
    expect(
      (
        await request.post(`${path}/activate`, { headers: admin, data: {} })
      ).ok(),
    ).toBe(true)
  }
  if (fixture.state === "open") {
    expect(
      (
        await request.post(`${partner}/open`, { headers: staff, data: {} })
      ).ok(),
    ).toBe(true)
  }
  return { id, path, admin }
}

const card = (page: Page, name: string) =>
  page.getByTestId("restaurant-card").filter({ hasText: name })

const noHorizontalScroll = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth,
  )

for (const locale of ["da", "en"] as const) {
  test(`Customer finds a Restaurant by postcode or town from the homepage and opens its menu (${locale})`, async ({
    page,
    context,
    request,
    baseURL,
  }, testInfo) => {
    expect(process.env.E2E_DISPOSABLE).toBe("1")
    test.setTimeout(240_000)
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    const text = TEXT[locale]
    const run = randomUUID().slice(0, 8)
    const names = {
      aarhus: `Aarhus Kitchen ${run}`,
      noerrebro: `Nørrebro Kitchen ${run}`,
      indreBy: `Indre By Kitchen ${run}`,
      hidden: `Hidden Kitchen ${run}`,
    }
    // Located in Aarhus, delivering to Nørrebro: appears for 2200, not for 8000.
    const aarhus = await setUpRestaurant(request, {
      name: names.aarhus,
      postalCode: "8000",
      city: "Aarhus C",
      deliveryArea: ["2200"],
      state: "open",
    })
    // Located in Nørrebro, delivering only to Aarhus: the pickup code is not served.
    await setUpRestaurant(request, {
      name: names.noerrebro,
      postalCode: "2200",
      city: "København N",
      deliveryArea: ["8000"],
      state: "closed",
    })
    // Serves two of København K's 213 codes.
    await setUpRestaurant(request, {
      name: names.indreBy,
      postalCode: "1050",
      city: "København K",
      deliveryArea: ["1050", "1051"],
      state: "open",
    })
    await setUpRestaurant(request, {
      name: names.hidden,
      postalCode: "2200",
      city: "København N",
      deliveryArea: ["2200"],
      state: "inactive",
    })
    await context.addCookies([
      { name: "_medusa_locale", value: locale, url: baseURL! },
    ])

    // The normal entry URL is the Restaurant homepage in the selected language.
    await page.goto("/")
    await expect(page).toHaveURL(/\/$/)
    const home = page.getByTestId("restaurants-home")
    await expect(
      page.locator(`div[lang="${locale}"][data-testid="restaurants-home"]`),
    ).toBeVisible()
    await expect(home.getByRole("heading", { level: 1 })).toHaveText(
      text.heading,
    )
    await expect(page.getByText("Ecommerce Starter Template")).toHaveCount(0)
    await expect(page.locator('a[href*="github.com"]')).toHaveCount(0)
    await expect(page.locator('a[href*="medusajs.com"]')).toHaveCount(0)
    await expect(page.getByTestId("footer-categories")).toHaveCount(0)
    await expect(page.getByTestId("nav-search-button")).toHaveCount(0)
    await expect(page.getByTestId("nav-account-link")).toHaveText(text.account)
    await expect(page.getByTestId("nav-cart-link")).toHaveText(
      `${text.basket} (0)`,
    )
    await page.getByTestId("nav-menu-button").click()
    await expect(page.getByTestId("restaurants-link")).toHaveText(
      text.restaurants,
    )
    await expect(page.getByTestId("basket-link")).toHaveText(text.basket)
    await expect(page.getByTestId("store-link")).toHaveCount(0)
    await page.getByTestId("close-menu-button").click()

    // Active Restaurants, open and closed, come from persisted data; inactive ones are absent.
    await expect(
      card(page, names.aarhus).getByTestId("restaurant-card-status"),
    ).toHaveText(text.open)
    const closed = card(page, names.noerrebro)
    await expect(closed.getByTestId("restaurant-card-status")).toHaveText(
      text.closed,
    )
    await expect(closed).toContainText(text.closedNote)
    await expect(card(page, names.indreBy)).toBeVisible()
    await expect(card(page, names.hidden)).toHaveCount(0)
    await expect(
      card(page, names.aarhus).getByTestId("restaurant-cover-placeholder"),
    ).toBeVisible()

    // Keyboard: a town search offers København K with every code, and selecting it filters.
    const input = page.getByTestId("location-search-input")
    await expect(page.getByText(text.searchLabel)).toBeVisible()
    await input.focus()
    await page.keyboard.type("københavn")
    const suggestions = page.getByTestId("location-suggestions")
    const copenhagenK = suggestions
      .getByRole("option")
      .filter({ hasText: text.copenhagenK })
    await expect(copenhagenK).toContainText(text.copenhagenKCodes)
    await expect(suggestions.getByRole("option").first()).toContainText(
      text.copenhagenK,
    )
    await page.keyboard.press("ArrowDown")
    await expect(copenhagenK).toHaveAttribute("aria-selected", "true")
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(/\?town=K%C3%B8benhavn(\+|%20)K$/)
    await expect(page.getByTestId("selected-location")).toContainText(
      text.selectedTown,
    )
    await expect(
      card(page, names.indreBy).getByTestId("restaurant-card-coverage"),
    ).toHaveText(text.partOfTown)
    await expect(card(page, names.aarhus)).toHaveCount(0)
    await expect(card(page, names.noerrebro)).toHaveCount(0)

    // Clearing restores every active Restaurant.
    await page.getByTestId("clear-location").click()
    await expect(page).toHaveURL(/\/dk\/?$/)
    await expect(page.getByTestId("selected-location")).toHaveCount(0)
    await expect(card(page, names.aarhus)).toBeVisible()
    await expect(card(page, names.noerrebro)).toBeVisible()

    // An exact code filters by delivery-area membership, not by the pickup address.
    await expect(input).toHaveValue("")
    await input.pressSequentially("2200")
    await expect(suggestions.getByRole("option").first()).toContainText(
      "2200 København N",
    )
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("Enter")
    await expect(page).toHaveURL(/\?postal_code=2200$/)
    await expect(page.getByTestId("selected-location")).toContainText(
      text.selectedCode,
    )
    await expect(
      card(page, names.aarhus).getByTestId("restaurant-card-coverage"),
    ).toHaveText(text.servesCode)
    await expect(card(page, names.noerrebro)).toHaveCount(0)
    await expect(card(page, names.indreBy)).toHaveCount(0)

    // The card opens the menu from #105 and keeps the location for the way back.
    await card(page, names.aarhus).getByTestId("restaurant-card-link").click()
    await expect(page).toHaveURL(
      new RegExp(`/dk/restaurants/${aarhus.id}\\?postal_code=2200$`),
    )
    const menu = page.getByTestId("restaurant-menu")
    await expect(
      menu.getByRole("heading", { level: 1, name: names.aarhus }),
    ).toBeVisible()
    // The header loads the cart on every page; a late reply must not move the Customer.
    await page.waitForLoadState("networkidle")
    await page.getByTestId("nav-cart-link").hover()
    await page.waitForTimeout(1_000)
    await expect(page).toHaveURL(
      new RegExp(`/dk/restaurants/${aarhus.id}\\?postal_code=2200$`),
    )
    await expect(
      menu.getByRole("heading", { level: 1, name: names.aarhus }),
    ).toBeVisible()
    await page.getByTestId("menu-back-link").click()
    await expect(page).toHaveURL(/\?postal_code=2200$/)
    await expect(page.getByTestId("selected-location")).toContainText(
      text.selectedCode,
    )

    // Unknown code, unknown town, unmatched text and no serving Restaurant are told apart.
    await page.goto("/dk?postal_code=9998")
    await expect(page.getByTestId("restaurants-refused")).toContainText(
      text.unknownCode,
    )
    await expect(page.getByTestId("restaurant-list")).toHaveCount(0)
    await page.goto("/dk?town=Atlantis")
    await expect(page.getByTestId("restaurants-refused")).toContainText(
      text.unknownTown,
    )
    await expect(page.getByTestId("restaurant-list")).toHaveCount(0)
    await page.goto("/dk?q=Atlantis")
    await expect(page.getByTestId("location-no-matches")).toHaveText(
      text.noMatches,
    )
    await expect(page.getByTestId("restaurant-list")).toHaveCount(0)
    await page.goto("/dk?postal_code=3770")
    await expect(page.getByTestId("restaurants-empty")).toContainText(
      text.emptyLocation,
    )
    await page.getByTestId("restaurants-show-all").click()
    await expect(page).toHaveURL(/\/dk\/?$/)

    // A search submitted as a plain form (no JavaScript needed) lists the choices as links.
    await page.goto("/dk?q=k%C3%B8benhavn")
    const choices = page.getByTestId("location-choices")
    await expect(choices).toContainText(text.chooseLocation)
    await choices
      .getByRole("link", { name: new RegExp(`^${text.copenhagenK}`) })
      .click()
    await expect(page).toHaveURL(/\?town=K%C3%B8benhavn(\+|%20)K$/)
    await expect(card(page, names.indreBy)).toBeVisible()

    // Narrow and wide layouts: long Danish names wrap, nothing scrolls sideways.
    await page.goto("/dk")
    await page.setViewportSize({ width: 360, height: 740 })
    await expect(card(page, names.indreBy)).toBeVisible()
    expect(await noHorizontalScroll(page)).toBe(true)
    await input.focus()
    await expect(input).toBeFocused()
    await page.evaluate(() => window.scrollTo(0, 0))
    await testInfo.attach(`restaurants-home-narrow-${locale}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    })
    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(card(page, names.aarhus)).toBeVisible()
    expect(await noHorizontalScroll(page)).toBe(true)
    await testInfo.attach(`restaurants-home-wide-${locale}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    })

    // Deactivation shows on the next fetch, and the direct menu stays hidden.
    expect(
      (
        await request.post(`${aarhus.path}/deactivate`, {
          headers: aarhus.admin,
          data: { reason: "Browsing journey finished" },
        })
      ).ok(),
    ).toBe(true)
    await page.reload()
    await expect(card(page, names.aarhus)).toHaveCount(0)
    await expect(card(page, names.indreBy)).toBeVisible()
    await page.goto(`/dk/restaurants/${aarhus.id}`)
    await expect(page.getByTestId("restaurant-menu-not_found")).toBeVisible()
    expect(errors).toEqual([])
  })
}
