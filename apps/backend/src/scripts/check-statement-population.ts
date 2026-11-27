/**
 * Reconciles and times the statement verification population (#235; spec
 * #52 testing decision 9) through the real read surfaces. Run from
 * apps/backend after `seed-statement-population.ts`, with the backend
 * running (MEDUSA_BACKEND_URL, default http://localhost:9000) and started
 * with MTOGO_FF_RESTAURANT_STATEMENTS=true:
 *
 *   npx medusa exec ./src/scripts/check-statement-population.ts
 *
 * 1. Reconciliation: every population Restaurant and month is read as its
 *    staff member (`/partner/restaurants/{id}/statements/{month}`) and as an
 *    operator (`/admin/...`), every entry page included. The whole-month
 *    totals, fee evidence, outcome counts and entries must equal the
 *    independently expected manifest (`statement-population-manifest.ts`),
 *    be the same on every page and the same on both surfaces.
 * 2. Timing: twenty simultaneous journeys, each a staff and an operator
 *    month list, a closed month's first two entry pages and the current
 *    month's first page, in DEMO_STATEMENT_POPULATION_ROUNDS rounds (3)
 *    after one unmeasured warm-up journey. It reports how many requests
 *    completed within two seconds against the 95% target.
 *
 * Requests are signed with short-lived tokens for the population staff and
 * the population operator, made with the backend's JWT secret, so no
 * password is needed. It prints the manifest summary, the reconciliation
 * result and the timings, and fails when a statement does not reconcile.
 */
import os from "node:os"
import type { ExecArgs, MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import {
  expectedStatementManifest,
  type ExpectedStatement,
} from "../lib/statement-population-manifest"
import {
  planStatementPopulation,
  POPULATION_KEY,
  POPULATION_OPERATOR,
  populationStaffEmail,
  POPULATION_RESTAURANTS,
} from "../lib/statement-population-plan"
import { ORDER_OPERATION_MODULE } from "../modules/order-operation"
import type OrderOperationModuleService from "../modules/order-operation/service"
import { RESTAURANT_MODULE } from "../modules/restaurant"
import type RestaurantModuleService from "../modules/restaurant/service"
import type { StatementSnapshot } from "../types/restaurant-statement"
import { copenhagenMonthOf } from "../workflows/restaurant-finance/calculation"

const PAGE = 50
const JOURNEYS = 20
const TARGET_MS = 2000

type Surface = "partner" | "admin"
type Timed = { surface: Surface; read: string; status: number; ms: number }

/** A decimal string as whole øre, so "76" and "76.00" compare equal. */
const ore = (amount: string) => {
  const [whole, fraction = ""] = amount.replace("-", "").split(".")
  const value =
    BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0").slice(0, 2))
  return amount.startsWith("-") ? -value : value
}

async function populationRestaurants(container: MedusaContainer) {
  const service = container.resolve<RestaurantModuleService>(RESTAURANT_MODULE)
  const found = new Map<string, { id: string; staff_id: string }>()
  for (const plan of POPULATION_RESTAURANTS) {
    const [restaurant] = await service.listRestaurants(
      { name: plan.name },
      { take: 1, select: ["id"] },
    )
    const [staff] = restaurant
      ? await service.listRestaurantStaffs(
          {
            restaurant_id: restaurant.id,
            email: populationStaffEmail(plan),
            status: "authorized",
          },
          { take: 1, select: ["id", "auth_identity_id"] },
        )
      : []
    if (!staff)
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `${plan.name} is missing; run seed-statement-population.ts first`,
      )
    found.set(plan.key, { id: restaurant.id, staff_id: staff.id })
  }
  return found
}

/** The anchor date the population's Orders carry. */
async function anchorDate(
  container: MedusaContainer,
  restaurant_ids: string[],
) {
  const operations = await container
    .resolve<OrderOperationModuleService>(ORDER_OPERATION_MODULE)
    .listOrderOperations(
      { restaurant_id: restaurant_ids },
      { select: ["order_id"], take: 1, order: { placed_at: "ASC" } },
    )
  const { data } = await container
    .resolve(ContainerRegistrationKeys.QUERY)
    .graph({
      entity: "order",
      fields: ["metadata"],
      filters: { id: operations.map(({ order_id }) => order_id) },
    })
  const tag = (data[0]?.metadata as Record<string, unknown> | undefined)?.[
    POPULATION_KEY
  ]
  if (typeof tag !== "string")
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "The population has no Orders; run seed-statement-population.ts first",
    )
  return tag.split(":")[0]
}

