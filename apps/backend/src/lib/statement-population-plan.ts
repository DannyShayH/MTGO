import { MedusaError } from "@medusajs/framework/utils"
import {
  copenhagenMidnight,
  copenhagenMonthOf,
} from "../workflows/shared/copenhagen-time"
import { seededRandom } from "./seeded-random"

/**
 * The statement verification population (#235; spec #52 decision 13): 100
 * synthetic Customers and 500 Orders at four Restaurants over three
 * Copenhagen months, with supported delivered and cancellation outcomes,
 * linked late adjustments and recorded participation. Pure and deterministic
 * per anchor month, so the seed creates only missing Orders on a rerun and
 * the expected-results manifest is computed from the same plan.
 */

/** The metadata key on each population Order and Customer. */
export const POPULATION_KEY = "statement_population_235"

/** The operator who cancels accepted Orders, as a Medusa Admin user. */
export const POPULATION_OPERATOR = {
  email: "nadia.operations@example.test",
  first_name: "Nadia",
  last_name: "Kjær",
}

/** The login of a population Restaurant's one staff member. */
export const populationStaffEmail = (restaurant: { slug: string }) =>
  `${restaurant.slug}-staff@example.test`

const MINUTE = 60 * 1000

type Bilingual = { da: string; en: string }
export type DishRole = "main" | "side" | "drink" | "dessert"
export type PopulationDish = {
  handle: string
  role: DishRole
  name: Bilingual
  description?: Bilingual
  /** DKK including VAT, as the menu shows it. */
  price: number
}
export type PopulationCategory = { name: Bilingual; dishes: PopulationDish[] }

/** A recorded participation change: month index (0-2), day and local minute. */
type ParticipationStep = {
  kind: "activated" | "deactivated"
  month: number
  day: number
  minute: number
}

export type PopulationRestaurant = {
  key: "A" | "B" | "C" | "D"
  name: string
  street: string
  postal_code: string
  city: string
  phone: string
  /** Local part of the contact and demo staff email addresses. */
  slug: string
  /** Relative weight of the Orders it receives. */
  weight: number
  created: { month: number; day: number; minute: number }
  participation: ParticipationStep[]
  menu: PopulationCategory[]
}

const dish = (
  handle: string,
  role: DishRole,
  da: string,
  en: string,
  price: number,
  description?: Bilingual,
): PopulationDish => ({
  handle: `population-235-${handle}`,
  role,
  name: { da, en },
  ...(description ? { description } : {}),
  price,
})

