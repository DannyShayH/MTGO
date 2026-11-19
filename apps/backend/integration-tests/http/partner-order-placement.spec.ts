import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { createOrderWorkflow } from "@medusajs/medusa/core-flows"
import { Modules } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { readPublishedMenu } from "../../src/workflows/menu"
import { markRecordedPlacementsWorkflow } from "../../src/workflows/order-operations"
import { markPaidPlacementsStep } from "../../src/workflows/order-operations/steps/mark-paid-placements"
import {
  AWAITING_ACCEPTANCE,
  CHECKOUT_REVIEW_KEY,
  ORDER_STATE_METADATA_KEY,
  PLACEMENT_MARKER_KEY,
} from "../../src/workflows/orders/placed-order-visibility"
import seedFoodCatalogue from "../../src/migration-scripts/food-catalogue"
import { FOOD_CATALOGUE_MODULE } from "../../src/modules/food-catalogue"
import type FoodCatalogueModuleService from "../../src/modules/food-catalogue/service"
import {
  FIVE_MINUTES,
  restaurantOrdersHarness,
} from "../helpers/restaurant-orders"

jest.setTimeout(240000)

/** Marks, then fails, so the marking is compensated. */
const markThenFailWorkflow = createWorkflow(
  "test-mark-paid-placements-then-fail",
  function (input: Parameters<typeof markPaidPlacementsStep>[0]) {
    markPaidPlacementsStep(input)
    createStep("test-fail-after-marking", async () => {
      throw new Error("after marking")
    })()
    return new WorkflowResponse(undefined)
  },
)