/** One mismatch per differing field, empty when the statement reconciles. */
function reconcile(
  expected: ExpectedStatement,
  pages: StatementSnapshot[],
): string[] {
  const problems: string[] = []
  const check = (label: string, actual: unknown, wanted: unknown) => {
    if (JSON.stringify(actual) !== JSON.stringify(wanted))
      problems.push(
        `${label}: expected ${JSON.stringify(wanted)}, read ${JSON.stringify(actual)}`,
      )
  }
  const [first] = pages
  const { statement } = first
  for (const page of pages.slice(1))
    check("totals on a later page", page.statement.totals, statement.totals)
  check("lifecycle", statement.lifecycle, expected.lifecycle)
  check("completeness", statement.completeness, expected.completeness)
  const totals = {
    ...statement.totals,
    mtogo_funded_food_credits: statement.mtogo_funded_food_credits,
  }
  for (const [key, amount] of Object.entries(expected.totals)) {
    const total = totals[key as keyof typeof totals]
    check(
      key,
      total.status === "available"
        ? ore(total.amount).toString()
        : total.status,
      amount === "unavailable" ? amount : ore(amount).toString(),
    )
  }
  check(
    "active dates",
    [
      statement.service_fee_evidence.active_date_count,
      statement.service_fee_evidence.month_day_count,
    ],
    [expected.active_date_count, expected.month_day_count],
  )
  check(
    "outcomes without entitlement",
    Object.fromEntries(
      statement.outcomes_without_entitlement
        .filter(({ count }) => count > 0)
        .map(({ outcome, count }) => [outcome, count])
        .sort(([a], [b]) => String(a).localeCompare(String(b))),
    ),
    Object.fromEntries(
      Object.entries(expected.without_entitlement).sort(([a], [b]) =>
        a.localeCompare(b),
      ),
    ),
  )
  const entries = pages.flatMap((page) => page.entries)
  check(
    "entry count",
    [first.count, entries.length],
    [expected.entries, expected.entries],
  )
  check(
    "distinct entries",
    new Set(entries.map(({ id }) => id)).size,
    expected.entries,
  )
  const countEntries = (filter: (entry: (typeof entries)[number]) => boolean) =>
    entries.filter(filter).length
  check(
    "entries by kind",
    {
      delivered: countEntries(
        (entry) =>
          entry.kind === "delivered_order" && !entry.original_statement,
      ),
      compensated: countEntries(
        (entry) => entry.kind === "prepared_food_compensation",
      ),
      late_adjustments: countEntries((entry) => !!entry.original_statement),
    },
    {
      delivered: expected.delivered,
      compensated: expected.compensated,
      late_adjustments: expected.late_adjustments,
    },
  )
  return problems
}

const percentile = (sorted: number[], share: number) =>
  sorted[Math.min(sorted.length - 1, Math.ceil(share * sorted.length) - 1)]