/** The four population Restaurants and their bilingual menus. */
export const POPULATION_RESTAURANTS: PopulationRestaurant[] = [
  {
    key: "A",
    name: "Trattoria Sankt Hans",
    street: "Sankt Hans Gade 14",
    postal_code: "2200",
    city: "København N",
    phone: "+45 35 36 21 14",
    slug: "trattoria-sankt-hans",
    weight: 30,
    created: { month: 0, day: 1, minute: 8 * 60 },
    participation: [{ kind: "activated", month: 0, day: 1, minute: 9 * 60 }],
    menu: [
      {
        name: { da: "Pizza", en: "Pizza" },
        dishes: [
          dish(
            "margherita",
            "main",
            "Pizza Margherita",
            "Pizza Margherita",
            95,
            {
              da: "Tomat, fior di latte og frisk basilikum.",
              en: "Tomato, fior di latte and fresh basil.",
            },
          ),
          dish("diavola", "main", "Pizza Diavola", "Pizza Diavola", 115, {
            da: "Tomat, mozzarella, stærk salami og chili.",
            en: "Tomato, mozzarella, spicy salami and chilli.",
          }),
          dish(
            "quattro-formaggi",
            "main",
            "Pizza Quattro Formaggi",
            "Pizza Quattro Formaggi",
            119,
          ),
        ],
      },
      {
        name: { da: "Pasta", en: "Pasta" },
        dishes: [
          dish("lasagne", "main", "Lasagne al forno", "Lasagne al forno", 129),
          dish(
            "carbonara",
            "main",
            "Spaghetti carbonara",
            "Spaghetti carbonara",
            125,
          ),
        ],
      },
      {
        name: { da: "Tilbehør", en: "Sides" },
        dishes: [
          dish(
            "focaccia",
            "side",
            "Focaccia med rosmarin",
            "Rosemary focaccia",
            45,
          ),
          dish("caesar", "side", "Cæsarsalat", "Caesar salad", 79),
        ],
      },
      {
        name: { da: "Drikkevarer og dessert", en: "Drinks and dessert" },
        dishes: [
          dish(
            "pellegrino",
            "drink",
            "Mineralvand med brus",
            "Sparkling water",
            35,
          ),
          dish("tiramisu", "dessert", "Tiramisu", "Tiramisu", 59),
        ],
      },
    ],
  },
  {
    key: "B",
    name: "Phở & Bánh Mì Vesterbro",
    street: "Istedgade 71",
    postal_code: "1650",
    city: "København V",
    phone: "+45 33 22 71 07",
    slug: "pho-banh-mi-vesterbro",
    weight: 27,
    created: { month: 0, day: 1, minute: 8 * 60 + 30 },
    participation: [
      { kind: "activated", month: 0, day: 1, minute: 9 * 60 + 30 },
    ],
    menu: [
      {
        name: { da: "Supper og nudler", en: "Soups and noodles" },
        dishes: [
          dish(
            "pho-bo",
            "main",
            "Phở bò med oksekød",
            "Phở bò with beef",
            119,
            {
              da: "Oksebouillon, risnudler, urter og lime.",
              en: "Beef broth, rice noodles, herbs and lime.",
            },
          ),
          dish(
            "bun-cha",
            "main",
            "Bún chả med grillet svinekød",
            "Bún chả with grilled pork",
            125,
          ),
        ],
      },
      {
        name: { da: "Bánh mì", en: "Bánh mì" },
        dishes: [
          dish(
            "banh-mi-pork",
            "main",
            "Bánh mì med svinekød",
            "Bánh mì with pork",
            79,
          ),
          dish(
            "banh-mi-tofu",
            "main",
            "Bánh mì med tofu",
            "Bánh mì with tofu",
            75,
          ),
        ],
      },
      {
        name: { da: "Småretter", en: "Small plates" },
        dishes: [
          dish(
            "spring-rolls",
            "side",
            "Forårsruller (4 stk.)",
            "Spring rolls (4 pcs)",
            55,
          ),
          dish(
            "mango-salad",
            "side",
            "Grøn mangosalat",
            "Green mango salad",
            65,
          ),
        ],
      },
      {
        name: { da: "Drikkevarer", en: "Drinks" },
        dishes: [
          dish(
            "iced-coffee",
            "drink",
            "Vietnamesisk iskaffe",
            "Vietnamese iced coffee",
            45,
          ),
          dish("lychee-soda", "drink", "Litchisodavand", "Lychee soda", 32),
        ],
      },
    ],
  },
  {
    key: "C",
    name: "Smørrebrød ved Søerne",
    street: "Østerbrogade 52",
    postal_code: "2100",
    city: "København Ø",
    phone: "+45 35 42 52 52",
    slug: "smorrebrod-ved-soerne",
    weight: 20,
    // Joined on the tenth, so its first month's fee is prorated.
    created: { month: 0, day: 9, minute: 14 * 60 },
    participation: [{ kind: "activated", month: 0, day: 10, minute: 10 * 60 }],
    menu: [
      {
        name: { da: "Smørrebrød", en: "Open sandwiches" },
        dishes: [
          dish(
            "egg-shrimp",
            "main",
            "Æg og rejer på rugbrød",
            "Egg and shrimp on rye",
            89,
          ),
          dish(
            "stjerneskud",
            "main",
            "Stjerneskud",
            "Stjerneskud with plaice and shrimp",
            115,
          ),
          dish(
            "roastbeef",
            "main",
            "Roastbeef med remoulade",
            "Roast beef with remoulade",
            85,
          ),
          dish("kartoffelmad", "main", "Kartoffelmad", "Potato on rye", 69),
        ],
      },
      {
        name: { da: "Varme retter", en: "Hot dishes" },
        dishes: [
          dish(
            "frikadeller",
            "main",
            "Frikadeller med kartoffelsalat",
            "Danish meatballs with potato salad",
            129,
          ),
          dish(
            "tartelet",
            "side",
            "Tartelet med høns i asparges",
            "Tartlet with chicken and asparagus",
            75,
          ),
        ],
      },
      {
        name: { da: "Drikkevarer og dessert", en: "Drinks and dessert" },
        dishes: [
          dish(
            "elderflower",
            "drink",
            "Hyldeblomstsaft",
            "Elderflower cordial",
            30,
          ),
          dish(
            "koldskaal",
            "dessert",
            "Koldskål med kammerjunkere",
            "Buttermilk soup with biscuits",
            55,
          ),
        ],
      },
    ],
  },
  {
    key: "D",
    name: "Frederiksberg Curry House",
    street: "Gammel Kongevej 121",
    postal_code: "1850",
    city: "Frederiksberg C",
    phone: "+45 33 21 12 21",
    slug: "frederiksberg-curry-house",
    weight: 23,
    created: { month: 0, day: 1, minute: 8 * 60 + 45 },
    // Deactivated for a kitchen renovation in the second month.
    participation: [
      { kind: "activated", month: 0, day: 1, minute: 10 * 60 },
      { kind: "deactivated", month: 1, day: 12, minute: 15 * 60 },
      { kind: "activated", month: 1, day: 17, minute: 9 * 60 },
    ],
    menu: [
      {
        name: { da: "Karryretter", en: "Curries" },
        dishes: [
          dish(
            "butter-chicken",
            "main",
            "Butter chicken",
            "Butter chicken",
            139,
          ),
          dish("rogan-josh", "main", "Lam rogan josh", "Lamb rogan josh", 149),
          dish("palak-paneer", "main", "Palak paneer", "Palak paneer", 129),
          dish(
            "chana-masala",
            "main",
            "Chana masala med kikærter",
            "Chickpea chana masala",
            115,
          ),
        ],
      },
      {
        name: { da: "Tilbehør", en: "Sides" },
        dishes: [
          dish("garlic-naan", "side", "Hvidløgsnaan", "Garlic naan", 35),
          dish("samosa", "side", "Samosa (2 stk.)", "Samosa (2 pcs)", 49),
        ],
      },
      {
        name: { da: "Drikkevarer og dessert", en: "Drinks and dessert" },
        dishes: [
          dish("mango-lassi", "drink", "Mango lassi", "Mango lassi", 42),
          dish("gulab-jamun", "dessert", "Gulab jamun", "Gulab jamun", 45),
        ],
      },
    ],
  },
]

