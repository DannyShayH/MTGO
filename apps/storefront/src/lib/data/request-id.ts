"use server"

import { knownRequestId } from "@dtc/logging/request-id"
import { headers } from "next/headers"

/**
 * The request ID the middleware gave this request, or nothing outside one (a
 * build or a static page). Like
 * `getLocale`, it is a Server Function because the SDK configuration is also
 * bundled for the browser; it only returns the caller's own header.
 */
export const getRequestId = async (): Promise<string | undefined> => {
  try {
    return knownRequestId((await headers()).get("x-request-id"))
  } catch {
    return undefined
  }
}
