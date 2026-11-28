import { createContext, useContext } from "react"
import { scopeWording, type ScopeWording } from "../lib/operations-api"

const ScopeContext = createContext<ScopeWording>(scopeWording(null))

/** Which Restaurants the Operations figures describe, for every card (#264). */
export const OperationsScopeProvider = ScopeContext.Provider

export const useScopeWording = () => useContext(ScopeContext)
