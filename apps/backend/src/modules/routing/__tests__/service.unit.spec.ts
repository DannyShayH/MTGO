import RoutingModuleService from "../service"

const logger = { log: jest.fn() } as any
const fetchMock = jest.spyOn(globalThis, "fetch")

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })

const service = (options: Record<string, unknown> = {}) =>
  new RoutingModuleService(
    { logger },
    { api_key: "ors-key", base_url: "https://ors.example", ...options },
  )

const pickup = { latitude: 55.6926, longitude: 12.5536 }
const customer = { latitude: 55.7012, longitude: 12.5391 }

describe("RoutingModuleService", () => {
  beforeEach(() => {
    fetchMock.mockReset()
    logger.log.mockReset()
  })

  const address = (properties: Record<string, unknown>) =>
    json({
      features: [{ geometry: { coordinates: [12.5536, 55.6926] }, properties }],
    })
  const exact = { layer: "address", match_type: "exact" }

  it("geocodes a Danish address by street and postal code, with the key in a header, never in the URL", async () => {
    fetchMock.mockResolvedValue(address(exact))
    const result = await service().geocode({
      street: "Nørrebrogade 1",
      postal_code: "2200",
      city: "København N",
    })
    expect(result).toEqual(pickup)
    const [url, init] = fetchMock.mock.calls[0]
    const parsed = new URL(String(url))
    expect(parsed.origin + parsed.pathname).toBe(
      "https://ors.example/pelias/v1/search/structured",
    )
    // A postal district such as "København N" makes the geocoder fall back
    // to the whole country, so only the postal code places the street.
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      address: "Nørrebrogade 1",
      postalcode: "2200",
      country: "DK",
      size: "1",
    })
    expect(String(url)).not.toContain("ors-key")
    expect((init?.headers as Record<string, string>).authorization).toBe(
      "ors-key",
    )
  })

  it.each([
    {
      reason: "EP: a floor and door after a comma are left out",
      street: "Rømersgade 9, 1. tv",
      sent: "Rømersgade 9",
    },
    {
      reason: "EP: a floor and door without a comma are left out",
      street: "Rømersgade 9 1. tv",
      sent: "Rømersgade 9",
    },
    {
      reason: "EP: a house letter is kept",
      street: "Nørrebrogade 12A, 3. th",
      sent: "Nørrebrogade 12A",
    },
    {
      reason: "EP: a house letter after a space is kept",
      street: "Nørrebrogade 12 B",
      sent: "Nørrebrogade 12 B",
    },
    {
      reason: "EP: a street without a number is sent as it is",
      street: "Rådhuspladsen",
      sent: "Rådhuspladsen",
    },
  ])("$reason", async ({ street, sent }) => {
    fetchMock.mockResolvedValue(address(exact))
    await service().geocode({
      street,
      postal_code: "1362",
      city: "København K",
    })
    expect(
      new URL(String(fetchMock.mock.calls[0][0])).searchParams.get("address"),
    ).toBe(sent)
  })

  it.each([
    { reason: "EP: an exact address is used", properties: exact, found: true },
    {
      reason: "EP: a street without the house number is used",
      properties: { layer: "street", match_type: "fallback" },
      found: true,
    },
    {
      reason: "EP: the country centre is no address",
      properties: { layer: "country", match_type: "fallback" },
      found: false,
    },
    {
      reason: "EP: a town or district centre is no address",
      properties: { layer: "locality", match_type: "fallback" },
      found: false,
    },
    {
      reason: "EP: a neighbourhood is no address",
      properties: { layer: "neighbourhood", match_type: "fallback" },
      found: false,
    },
    {
      reason: "EP: a result without a layer is no address",
      properties: {},
      found: false,
    },
  ])("$reason", async ({ properties, found }) => {
    fetchMock.mockResolvedValue(address(properties))
    expect(
      await service().geocode({
        street: "Nørrebrogade 1",
        postal_code: "2200",
        city: "København N",
      }),
    ).toEqual(found ? pickup : null)
  })

  it("measures a cycling trip rounded to 100 m without asking for geometry", async () => {
    fetchMock.mockResolvedValue(
      json({ routes: [{ summary: { distance: 3249.7 } }] }),
    )
    expect(await service().tripDistance(pickup, customer)).toBe(3200)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe(
      "https://ors.example/openrouteservice/v2/directions/cycling-regular",
    )
    expect(JSON.parse(String(init?.body))).toEqual({
      coordinates: [
        [12.5536, 55.6926],
        [12.5391, 55.7012],
      ],
      instructions: false,
      geometry: false,
    })
  })

  it("measures from one origin to many pickups in one matrix call", async () => {
    fetchMock.mockResolvedValue(json({ distances: [[1249, null, 51]] }))
    const origin = { latitude: 55.68, longitude: 12.57 }
    expect(
      await service().distancesFrom(origin, [pickup, customer, pickup]),
    ).toEqual([1200, null, 100])
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe(
      "https://ors.example/openrouteservice/v2/matrix/cycling-regular",
    )
    expect(JSON.parse(String(init?.body))).toEqual({
      locations: [
        [12.57, 55.68],
        [12.5536, 55.6926],
        [12.5391, 55.7012],
        [12.5536, 55.6926],
      ],
      sources: [0],
      destinations: [1, 2, 3],
      metrics: ["distance"],
      units: "m",
    })
  })

  it("calls HeiGIT's API by default, since api.openrouteservice.org is deprecated", async () => {
    fetchMock.mockResolvedValue(address(exact))
    await service({ base_url: undefined }).geocode({
      street: "Nørrebrogade 1",
      postal_code: "2200",
      city: "København N",
    })
    const parsed = new URL(String(fetchMock.mock.calls[0][0]))
    expect(parsed.origin + parsed.pathname).toBe(
      "https://api.heigit.org/pelias/v1/search/structured",
    )
  })

  it("makes no call for an empty list of pickups", async () => {
    expect(await service().distancesFrom(pickup, [])).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("is unavailable without a key and never calls the provider", async () => {
    const routing = service({ api_key: undefined })
    expect(routing.isConfigured()).toBe(false)
    expect(
      await routing.geocode({ street: "x", postal_code: "2200", city: "y" }),
    ).toBeNull()
    expect(await routing.tripDistance(pickup, customer)).toBeNull()
    expect(await routing.distancesFrom(pickup, [customer])).toEqual([null])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ["an over-quota response", () => json({ error: "quota" }, 429)],
    ["a provider error", () => json({ error: "boom" }, 500)],
    ["an unreadable body", () => new Response("<html>", { status: 200 })],
    ["no route", () => json({ routes: [] })],
  ])("returns no distance on %s and logs no coordinates", async (_, reply) => {
    fetchMock.mockResolvedValue(reply())
    expect(await service().tripDistance(pickup, customer)).toBeNull()
    expect(await service().distancesFrom(pickup, [customer])).toEqual([null])
    // Without the record's own timestamp: a log written at second 55 of a
    // minute ("18:20:55.119Z") would otherwise match the coordinate pattern.
    const logged = JSON.stringify(logger.log.mock.calls, (key, value) =>
      key === "time" ? undefined : value,
    )
    expect(logged).toContain("upstream.request.failed")
    expect(logged).toContain("/openrouteservice/v2/matrix/:profile")
    expect(logged).not.toMatch(/55\.|12\.5|ors-key|ors\.example/)
  })

  it("returns no address match when the geocoder finds nothing", async () => {
    fetchMock.mockResolvedValue(json({ features: [] }))
    expect(
      await service().geocode({ street: "x", postal_code: "2200", city: "y" }),
    ).toBeNull()
  })

  it("gives up after its timeout", async () => {
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          ),
        ),
    )
    expect(
      await service({ timeout_ms: 20 }).tripDistance(pickup, customer),
    ).toBeNull()
  })

  it("returns no distance when the network fails", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"))
    expect(await service().distancesFrom(pickup, [customer])).toEqual([null])
  })
})
