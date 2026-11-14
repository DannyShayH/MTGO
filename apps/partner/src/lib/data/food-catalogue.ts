import "server-only"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { PARTNER_TOKEN_COOKIE, sdk } from "@lib/config"
import { sessionEndedCode } from "./staff"

type Translated = { da: string; en: string }
export type FoodReference = {
  id: string
  code: string
  name: Translated
  description: Translated
}
export type Allergen = FoodReference & {
  number: number
  details: { id: string; code: string; name: Translated }[]
}
export type FoodCatalogue = {
  allergens: Allergen[]
  food_labels: FoodReference[]
}

/** Database reference data; rechecks access even if it changed after layout rendering. */
export async function retrieveFoodCatalogue(): Promise<FoodCatalogue | null> {
  const token = (await cookies()).get(PARTNER_TOKEN_COOKIE)?.value
  try {
    return await sdk.client.fetch<FoodCatalogue>("/partner/food-catalogue", {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    })
  } catch (error) {
    const code = sessionEndedCode(error)
    if (code) redirect(`/session-ended?code=${code}`)
    // Keep the workspace usable and offer a fresh request after a backend outage.
    console.error("Food catalogue request failed", {
      status:
        error instanceof Error && "status" in error ? error.status : undefined,
    })
    return null
  }
}
