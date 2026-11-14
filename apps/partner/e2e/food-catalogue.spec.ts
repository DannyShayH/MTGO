import { expect, test } from "@playwright/test"

test.use({ locale: "da-DK" })

test("staff read numbered food information in both languages with keyboard and narrow layouts", async ({
  page,
}, testInfo) => {
  expect(process.env.E2E_DISPOSABLE).toBe("1")
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto("/menu")
  await expect(page).toHaveURL(/\/sign-in$/)
  await page.getByLabel("E-mail").fill(process.env.SEED_STAFF_EMAIL!)
  await page.getByLabel("Adgangskode").fill(process.env.SEED_STAFF_PASSWORD!)
  await page.getByRole("button", { name: "Log ind", exact: true }).click()
  await page.getByRole("link", { name: "Menu", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "De 14 EU-allergener" }),
  ).toBeVisible()
  const summaries = page.locator("main summary")
  await expect(summaries).toHaveCount(14)
  await expect(summaries.first()).toHaveText("1Korn, der indeholder gluten+−")
  await summaries.first().focus()
  await page.keyboard.press("Enter")
  await expect(page.getByText("Khorasanhvede", { exact: true })).toBeVisible()
  await expect(page.locator("details").first()).toHaveAttribute("open", "")
  await page.keyboard.press("Tab")
  await expect(summaries.nth(1)).toBeFocused()
  await page.keyboard.press("Space")
  await expect(page.locator("details").nth(1)).toHaveAttribute("open", "")
  await summaries.nth(7).click()
  await expect(page.getByText("Paranød", { exact: true })).toBeVisible()
  await summaries.nth(11).click()
  await expect(
    page.getByText(/Over 10 mg\/kg eller 10 mg\/liter/),
  ).toBeVisible()
  const extras = page.getByRole("region", { name: "Øvrige madoplysninger" })
  await expect(extras.getByText("Hvidløg", { exact: true })).toBeVisible()
  await expect(extras.locator("summary")).toHaveCount(0)
  await expect(
    page.getByText(/Manglende oplysninger betyder ukendt/),
  ).toBeVisible()

  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await testInfo.attach(`catalogue-da-${width}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    })
  }
  const numberAndIcons = await summaries
    .locator("img")
    .evaluateAll((images) => images.map((image) => image.getAttribute("src")))
  await page.getByRole("button", { name: "English", exact: true }).click()
  await expect(
    page.getByRole("heading", { name: "The 14 EU allergens" }),
  ).toBeVisible()
  await expect(summaries.first()).toContainText("1Cereals containing gluten")
  expect(
    await summaries
      .locator("img")
      .evaluateAll((images) =>
        images.map((image) => image.getAttribute("src")),
      ),
  ).toEqual(numberAndIcons)
  // Native disclosure state survives the language change.
  await expect(page.getByText("Brazil nut", { exact: true })).toBeVisible()
  await expect(
    page
      .getByRole("region", { name: "Additional food information" })
      .getByText("Garlic", { exact: true }),
  ).toBeVisible()
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    expect(
      await page
        .locator("main img")
        .evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete &&
              (image as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    ).toBe(true)
    for (const fontSize of [16, 24, 32]) {
      await page.evaluate((size) => {
        document.documentElement.style.fontSize = `${size}px`
      }, fontSize)
      const wrappedNumbers = await page
        .locator("main summary > span:first-child")
        .evaluateAll((nodes) =>
          nodes
            .filter(
              (node) =>
                node.getBoundingClientRect().height >
                Number.parseFloat(getComputedStyle(node).lineHeight) + 1,
            )
            .map((node) => node.textContent),
        )
      expect(
        wrappedNumbers,
        `EU numbers stay on one line at ${fontSize}px text and ${width}px width`,
      ).toEqual([])
    }
    await page.evaluate(() => {
      document.documentElement.style.fontSize = ""
    })
    await testInfo.attach(`catalogue-en-${width}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    })
  }
  expect(errors).toEqual([])
})
