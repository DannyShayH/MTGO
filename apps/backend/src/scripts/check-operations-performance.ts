/**
 * Times the operations reads (#264; spec #54 testing decision
 * "Performance") under twenty simultaneous journeys. Run from apps/backend
 * with the backend running (MEDUSA_BACKEND_URL, default
 * http://localhost:9000), started with MTOGO_FF_OPERATIONS_MONITORING=true,
 * on a database holding the 100-Customer, 500-Order verification population
 * with the demo world loaded:
 *
 *   npx medusa exec ./src/scripts/check-operations-performance.ts
 *
 * Each journey reads one Restaurant's figures as its staff
 * (`/partner/restaurants/{id}/operations`), the same Restaurant as an
 * operator (`/admin/operations?restaurant_id=`) and the whole platform
 * (`/admin/operations`), in OPERATIONS_PERFORMANCE_ROUNDS rounds (5) of
 * twenty simultaneous journeys after one unmeasured warm-up journey. The
 * journeys rotate over every Restaurant with authorized staff. It reports how
 * many requests completed within two seconds against the 95% target.
 *
 * Requests are signed with short-lived tokens made with the backend's JWT
 * secret, so no password is needed. It prints one JSON report on stdout;
 * every count in it comes from the module services. The script never touches
 * the database connection (coding standard 5.1): the query plans are checked
 * in integration-tests/http/admin-operations.spec.ts, beside the earlier
 * index checks.
 */
import os from "node:os"
import type { ExecArgs, MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import { RESTAURANT_MODULE } from "../modules/restaurant"
import type RestaurantModuleService from "../modules/restaurant/service"

const JOURNEYS = 20
const TARGET_MS = 2000

type Read = "partner: own Restaurant" | "admin: one Restaurant" | "admin: all"
type Timed = { read: Read; status: number; ms: number }

const percentile = (sorted: number[], share: number) =>
  sorted[Math.min(sorted.length - 1, Math.ceil(share * sorted.length) - 1)]

/** One authorized staff member per Restaurant that has one. */
async function staffedRestaurants(container: MedusaContainer) {
  const staff = await container
    .resolve<RestaurantModuleService>(RESTAURANT_MODULE)
    .listRestaurantStaffs(
      { status: "authorized" },
      { select: ["id", "restaurant_id"], take: 1000 },
    )
  const byRestaurant = new Map<string, string>()
  for (const { id, restaurant_id } of staff)
    if (!byRestaurant.has(restaurant_id)) byRestaurant.set(restaurant_id, id)
  return [...byRestaurant].map(([restaurant_id, staff_id]) => ({
    restaurant_id,
    staff_id,
  }))
}

export default async function checkOperationsPerformance({
  container,
}: ExecArgs) {
  const base = process.env.MEDUSA_BACKEND_URL ?? "http://localhost:9000"
  const rounds = Number(process.env.OPERATIONS_PERFORMANCE_ROUNDS ?? 5)
  const config = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
  const secret = config.projectConfig.http.jwtSecret!
  const restaurants = await staffedRestaurants(container)
  const [operator] = await container
    .resolve(Modules.USER)
    .listUsers({}, { take: 1, order: { created_at: "ASC" } })
  if (!operator || !restaurants.length)
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "An operator and a Restaurant with authorized staff are needed",
    )
  const token = (actor_type: string, actor_id: string) =>
    `Bearer ${generateJwtToken(
      { actor_id, actor_type, auth_identity_id: "operations-performance" },
      { secret, expiresIn: "1h" },
    )}`
  const admin = token("user", operator.id)

  const journey = async (index: number) => {
    const { restaurant_id, staff_id } = restaurants[index % restaurants.length]
    const timed: Timed[] = []
    const step = async (read: Read, url: string, authorization: string) => {
      const start = performance.now()
      const response = await fetch(url, { headers: { authorization } })
      await response.arrayBuffer()
      timed.push({
        read,
        status: response.status,
        ms: performance.now() - start,
      })
    }
    await step(
      "partner: own Restaurant",
      `${base}/partner/restaurants/${restaurant_id}/operations`,
      token("restaurant_staff", staff_id),
    )
    await step(
      "admin: one Restaurant",
      `${base}/admin/operations?restaurant_id=${restaurant_id}`,
      admin,
    )
    await step("admin: all", `${base}/admin/operations`, admin)
    return timed
  }
  await journey(0)
  const timings: Timed[] = []
  for (let round = 0; round < rounds; round++)
    timings.push(
      ...(
        await Promise.all(
          Array.from({ length: JOURNEYS }, (_, index) => journey(index)),
        )
      ).flat(),
    )
  const summarize = (rows: Timed[]) => {
    const sorted = rows.map(({ ms }) => ms).sort((a, b) => a - b)
    const within = rows.filter(
      ({ ms, status }) => status === 200 && ms <= TARGET_MS,
    ).length
    return {
      requests: rows.length,
      failed: rows.filter(({ status }) => status !== 200).length,
      within_2s: `${((100 * within) / rows.length).toFixed(1)}%`,
      p50_ms: Math.round(percentile(sorted, 0.5)),
      p95_ms: Math.round(percentile(sorted, 0.95)),
      max_ms: Math.round(sorted.at(-1)!),
    }
  }
  const reads: Read[] = [
    "partner: own Restaurant",
    "admin: one Restaurant",
    "admin: all",
  ]
  const overall = summarize(timings)

  const count = async (
    list: (
      filters: object,
      config: { take: number },
    ) => Promise<[unknown[], number]>,
  ) => (await list({}, { take: 1 }))[1]
  const customerModule = container.resolve(Modules.CUSTOMER)
  const orderModule = container.resolve(Modules.ORDER)
  const restaurantModule =
    container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
  const report = {
    population: {
      customers: await count((f, c) =>
        customerModule.listAndCountCustomers(f, c),
      ),
      orders: await count((f, c) => orderModule.listAndCountOrders(f, c)),
      restaurants: await count((f, c) =>
        restaurantModule.listAndCountRestaurants(f, c),
      ),
      journey_restaurants: restaurants.length,
    },
    timing: {
      workload: `${JOURNEYS} simultaneous journeys x ${rounds} rounds, 3 reads each (staff: own Restaurant; operator: the same Restaurant, all Restaurants), rotating over ${restaurants.length} Restaurants with authorized staff, after one unmeasured warm-up journey`,
      target: "95% within 2000 ms",
      met: overall.failed === 0 && Number.parseFloat(overall.within_2s) >= 95,
      overall,
      by_read: Object.fromEntries(
        reads.map((read) => [
          read,
          summarize(timings.filter((row) => row.read === read)),
        ]),
      ),
    },
    environment: {
      measured_at: new Date().toISOString(),
      backend: base,
      node: process.version,
      platform: `${os.type()} ${os.release()}`,
      cpus: `${os.cpus().length} x ${os.cpus()[0]?.model ?? "unknown"}`,
      memory_gb: Math.round(os.totalmem() / 2 ** 30),
      node_env: process.env.NODE_ENV,
    },
  }
  // A report for the person running it, not an application log record
  // (coding standard 7.3), so it goes to stdout as it is.
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}
