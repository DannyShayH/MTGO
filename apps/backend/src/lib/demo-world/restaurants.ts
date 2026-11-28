/**
 * The demo world's Restaurants (#258): three prime Restaurants the team signs
 * in to and demonstrates, and general Restaurants that supply platform
 * activity. Every name, address and dish reads like a real Copenhagen
 * business; nothing visible says demo or synthetic.
 *
 * A dish's `allergens` lists what it contains, as `code` or
 * `code:detail+detail`, and what it may contain with a leading `~`. An empty
 * list declares no allergens. `labels` names the food labels that apply
 * (chili, garlic, halal); every other label is declared as not applying.
 */

type Bilingual = { da: string; en: string }

export type DemoDishRole = "main" | "side" | "drink" | "dessert"

export type DemoWorldDish = {
  /** Stable within the Restaurant; keys the dish's creation request. */
  key: string
  role: DemoDishRole
  name: Bilingual
  description?: Bilingual
  /** DKK including VAT, as the menu shows it. */
  price: number
  allergens: string[]
  labels?: FoodLabelCode[]
}

export type FoodLabelCode = "chili" | "garlic" | "halal"

export type DemoWorldCategory = {
  key: string
  name: Bilingual
  dishes: DemoWorldDish[]
}

export type DemoWorldRestaurant = {
  /** Stable identity across runs and databases. */
  key: string
  name: string
  cuisine: string
  prime: boolean
  street: string
  postal_code: string
  city: string
  phone: string
  /** Local part of the contact address on the team's domain. */
  contact: string
  /** The staff member the seed signs in as; names are real-looking people. */
  staff: { first_name: string; last_name: string }
  /** Postal codes it delivers to, its own first. */
  delivery_area: string[]
  /**
   * Usual Orders on a weekday; weekends are busier. Prime Restaurants carry
   * the demonstration, the general ones a lighter platform-wide activity, so
   * the whole world seeds in about an hour and a half.
   */
  orders_per_day: number
  /** The usual food rating its Customers give, 1-5. */
  food_quality: number
  /** Opening hours as local minutes; Orders fall inside them. */
  opens: number
  closes: number
  /**
   * Matches an existing Restaurant instead of creating one: the staging id
   * first, then the name.
   */
  existing_id?: string
  menu: DemoWorldCategory[]
}

const HOUR = 60

const dish = (
  key: string,
  role: DemoDishRole,
  da: string,
  en: string,
  price: number,
  allergens: string[],
  extra: {
    description?: [string, string]
    labels?: FoodLabelCode[]
  } = {},
): DemoWorldDish => ({
  key,
  role,
  name: { da, en },
  ...(extra.description
    ? { description: { da: extra.description[0], en: extra.description[1] } }
    : {}),
  price,
  allergens,
  ...(extra.labels ? { labels: extra.labels } : {}),
})

const category = (
  key: string,
  da: string,
  en: string,
  dishes: DemoWorldDish[],
): DemoWorldCategory => ({ key, name: { da, en }, dishes })

const soda = (key: string, da: string, en: string, price = 30) =>
  dish(key, "drink", da, en, price, [])

const GLUTEN = "cereals:wheat"

/** Scarpetta on staging; elsewhere the seed creates it from this definition. */
export const SCARPETTA_STAGING_ID = "res_01M7HP44NHJ9GVPDKQ9ZCME2VA"

