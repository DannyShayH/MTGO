import "server-only"
import { cache } from "react"
import { retrieveCart } from "./cart"

/**
 * The basket of this server request, or `null`. The layout, the header basket
 * and the basket page all show it, so it is read once per request and shared
 * (#252), as the Customer is (#205); the next request reads it fresh. Server
 * actions that change the basket read it themselves, never from here.
 */
export const retrieveCurrentCart = cache(() => retrieveCart().catch(() => null))
