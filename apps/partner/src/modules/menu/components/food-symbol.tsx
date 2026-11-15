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
export function FoodSymbol({
  code,
  size = 36,
}: {
  code: string
  /** Rendered edge in pixels; 36 in legends, 28 in dense lists. */
  size?: 28 | 36
}) {
  const symbol = Object.hasOwn(SYMBOLS, code) ? SYMBOLS[code] : undefined
  const box = size === 28 ? "h-7 w-7 shrink-0" : "h-9 w-9 shrink-0"
  return symbol ? (
    // Local static SVG, never markup or a URL supplied by menu content.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/images/food-symbols/${symbol}.svg`}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      className={box}
    />
  ) : (
    <span aria-hidden="true" className={box} />
  )
}
