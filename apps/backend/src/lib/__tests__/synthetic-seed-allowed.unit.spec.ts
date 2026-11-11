import { syntheticSeedAllowed } from "../synthetic-seed-allowed"

describe("synthetic Restaurant seed safety", () => {
  it.each([
    {
      url: "postgres://localhost/medusa_dev",
      env: "development",
      allowed: true,
      reason: "DT: local development",
    },
    {
      url: "postgres://127.0.0.1/medusa_ci_restaurants",
      env: "production",
      allowed: true,
      reason: "DT: disposable CI",
    },
    {
      url: "postgres://[::1]/medusa_ci_restaurants",
      env: "test",
      allowed: true,
      reason: "EP: IPv6 loopback",
    },
    {
      url: "postgres://localhost/live_store",
      env: "production",
      allowed: false,
      reason: "DT: local production",
    },
    {
      url: "postgres://database.example/medusa_ci_test",
      env: "development",
      allowed: false,
      reason: "DT: remote database",
    },
    {
      url: "postgres://localhost/dev",
      env: undefined,
      allowed: false,
      reason: "EP: environment unspecified",
    },
    {
      url: "invalid",
      env: "development",
      allowed: false,
      reason: "EP: malformed URL",
    },
  ])("$reason", ({ url, env, allowed }) =>
    expect(syntheticSeedAllowed(url, env)).toBe(allowed),
  )
})