export default async function checkStatementPopulation({
  container,
}: ExecArgs) {
  const base = process.env.MEDUSA_BACKEND_URL ?? "http://localhost:9000"
  const rounds = Number(process.env.DEMO_STATEMENT_POPULATION_ROUNDS ?? 3)
  const config = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
  const secret = config.projectConfig.http.jwtSecret!
  const restaurants = await populationRestaurants(container)
  const anchor = await anchorDate(
    container,
    [...restaurants.values()].map(({ id }) => id),
  )
  const now = new Date()
  const population = planStatementPopulation({ anchor_date: anchor })
  const manifest = expectedStatementManifest(population, now)
  const [operator] = await container
    .resolve(Modules.USER)
    .listUsers({ email: POPULATION_OPERATOR.email })
  if (!operator)
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "The population operator is missing",
    )
  const token = (actor_type: string, actor_id: string) =>
    `Bearer ${generateJwtToken(
      { actor_id, actor_type, auth_identity_id: "statement-population-check" },
      { secret, expiresIn: "1h" },
    )}`
  const admin = token("user", operator.id)
  const staff = new Map(
    [...restaurants].map(([key, { staff_id }]) => [
      key,
      token("restaurant_staff", staff_id),
    ]),
  )
  const path = (surface: Surface, restaurant_id: string, rest = "") =>
    `${base}/${surface}/restaurants/${restaurant_id}/statements${rest}`
  const read = async <T>(url: string, authorization: string) => {
    const response = await fetch(url, { headers: { authorization } })
    if (response.status !== 200)
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `${url} answered ${response.status}: ${await response.text()}`,
      )
    return (await response.json()) as T
  }

  // 1. Reconciliation on both surfaces.
  const mismatches: string[] = []
  for (const expected of manifest.statements) {
    const { id } = restaurants.get(expected.restaurant)!
    const readPages = async (surface: Surface) => {
      const authorization =
        surface === "admin" ? admin : staff.get(expected.restaurant)!
      const pages: StatementSnapshot[] = []
      do
        pages.push(
          await read<StatementSnapshot>(
            path(
              surface,
              id,
              `/${expected.month}?limit=${PAGE}&offset=${pages.length * PAGE}`,
            ),
            authorization,
          ),
        )
      while (pages.length * PAGE < pages[0].count)
      return pages
    }
    const partner = await readPages("partner")
    const operatorView = await readPages("admin")
    const label = `${expected.restaurant} ${expected.month}`
    for (const problem of reconcile(expected, partner))
      mismatches.push(`${label} (partner) ${problem}`)
    const comparableJson = (pages: StatementSnapshot[]) =>
      JSON.stringify(
        pages.map(({ statement, entries }) => ({
          statement: { ...statement, verified_at: undefined },
          entries,
        })),
      )
    if (comparableJson(partner) !== comparableJson(operatorView))
      mismatches.push(`${label}: the Admin read differs from the partner read`)
  }

  // 2. Twenty simultaneous journeys.
  const keys = POPULATION_RESTAURANTS.map(({ key }) => key)
  // The first month is closed and complete for every Restaurant, so its
  // reads carry real whole-month totals rather than withheld ones.
  const closed = population.months[0]
  const current = copenhagenMonthOf(now)
  const journey = async (index: number) => {
    const key = keys[index % keys.length]
    const { id } = restaurants.get(key)!
    const timed: Timed[] = []
    const step = async (surface: Surface, label: string, rest: string) => {
      const start = performance.now()
      const response = await fetch(path(surface, id, rest), {
        headers: {
          authorization: surface === "admin" ? admin : staff.get(key)!,
        },
      })
      await response.arrayBuffer()
      timed.push({
        surface,
        read: label,
        status: response.status,
        ms: performance.now() - start,
      })
    }
    for (const surface of ["partner", "admin"] as Surface[]) {
      await step(surface, "month list", "")
      await step(surface, "closed month, entries 1-20", `/${closed}`)
      await step(surface, "closed month, entries 21-40", `/${closed}?offset=20`)
      await step(surface, "current month, entries 1-20", `/${current}`)
    }
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
  const byRead = Object.fromEntries(
    [...new Set(timings.map(({ surface, read }) => `${surface}: ${read}`))].map(
      (label) => [
        label,
        summarize(
          timings.filter(
            ({ surface, read }) => `${surface}: ${read}` === label,
          ),
        ),
      ],
    ),
  )
  const overall = summarize(timings)
  const report = {
    population: manifest.population,
    statements: manifest.statements.map(
      ({ restaurant, month, lifecycle, entries, totals }) => ({
        restaurant: POPULATION_RESTAURANTS.find(
          ({ key }) => key === restaurant,
        )!.name,
        month,
        lifecycle,
        entries,
        ...totals,
      }),
    ),
    reconciliation: {
      statements: manifest.statements.length,
      surfaces: ["partner", "admin"],
      mismatches,
    },
    timing: {
      workload: `${JOURNEYS} simultaneous journeys x ${rounds} rounds, 8 reads each (staff and operator: month list, ${closed} entries 1-20 and 21-40, ${current} entries 1-20), after one unmeasured warm-up journey`,
      target: "95% within 2000 ms",
      met: overall.failed === 0 && Number.parseFloat(overall.within_2s) >= 95,
      overall,
      by_read: byRead,
    },
    environment: {
      measured_at: now.toISOString(),
      backend: base,
      node: process.version,
      platform: `${os.type()} ${os.release()}`,
      cpus: `${os.cpus().length} x ${os.cpus()[0]?.model ?? "unknown"}`,
      memory_gb: Math.round(os.totalmem() / 2 ** 30),
      node_env: process.env.NODE_ENV,
    },
  }
  container
    .resolve(ContainerRegistrationKeys.LOGGER)
    .info(JSON.stringify(report, null, 2))
  if (mismatches.length)
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `${mismatches.length} statement differences from the expected manifest`,
    )
}