/** Postal codes every population Restaurant delivers to, with streets. */
export const POPULATION_AREAS: {
  postal_code: string
  city: string
  streets: string[]
}[] = [
  {
    postal_code: "2200",
    city: "København N",
    streets: [
      "Nørrebrogade",
      "Jagtvej",
      "Guldbergsgade",
      "Blågårdsgade",
      "Elmegade",
      "Fælledvej",
    ],
  },
  {
    postal_code: "2100",
    city: "København Ø",
    streets: [
      "Østerbrogade",
      "Classensgade",
      "Nordre Frihavnsgade",
      "Strandboulevarden",
      "Ribegade",
    ],
  },
  {
    postal_code: "1650",
    city: "København V",
    streets: ["Istedgade", "Absalonsgade", "Valdemarsgade", "Saxogade"],
  },
  {
    postal_code: "1850",
    city: "Frederiksberg C",
    streets: ["Gammel Kongevej", "Værnedamsvej", "Svanholmsvej", "Kingosgade"],
  },
  {
    postal_code: "2300",
    city: "København S",
    streets: ["Amagerbrogade", "Holmbladsgade", "Englandsvej", "Øresundsvej"],
  },
  {
    postal_code: "2400",
    city: "København NV",
    streets: ["Frederikssundsvej", "Tagensvej", "Rentemestervej", "Glasvej"],
  },
]

