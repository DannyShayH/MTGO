import { retrieveCart } from "@lib/data/cart"
import { shareWithinTick } from "./share-within-tick"

/**
 * The browser's cart read after a basket change. The header basket and the
 * phone basket bar both react to one change, so they share this read (#252).
 */
export const readBasketCart = shareWithinTick(() => retrieveCart())
