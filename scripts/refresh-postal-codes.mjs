// Refreshes the Danish postal code register from Statistics Denmark's open
// Statbank table POSTNR1 (population by postal code). Run from the repo root:
//   node scripts/refresh-postal-codes.mjs
// Then add a migration script that syncs the new file (see the postal-code README).
import { writeFileSync } from "node:fs"

const source =
  "https://api.statbank.dk/v1/tableinfo/POSTNR1?lang=da&format=JSON"
const target = new URL(
  "../apps/backend/src/modules/postal-code/data/postal-codes.json",
  import.meta.url,
)

const response = await fetch(source)
if (!response.ok) throw new Error(`Statbank answered ${response.status}`)
const table = await response.json()
const variable = table.variables.find((v) => v.id === "PNR20")
if (!variable) throw new Error("POSTNR1 no longer has the PNR20 variable")

const postalCodes = []
for (const { id, text } of variable.values) {
  // "0001 Hele landet" and "9999 Ukendt" are statistical totals, not postal codes.
  if (id === "0001" || id === "9999") continue
  const match = text.match(/^(\d{4}) (.+) \((.+)\)$/)
  if (!match || match[1] !== id)
    throw new Error(`Unexpected value: ${id} ${text}`)
  postalCodes.push({ postal_code: id, name: match[2], municipality: match[3] })
}
postalCodes.sort((a, b) => a.postal_code.localeCompare(b.postal_code))

writeFileSync(
  target,
  JSON.stringify(
    { source, source_updated: table.updated, postal_codes: postalCodes },
    null,
    2,
  ) + "\n",
)
console.log(
  `Wrote ${postalCodes.length} postal codes (source updated ${table.updated})`,
)
