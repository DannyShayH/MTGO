"use server"

import { sdk } from "@lib/config"
import { HttpTypes } from "@medusajs/types"
import { getCacheOptions } from "./cookies"

export const listRegions = async () => {
  const next = {
    ...(await getCacheOptions("regions")),
    // A region change, such as Denmark moving to its own DKK region, must reach
    // a running storefront without a restart.
    revalidate: REGION_REVALIDATE_SECONDS,
  }

  return await sdk.client
    .fetch<{ regions: HttpTypes.StoreRegion[] }>(`/store/regions`, {
      method: "GET",
      next,
    })
    .then(({ regions }) => regions)
}

export const retrieveRegion = async (id: string) => {
  const next = {
    ...(await getCacheOptions(["regions", id].join("-"))),
  }

  return await sdk.client
    .fetch<{ region: HttpTypes.StoreRegion }>(`/store/regions/${id}`, {
      method: "GET",
      next,
      cache: "force-cache",
    })
    .then(({ region }) => region)
}

const REGION_REVALIDATE_SECONDS = 60

let regionMap = new Map<string, HttpTypes.StoreRegion>()
let regionMapLoadedAt = 0

export const getRegion = async (countryCode: string) => {
  if (
    regionMap.has(countryCode) &&
    Date.now() - regionMapLoadedAt < REGION_REVALIDATE_SECONDS * 1000
  ) {
    return regionMap.get(countryCode)
  }

  const regions = await listRegions()
  regionMap = new Map()
  regionMapLoadedAt = Date.now()

  if (!regions) {
    return null
  }

  regions.forEach((region) => {
    region.countries?.forEach((c) => {
      regionMap.set(c?.iso_2 ?? "", region)
    })
  })

  const region = countryCode ? regionMap.get(countryCode) : regionMap.get("us")

  return region
}
