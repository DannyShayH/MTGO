const SYMBOLS: Record<string, string> = {
  cereals: "cereals",
  crustaceans: "crustaceans",
  eggs: "eggs",
  fish: "fish",
  peanuts: "peanuts",
  soybeans: "soybeans",
  milk: "milk",
  nuts: "nuts",
  celery: "celery",
  mustard: "mustard",
  sesame: "sesame",
  sulphites: "sulphites",
  lupin: "lupin",
  molluscs: "molluscs",
  halal: "halal",
  chili: "chili",
  garlic: "garlic",
}

/** Only trusted bundled symbols can render; unknown codes retain their readable label. */
export function FoodSymbol({ code }: { code: string }) {
  const symbol = Object.hasOwn(SYMBOLS, code) ? SYMBOLS[code] : undefined
  return symbol ? (
    // Local static SVG, never markup or a URL supplied by menu content.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/images/food-symbols/${symbol}.svg`}
      width={36}
      height={36}
      alt=""
      aria-hidden="true"
      className="h-9 w-9 shrink-0"
    />
  ) : (
    <span aria-hidden="true" className="h-9 w-9 shrink-0" />
  )
}