const FIRST_NAMES = [
  "Freja",
  "Mikkel",
  "Ida",
  "Jonas",
  "Sofie",
  "Mads",
  "Emma",
  "Frederik",
  "Clara",
  "Lucas",
  "Laura",
  "Oliver",
  "Anna",
  "William",
  "Karla",
  "Noah",
  "Ella",
  "Magnus",
  "Alma",
  "Emil",
  "Maja",
  "Victor",
  "Josefine",
  "Christian",
  "Mathilde",
  "Rasmus",
  "Cecilie",
  "Søren",
  "Line",
  "Anders",
  "Mette",
  "Henrik",
  "Hanne",
  "Ahmed",
  "Fatima",
  "Ali",
  "Leila",
  "Omar",
  "Mia",
  "Jakob",
  "Astrid",
  "Kasper",
  "Signe",
  "Thomas",
  "Nanna",
  "Martin",
  "Julie",
  "Peter",
]
const LAST_NAMES = [
  "Nielsen",
  "Jensen",
  "Hansen",
  "Pedersen",
  "Andersen",
  "Christensen",
  "Larsen",
  "Sørensen",
  "Rasmussen",
  "Jørgensen",
  "Petersen",
  "Madsen",
  "Kristensen",
  "Olsen",
  "Thomsen",
  "Christiansen",
  "Poulsen",
  "Johansen",
  "Møller",
  "Mortensen",
  "Holm",
  "Dahl",
  "Lund",
  "Bech",
  "Kjær",
  "Frost",
  "Østergaard",
  "Lindberg",
  "Hussain",
  "Yilmaz",
  "Novak",
  "Ali",
]
const FLOORS = [
  "st. tv.",
  "st. th.",
  "1. tv.",
  "1. th.",
  "2. tv.",
  "2. th.",
  "3. mf.",
  "4. tv.",
]
const AGENT_NAMES = [
  "Mikkel Thomsen",
  "Sara Lindberg",
  "Yusuf Demir",
  "Katrine Bech",
  "Jonas Dahl",
]

export type PopulationCustomer = {
  /** Stable identity across runs: `customer-001` ... `customer-100`. */
  key: string
  first_name: string
  last_name: string
  email: string
  phone: string
  address_1: string
  postal_code: string
  city: string
}

export type PopulationOutcome =
  | "delivered"
  /** Delivered in the previous month, recognized only in the current one. */
  | "delivered_late"
  | "customer_cancelled"
  | "restaurant_rejected"
  | "acceptance_timeout"
  | "unassigned_timeout"
  | "operator_cancelled"

/** How many Orders end in each outcome; 500 in total. */
export const OUTCOME_COUNTS: Record<PopulationOutcome, number> = {
  delivered: 430,
  delivered_late: 6,
  customer_cancelled: 18,
  restaurant_rejected: 16,
  acceptance_timeout: 10,
  unassigned_timeout: 8,
  operator_cancelled: 12,
}
/** Orders per month index (oldest first), apart from the late deliveries. */
const MONTH_COUNTS = [205, 229, 60]

export type PopulationTimeline = {
  placed_at: Date
  accepted_at?: Date
  claimed_at?: Date
  preparation_started_at?: Date
  ready_at?: Date
  picked_up_at?: Date
  handed_over_at?: Date
  /** The acceptance or claim deadline that expired, for a timeout. */
  deadline_at?: Date
  cancelled_at?: Date
}

