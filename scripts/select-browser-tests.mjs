import { execFileSync } from "node:child_process"
import { resolveExecutable } from "./resolve-executable.mjs"
import { fileURLToPath } from "node:url"

/** Unknown runtime changes select everything; docs never trigger browser journeys. */
export function selectBrowserTests(files) {
  const selection = { partner: [], storefront: [], admin: false }
  const add = (app, ...tests) => {
    if (tests.includes("*")) {
      selection[app] = ["*"]
      return
    }
    if (!selection[app].includes("*"))
      selection[app] = [...new Set([...selection[app], ...tests])].sort(
        (a, b) => a.localeCompare(b),
      )
  }
  const all = () => {
    selection.partner = ["*"]
    selection.storefront = ["*"]
    selection.admin = true
  }
  for (const file of files) {
    if (
      /^(docs\/|apps\/docs\/|\.dict\/)/.test(file) ||
      /\.(md|mdx)$/.test(file)
    )
      continue
    if (/^apps\/(partner|storefront)\/e2e\/[^/]+\.spec\.ts$/.test(file)) {
      const [, app, , name] = file.split("/")
      add(app, name)
      continue
    }
    if (file === ".github/workflows/on_ready.yml") {
      add("partner", "partner.smoke.spec.ts")
      add("storefront", "storefront.smoke.spec.ts")
      selection.admin = true
      continue
    }
    if (/^apps\/partner\//.test(file)) {
      add("partner", "*")
      continue
    }
    if (/^apps\/storefront\//.test(file)) {
      add("storefront", "*")
      continue
    }
    if (
      /^packages\/i18n\/src\/(menu|dishes|categories|messages)\.ts$/.test(file)
    ) {
      add("partner", "*")
      continue
    }
    if (/^packages\/i18n\/src\/customer-menu\.ts$/.test(file)) {
      add("storefront", "restaurant-menu.spec.ts")
      continue
    }
    if (/^packages\/i18n\/src\/customer-auth\.ts$/.test(file)) {
      add("storefront", "customer-auth.spec.ts")
      continue
    }
    if (
      file === "packages/i18n/src/index.ts" &&
      files.some(
        (name) =>
          name !== file &&
          name.startsWith("packages/i18n/src/") &&
          !name.includes("__tests__"),
      )
    )
      continue
    if (
      /^packages\/i18n\/src\/__tests__\//.test(file) ||
      /^apps\/backend\/integration-tests\//.test(file) ||
      /\/__tests__\//.test(file)
    )
      continue
    if (
      /^apps\/backend\/src\/(api\/store\/(restaurants|postal-codes)\/|workflows\/restaurants\/(steps\/browse-restaurants|delivery-area-match)\.ts)/.test(
        file,
      )
    ) {
      add(
        "storefront",
        "restaurant-browsing.spec.ts",
        "restaurant-menu.spec.ts",
      )
      continue
    }
    if (
      /^packages\/i18n\/src\/(customer-home|customer-navigation)\.ts$/.test(
        file,
      )
    ) {
      add("storefront", "restaurant-browsing.spec.ts")
      continue
    }
    if (
      /^apps\/backend\/src\/(workflows\/menu|api\/partner\/restaurants\/.*\/(dishes|categories)|links\/menu)/.test(
        file,
      )
    ) {
      add(
        "partner",
        "menu-dishes.spec.ts",
        "menu-categories.spec.ts",
        "food-catalogue.spec.ts",
        "restaurant-opening.spec.ts",
      )
      add("storefront", "restaurant-menu.spec.ts", "restaurants.admin.spec.ts")
      continue
    }
    if (
      /^scripts\/(select-browser-tests|run-browser-tests|verify-applications|verify-application-builds)/.test(
        file,
      )
    ) {
      add("partner", "partner.smoke.spec.ts")
      add("storefront", "storefront.smoke.spec.ts")
      selection.admin = true
      continue
    }
    all()
  }
  return selection
}

export function changedFiles(base = "origin/main") {
  const read = (...args) =>
    execFileSync(resolveExecutable("git"), args, { encoding: "utf8" })
      .split("\n")
      .filter(Boolean)
  return [
    ...new Set([
      ...read("diff", "--name-only", `${base}...HEAD`),
      ...read("diff", "--name-only", "HEAD"),
      ...read("ls-files", "--others", "--exclude-standard"),
    ]),
  ]
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let selection
  try {
    selection = selectBrowserTests(changedFiles(process.env.BROWSER_TEST_BASE))
  } catch {
    selection = { partner: ["*"], storefront: ["*"], admin: true }
  }
  if (process.env.BROWSER_TEST_ALL === "1")
    selection = { partner: ["*"], storefront: ["*"], admin: true }
  console.log(JSON.stringify(selection))
}
