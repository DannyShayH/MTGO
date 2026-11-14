import { expect, test } from "@playwright/test"

test.use({ locale: "da-DK" })

test("staff manage bilingual categories, preserve invalid and stale input and confirm unsaved navigation", async ({
  page,
  context,
}, testInfo) => {
  expect(process.env.E2E_DISPOSABLE).toBe("1")
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto("/menu")
  await page.getByLabel("E-mail").fill(process.env.SEED_STAFF_EMAIL!)
  await page.getByLabel("Adgangskode").fill(process.env.SEED_STAFF_PASSWORD!)
  await page.getByRole("button", { name: "Log ind", exact: true }).click()
  await page.getByRole("link", { name: "Menu", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "Kategorier", exact: true }),
  ).toBeVisible()
  await page
    .getByRole("button", { name: "Opret kategori", exact: true })
    .click()
  await expect(page.getByLabel("Dansk navn")).toBeFocused()
  await page.getByLabel("Dansk navn").fill("  Drikke  ")
  await page.getByLabel("Engelsk navn").fill(" Drinks ")
  await page.getByRole("button", { name: "Gem kategori", exact: true }).click()
  await expect(page.getByRole("status")).toHaveText("Kategorien er gemt.")
  await expect(
    page.getByRole("button", { name: "Omdøb: Drikke", exact: true }),
  ).toBeVisible()
  await page.getByRole("button", { name: "English", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "Categories", exact: true }),
  ).toBeVisible()
  await page.getByRole("link", { name: "Overview", exact: true }).click()
  await expect(page).toHaveURL(/\/overview$/)
  await page.getByRole("link", { name: "Menu", exact: true }).click()
  await expect(page).toHaveURL(/\/menu$/)
  await page.getByRole("link", { name: "Overview", exact: true }).click()
  await expect(page).toHaveURL(/\/overview$/)
  await page.goBack()
  await expect(page).toHaveURL(/\/menu$/)
  await page
    .getByRole("button", { name: "Rename: Drinks", exact: true })
    .click()
  await page.getByLabel("Danish name").fill("<script>alert(1)</script>")
  await page.getByLabel("English name").fill('Pizza "special" & pasta')
  await page.getByRole("button", { name: "Save category", exact: true }).click()
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "only letters, numbers, spaces and basic punctuation",
  )
  await expect(page.getByLabel("Danish name")).toHaveValue(
    "<script>alert(1)</script>",
  )
  await expect(page.getByLabel("English name")).toHaveValue(
    'Pizza "special" & pasta',
  )
  await expect(
    page.getByRole("button", { name: "Rename: Drinks", exact: true }),
  ).toBeVisible()
  await page.getByLabel("Danish name").fill("Pizza & pasta")

  page.once("dialog", (dialog) => dialog.dismiss())
  await page.getByRole("link", { name: "Overview", exact: true }).click()
  await expect(page).toHaveURL(/\/menu$/)
  await expect(page.getByLabel("Danish name")).toHaveValue("Pizza & pasta")
  page.once("dialog", (dialog) => dialog.dismiss())
  await page.getByRole("button", { name: "Dansk", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "Categories", exact: true }),
  ).toBeVisible()
  const backDialog = page.waitForEvent("dialog")
  page.once("dialog", (dialog) => dialog.dismiss())
  await page.evaluate(() => window.history.back())
  await backDialog
  await expect(page).toHaveURL(/\/menu$/)
  await expect(page.getByLabel("Danish name")).toHaveValue("Pizza & pasta")
  const forwardDialog = page.waitForEvent("dialog")
  page.once("dialog", (dialog) => dialog.dismiss())
  await page.evaluate(() => window.history.forward())
  await forwardDialog
  await expect(page).toHaveURL(/\/menu$/)
  await expect(page.getByLabel("Danish name")).toHaveValue("Pizza & pasta")
  const jumpDialog = page.waitForEvent("dialog")
  page.once("dialog", (dialog) => dialog.dismiss())
  await page.evaluate(() => window.history.go(-2))
  await jumpDialog
  await expect(page).toHaveURL(/\/menu$/)
  await expect(page.getByLabel("Danish name")).toHaveValue("Pizza & pasta")

  const other = await context.newPage()
  await other.goto("/menu")
  await other
    .getByRole("button", { name: "Rename: Drinks", exact: true })
    .click()
  await other.getByLabel("Danish name").fill("Vand")
  await other.getByLabel("English name").fill("Water")
  await other
    .getByRole("button", { name: "Save category", exact: true })
    .click()
  await expect(other.getByRole("status")).toHaveText("Category saved.")
  await other.close()
  await page.getByRole("button", { name: "Save category", exact: true }).click()
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Someone changed this category",
  )
  await expect(page.getByLabel("English name")).toHaveValue(
    'Pizza "special" & pasta',
  )
  await expect(
    page.getByRole("button", { name: "Save category", exact: true }),
  ).toBeDisabled()
  await page
    .getByRole("button", { name: "Load the latest names", exact: true })
    .click()
  await expect(
    page.getByText("Latest saved names", { exact: true }),
  ).toBeVisible()
  await expect(page.getByText("Water", { exact: true })).toHaveCount(2)
  await page
    .getByRole("button", {
      name: "Keep my names and use this version",
      exact: true,
    })
    .click()
  await page.getByRole("button", { name: "Save category", exact: true }).click()
  await expect(page.getByRole("status")).toHaveText("Category saved.")
  await expect(
    page.getByText('Pizza "special" & pasta', { exact: true }),
  ).toBeVisible()
  expect(await page.locator("main script").count()).toBe(0)

  for (const width of [1280, 375, 320]) {
    await page.setViewportSize({ width, height: 900 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await testInfo.attach(`categories-en-${width}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    })
  }
  await page.getByRole("button", { name: "Dansk", exact: true }).click()
  await expect(
    page.getByRole("button", { name: "Omdøb: Pizza & pasta", exact: true }),
  ).toBeVisible()
  await testInfo.attach("categories-da", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  })
  page.once("dialog", (dialog) => dialog.accept())
  await page
    .getByRole("button", { name: "Fjern: Pizza & pasta", exact: true })
    .click()
  await expect(page.getByRole("status")).toHaveText("Kategorien er fjernet.")
  await expect(
    page.getByRole("button", { name: "Omdøb: Pizza & pasta", exact: true }),
  ).toHaveCount(0)
  await page.getByRole("button", { name: "English", exact: true }).click()
  await page
    .getByRole("button", { name: "Create category", exact: true })
    .click()
  await page.getByLabel("Danish name").fill("Desserter")
  await page.getByLabel("English name").fill("Desserts")
  let lost = false
  await page.route("**/menu", async (route) => {
    if (
      !lost &&
      route.request().method() === "POST" &&
      route.request().headers()["next-action"]
    ) {
      lost = true
      await route.fetch()
      await route.abort("failed")
    } else await route.continue()
  })
  await page.getByRole("button", { name: "Save category", exact: true }).click()
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "The change could not be confirmed",
  )
  expect(lost).toBe(true)
  await expect(page.getByLabel("Danish name")).toHaveValue("Desserter")
  await page.unroute("**/menu")
  await page.getByLabel("English name").fill("Sweets")
  await page.getByRole("button", { name: "Save category", exact: true }).click()
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "already saved with different names",
  )
  await expect(page.getByLabel("English name")).toHaveValue("Sweets")
  await page
    .getByRole("button", {
      name: "Keep my names and use this version",
      exact: true,
    })
    .click()
  await page.getByRole("button", { name: "Save category", exact: true }).click()
  await expect(page.getByRole("status")).toHaveText("Category saved.")
  await expect(
    page.getByRole("button", { name: "Rename: Sweets", exact: true }),
  ).toHaveCount(1)
  page.once("dialog", (dialog) => dialog.accept())
  await page
    .getByRole("button", { name: "Remove: Sweets", exact: true })
    .click()
  await expect(page.getByRole("status")).toHaveText("Category removed.")

  // A suggestion saves both names in one click and leaves the suggestions.
  await expect(
    page.getByRole("heading", { name: "Suggestions", exact: true }),
  ).toBeVisible()
  await page.getByRole("button", { name: "Add: Starters", exact: true }).click()
  await expect(page.getByRole("status")).toHaveText("Category saved.")
  await expect(
    page.getByRole("button", { name: "Rename: Starters", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Add: Starters", exact: true }),
  ).toHaveCount(0)
  await page.reload()
  await page.getByRole("button", { name: "Dansk", exact: true }).click()
  await expect(
    page.getByRole("button", { name: "Omdøb: Forretter", exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Tilføj: Forretter", exact: true }),
  ).toHaveCount(0)
  page.once("dialog", (dialog) => dialog.accept())
  await page
    .getByRole("button", { name: "Fjern: Forretter", exact: true })
    .click()
  await expect(page.getByRole("status")).toHaveText("Kategorien er fjernet.")
  await expect(
    page.getByRole("button", { name: "Tilføj: Forretter", exact: true }),
  ).toBeVisible()
  expect(errors).toEqual([])
})