export type PopulationOrder = {
  /** `001` ... `500`, in placement order. */
  slot: string
  restaurant: PopulationRestaurant["key"]
  customer: string
  agent: number
  outcome: PopulationOutcome
  basket: { handle: string; quantity: number }[]
  timeline: PopulationTimeline
  /** The Copenhagen month of the qualifying moment. */
  original_month: string
  /** A staff rejection note or an operator's reason. */
  note?: string
}

export type StatementPopulation = {
  /** The Copenhagen date of the first run, which fixes the plan. */
  anchor_date: string
  anchor_month: string
  /** The three statement months, oldest first; the last is the anchor. */
  months: string[]
  restaurants: {
    key: PopulationRestaurant["key"]
    created_at: Date
    changes: { kind: "activated" | "deactivated"; occurred_at: Date }[]
  }[]
  agents: string[]
  customers: PopulationCustomer[]
  orders: PopulationOrder[]
}

const REJECTION_NOTES = [
  "Vi er løbet tør for dej i aften",
  "Ovnen er gået i stykker",
  "Køkkenet er overbooket lige nu",
  "Vi mangler en ingrediens til retten",
]
const OPERATOR_REASONS = [
  "Restaurant reported a power cut during preparation",
  "Customer's building is closed off by the police; delivery not possible",
  "Restaurant reported a kitchen fire alarm and evacuated",
  "Customer asked support to cancel after a family emergency",
]

