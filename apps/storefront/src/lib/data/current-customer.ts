import "server-only"
import { cache } from "react"
import { sdk } from "@lib/config"
import { getAuthHeaders } from "./cookies"
import { readVerifiedCustomer } from "./verified-customer"

/**
 * The signed-in, verified Customer of this server request, or `null`. Layouts,
 * navigation, footer, locale and pages all ask for it, so it is read once per
 * request and shared; the next request reads it fresh (#205).
 */
export const retrieveCustomer = cache(async () =>
  readVerifiedCustomer(sdk.client.fetch, await getAuthHeaders()),
)