medusaIntegrationTestRunner({
  dbName: "medusa_ci_partner_order_placement_http",
  env: { JWT_SECRET: "ci-only-partner-order-placement-secret", REDIS_URL: "" },
  testSuite: ({ api, getContainer, dbUtils }) => {
    const harness = restaurantOrdersHarness({ api, getContainer, dbUtils })
    const {
      operations,
      restaurants,
      reviewedCartOf,
      complete,
      placePaidOrder,
      signInAsStaffOf,
      queue,
      detail,
    } = harness
    type Seeded = ReturnType<typeof harness.seeded>
    let admin: Seeded["admin"]
    let store: Seeded["store"]
    let customer: Seeded["customer"]
    let customerId: Seeded["customerId"]
    let regionId: Seeded["regionId"]
    let pizzeriaId: Seeded["pizzeriaId"]
    beforeEach(() => {
      ;({ admin, store, customer, customerId, regionId, pizzeriaId } =
        harness.seeded())
    })

    describe("paid placement", () => {
      it("records one placement time and deadline, kept across a retried completion", async () => {
        const { cartId, dish } = await reviewedCartOf(pizzeriaId, 2)
        const first = (await complete(cartId)).data.order
        const placedAt = new Date(first.order_operation.placed_at).getTime()
        expect(Math.abs(placedAt - Date.now())).toBeLessThan(60000)
        expect(
          new Date(first.order_operation.acceptance_deadline).getTime(),
        ).toBe(placedAt + FIVE_MINUTES)

        const retried = (await complete(cartId)).data.order
        expect(retried.id).toBe(first.id)
        expect(retried.order_operation).toEqual(first.order_operation)
        expect(retried.payment_collections[0].payments).toHaveLength(1)
        expect(Number(retried.payment_collections[0].payments[0].amount)).toBe(
          dish.price.amount * 2,
        )
        const records = await operations().listOrderOperations({
          order_id: first.id,
        })
        expect(records).toHaveLength(1)
        // Order lists filter on this copy of the record (#154).
        expect(retried.metadata[PLACEMENT_MARKER_KEY]).toBe(records[0].id)
      })

      it("keeps paid Orders visible to Customer and Admin whatever their later operational state", async () => {
        const accepted = await placePaidOrder(pizzeriaId)
        const cancelled = await placePaidOrder(pizzeriaId)
        for (const [order, state] of [
          [accepted, "accepted"],
          [cancelled, "cancelled"],
        ] as const) {
          const [record] = await operations().listOrderOperations({
            order_id: order.id,
          })
          await operations().updateOrderOperations({ id: record.id, state })
        }
        // A provisional core row from an unfinished completion stays hidden.
        await createOrderWorkflow(getContainer()).run({
          input: {
            region_id: regionId,
            customer_id: customerId,
            email: "orders-customer@example.test",
            currency_code: "dkk",
            metadata: { [CHECKOUT_REVIEW_KEY]: { version: 1 } },
            items: [{ title: "Provisional", quantity: 1, unit_price: 100 }],
          },
        })

        const all = await api.get("/store/orders", { headers: customer })
        expect(all.data.count).toBe(2)
        // History labels an Order by its operational state, not a metadata marker.
        expect(
          Object.fromEntries(
            all.data.orders.map(
              (o: { id: string; order_operation: { state: string } }) => [
                o.id,
                o.order_operation.state,
              ],
            ),
          ),
        ).toEqual({ [accepted.id]: "accepted", [cancelled.id]: "cancelled" })
        expect(
          all.data.orders.map(({ id }: { id: string }) => id).sort(),
        ).toEqual([accepted.id, cancelled.id].sort())
        for (const id of [accepted.id, cancelled.id]) {
          expect(
            (await api.get(`/store/orders/${id}`, { headers: customer }))
              .status,
          ).toBe(200)
          expect(
            (await api.get(`/admin/orders/${id}`, { headers: admin })).status,
          ).toBe(200)
        }
        const operator = await api.get("/admin/orders", { headers: admin })
        expect(operator.data.count).toBe(2)
      })

      it("counts and pages only visible Orders wherever provisional rows sit", async () => {
        const createCoreOrder = async (
          title: string,
          metadata: Record<string, unknown>,
        ) =>
          (
            await createOrderWorkflow(getContainer()).run({
              input: {
                region_id: regionId,
                customer_id: customerId,
                email: "orders-customer@example.test",
                currency_code: "dkk",
                metadata,
                items: [{ title, quantity: 1, unit_price: 100 }],
              },
            })
          ).result
        const provisional = () =>
          createCoreOrder("Provisional", {
            [CHECKOUT_REVIEW_KEY]: { version: 1 },
          })
        // Oldest first: P, paid, P, legacy, unreviewed, paid, P.
        await provisional()
        const firstPaid = await placePaidOrder(pizzeriaId)
        await provisional()
        const legacy = await createCoreOrder("Legacy", {
          [CHECKOUT_REVIEW_KEY]: { version: 1 },
          [ORDER_STATE_METADATA_KEY]: AWAITING_ACCEPTANCE,
        })
        const unreviewed = await createCoreOrder("Unreviewed", {})
        const lastPaid = await placePaidOrder(pizzeriaId)
        await provisional()
        const visible = [firstPaid, legacy, unreviewed, lastPaid].map(
          ({ id }) => id,
        )

        for (const [path, headers] of [
          ["/store/orders", customer],
          ["/admin/orders", admin],
        ] as const) {
          const unlimited = await api.get(`${path}?order=created_at`, {
            headers,
          })
          expect(unlimited.data.count).toBe(4)
          expect(
            unlimited.data.orders.map(({ id }: { id: string }) => id),
          ).toEqual(visible)
          const pages: string[][] = []
          for (let offset = 0; offset < 5; offset++) {
            const page = await api.get(
              `${path}?order=created_at&limit=1&offset=${offset}`,
              { headers },
            )
            expect(page.data).toMatchObject({ count: 4, limit: 1, offset })
            pages.push(page.data.orders.map(({ id }: { id: string }) => id))
          }
          expect(pages).toEqual([...visible.map((id) => [id]), []])
          const pair = await api.get(
            `${path}?order=-created_at&limit=2&offset=1`,
            { headers },
          )
          expect(pair.data.count).toBe(4)
          expect(pair.data.orders.map(({ id }: { id: string }) => id)).toEqual([
            unreviewed.id,
            legacy.id,
          ])
        }
        // A Customer's own `$and` filter still applies beside the exclusion.
        const filtered = await api.get(
          `/store/orders?$and[0][id][0]=${legacy.id}&$and[0][id][1]=${lastPaid.id}`,
          { headers: customer },
        )
        expect(filtered.data.count).toBe(2)
        expect(
          filtered.data.orders.map(({ id }: { id: string }) => id).sort(),
        ).toEqual([legacy.id, lastPaid.id].sort())
      })

      it("marks Orders placed before #154 once, and an undone marking hides the Order again", async () => {
        const paid = await placePaidOrder(pizzeriaId)
        const orders = getContainer().resolve(Modules.ORDER)
        const markerOf = async () =>
          (await orders.retrieveOrder(paid.id, { select: ["metadata"] }))
            .metadata?.[PLACEMENT_MARKER_KEY]
        const [record] = await operations().listOrderOperations({
          order_id: paid.id,
        })
        // An empty string removes the key; Medusa merges metadata otherwise.
        const unmark = () =>
          orders.updateOrders([
            { id: paid.id, metadata: { [PLACEMENT_MARKER_KEY]: "" } },
          ])
        // As if placed before #154: the record exists, the marker does not.
        await unmark()
        expect(
          (await api.get("/store/orders", { headers: customer })).data.count,
        ).toBe(0)

        for (let run = 0; run < 2; run++)
          await markRecordedPlacementsWorkflow(getContainer()).run({
            input: undefined,
          })
        expect(await markerOf()).toBe(record.id)
        expect(
          (await api.get("/store/orders", { headers: customer })).data.count,
        ).toBe(1)

        // A failed placement's compensation must remove the key again.
        await unmark()
        const { errors } = await markThenFailWorkflow(getContainer()).run({
          input: [{ order_id: paid.id, order_operation_id: record.id }],
          throwOnError: false,
        })
        expect(errors).toHaveLength(1)
        expect(await markerOf()).toBeUndefined()
        expect(
          (await api.get("/store/orders", { headers: customer })).data.count,
        ).toBe(0)

        // A failed run that marked nothing has nothing to undo.
        const empty = await markThenFailWorkflow(getContainer()).run({
          input: [],
          throwOnError: false,
        })
        expect(empty.errors).toHaveLength(1)
        expect(await markerOf()).toBeUndefined()
      })
    })

    describe("purchased kitchen details", () => {
      type Staff = Awaited<ReturnType<typeof signInAsStaffOf>>
      const catalogue = async () => {
        await seedFoodCatalogue({ container: getContainer() })
        const service = getContainer().resolve<FoodCatalogueModuleService>(
          FOOD_CATALOGUE_MODULE,
        )
        const [allergens, details, labels] = await Promise.all([
          service.listAllergens({}, { take: null }),
          service.listAllergenDetails({}, { take: null }),
          service.listFoodLabels({}, { take: null }),
        ])
        return {
          allergen: (number: number) =>
            allergens.find((row) => row.number === number)!,
          detail: (code: string) => details.find((row) => row.code === code)!,
          label: (code: string) => labels.find((row) => row.code === code)!,
          labels,
        }
      }
      const editDish = async (
        staff: Staff,
        restaurantId: string,
        changes: {
          name: { da: string; en: string }
          price?: string
          allergens: Record<string, unknown>
          food_labels: { food_label_id: string; state: string }[]
        },
      ) => {
        const [{ dishes }] = await readPublishedMenu(
          getContainer(),
          restaurantId,
        )
        const dish = dishes[0]
        const response = await api.post(
          `/partner/restaurants/${restaurantId}/dishes/${dish.id}`,
          {
            request_id: `edit-${dish.revision}-${Date.now()}`,
            revision: dish.revision,
            description: null,
            price: changes.price ?? String(dish.price.amount),
            ...changes,
          },
          { headers: staff.headers, validateStatus: () => true },
        )
        expect(response.status).toBe(200)
      }

      /** Gluten (wheat) contained, milk possibly; halal yes, chili no, garlic unknown. */
      const declare = async (
        staff: Staff,
        c: Awaited<ReturnType<typeof catalogue>>,
      ) =>
        editDish(staff, pizzeriaId, {
          name: {
            da: "Pizza med en meget lang dansk ret-betegnelse, der skal kunne læses i køkkenet",
            en: "Pizza with a very long English dish name that the kitchen must still read",
          },
          allergens: {
            status: "supplied",
            contains: [
              {
                allergen_id: c.allergen(1).id,
                detail_ids: [c.detail("wheat").id],
              },
            ],
            may_contain: [{ allergen_id: c.allergen(7).id, detail_ids: [] }],
            none_declared: false,
          },
          food_labels: [
            { food_label_id: c.label("halal").id, state: "yes" },
            { food_label_id: c.label("chili").id, state: "no" },
            { food_label_id: c.label("garlic").id, state: "unknown" },
          ],
        })
      const changeEverything = async (
        staff: Staff,
        c: Awaited<ReturnType<typeof catalogue>>,
      ) =>
        editDish(staff, pizzeriaId, {
          name: { da: "Ny pizza", en: "New pizza" },
          price: "120",
          allergens: {
            status: "supplied",
            contains: [],
            may_contain: [],
            none_declared: true,
          },
          food_labels: c.labels.map(({ id }) => ({
            food_label_id: id,
            state: "no",
          })),
        })
      const purchasedFacts = {
        status: "preserved",
        name: {
          da: "Pizza med en meget lang dansk ret-betegnelse, der skal kunne læses i køkkenet",
          en: "Pizza with a very long English dish name that the kitchen must still read",
        },
        allergens: {
          status: "supplied",
          contains: [
            expect.objectContaining({
              number: 1,
              code: "cereals",
              name: expect.objectContaining({ da: expect.any(String) }),
              details: [expect.objectContaining({ code: "wheat" })],
            }),
          ],
          may_contain: [
            expect.objectContaining({ number: 7, code: "milk", details: [] }),
          ],
          none_declared: false,
        },
        labels: expect.arrayContaining([
          expect.objectContaining({ code: "halal", state: "yes" }),
          expect.objectContaining({ code: "chili", state: "no" }),
          expect.objectContaining({ code: "garlic", state: "unknown" }),
        ]),
      }

      it("keeps the purchased bilingual names and declarations on the ticket after menu edits and removal", async () => {
        const c = await catalogue()
        const staff = await signInAsStaffOf(
          pizzeriaId,
          "mette@pizzeria.example",
        )
        await declare(staff, c)
        const order = await placePaidOrder(pizzeriaId, 2)

        await changeEverything(staff, c)
        await restaurants().updateRestaurants({
          id: pizzeriaId,
          is_active: false,
        })
        const [{ dishes }] = await readPublishedMenu(getContainer(), pizzeriaId)
        const removal = await api.delete(
          `/partner/restaurants/${pizzeriaId}/dishes/${dishes[0].id}`,
          {
            headers: staff.headers,
            data: { revision: dishes[0].revision },
            validateStatus: () => true,
          },
        )
        expect(removal.status).toBe(200)

        const { data } = await detail(staff.headers, order.id)
        expect(data.order.items).toEqual([
          expect.objectContaining({
            quantity: 2,
            unit_price_including_vat: 95,
            total_including_vat: 190,
            purchased: purchasedFacts,
          }),
        ])
        const { data: page } = await queue(staff.headers)
        expect(page.orders[0].items[0].purchased).toEqual(purchasedFacts)
      })

      it("places an interrupted completion from the frozen review, not the menu changed meanwhile", async () => {
        const c = await catalogue()
        const staff = await signInAsStaffOf(
          pizzeriaId,
          "mette@pizzeria.example",
        )
        await declare(staff, c)
        const { cartId } = await reviewedCartOf(pizzeriaId)
        const first = (await complete(cartId)).data.order
        // Payment succeeded, but the process stopped before placement was
        // recorded, so the cart's frozen review was not consumed either.
        const [record] = await operations().listOrderOperations({
          order_id: first.id,
        })
        await operations().deleteOrderOperations(record.id)
        const [review] = await operations().listPurchaseReviews(
          { cart_id: cartId },
          { withDeleted: true },
        )
        await operations().restorePurchaseReviews(review.id)
        await changeEverything(staff, c)

        const retried = (await complete(cartId)).data.order
        expect(retried.id).toBe(first.id)
        const { data } = await detail(staff.headers, first.id)
        expect(data.order.items[0].purchased).toEqual(purchasedFacts)
        // A further retry keeps the placed snapshot.
        await complete(cartId)
        expect(
          (await detail(staff.headers, first.id)).data.order.items[0].purchased,
        ).toEqual(purchasedFacts)
      })

      it("refuses a basket whose price changed after review without freezing its facts", async () => {
        const c = await catalogue()
        const staff = await signInAsStaffOf(
          pizzeriaId,
          "mette@pizzeria.example",
        )
        await declare(staff, c)
        const { cartId } = await reviewedCartOf(pizzeriaId)
        await changeEverything(staff, c)

        const refused = await api.post(
          `/store/carts/${cartId}/complete`,
          {},
          { headers: customer, validateStatus: () => true },
        )
        expect(refused.status).toBe(400)
        expect(refused.data.code).toBe("basket_review_required")
        expect(
          await operations().listPurchaseReviews(
            { cart_id: cartId },
            { withDeleted: true },
          ),
        ).toHaveLength(0)
      })

      it("keeps unknown declarations unknown and distinct from an explicitly empty one", async () => {
        const c = await catalogue()
        const staff = await signInAsStaffOf(
          pizzeriaId,
          "mette@pizzeria.example",
        )
        const unknown = await placePaidOrder(pizzeriaId)
        await changeEverything(staff, c)
        const empty = await placePaidOrder(pizzeriaId)

        const unknownItem = (await detail(staff.headers, unknown.id)).data.order
          .items[0]
        expect(unknownItem.purchased).toMatchObject({
          status: "preserved",
          name: {
            da: "Pizza Margherita (syntetisk)",
            en: "Pizza Margherita (synthetic)",
          },
          allergens: { status: "unknown" },
        })
        expect(
          unknownItem.purchased.labels.map(
            ({ state }: { state: string }) => state,
          ),
        ).toEqual(["unknown", "unknown", "unknown"])
        expect(
          (await detail(staff.headers, empty.id)).data.order.items[0].purchased,
        ).toMatchObject({
          status: "preserved",
          name: { da: "Ny pizza", en: "New pizza" },
          allergens: {
            status: "supplied",
            contains: [],
            may_contain: [],
            none_declared: true,
          },
          labels: [
            expect.objectContaining({ state: "no" }),
            expect.objectContaining({ state: "no" }),
            expect.objectContaining({ state: "no" }),
          ],
        })
      })
    })
  },
})