/** The month `offset` months after `month`, as `YYYY-MM`. */
export function shiftMonth(month: string, offset: number) {
  const [year, number] = month.split("-").map(Number)
  const index = year * 12 + number - 1 + offset
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`
}

/** Days in a `YYYY-MM` month. */
export const daysIn = (month: string) => {
  const [year, number] = month.split("-").map(Number)
  return new Date(Date.UTC(year, number, 0)).getUTCDate()
}

/** The instant of a Copenhagen wall-clock minute on a day of a month. */
const localAt = (month: string, day: number, minute: number) => {
  const [year, number] = month.split("-").map(Number)
  return new Date(
    copenhagenMidnight(year, number, day).getTime() + minute * MINUTE,
  )
}

const hashOf = (text: string) =>
  [...text].reduce(
    (hash, char) => (Math.imul(hash, 31) + char.charCodeAt(0)) | 0,
    7,
  )

const ascii = (text: string) =>
  text
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")

/** Dates of `month` on which the Restaurant was active all day. */
function wholeActiveDays(
  changes: StatementPopulation["restaurants"][number]["changes"],
  month: string,
) {
  const days: number[] = []
  for (let day = 1; day <= daysIn(month); day++) {
    const start = localAt(month, day, 0)
    const end = localAt(month, day, 24 * 60)
    const before = changes.filter(({ occurred_at }) => occurred_at <= start)
    const isActive = before.at(-1)?.kind === "activated"
    const hasChangeDuring = changes.some(
      ({ occurred_at }) => occurred_at > start && occurred_at < end,
    )
    if (isActive && !hasChangeDuring) days.push(day)
  }
  return days
}

/**
 * Plans the population for `anchor_date` (`YYYY-MM-DD`, the Copenhagen date
 * of the seed's first run), independently of when it is planned again, so a
 * later rerun finds the same Orders. Orders of the anchor month fall on dates
 * before the anchor date, so every history was complete at the first run.
 * Refuses an anchor date on a month's first day, which has no earlier date.
 */
export function planStatementPopulation(input: {
  anchor_date: string
}): StatementPopulation {
  const anchor_month = input.anchor_date.slice(0, 7)
  const random = seededRandom(hashOf(`${POPULATION_KEY}:${anchor_month}`))
  const between = (min: number, max: number) =>
    min + Math.floor(random() * (max - min + 1))
  const pick = <T>(items: readonly T[]) =>
    items[Math.floor(random() * items.length)]
  const shuffle = <T>(items: T[]) => {
    for (let index = items.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1))
      ;[items[index], items[other]] = [items[other], items[index]]
    }
    return items
  }
  const months = [2, 1, 0].map((back) => shiftMonth(anchor_month, -back))

  const restaurants = POPULATION_RESTAURANTS.map((restaurant) => ({
    key: restaurant.key,
    created_at: localAt(
      months[restaurant.created.month],
      restaurant.created.day,
      restaurant.created.minute,
    ),
    changes: restaurant.participation.map((step) => ({
      kind: step.kind,
      occurred_at: localAt(months[step.month], step.day, step.minute),
    })),
  }))

  const anchorDay = Number(input.anchor_date.slice(8, 10))
  const eligible = restaurants.map(({ changes }) =>
    months.map((month, index) =>
      wholeActiveDays(changes, month).filter(
        (day) => index < 2 || day < anchorDay,
      ),
    ),
  )
  if (eligible.some((perMonth) => !perMonth[2].length))
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "statement_population_month_too_young",
    )

  // Customers: unique names, plausible contact details and addresses.
  const names = new Set<string>()
  const emails = new Set<string>()
  const phones = new Set<string>()
  const customers: PopulationCustomer[] = []
  while (customers.length < 100) {
    const first_name = pick(FIRST_NAMES)
    const last_name = pick(LAST_NAMES)
    if (names.has(`${first_name} ${last_name}`)) continue
    names.add(`${first_name} ${last_name}`)
    const first = ascii(first_name)
    const last = ascii(last_name)
    const style = between(0, 3)
    const local = [
      `${first}.${last}`,
      `${first[0]}${last}`,
      `${first}${last}${between(60, 99)}`,
      `${first}.${last[0]}`,
    ][style]
    const email = emails.has(`${local}@example.test`)
      ? `${local}${customers.length}@example.test`
      : `${local}@example.test`
    emails.add(email)
    let phone: string
    do
      phone = `+45${pick(["2", "3", "4", "5", "6", "7", "8"])}${String(between(0, 9999999)).padStart(7, "0")}`
    while (phones.has(phone))
    phones.add(phone)
    const area = pick(POPULATION_AREAS)
    const floor = random() < 0.6 ? `, ${pick(FLOORS)}` : ""
    customers.push({
      key: `customer-${String(customers.length + 1).padStart(3, "0")}`,
      first_name,
      last_name,
      email,
      phone,
      address_1: `${pick(area.streets)} ${between(1, 160)}${floor}`,
      postal_code: area.postal_code,
      city: area.city,
    })
  }

  // Outcomes, then a month for each: late deliveries are the previous month's.
  const regular = shuffle(
    (Object.keys(OUTCOME_COUNTS) as PopulationOutcome[])
      .filter((outcome) => outcome !== "delivered_late")
      .flatMap((outcome) => Array(OUTCOME_COUNTS[outcome]).fill(outcome)),
  )
  const assigned: { outcome: PopulationOutcome; month: number }[] = []
  let cursor = 0
  MONTH_COUNTS.forEach((count, month) => {
    for (const outcome of regular.slice(cursor, cursor + count))
      assigned.push({ outcome, month })
    cursor += count
  })
  for (let index = 0; index < OUTCOME_COUNTS.delivered_late; index++)
    assigned.push({ outcome: "delivered_late", month: 1 })

  const weights = POPULATION_RESTAURANTS.map(({ weight }) => weight)
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
  const restaurantIndex = () => {
    let roll = random() * totalWeight
    return weights.findIndex((weight) => (roll -= weight) < 0)
  }
  const customerOrder = shuffle(customers.map(({ key }) => key))
  const regulars = customerOrder.slice(0, 25)

  const planned = assigned.map(({ outcome, month }, index) => {
    let restaurant = restaurantIndex()
    while (!eligible[restaurant][month].length) restaurant = restaurantIndex()
    const day = pick(eligible[restaurant][month])
    const isLunch = random() < 0.4
    const minute = isLunch
      ? between(11 * 60 + 30, 13 * 60 + 45)
      : between(17 * 60 + 15, 20 * 60 + 45)
    const moment =
      localAt(months[month], day, minute).getTime() + between(0, 59) * 1000
    const timeline = timelineOf(outcome, moment, between)
    const menu = POPULATION_RESTAURANTS[restaurant].menu.flatMap(
      ({ dishes }) => dishes,
    )
    // Each Customer's first Order comes first; later ones favour regulars.
    let customer = customerOrder[index]
    if (index >= 100)
      customer = random() < 0.4 ? pick(regulars) : pick(customerOrder)
    return {
      restaurant: POPULATION_RESTAURANTS[restaurant].key,
      customer,
      agent: between(0, AGENT_NAMES.length - 1),
      outcome,
      basket: basketOf(menu, random, between),
      timeline,
      original_month: copenhagenMonthOf(
        qualifyingMoment({ outcome, timeline }),
      ),
      ...(outcome === "restaurant_rejected"
        ? { note: pick(REJECTION_NOTES) }
        : {}),
      ...(outcome === "operator_cancelled"
        ? { note: pick(OPERATOR_REASONS) }
        : {}),
    }
  })
  // Customers are assigned in shuffled outcome order; place them in time order.
  planned.sort(
    (a, b) => a.timeline.placed_at.getTime() - b.timeline.placed_at.getTime(),
  )
  const orders = planned.map((order, index) => ({
    slot: String(index + 1).padStart(3, "0"),
    ...order,
  }))

  return {
    anchor_date: input.anchor_date,
    anchor_month,
    months,
    restaurants,
    agents: AGENT_NAMES,
    customers,
    orders,
  }
}

/**
 * When finance dates the Order's outcome: the handover, the deadline of a
 * timeout, or otherwise the cancellation.
 */
export function qualifyingMoment({
  outcome,
  timeline,
}: Pick<PopulationOrder, "outcome" | "timeline">) {
  if (timeline.handed_over_at) return timeline.handed_over_at
  if (outcome === "acceptance_timeout" || outcome === "unassigned_timeout")
    return timeline.deadline_at!
  return timeline.cancelled_at!
}

/**
 * The milestones of one Order around its service moment, in the order the
 * real workflows record them. Delivered: the handover is at the moment.
 * Cancelled: the Order is placed at the moment.
 */
function timelineOf(
  outcome: PopulationOutcome,
  moment: number,
  between: (min: number, max: number) => number,
): PopulationTimeline {
  const at = (time: number) => new Date(time)
  const minutes = (min: number, max: number) =>
    between(min * 60, max * 60) * 1000
  if (outcome === "delivered" || outcome === "delivered_late") {
    const handedOver = moment
    const pickedUp = handedOver - minutes(8, 22)
    const ready = pickedUp - minutes(2, 9)
    const preparation = ready - minutes(12, 28)
    const claimed = preparation - minutes(1, 4)
    const accepted = claimed - minutes(1, 3)
    return {
      placed_at: at(accepted - minutes(1, 4)),
      accepted_at: at(accepted),
      claimed_at: at(claimed),
      preparation_started_at: at(preparation),
      ready_at: at(ready),
      picked_up_at: at(pickedUp),
      handed_over_at: at(handedOver),
    }
  }
  const placed = moment
  if (outcome === "customer_cancelled" || outcome === "restaurant_rejected")
    return { placed_at: at(placed), cancelled_at: at(placed + minutes(1, 4)) }
  if (outcome === "acceptance_timeout") {
    const deadline = placed + 5 * 60 * 1000
    return {
      placed_at: at(placed),
      deadline_at: at(deadline),
      cancelled_at: at(deadline + between(15, 55) * 1000),
    }
  }
  const accepted = placed + minutes(1, 4)
  if (outcome === "unassigned_timeout") {
    const deadline = accepted + 30 * 60 * 1000
    return {
      placed_at: at(placed),
      accepted_at: at(accepted),
      preparation_started_at: at(accepted + minutes(2, 6)),
      deadline_at: at(deadline),
      cancelled_at: at(deadline + between(15, 55) * 1000),
    }
  }
  // Operator cancellation after preparation started, sometimes after ready.
  const claimed = accepted + minutes(1, 3)
  const preparation = claimed + minutes(1, 4)
  const ready = between(0, 1) ? preparation + minutes(12, 20) : undefined
  return {
    placed_at: at(placed),
    accepted_at: at(accepted),
    claimed_at: at(claimed),
    preparation_started_at: at(preparation),
    ...(ready ? { ready_at: at(ready) } : {}),
    cancelled_at: at((ready ?? preparation) + minutes(3, 12)),
  }
}

/**
 * A basket: mostly one or two mains with the odd side, drink or dessert, a
 * few family orders and rare office orders large enough to reach the higher
 * commission bands. Repeated dishes merge into one line.
 */
function basketOf(
  menu: PopulationDish[],
  random: () => number,
  between: (min: number, max: number) => number,
) {
  const of = (role: DishRole) =>
    menu.filter((candidate) => candidate.role === role)
  const lines = new Map<string, number>()
  const add = (role: DishRole, quantity: number) => {
    const options = of(role)
    if (!options.length || quantity < 1) return
    const chosen = options[Math.floor(random() * options.length)]
    lines.set(chosen.handle, (lines.get(chosen.handle) ?? 0) + quantity)
  }
  const roll = random()
  if (roll < 0.05) officeBasket(add, between)
  else everydayBasket(add, roll, random, between)
  return [...lines].map(([handle, quantity]) => ({ handle, quantity }))
}

type AddDish = (role: DishRole, quantity: number) => void

/** An office order: several mains of each kind, sides and drinks. */
function officeBasket(
  add: AddDish,
  between: (min: number, max: number) => number,
) {
  for (let main = 0; main < between(3, 4); main++) add("main", between(2, 4))
  add("side", between(2, 4))
  add("drink", between(4, 8))
}

/** One to four mains, now and then with a side, drinks or dessert. */
function everydayBasket(
  add: AddDish,
  roll: number,
  random: () => number,
  between: (min: number, max: number) => number,
) {
  let mains = 1
  if (roll < 0.17) mains = between(3, 4)
  else if (roll < 0.55) mains = 2
  for (let main = 0; main < mains; main++) add("main", 1)
  if (random() < 0.45) add("side", mains > 1 ? between(1, 2) : 1)
  if (random() < 0.6) add("drink", between(1, mains))
  if (random() < 0.25) add("dessert", between(1, 2))
}

/**
 * Maps the times the real workflows recorded, seconds apart, onto the
 * planned history: each recorded milestone lands on its planned time, a time
 * between two milestones keeps its proportion, and one before the first or
 * after the last keeps its distance. A milestone that does not move forward
 * in recorded time is ignored.
 */
export function retimerAlong(anchors: { recorded: Date; planned: Date }[]) {
  const points = anchors
    .map(({ recorded, planned }) => [recorded.getTime(), planned.getTime()])
    .filter(([recorded], index, all) =>
      all.slice(0, index).every(([earlier]) => earlier < recorded),
    )
  return (time: Date) => {
    const recordedAt = time.getTime()
    const after = points.findIndex(([recorded]) => recorded >= recordedAt)
    if (after === 0 || after === -1) {
      const [recorded, planned] = after === 0 ? points[0] : points.at(-1)!
      return new Date(planned + (recordedAt - recorded))
    }
    const [fromRecorded, fromPlanned] = points[after - 1]
    const [toRecorded, toPlanned] = points[after]
    const share = (recordedAt - fromRecorded) / (toRecorded - fromRecorded)
    return new Date(Math.round(fromPlanned + share * (toPlanned - fromPlanned)))
  }
}