export const DEMO_WORLD_RESTAURANTS: DemoWorldRestaurant[] = [
  {
    key: "scarpetta",
    name: "Restaurant Scarpetta",
    cuisine: "italian",
    prime: true,
    street: "Rantzausgade 32",
    postal_code: "2200",
    city: "København N",
    phone: "+45 35 35 08 08",
    contact: "kontakt.scarpetta",
    staff: { first_name: "Giulia", last_name: "Romano" },
    delivery_area: ["2200", "2100", "2400", "1850", "2000"],
    orders_per_day: 10,
    food_quality: 4.5,
    opens: 11 * HOUR,
    closes: 22 * HOUR,
    existing_id: SCARPETTA_STAGING_ID,
    menu: [
      category("starters", "Forretter", "Starters", [
        dish("carpaccio", "side", "Carpaccio", "Carpaccio", 95, ["milk"], {
          description: [
            "Tynde skiver råt oksekød med parmesan, rucola og olivenolie.",
            "Thin slices of raw beef with parmesan, rocket and olive oil.",
          ],
        }),
        dish(
          "burrata",
          "side",
          "Burrata med tomater",
          "Burrata with tomatoes",
          105,
          ["milk"],
          {
            description: [
              "Cremet burrata, modne tomater, basilikum og jomfruolie.",
              "Creamy burrata, ripe tomatoes, basil and extra virgin olive oil.",
            ],
          },
        ),
        dish(
          "vitello-tonnato",
          "side",
          "Vitello tonnato",
          "Vitello tonnato",
          98,
          ["eggs", "fish"],
          {
            description: [
              "Kalvekød i tynde skiver med tunsauce og kapers.",
              "Thinly sliced veal with tuna sauce and capers.",
            ],
          },
        ),
        dish(
          "arancini",
          "side",
          "Arancini",
          "Arancini",
          75,
          [GLUTEN, "milk", "eggs"],
          {
            description: [
              "Sprøde risottokugler med mozzarella.",
              "Crisp risotto balls filled with mozzarella.",
            ],
          },
        ),
        dish(
          "focaccia",
          "side",
          "Focaccia med rosmarin",
          "Rosemary focaccia",
          45,
          [GLUTEN],
          { labels: ["garlic"] },
        ),
      ]),
      category("pizza", "Pizza", "Pizza", [
        dish(
          "pizza-patate",
          "main",
          "Pizza Patate",
          "Pizza Patate",
          105,
          [GLUTEN, "milk"],
          {
            description: [
              "Kartoffel, rosmarin, fior di latte og parmesan.",
              "Potato, rosemary, fior di latte and parmesan.",
            ],
          },
        ),
        dish(
          "pizza-cavolfiore",
          "main",
          "Pizza Cavolfiore med trøffel",
          "Pizza Cavolfiore with truffle",
          135,
          [GLUTEN, "milk"],
          {
            description: [
              "Blomkålscreme, fior di latte, ristet blomkål, pecorino og frisk trøffel.",
              "Cauliflower cream, fior di latte, roasted cauliflower, pecorino and fresh truffle.",
            ],
          },
        ),
        dish(
          "margherita",
          "main",
          "Pizza Margherita",
          "Pizza Margherita",
          95,
          [GLUTEN, "milk"],
          {
            description: [
              "San Marzano-tomat, fior di latte og basilikum.",
              "San Marzano tomato, fior di latte and basil.",
            ],
          },
        ),
        dish(
          "diavola",
          "main",
          "Pizza Diavola",
          "Pizza Diavola",
          115,
          [GLUTEN, "milk"],
          {
            description: [
              "Tomat, fior di latte, stærk salami og chili.",
              "Tomato, fior di latte, spicy salami and chilli.",
            ],
            labels: ["chili"],
          },
        ),
        dish(
          "salsiccia",
          "main",
          "Pizza Salsiccia e friarielli",
          "Pizza Salsiccia e friarielli",
          125,
          [GLUTEN, "milk"],
          {
            description: [
              "Italiensk pølse, friarielli, røget scamorza og hvidløg.",
              "Italian sausage, friarielli, smoked scamorza and garlic.",
            ],
            labels: ["garlic"],
          },
        ),
        dish(
          "prosciutto",
          "main",
          "Pizza Prosciutto e rucola",
          "Pizza Prosciutto e rucola",
          129,
          [GLUTEN, "milk"],
          {
            description: [
              "Tomat, fior di latte, parmaskinke, rucola og parmesan.",
              "Tomato, fior di latte, Parma ham, rocket and parmesan.",
            ],
          },
        ),
      ]),
      category("pasta", "Pasta", "Pasta", [
        dish(
          "kantareller",
          "main",
          "Pasta med kantareller",
          "Pasta with chanterelles",
          145,
          [GLUTEN, "milk", "eggs"],
          {
            description: [
              "Frisk pasta med kantareller, smør, timian og parmesan.",
              "Fresh pasta with chanterelles, butter, thyme and parmesan.",
            ],
          },
        ),
        dish(
          "cacio-e-pepe",
          "main",
          "Cacio e pepe",
          "Cacio e pepe",
          125,
          [GLUTEN, "milk"],
          {
            description: [
              "Tonnarelli med pecorino romano og sort peber.",
              "Tonnarelli with pecorino romano and black pepper.",
            ],
          },
        ),
        dish(
          "amatriciana",
          "main",
          "Rigatoni all'amatriciana",
          "Rigatoni all'amatriciana",
          135,
          [GLUTEN, "milk"],
          {
            description: [
              "Guanciale, tomat, chili og pecorino.",
              "Guanciale, tomato, chilli and pecorino.",
            ],
            labels: ["chili"],
          },
        ),
        dish(
          "ragu",
          "main",
          "Tagliatelle al ragù",
          "Tagliatelle al ragù",
          145,
          [GLUTEN, "eggs", "milk", "celery"],
          {
            description: [
              "Langtidskogt ragù af okse og svin.",
              "Slow-cooked beef and pork ragù.",
            ],
          },
        ),
        dish(
          "vongole",
          "main",
          "Linguine alle vongole",
          "Linguine alle vongole",
          165,
          [GLUTEN, "molluscs"],
          {
            description: [
              "Hjertemuslinger, hvidvin, hvidløg og persille.",
              "Clams, white wine, garlic and parsley.",
            ],
            labels: ["garlic"],
          },
        ),
        dish(
          "gnocchi",
          "main",
          "Gnocchi al pomodoro",
          "Gnocchi al pomodoro",
          125,
          [GLUTEN, "milk", "eggs"],
          {
            description: [
              "Kartoffelgnocchi i tomatsauce med basilikum og mozzarella.",
              "Potato gnocchi in tomato sauce with basil and mozzarella.",
            ],
          },
        ),
      ]),
      category("desserts", "Desserter", "Desserts", [
        dish("tiramisu", "dessert", "Tiramisu", "Tiramisu", 55, [
          GLUTEN,
          "milk",
          "eggs",
        ]),
        dish(
          "panna-cotta",
          "dessert",
          "Panna cotta",
          "Panna cotta",
          55,
          ["milk"],
          {
            description: [
              "Vanilje panna cotta med kompot af bær.",
              "Vanilla panna cotta with berry compote.",
            ],
          },
        ),
        dish(
          "cannoli",
          "dessert",
          "Cannoli siciliani",
          "Sicilian cannoli",
          50,
          [GLUTEN, "milk", "nuts:pistachio"],
        ),
        dish("affogato", "dessert", "Affogato", "Affogato", 45, ["milk"]),
      ]),
      category("drinks", "Drikkevarer", "Drinks", [
        dish("limonade", "drink", "Limonade", "Lemonade", 45, []),
        soda("pellegrino", "San Pellegrino 50 cl", "San Pellegrino 50 cl", 35),
        soda("aranciata", "Aranciata", "Aranciata", 35),
        soda("cola", "Coca-Cola", "Coca-Cola"),
      ]),
      category("wine", "Vin og øl", "Wine and beer", [
        dish("peroni", "drink", "Peroni 33 cl", "Peroni 33 cl", 45, [GLUTEN]),
        dish(
          "chianti",
          "drink",
          "Chianti Classico 75 cl",
          "Chianti Classico 75 cl",
          245,
          ["sulphites"],
        ),
        dish("prosecco", "drink", "Prosecco 75 cl", "Prosecco 75 cl", 225, [
          "sulphites",
        ]),
        dish(
          "montepulciano",
          "drink",
          "Montepulciano d'Abruzzo 75 cl",
          "Montepulciano d'Abruzzo 75 cl",
          195,
          ["sulphites"],
        ),
      ]),
    ],
  },
  {
    key: "mezze-vesterbro",
    name: "Mezze Vesterbro",
    cuisine: "lebanese",
    prime: true,
    street: "Istedgade 74",
    postal_code: "1650",
    city: "København V",
    phone: "+45 33 21 47 90",
    contact: "hej.mezzevesterbro",
    staff: { first_name: "Karim", last_name: "Haddad" },
    delivery_area: ["1650", "1620", "1550", "1700", "1850", "2450"],
    orders_per_day: 9,
    food_quality: 4.3,
    opens: 11 * HOUR + 30,
    closes: 22 * HOUR,
    menu: [
      category("cold-mezze", "Kolde mezze", "Cold mezze", [
        dish("hummus", "side", "Hummus", "Hummus", 59, ["sesame"], {
          description: [
            "Kikærter, tahin, citron og olivenolie.",
            "Chickpeas, tahini, lemon and olive oil.",
          ],
          labels: ["garlic", "halal"],
        }),
        dish(
          "baba-ghanoush",
          "side",
          "Baba ghanoush",
          "Baba ghanoush",
          59,
          ["sesame"],
          { labels: ["garlic", "halal"] },
        ),
        dish("tabbouleh", "side", "Tabbouleh", "Tabbouleh", 55, [GLUTEN], {
          description: [
            "Persille, bulgur, tomat, mynte og citron.",
            "Parsley, bulgur, tomato, mint and lemon.",
          ],
          labels: ["halal"],
        }),
        dish(
          "muhammara",
          "side",
          "Muhammara",
          "Muhammara",
          59,
          [GLUTEN, "nuts:walnut"],
          { labels: ["chili", "halal"] },
        ),
        dish(
          "labneh",
          "side",
          "Labneh med za'atar",
          "Labneh with za'atar",
          55,
          ["milk", "sesame"],
        ),
      ]),
      category("warm-mezze", "Varme mezze", "Warm mezze", [
        dish(
          "falafel",
          "side",
          "Falafel (5 stk.)",
          "Falafel (5 pcs)",
          65,
          ["sesame"],
          { labels: ["garlic", "halal"] },
        ),
        dish("halloumi", "side", "Grillet halloumi", "Grilled halloumi", 75, [
          "milk",
        ]),
        dish(
          "kibbeh",
          "side",
          "Kibbeh (4 stk.)",
          "Kibbeh (4 pcs)",
          79,
          [GLUTEN, "nuts:almond"],
          {
            description: [
              "Bulgurkroketter med lam, løg og pinjekerner.",
              "Bulgur croquettes with lamb, onion and pine nuts.",
            ],
            labels: ["halal"],
          },
        ),
        dish("batata-harra", "side", "Batata harra", "Batata harra", 55, [], {
          description: [
            "Sprøde kartofler med chili, koriander og hvidløg.",
            "Crisp potatoes with chilli, coriander and garlic.",
          ],
          labels: ["chili", "garlic", "halal"],
        }),
        dish("fatayer", "side", "Spinatfatayer", "Spinach fatayer", 59, [
          GLUTEN,
        ]),
      ]),
      category("grill", "Fra grillen", "From the grill", [
        dish(
          "shish-taouk",
          "main",
          "Shish taouk",
          "Shish taouk",
          139,
          ["milk"],
          {
            description: [
              "Marineret kyllingespyd med toum, ris og salat.",
              "Marinated chicken skewers with toum, rice and salad.",
            ],
            labels: ["garlic", "halal"],
          },
        ),
        dish("kafta", "main", "Lamme-kafta", "Lamb kafta", 149, ["sesame"], {
          description: [
            "Grillede lammefrikadeller med tahin, ris og salat.",
            "Grilled lamb kofta with tahini, rice and salad.",
          ],
          labels: ["halal"],
        }),
        dish(
          "mixed-grill",
          "main",
          "Mixed grill for to",
          "Mixed grill for two",
          329,
          ["milk", "sesame"],
          { labels: ["garlic", "halal"] },
        ),
        dish(
          "chicken-shawarma",
          "main",
          "Kyllingeshawarma-tallerken",
          "Chicken shawarma plate",
          129,
          ["milk", "sesame"],
          { labels: ["garlic", "halal"] },
        ),
        dish(
          "falafel-plate",
          "main",
          "Falafeltallerken",
          "Falafel plate",
          119,
          ["sesame"],
          { labels: ["garlic", "halal"] },
        ),
      ]),
      category("wraps", "Wraps", "Wraps", [
        dish(
          "shawarma-wrap",
          "main",
          "Kyllingeshawarma-wrap",
          "Chicken shawarma wrap",
          89,
          [GLUTEN, "milk"],
          { labels: ["garlic", "halal"] },
        ),
        dish(
          "falafel-wrap",
          "main",
          "Falafel-wrap",
          "Falafel wrap",
          79,
          [GLUTEN, "sesame"],
          { labels: ["halal"] },
        ),
        dish("halloumi-wrap", "main", "Halloumi-wrap", "Halloumi wrap", 85, [
          GLUTEN,
          "milk",
        ]),
      ]),
      category("sweets", "Søde sager", "Sweets", [
        dish("baklava", "dessert", "Baklava (4 stk.)", "Baklava (4 pcs)", 49, [
          GLUTEN,
          "nuts:pistachio+walnut",
        ]),
        dish("knafeh", "dessert", "Knafeh", "Knafeh", 65, [GLUTEN, "milk"]),
      ]),
      category("drinks", "Drikkevarer", "Drinks", [
        dish("ayran", "drink", "Ayran", "Ayran", 30, ["milk"]),
        dish(
          "mint-lemonade",
          "drink",
          "Limonade med mynte",
          "Mint lemonade",
          40,
          [],
        ),
        soda("cola", "Coca-Cola", "Coca-Cola"),
        soda("water", "Danskvand", "Sparkling water", 25),
        dish("almaza", "drink", "Almaza 33 cl", "Almaza 33 cl", 45, [GLUTEN]),
      ]),
    ],
  },
  {
    key: "bistro-classen",
    name: "Bistro Classen",
    cuisine: "danish_bistro",
    prime: true,
    street: "Classensgade 21",
    postal_code: "2100",
    city: "København Ø",
    phone: "+45 35 26 19 40",
    contact: "bord.bistroclassen",
    staff: { first_name: "Anne-Sofie", last_name: "Lauridsen" },
    delivery_area: ["2100", "2150", "2200", "2900", "1150"],
    orders_per_day: 8,
    food_quality: 4.2,
    opens: 11 * HOUR,
    closes: 21 * HOUR + 30,
    menu: [
      category("lunch", "Frokost", "Lunch", [
        dish(
          "stjerneskud",
          "main",
          "Stjerneskud",
          "Stjerneskud (fish fillet and shrimp)",
          145,
          [GLUTEN, "fish", "crustaceans", "eggs", "milk"],
        ),
        dish(
          "frikadeller",
          "main",
          "Frikadeller med kartoffelsalat",
          "Danish meatballs with potato salad",
          135,
          [GLUTEN, "eggs", "milk", "mustard"],
        ),
        dish(
          "pariserbof",
          "main",
          "Pariserbøf",
          "Pariserbøf (steak on toast)",
          165,
          [GLUTEN, "eggs", "mustard"],
        ),
        dish(
          "fiskefrikadeller",
          "main",
          "Fiskefrikadeller med remoulade",
          "Fish cakes with remoulade",
          129,
          [GLUTEN, "fish", "eggs", "mustard"],
        ),
        dish(
          "smorrebrod-trio",
          "main",
          "Tre stykker smørrebrød",
          "Three open sandwiches",
          155,
          ["cereals:rye", "eggs", "fish", "milk", "mustard"],
          {
            description: [
              "Dagens udvalg: sild, æg og rejer samt roastbeef.",
              "Today's choice: herring, egg and shrimp, and roast beef.",
            ],
          },
        ),
      ]),
      category("dinner", "Aften", "Dinner", [
        dish(
          "steak-frites",
          "main",
          "Steak frites",
          "Steak frites",
          225,
          ["eggs", "milk"],
          {
            description: [
              "Flanksteak med pommes frites og bearnaise.",
              "Flank steak with French fries and béarnaise.",
            ],
          },
        ),
        dish(
          "moules-frites",
          "main",
          "Moules frites",
          "Moules frites",
          195,
          ["molluscs", "milk", "celery"],
          { labels: ["garlic"] },
        ),
        dish(
          "stegt-flaesk",
          "main",
          "Stegt flæsk med persillesovs",
          "Crispy pork belly with parsley sauce",
          175,
          [GLUTEN, "milk"],
        ),
        dish(
          "kylling",
          "main",
          "Majskylling med ovnkartofler",
          "Corn-fed chicken with roast potatoes",
          189,
          ["milk", "celery"],
          { labels: ["garlic"] },
        ),
        dish(
          "torsk",
          "main",
          "Torsk med sennepssauce",
          "Cod with mustard sauce",
          215,
          ["fish", "milk", "mustard"],
        ),
        dish("risotto", "main", "Svamperisotto", "Mushroom risotto", 165, [
          "milk",
          "celery",
        ]),
      ]),
      category("sides", "Tilbehør", "Sides", [
        dish("pommes", "side", "Pommes frites", "French fries", 45, []),
        dish("salat", "side", "Grøn salat", "Green salad", 45, ["mustard"]),
        dish("bearnaise", "side", "Ekstra bearnaise", "Extra béarnaise", 25, [
          "eggs",
          "milk",
        ]),
      ]),
      category("desserts", "Desserter", "Desserts", [
        dish(
          "koldskal",
          "dessert",
          "Koldskål med kammerjunkere",
          "Buttermilk soup with biscuits",
          65,
          [GLUTEN, "milk", "eggs"],
        ),
        dish("creme-brulee", "dessert", "Crème brûlée", "Crème brûlée", 75, [
          "milk",
          "eggs",
        ]),
        dish(
          "chokoladekage",
          "dessert",
          "Chokoladekage",
          "Chocolate cake",
          65,
          ["eggs", "milk", "~nuts:hazelnut"],
        ),
      ]),
      category("drinks", "Drikkevarer", "Drinks", [
        dish(
          "hyldeblomst",
          "drink",
          "Hyldeblomstsaft",
          "Elderflower cordial",
          35,
          [],
        ),
        soda("cola", "Coca-Cola", "Coca-Cola"),
        soda("faxe", "Faxe Kondi", "Faxe Kondi"),
        dish("pilsner", "drink", "Pilsner 33 cl", "Pilsner 33 cl", 45, [
          "cereals:barley",
        ]),
        dish(
          "rodvin",
          "drink",
          "Husets rødvin 75 cl",
          "House red wine 75 cl",
          225,
          ["sulphites"],
        ),
      ]),
    ],
  },
  general("taqueria-maiz", "Taqueria Maíz", "mexican", {
    street: "Jægersborggade 41",
    postal_code: "2200",
    city: "København N",
    phone: "+45 31 42 77 18",
    contact: "hola.taqueriamaiz",
    staff: { first_name: "Valeria", last_name: "Ortega" },
    delivery_area: ["2200", "2400", "2100"],
    orders_per_day: 1.0,
    food_quality: 4.1,
    opens: 12 * HOUR,
    closes: 21 * HOUR + 30,
    menu: [
      category("tacos", "Tacos", "Tacos", [
        dish(
          "al-pastor",
          "main",
          "Tacos al pastor (3 stk.)",
          "Tacos al pastor (3 pcs)",
          115,
          [],
          {
            labels: ["chili", "garlic"],
          },
        ),
        dish(
          "carnitas",
          "main",
          "Tacos de carnitas (3 stk.)",
          "Carnitas tacos (3 pcs)",
          115,
          [],
          {
            labels: ["garlic"],
          },
        ),
        dish(
          "baja-fish",
          "main",
          "Baja fisketacos (3 stk.)",
          "Baja fish tacos (3 pcs)",
          125,
          [GLUTEN, "fish", "eggs"],
        ),
        dish(
          "hongos",
          "main",
          "Svampetacos (3 stk.)",
          "Mushroom tacos (3 pcs)",
          105,
          ["milk"],
        ),
      ]),
      category("more", "Burritos og bowls", "Burritos and bowls", [
        dish(
          "burrito",
          "main",
          "Burrito med oksekød",
          "Beef burrito",
          129,
          [GLUTEN, "milk"],
          { labels: ["chili"] },
        ),
        dish(
          "bowl",
          "main",
          "Burrito bowl med kylling",
          "Chicken burrito bowl",
          125,
          ["milk"],
        ),
        dish("quesadilla", "main", "Quesadilla", "Quesadilla", 99, [
          GLUTEN,
          "milk",
        ]),
      ]),
      category("sides", "Tilbehør", "Sides", [
        dish(
          "guacamole",
          "side",
          "Guacamole med chips",
          "Guacamole and chips",
          59,
          [],
          { labels: ["chili"] },
        ),
        dish(
          "elote",
          "side",
          "Elote",
          "Elote (grilled corn)",
          45,
          ["milk", "eggs"],
          { labels: ["chili"] },
        ),
      ]),
      category("drinks", "Drikkevarer", "Drinks", [
        dish("horchata", "drink", "Horchata", "Horchata", 39, ["milk"]),
        dish("jarritos", "drink", "Jarritos", "Jarritos", 35, []),
        dish("corona", "drink", "Corona 33 cl", "Corona 33 cl", 45, [GLUTEN]),
      ]),
      category("sweet", "Dessert", "Dessert", [
        dish(
          "churros",
          "dessert",
          "Churros med chokolade",
          "Churros with chocolate",
          55,
          [GLUTEN, "milk", "eggs"],
        ),
      ]),
    ],
  }),
  general("ramen-koji", "Ramen Koji", "japanese_ramen", {
    street: "Vesterbrogade 102",
    postal_code: "1620",
    city: "København V",
    phone: "+45 33 31 60 25",
    contact: "info.ramenkoji",
    staff: { first_name: "Haruto", last_name: "Sato" },
    delivery_area: ["1620", "1650", "1550", "1850"],
    orders_per_day: 1.1,
    food_quality: 4.4,
    opens: 11 * HOUR + 30,
    closes: 22 * HOUR,
    menu: [
      category("ramen", "Ramen", "Ramen", [
        dish(
          "tonkotsu",
          "main",
          "Tonkotsu ramen",
          "Tonkotsu ramen",
          149,
          [GLUTEN, "eggs", "soybeans", "sesame"],
          { labels: ["garlic"] },
        ),
        dish("shoyu", "main", "Shoyu ramen", "Shoyu ramen", 139, [
          GLUTEN,
          "eggs",
          "soybeans",
        ]),
        dish("miso", "main", "Miso ramen", "Miso ramen", 145, [
          GLUTEN,
          "eggs",
          "soybeans",
          "sesame",
        ]),
        dish(
          "tantanmen",
          "main",
          "Tantanmen",
          "Tantanmen",
          155,
          [GLUTEN, "soybeans", "sesame", "peanuts"],
          { labels: ["chili"] },
        ),
        dish("veggie", "main", "Vegansk shio ramen", "Vegan shio ramen", 135, [
          GLUTEN,
          "soybeans",
        ]),
      ]),
      category("small", "Små retter", "Small plates", [
        dish(
          "gyoza",
          "side",
          "Gyoza (6 stk.)",
          "Gyoza (6 pcs)",
          65,
          [GLUTEN, "soybeans", "sesame"],
          { labels: ["garlic"] },
        ),
        dish("karaage", "side", "Karaage", "Karaage", 69, [
          GLUTEN,
          "soybeans",
          "eggs",
        ]),
        dish("edamame", "side", "Edamame", "Edamame", 39, ["soybeans"]),
        dish("ajitama", "side", "Ekstra ajitama-æg", "Extra ajitama egg", 15, [
          "eggs",
          "soybeans",
        ]),
      ]),
      category("drinks", "Drikkevarer", "Drinks", [
        dish("ramune", "drink", "Ramune", "Ramune", 35, []),
        dish(
          "green-tea",
          "drink",
          "Iste med grøn te",
          "Green iced tea",
          35,
          [],
        ),
        dish("asahi", "drink", "Asahi 33 cl", "Asahi 33 cl", 45, [GLUTEN]),
      ]),
    ],
  }),
  general("seoul-kitchen", "Seoul Kitchen Amager", "korean", {
    street: "Amagerbrogade 158",
    postal_code: "2300",
    city: "København S",
    phone: "+45 32 57 84 03",
    contact: "hello.seoulkitchen",
    staff: { first_name: "Ji-woo", last_name: "Park" },
    delivery_area: ["2300", "1401", "2450"],
    orders_per_day: 0.85,
    food_quality: 4.0,
    opens: 12 * HOUR,
    closes: 21 * HOUR + 30,
    menu: [
      category("mains", "Hovedretter", "Mains", [
        dish(
          "bibimbap",
          "main",
          "Bibimbap med oksekød",
          "Beef bibimbap",
          135,
          ["eggs", "soybeans", "sesame"],
          { labels: ["chili", "garlic"] },
        ),
        dish(
          "bulgogi",
          "main",
          "Bulgogi med ris",
          "Bulgogi with rice",
          145,
          ["soybeans", "sesame"],
          { labels: ["garlic"] },
        ),
        dish(
          "kfc",
          "main",
          "Koreansk friturestegt kylling",
          "Korean fried chicken",
          139,
          [GLUTEN, "soybeans", "sesame"],
          { labels: ["chili", "garlic"] },
        ),
        dish("japchae", "main", "Japchae", "Japchae", 125, [
          "soybeans",
          "sesame",
        ]),
        dish("tofu-bowl", "main", "Sprød tofu-bowl", "Crispy tofu bowl", 119, [
          "soybeans",
          "sesame",
        ]),
      ]),
      category("sides", "Tilbehør", "Sides", [
        dish("kimchi", "side", "Kimchi", "Kimchi", 35, ["crustaceans"], {
          labels: ["chili", "garlic"],
        }),
        dish("mandu", "side", "Mandu (6 stk.)", "Mandu (6 pcs)", 65, [
          GLUTEN,
          "soybeans",
        ]),
        dish(
          "tteokbokki",
          "side",
          "Tteokbokki",
          "Tteokbokki",
          69,
          [GLUTEN, "fish"],
          { labels: ["chili"] },
        ),
      ]),
      category("drinks", "Drikkevarer", "Drinks", [
        dish("milkis", "drink", "Milkis", "Milkis", 32, ["milk"]),
        soda("cola", "Coca-Cola", "Coca-Cola"),
        dish("soju", "drink", "Soju 36 cl", "Soju 36 cl", 95, []),
      ]),
    ],
  }),
  general("shuk-falafel", "Shuk Falafel", "middle_eastern_street_food", {
    street: "Blågårdsgade 9",
    postal_code: "2200",
    city: "København N",
    phone: "+45 28 19 64 50",
    contact: "shuk.falafel",
    staff: { first_name: "Noa", last_name: "Ben-David" },
    delivery_area: ["2200", "1360", "2100"],
    orders_per_day: 1.0,
    food_quality: 4.3,
    opens: 11 * HOUR,
    closes: 21 * HOUR,
    menu: [
      category("pita", "Pita", "Pita", [
        dish(
          "falafel-pita",
          "main",
          "Falafel i pita",
          "Falafel in pita",
          75,
          [GLUTEN, "sesame"],
          { labels: ["halal"] },
        ),
        dish("sabich", "main", "Sabich", "Sabich", 79, [
          GLUTEN,
          "eggs",
          "sesame",
        ]),
        dish(
          "shawarma-pita",
          "main",
          "Kyllingeshawarma i pita",
          "Chicken shawarma in pita",
          89,
          [GLUTEN, "sesame"],
          { labels: ["garlic", "halal"] },
        ),
      ]),
      category("plates", "Tallerkener", "Plates", [
        dish(
          "falafel-plate",
          "main",
          "Falafeltallerken med hummus",
          "Falafel plate with hummus",
          115,
          ["sesame"],
          { labels: ["halal"] },
        ),
        dish(
          "shakshuka",
          "main",
          "Shakshuka",
          "Shakshuka",
          109,
          [GLUTEN, "eggs"],
          { labels: ["chili", "garlic"] },
        ),
      ]),
      category("sides", "Tilbehør", "Sides", [
        dish(
          "hummus",
          "side",
          "Hummus med pita",
          "Hummus with pita",
          55,
          [GLUTEN, "sesame"],
          { labels: ["garlic"] },
        ),
        dish("fries", "side", "Pommes med amba", "Fries with amba", 45, [
          "mustard",
        ]),
      ]),
      category("drinks", "Drikkevarer", "Drinks", [
        dish("lemonana", "drink", "Limonana", "Limonana", 35, []),
        dish("malabi", "dessert", "Malabi", "Malabi", 45, [
          "milk",
          "nuts:pistachio",
        ]),
        soda("cola", "Coca-Cola", "Coca-Cola"),
      ]),
    ],
  }),
  general("athena-taverna", "Athena Taverna", "greek", {
    street: "Østerbrogade 128",
    postal_code: "2100",
    city: "København Ø",
    phone: "+45 35 43 12 87",
    contact: "kalimera.athenataverna",
    staff: { first_name: "Eleni", last_name: "Papadopoulos" },
    delivery_area: ["2100", "2150", "2900"],
    orders_per_day: 0.8,
    food_quality: 3.9,
    opens: 16 * HOUR,
    closes: 22 * HOUR,
    menu: [
      category("meze", "Meze", "Meze", [
        dish(
          "tzatziki",
          "side",
          "Tzatziki med pita",
          "Tzatziki with pita",
          55,
          [GLUTEN, "milk"],
          { labels: ["garlic"] },
        ),
        dish("spanakopita", "side", "Spanakopita", "Spanakopita", 69, [
          GLUTEN,
          "milk",
          "eggs",
        ]),
        dish("dolmades", "side", "Dolmades", "Dolmades", 59, []),
      ]),
      category("mains", "Hovedretter", "Mains", [
        dish("moussaka", "main", "Moussaka", "Moussaka", 165, [
          GLUTEN,
          "milk",
          "eggs",
        ]),
        dish(
          "souvlaki",
          "main",
          "Svinesouvlaki med pommes",
          "Pork souvlaki with fries",
          155,
          ["milk"],
          { labels: ["garlic"] },
        ),
        dish(
          "gyros",
          "main",
          "Gyros-tallerken",
          "Gyros plate",
          149,
          [GLUTEN, "milk"],
          { labels: ["garlic"] },
        ),
        dish(
          "kleftiko",
          "main",
          "Lammekleftiko",
          "Lamb kleftiko",
          195,
          ["celery"],
          { labels: ["garlic"] },
        ),
        dish("horiatiki", "main", "Græsk salat", "Greek salad", 115, ["milk"]),
      ]),
      category("desserts", "Desserter", "Desserts", [
        dish("baklava", "dessert", "Baklava", "Baklava", 49, [
          GLUTEN,
          "nuts:walnut",
        ]),
        dish(
          "yoghurt",
          "dessert",
          "Græsk yoghurt med honning",
          "Greek yoghurt with honey",
          45,
          ["milk", "nuts:walnut"],
        ),
      ]),
      category("drinks", "Drikkevarer", "Drinks", [
        dish("mythos", "drink", "Mythos 33 cl", "Mythos 33 cl", 45, [GLUTEN]),
        dish("retsina", "drink", "Retsina 50 cl", "Retsina 50 cl", 145, [
          "sulphites",
        ]),
        soda("cola", "Coca-Cola", "Coca-Cola"),
      ]),
    ],
  }),
  general("addis-cafe", "Addis Café", "ethiopian", {
    street: "Frederikssundsvej 54",
    postal_code: "2400",
    city: "København NV",
    phone: "+45 22 63 91 07",
    contact: "addis.cafe",
    staff: { first_name: "Selam", last_name: "Tesfaye" },
    delivery_area: ["2400", "2200", "2000"],
    orders_per_day: 0.5,
    food_quality: 4.5,
    opens: 15 * HOUR,
    closes: 21 * HOUR + 30,
    menu: [
      category("mains", "Hovedretter", "Mains", [
        dish(
          "doro-wat",
          "main",
          "Doro wat",
          "Doro wat",
          155,
          ["eggs", "cereals:barley"],
          { labels: ["chili", "garlic", "halal"] },
        ),
        dish("tibs", "main", "Bøf tibs", "Beef tibs", 165, ["cereals:barley"], {
          labels: ["chili", "halal"],
        }),
        dish(
          "misir",
          "main",
          "Misir wat",
          "Misir wat (red lentils)",
          125,
          ["cereals:barley"],
          { labels: ["chili", "garlic"] },
        ),
        dish(
          "veggie-combo",
          "main",
          "Vegetarisk platte",
          "Vegetarian platter",
          145,
          ["cereals:barley"],
          { labels: ["garlic"] },
        ),
        dish(
          "for-two",
          "main",
          "Familieplatte for to",
          "Family platter for two",
          315,
          ["eggs", "cereals:barley"],
          { labels: ["chili", "garlic", "halal"] },
        ),
      ]),
      category("sides", "Tilbehør", "Sides", [
        dish("injera", "side", "Ekstra injera", "Extra injera", 20, [
          "cereals:barley",
        ]),
        dish(
          "sambusa",
          "side",
          "Sambusa (3 stk.)",
          "Sambusa (3 pcs)",
          49,
          [GLUTEN],
          { labels: ["chili"] },
        ),
      ]),
      category("drinks", "Drikkevarer", "Drinks", [
        dish("spris", "drink", "Spris-juice", "Spris juice", 39, []),
        dish("coffee", "drink", "Etiopisk kaffe", "Ethiopian coffee", 35, []),
        dish(
          "shiro",
          "main",
          "Shiro",
          "Shiro (chickpea stew)",
          129,
          ["cereals:barley"],
          { labels: ["garlic"] },
        ),
      ]),
    ],
  }),
  general("aloha-bowl", "Aloha Bowl Christianshavn", "poke", {
    street: "Torvegade 47",
    postal_code: "1401",
    city: "København K",
    phone: "+45 31 77 20 54",
    contact: "aloha.christianshavn",
    staff: { first_name: "Maja", last_name: "Søgaard" },
    delivery_area: ["1401", "1360", "1150", "2300"],
    orders_per_day: 0.85,
    food_quality: 3.8,
    opens: 11 * HOUR,
    closes: 20 * HOUR + 30,
    menu: [
      category("bowls", "Bowls", "Bowls", [
        dish("salmon", "main", "Laks og avocado", "Salmon and avocado", 119, [
          "fish",
          "soybeans",
          "sesame",
        ]),
        dish(
          "tuna",
          "main",
          "Spicy tun",
          "Spicy tuna",
          129,
          ["fish", "soybeans", "sesame", "eggs"],
          { labels: ["chili"] },
        ),
        dish("chicken", "main", "Teriyaki kylling", "Teriyaki chicken", 115, [
          "soybeans",
          "sesame",
          GLUTEN,
        ]),
        dish("tofu", "main", "Tofu og mango", "Tofu and mango", 109, [
          "soybeans",
          "sesame",
        ]),
        dish("shrimp", "main", "Rejer og edamame", "Shrimp and edamame", 125, [
          "crustaceans",
          "soybeans",
        ]),
      ]),
      category("extras", "Ekstra", "Extras", [
        dish("seaweed", "side", "Tangsalat", "Seaweed salad", 35, [
          "sesame",
          "soybeans",
        ]),
        dish("miso-soup", "side", "Misosuppe", "Miso soup", 29, [
          "soybeans",
          "fish",
        ]),
      ]),
      category("drinks", "Drikkevarer", "Drinks", [
        dish("kombucha", "drink", "Kombucha", "Kombucha", 39, []),
        dish("coconut", "drink", "Kokosvand", "Coconut water", 35, []),
        dish(
          "mochi",
          "dessert",
          "Mochi-is (3 stk.)",
          "Mochi ice cream (3 pcs)",
          49,
          ["milk"],
        ),
      ]),
    ],
  }),
  general("golden-lotus", "Golden Lotus Dim Sum", "cantonese", {
    street: "Gammel Kongevej 33",
    postal_code: "1550",
    city: "København V",
    phone: "+45 33 25 88 61",
    contact: "golden.lotus",
    staff: { first_name: "Mei", last_name: "Chen" },
    delivery_area: ["1550", "1620", "1850", "1360"],
    orders_per_day: 1.0,
    food_quality: 4.2,
    opens: 12 * HOUR,
    closes: 22 * HOUR,
    menu: [
      category("dim-sum", "Dim sum", "Dim sum", [
        dish("har-gow", "side", "Har gow (4 stk.)", "Har gow (4 pcs)", 59, [
          GLUTEN,
          "crustaceans",
        ]),
        dish("siu-mai", "side", "Siu mai (4 stk.)", "Siu mai (4 pcs)", 59, [
          GLUTEN,
          "crustaceans",
          "soybeans",
        ]),
        dish(
          "char-siu-bao",
          "side",
          "Char siu bao (3 stk.)",
          "Char siu bao (3 pcs)",
          55,
          [GLUTEN, "soybeans", "sesame"],
        ),
        dish(
          "spring-rolls",
          "side",
          "Forårsruller (4 stk.)",
          "Spring rolls (4 pcs)",
          49,
          [GLUTEN, "soybeans"],
        ),
      ]),
      category("mains", "Hovedretter", "Mains", [
        dish(
          "roast-duck",
          "main",
          "Sprød and med ris",
          "Roast duck with rice",
          159,
          ["soybeans", GLUTEN],
        ),
        dish(
          "char-siu",
          "main",
          "Char siu med ris",
          "Char siu with rice",
          139,
          ["soybeans", "sesame", GLUTEN],
        ),
        dish("mapo-tofu", "main", "Mapo tofu", "Mapo tofu", 129, ["soybeans"], {
          labels: ["chili", "garlic"],
        }),
        dish(
          "chow-mein",
          "main",
          "Chow mein med kylling",
          "Chicken chow mein",
          129,
          [GLUTEN, "eggs", "soybeans"],
        ),
        dish(
          "fried-rice",
          "main",
          "Stegte ris med rejer",
          "Shrimp fried rice",
          125,
          ["eggs", "crustaceans", "soybeans"],
        ),
      ]),
      category("drinks", "Drikkevarer", "Drinks", [
        dish("jasmine", "drink", "Jasminte", "Jasmine tea", 29, []),
        dish("tsingtao", "drink", "Tsingtao 33 cl", "Tsingtao 33 cl", 45, [
          GLUTEN,
        ]),
        soda("cola", "Coca-Cola", "Coca-Cola"),
      ]),
    ],
  }),
  general("khachapuri-house", "Khachapuri House", "georgian", {
    street: "Falkoner Allé 88",
    postal_code: "2000",
    city: "Frederiksberg",
    phone: "+45 38 34 50 72",
    contact: "gamarjoba.khachapurihouse",
    staff: { first_name: "Nino", last_name: "Beridze" },
    delivery_area: ["2000", "1850", "1870", "2400"],
    orders_per_day: 0.6,
    food_quality: 4.4,
    opens: 12 * HOUR,
    closes: 21 * HOUR,
    menu: [
      category("bread", "Khachapuri", "Khachapuri", [
        dish(
          "adjaruli",
          "main",
          "Adjaruli khachapuri",
          "Adjarian khachapuri",
          125,
          [GLUTEN, "milk", "eggs"],
        ),
        dish(
          "imeruli",
          "main",
          "Imeruli khachapuri",
          "Imeretian khachapuri",
          115,
          [GLUTEN, "milk", "eggs"],
        ),
        dish("lobiani", "main", "Lobiani", "Lobiani (bean bread)", 99, [
          GLUTEN,
        ]),
      ]),
      category("mains", "Hovedretter", "Mains", [
        dish(
          "khinkali",
          "main",
          "Khinkali (6 stk.)",
          "Khinkali (6 pcs)",
          129,
          [GLUTEN],
          { labels: ["garlic"] },
        ),
        dish("mtsvadi", "main", "Mtsvadi", "Mtsvadi (pork skewers)", 165, [], {
          labels: ["garlic"],
        }),
        dish("pkhali", "side", "Pkhali", "Pkhali", 65, ["nuts:walnut"], {
          labels: ["garlic"],
        }),
      ]),
      category("drinks", "Drikkevarer", "Drinks", [
        dish(
          "tarkhuna",
          "drink",
          "Tarkhuna",
          "Tarkhuna (tarragon soda)",
          35,
          [],
        ),
        dish("borjomi", "drink", "Borjomi", "Borjomi mineral water", 30, []),
        dish(
          "ajapsandali",
          "main",
          "Ajapsandali",
          "Ajapsandali (vegetable stew)",
          119,
          [],
          { labels: ["garlic"] },
        ),
        dish("churchkhela", "dessert", "Churchkhela", "Churchkhela", 39, [
          "nuts:walnut",
        ]),
        dish("saperavi", "drink", "Saperavi 75 cl", "Saperavi 75 cl", 265, [
          "sulphites",
        ]),
      ]),
    ],
  }),
  general("gront-og-godt", "Grønt & Godt", "plant_based", {
    street: "Elmegade 18",
    postal_code: "2200",
    city: "København N",
    phone: "+45 42 18 37 66",
    contact: "hej.grontoggodt",
    staff: { first_name: "Ida", last_name: "Holmgaard" },
    delivery_area: ["2200", "2100", "1360"],
    orders_per_day: 0.7,
    food_quality: 4.0,
    opens: 10 * HOUR + 30,
    closes: 20 * HOUR,
    menu: [
      category("bowls", "Bowls", "Bowls", [
        dish("buddha", "main", "Buddha bowl", "Buddha bowl", 115, [
          "sesame",
          "soybeans",
        ]),
        dish(
          "lentil",
          "main",
          "Dal med brune ris",
          "Dal with brown rice",
          105,
          [],
          { labels: ["garlic"] },
        ),
        dish(
          "quinoa",
          "main",
          "Quinoasalat med græskar",
          "Quinoa salad with pumpkin",
          109,
          ["nuts:almond"],
        ),
      ]),
      category("burgers", "Burgere", "Burgers", [
        dish("beet-burger", "main", "Rødbedeburger", "Beetroot burger", 125, [
          GLUTEN,
          "mustard",
          "soybeans",
        ]),
        dish(
          "bbq-jackfruit",
          "main",
          "BBQ-jackfruit burger",
          "BBQ jackfruit burger",
          129,
          [GLUTEN, "mustard"],
        ),
      ]),
      category("sides", "Tilbehør", "Sides", [
        dish(
          "sweet-fries",
          "side",
          "Søde kartoffelfritter",
          "Sweet potato fries",
          45,
          [],
        ),
        dish("hummus", "side", "Rødbedehummus", "Beetroot hummus", 45, [
          "sesame",
        ]),
      ]),
      category("drinks", "Drikkevarer", "Drinks", [
        dish("smoothie", "drink", "Grøn smoothie", "Green smoothie", 49, []),
        dish("ginger-shot", "drink", "Ingefærshot", "Ginger shot", 25, []),
      ]),
      category("sweet", "Søde sager", "Sweets", [
        dish("raw-cake", "dessert", "Raw cake med lime", "Lime raw cake", 45, [
          "nuts:cashew",
        ]),
      ]),
    ],
  }),
  general("ceviche-lima", "Ceviche Lima", "peruvian", {
    street: "Store Kongensgade 66",
    postal_code: "1360",
    city: "København K",
    phone: "+45 33 13 44 29",
    contact: "reservas.cevichelima",
    staff: { first_name: "Camila", last_name: "Quispe" },
    delivery_area: ["1360", "1150", "1123", "2100"],
    orders_per_day: 0.5,
    food_quality: 4.6,
    opens: 17 * HOUR,
    closes: 22 * HOUR,
    menu: [
      category("cold", "Kolde retter", "Cold dishes", [
        dish(
          "ceviche",
          "main",
          "Klassisk ceviche",
          "Classic ceviche",
          155,
          ["fish"],
          { labels: ["chili"] },
        ),
        dish(
          "tiradito",
          "main",
          "Tiradito med ají amarillo",
          "Tiradito with ají amarillo",
          165,
          ["fish"],
          { labels: ["chili"] },
        ),
      ]),
      category("warm", "Varme retter", "Warm dishes", [
        dish(
          "lomo-saltado",
          "main",
          "Lomo saltado",
          "Lomo saltado",
          195,
          ["soybeans"],
          { labels: ["garlic"] },
        ),
        dish(
          "aji-de-gallina",
          "main",
          "Ají de gallina",
          "Ají de gallina",
          169,
          ["milk", "nuts:walnut", GLUTEN],
          { labels: ["chili"] },
        ),
        dish(
          "pollo",
          "main",
          "Pollo a la brasa",
          "Pollo a la brasa",
          175,
          ["mustard"],
          { labels: ["garlic"] },
        ),
      ]),
      category("sides", "Tilbehør", "Sides", [
        dish("yuca", "side", "Yucafritter", "Yuca fries", 49, ["eggs"]),
        dish(
          "choclo",
          "side",
          "Choclo med queso fresco",
          "Choclo with queso fresco",
          45,
          ["milk"],
        ),
      ]),
      category("drinks", "Drikkevarer", "Drinks", [
        dish("chicha", "drink", "Chicha morada", "Chicha morada", 39, []),
        dish("inca-kola", "drink", "Inca Kola", "Inca Kola", 35, []),
        dish("pisco-sour", "drink", "Pisco sour", "Pisco sour", 95, ["eggs"]),
      ]),
    ],
  }),
  general("smokehouse-sydhavn", "Smokehouse Sydhavn", "american_bbq", {
    street: "Mozarts Plads 4",
    postal_code: "2450",
    city: "København SV",
    phone: "+45 36 46 71 15",
    contact: "pit.smokehouse",
    staff: { first_name: "Rasmus", last_name: "Kragh" },
    delivery_area: ["2450", "2500", "1700", "2300"],
    orders_per_day: 0.8,
    food_quality: 4.1,
    opens: 15 * HOUR,
    closes: 22 * HOUR,
    menu: [
      category("smoked", "Fra røgeriet", "From the smoker", [
        dish(
          "brisket",
          "main",
          "Oksebryst med coleslaw",
          "Brisket with coleslaw",
          189,
          ["mustard", "eggs"],
        ),
        dish(
          "pulled-pork",
          "main",
          "Pulled pork burger",
          "Pulled pork burger",
          149,
          [GLUTEN, "mustard", "eggs"],
        ),
        dish(
          "ribs",
          "main",
          "Spareribs (halv rack)",
          "Spare ribs (half rack)",
          195,
          ["mustard", "celery"],
          { labels: ["garlic"] },
        ),
        dish(
          "wings",
          "main",
          "Røgede kyllingevinger",
          "Smoked chicken wings",
          135,
          ["mustard"],
          { labels: ["chili"] },
        ),
      ]),
      category("sides", "Tilbehør", "Sides", [
        dish("mac", "side", "Mac and cheese", "Mac and cheese", 55, [
          GLUTEN,
          "milk",
        ]),
        dish("cornbread", "side", "Majsbrød", "Cornbread", 39, [
          GLUTEN,
          "milk",
          "eggs",
        ]),
        dish("beans", "side", "Baked beans", "Baked beans", 39, ["mustard"]),
      ]),
      category("drinks", "Drikkevarer", "Drinks", [
        dish("ipa", "drink", "IPA 33 cl", "IPA 33 cl", 55, ["cereals:barley"]),
        dish("root-beer", "drink", "Root beer", "Root beer", 35, []),
        soda("cola", "Coca-Cola", "Coca-Cola"),
      ]),
      category("sweet", "Dessert", "Dessert", [
        dish("pecan-pie", "dessert", "Pecan pie", "Pecan pie", 59, [
          GLUTEN,
          "eggs",
          "milk",
          "nuts:pecan",
        ]),
      ]),
    ],
  }),
  general("shiraz-grill", "Shiraz Grill", "persian", {
    street: "Tagensvej 136",
    postal_code: "2400",
    city: "København NV",
    phone: "+45 35 82 93 40",
    contact: "salam.shirazgrill",
    staff: { first_name: "Dariush", last_name: "Rahimi" },
    delivery_area: ["2400", "2200", "2860"],
    orders_per_day: 0.7,
    food_quality: 4.3,
    opens: 14 * HOUR,
    closes: 22 * HOUR,
    menu: [
      category("kebab", "Kebab", "Kebab", [
        dish(
          "koobideh",
          "main",
          "Kubideh-kebab med safranris",
          "Koobideh kebab with saffron rice",
          159,
          ["milk"],
          { labels: ["halal"] },
        ),
        dish("joojeh", "main", "Joojeh-kebab", "Joojeh kebab", 155, ["milk"], {
          labels: ["halal"],
        }),
        dish("barg", "main", "Barg-kebab", "Barg kebab", 199, ["milk"], {
          labels: ["halal"],
        }),
      ]),
      category("stews", "Gryderetter", "Stews", [
        dish("ghormeh", "main", "Ghormeh sabzi", "Ghormeh sabzi", 149, [], {
          labels: ["halal"],
        }),
        dish("fesenjan", "main", "Fesenjan", "Fesenjan", 159, ["nuts:walnut"], {
          labels: ["halal"],
        }),
      ]),
      category("sides", "Tilbehør", "Sides", [
        dish(
          "mast-o-khiar",
          "side",
          "Mast-o-khiar",
          "Mast-o-khiar (yoghurt and cucumber)",
          39,
          ["milk"],
          { labels: ["garlic"] },
        ),
        dish("tahdig", "side", "Tahdig", "Tahdig (crispy rice)", 45, ["milk"]),
        dish("shirazi", "side", "Shirazi-salat", "Shirazi salad", 39, []),
      ]),
      category("drinks", "Drikkevarer", "Drinks", [
        dish("doogh", "drink", "Doogh", "Doogh", 30, ["milk"]),
        dish("chai", "drink", "Persisk te", "Persian tea", 25, []),
      ]),
    ],
  }),
  general("taperia-valby", "Tapería Valby", "spanish", {
    street: "Valby Langgade 61",
    postal_code: "2500",
    city: "Valby",
    phone: "+45 36 30 25 48",
    contact: "hola.taperiavalby",
    staff: { first_name: "Lucía", last_name: "Fernández" },
    delivery_area: ["2500", "2450", "1700", "2000"],
    orders_per_day: 0.6,
    food_quality: 4.0,
    opens: 16 * HOUR,
    closes: 22 * HOUR,
    // Paused for part of the current month: a kitchen renovation.
    menu: [
      category("tapas", "Tapas", "Tapas", [
        dish(
          "patatas-bravas",
          "side",
          "Patatas bravas",
          "Patatas bravas",
          55,
          ["eggs"],
          { labels: ["chili", "garlic"] },
        ),
        dish("croquetas", "side", "Croquetas de jamón", "Ham croquettes", 65, [
          GLUTEN,
          "milk",
          "eggs",
        ]),
        dish(
          "gambas",
          "side",
          "Gambas al ajillo",
          "Garlic prawns",
          85,
          ["crustaceans"],
          { labels: ["chili", "garlic"] },
        ),
        dish("tortilla", "side", "Tortilla española", "Spanish omelette", 55, [
          "eggs",
        ]),
        dish(
          "pimientos",
          "side",
          "Pimientos de Padrón",
          "Padrón peppers",
          49,
          [],
        ),
      ]),
      category("mains", "Hovedretter", "Mains", [
        dish(
          "paella",
          "main",
          "Paella mixta for to",
          "Mixed paella for two",
          295,
          ["crustaceans", "molluscs", "fish"],
          { labels: ["garlic"] },
        ),
        dish(
          "tapas-menu",
          "main",
          "Tapasmenu for en",
          "Tapas menu for one",
          189,
          [GLUTEN, "eggs", "milk", "crustaceans"],
          { labels: ["garlic"] },
        ),
      ]),
      category("drinks", "Drikkevarer", "Drinks", [
        dish(
          "estrella",
          "drink",
          "Estrella Damm 33 cl",
          "Estrella Damm 33 cl",
          45,
          ["cereals:barley"],
        ),
        dish(
          "rioja",
          "drink",
          "Rioja Crianza 75 cl",
          "Rioja Crianza 75 cl",
          245,
          ["sulphites"],
        ),
        dish("sangria", "drink", "Sangria 1 l", "Sangria 1 l", 165, [
          "sulphites",
        ]),
      ]),
      category("sweet", "Dessert", "Dessert", [
        dish(
          "crema-catalana",
          "dessert",
          "Crema catalana",
          "Crema catalana",
          55,
          ["milk", "eggs"],
        ),
      ]),
    ],
  }),
  general(
    "frederiksberg-pizza",
    "Pizzabageriet Frederiksberg",
    "pizza_by_the_slice",
    {
      street: "Godthåbsvej 23",
      postal_code: "2000",
      city: "Frederiksberg",
      phone: "+45 38 87 12 66",
      contact: "bestil.pizzabageriet",
      staff: { first_name: "Emil", last_name: "Vestergaard" },
      delivery_area: ["2000", "1850", "1870", "2400", "2500"],
      orders_per_day: 1.3,
      food_quality: 3.6,
      opens: 11 * HOUR,
      closes: 22 * HOUR,
      menu: [
        category("pizza", "Pizza", "Pizza", [
          dish("margherita", "main", "Margherita", "Margherita", 79, [
            GLUTEN,
            "milk",
          ]),
          dish(
            "pepperoni",
            "main",
            "Pepperoni",
            "Pepperoni",
            89,
            [GLUTEN, "milk"],
            { labels: ["chili"] },
          ),
          dish("hawaii", "main", "Hawaii", "Hawaii", 89, [GLUTEN, "milk"]),
          dish(
            "kebab-pizza",
            "main",
            "Kebabpizza",
            "Kebab pizza",
            95,
            [GLUTEN, "milk"],
            { labels: ["garlic", "halal"] },
          ),
          dish("veggie", "main", "Grøntsagspizza", "Vegetable pizza", 85, [
            GLUTEN,
            "milk",
          ]),
          dish("family", "main", "Familiepizza", "Family pizza", 189, [
            GLUTEN,
            "milk",
          ]),
        ]),
        category("sides", "Tilbehør", "Sides", [
          dish(
            "garlic-bread",
            "side",
            "Hvidløgsbrød",
            "Garlic bread",
            39,
            [GLUTEN, "milk"],
            { labels: ["garlic"] },
          ),
          dish(
            "dip",
            "side",
            "Hvidløgsdressing",
            "Garlic dressing",
            10,
            ["milk", "eggs"],
            { labels: ["garlic"] },
          ),
        ]),
        category("drinks", "Drikkevarer", "Drinks", [
          soda("cola", "Coca-Cola 1,5 l", "Coca-Cola 1.5 l", 39),
          soda("fanta", "Fanta 50 cl", "Fanta 50 cl", 28),
        ]),
      ],
    },
  ),
  general("sabai-thai", "Sabai Thai Christianshavn", "thai", {
    street: "Overgaden Neden Vandet 17",
    postal_code: "1401",
    city: "København K",
    phone: "+45 32 95 40 13",
    contact: "sawasdee.sabaithai",
    staff: { first_name: "Ploy", last_name: "Srisuk" },
    delivery_area: ["1401", "1150", "1123", "2300"],
    orders_per_day: 0.8,
    food_quality: 3.9,
    opens: 12 * HOUR,
    closes: 21 * HOUR + 30,
    menu: [
      category("curry", "Karry", "Curry", [
        dish(
          "green-curry",
          "main",
          "Grøn karry med kylling",
          "Green curry with chicken",
          135,
          ["fish", "crustaceans"],
          { labels: ["chili", "garlic"] },
        ),
        dish(
          "massaman",
          "main",
          "Massaman med okse",
          "Beef massaman",
          145,
          ["fish", "peanuts"],
          { labels: ["chili"] },
        ),
        dish(
          "panang",
          "main",
          "Panang med tofu",
          "Panang with tofu",
          125,
          ["soybeans", "peanuts"],
          { labels: ["chili"] },
        ),
      ]),
      category("wok", "Wok og nudler", "Wok and noodles", [
        dish(
          "pad-thai",
          "main",
          "Pad thai med rejer",
          "Pad thai with shrimp",
          139,
          ["crustaceans", "eggs", "peanuts", "fish", "soybeans"],
        ),
        dish(
          "pad-see-ew",
          "main",
          "Pad see ew",
          "Pad see ew",
          129,
          [GLUTEN, "eggs", "soybeans"],
          { labels: ["garlic"] },
        ),
        dish(
          "krapow",
          "main",
          "Pad krapow med svin",
          "Pork pad krapow",
          129,
          ["fish", "soybeans", "eggs"],
          { labels: ["chili", "garlic"] },
        ),
      ]),
      category("starters", "Forretter", "Starters", [
        dish("satay", "side", "Kyllingesatay", "Chicken satay", 65, [
          "peanuts",
          "soybeans",
        ]),
        dish(
          "tom-yum",
          "side",
          "Tom yum-suppe",
          "Tom yum soup",
          69,
          ["crustaceans", "fish"],
          { labels: ["chili"] },
        ),
      ]),
      category("drinks", "Drikkevarer", "Drinks", [
        dish("thai-tea", "drink", "Thai iste", "Thai iced tea", 39, ["milk"]),
        dish("singha", "drink", "Singha 33 cl", "Singha 33 cl", 45, [
          "cereals:barley",
        ]),
      ]),
    ],
  }),
]

/** A general Restaurant: it supplies activity more than it is demonstrated. */
function general(
  key: string,
  name: string,
  cuisine: string,
  rest: Omit<DemoWorldRestaurant, "key" | "name" | "cuisine" | "prime">,
): DemoWorldRestaurant {
  return { key, name, cuisine, prime: false, ...rest }
}

/** The general Restaurant paused for part of the current month. */
export const PAUSED_RESTAURANT_KEY = "taperia-valby"
