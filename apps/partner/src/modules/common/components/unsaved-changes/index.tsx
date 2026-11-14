"use client"

import {
  createContext,
  useId,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react"

type Guard = { dirty: boolean; message: string }
const GuardContext = createContext<
  ((id: string, value?: Guard) => void) | null
>(null)
const POSITION = "mtogoNavigationPosition"

/** Lives across app routes so every same-document history entry gets a position. */
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const guards = useRef(new Map<string, Guard>())
  const updateGuard = useCallback((id: string, value?: Guard) => {
    if (value) guards.current.set(id, value)
    else guards.current.delete(id)
  }, [])
  useEffect(() => {
    const originalPush = window.history.pushState
    const originalReplace = window.history.replaceState
    let position =
      typeof window.history.state?.[POSITION] === "number"
        ? window.history.state[POSITION]
        : 0
    let restoring = false
    originalReplace.call(
      window.history,
      { ...window.history.state, [POSITION]: position },
      "",
    )
    window.history.pushState = function (state, unused, url) {
      const nextPosition = position + 1
      originalPush.call(
        this,
        { ...state, [POSITION]: nextPosition },
        unused,
        url,
      )
      position = nextPosition
    }
    window.history.replaceState = function (state, unused, url) {
      originalReplace.call(
        this,
        { ...state, [POSITION]: position },
        unused,
        url,
      )
    }
    const activeGuard = () =>
      [...guards.current.values()].find(({ dirty }) => dirty)
    const mayLeave = () => {
      const guard = activeGuard()
      return !guard || window.confirm(guard.message)
    }
    const unload = (event: BeforeUnloadEvent) => {
      if (activeGuard()) {
        event.preventDefault()
        event.returnValue = ""
      }
    }
    const click = (event: MouseEvent) => {
      const link =
        event.target instanceof Element ? event.target.closest("a[href]") : null
      if (link && !mayLeave()) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    const submit = (event: SubmitEvent) => {
      if (
        event.target instanceof HTMLFormElement &&
        !event.target.hasAttribute("data-category-editor") &&
        !event.target.hasAttribute("data-dish-editor") &&
        !mayLeave()
      ) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    const traverse = (event: PopStateEvent) => {
      const destination: unknown = event.state?.[POSITION]
      // Cross-document navigation is covered by beforeunload. All app entries are indexed here.
      if (typeof destination !== "number") return
      if (restoring) {
        restoring = false
        event.stopImmediatePropagation()
        return
      }
      if (!mayLeave()) {
        event.stopImmediatePropagation()
        restoring = true
        window.history.go(position - destination)
      } else position = destination
    }
    window.addEventListener("beforeunload", unload)
    document.addEventListener("click", click, true)
    document.addEventListener("submit", submit, true)
    window.addEventListener("popstate", traverse, true)
    return () => {
      window.history.pushState = originalPush
      window.history.replaceState = originalReplace
      window.removeEventListener("beforeunload", unload)
      document.removeEventListener("click", click, true)
      document.removeEventListener("submit", submit, true)
      window.removeEventListener("popstate", traverse, true)
    }
  }, [])
  return (
    <GuardContext.Provider value={updateGuard}>
      {children}
    </GuardContext.Provider>
  )
}

export function useUnsavedChanges(dirty: boolean, message: string) {
  const updateGuard = useContext(GuardContext)
  const id = useId()
  useEffect(() => {
    updateGuard?.(id, { dirty, message })
    return () => updateGuard?.(id)
  }, [dirty, message, updateGuard, id])
}
