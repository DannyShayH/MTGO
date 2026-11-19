import { posix } from "node:path"

// Which backend HTTP specs a change affects, by the URL paths they request.
//
// HTTP specs reach routes over HTTP instead of importing them, so Jest's
// import-based --changedSince cannot see that a route changed. A route file
// serves the URL path of its folder under src/api, and a spec is affected
// when it (or a helper it imports) requests that path or a path under it.

const WHOLE_SUITE = /^(src\/links\/|medusa-config\.)/
const MIDDLEWARES = "src/api/middlewares.ts"

/**
 * The file a relative import of `base` (joined to the importer's folder)
 * resolves to among `files`: the path itself, with `.ts`, or its index.
 */
export const resolveImport = (base, files) =>
  [base, `${base}.ts`, `${base}/index.ts`].find(
    (candidate) => candidate in files,
  )

/** The src/api files a source file imports through relative specifiers. */
function relativeImports(file, source, api) {
  const imports = []
  for (const [, specifier] of source.matchAll(
    /(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g,
  )) {
    const base = posix.join(posix.dirname(file), specifier)
    const target = resolveImport(base, api)
    if (target) imports.push(target)
  }
  return imports
}

/** Every file under src/api that imports `file`, directly or transitively. */
function importersOf(file, api) {
  const importedBy = new Map()
  for (const [from, source] of Object.entries(api))
    for (const target of relativeImports(from, source, api))
      importedBy.set(target, [...(importedBy.get(target) ?? []), from])
  const found = new Set()
  const queue = [file]
  while (queue.length)
    for (const importer of importedBy.get(queue.shift()) ?? [])
      if (!found.has(importer)) {
        found.add(importer)
        queue.push(importer)
      }
  return [...found].sort((a, b) => a.localeCompare(b))
}

const isRoute = (file) => posix.basename(file) === "route.ts"

/** URL path segments of a folder under src/api, e.g. ["partner", "orders"]. */
const folderSegments = (file) =>
  posix.dirname(file).split("/").slice(2).filter(Boolean)

/**
 * The URL paths requested in source text: string and template literals that
 * start with "/". Their query string is dropped. A segment holding `${...}`
 * is dynamic: it matches any segment, and whatever follows the expression in
 * that segment is unknown, so the path matches everything below it ("isOpen").
 */
export function requestedPaths(source) {
  const paths = []
  for (const [, path] of source.matchAll(/["'`](\/[a-zA-Z][^"'`\s]*)/g)) {
    const segments = []
    let isOpen = false
    for (const raw of path.split("?")[0].split("/").slice(1)) {
      const at = raw.indexOf("${")
      if (at === 0) {
        segments.push(null)
        if (raw.indexOf("}") !== raw.length - 1) isOpen = true
      } else if (at > 0) {
        segments.push(decode(raw.slice(0, at)))
        isOpen = true
      } else segments.push(decode(raw))
      if (isOpen) break
    }
    paths.push({
      segments: segments.filter((segment) => segment !== ""),
      isOpen,
    })
  }
  return paths
}

const decode = (segment) => {
  try {
    return decodeURIComponent(segment).toLowerCase()
  } catch {
    return segment.toLowerCase()
  }
}

const isParam = (segment) => /^\[.+\]$/.test(segment)

/**
 * Whether a requested path reaches a URL prefix: one is an ancestor of the
 * other, comparing segment by segment. Route parameters ([id]) and dynamic
 * request segments match any segment.
 */
function reaches(requested, prefix) {
  const shared = Math.min(requested.segments.length, prefix.length)
  for (let i = 0; i < shared; i++) {
    const want = prefix[i]
    const got = requested.segments[i]
    if (got !== null && !isParam(want) && got !== want.toLowerCase())
      return false
  }
  return requested.segments.length > 0 || requested.isOpen
}

/**
 * Selects the HTTP specs a set of changed backend files affects.
 *
 * - `changed`: changed files, relative to apps/backend
 * - `api`: every source file under src/api, mapped to its text
 * - `specs`: every HTTP spec, mapped to the texts of the spec and the local
 *   helpers it imports
 *
 * Returns `{ all }` with the reason when the whole suite must run, otherwise
 * `{ all: null, specs }`: the affected specs, each with why it was chosen.
 */
export function selectHttpSpecs({ changed, api, specs }) {
  const prefixes = []
  for (const file of changed) {
    if (WHOLE_SUITE.test(file))
      return { all: `${file} reaches every request`, specs: [] }
    if (!file.startsWith("src/api/") || !/\.[jt]s$/.test(file)) continue
    if (file.includes("/__tests__/")) continue
    if (file === MIDDLEWARES)
      return { all: `${file} reaches every request`, specs: [] }
    if (isRoute(file)) {
      const segments = folderSegments(file)
      prefixes.push({
        segments,
        reason: `${file} serves /${segments.join("/")}`,
      })
      continue
    }
    const importers = importersOf(file, api)
    if (importers.includes(MIDDLEWARES)) {
      // Middleware applies a folder's validators to the routes below it; a
      // helper at the top of src/api can guard any request.
      const segments = folderSegments(file)
      if (!segments.length)
        return {
          all: `${file} is used by middleware for every request`,
          specs: [],
        }
      prefixes.push({
        segments,
        reason: `${file} is used by middleware for /${segments.join("/")}`,
      })
    }
    const routes = importers.filter(isRoute)
    for (const route of routes) {
      const segments = folderSegments(route)
      prefixes.push({
        segments,
        reason: `${file} is used by ${route} for /${segments.join("/")}`,
      })
    }
    if (!routes.length && !importers.includes(MIDDLEWARES))
      return {
        all: `${file} is used by no route or middleware it can be traced to`,
        specs: [],
      }
  }
  const selected = []
  for (const [spec, sources] of Object.entries(specs)) {
    const paths = sources.flatMap(requestedPaths)
    const reasons = prefixes
      .filter(({ segments }) => paths.some((path) => reaches(path, segments)))
      .map(({ reason }) => reason)
    if (reasons.length) selected.push({ spec, reasons })
  }
  return {
    all: null,
    specs: selected.sort((a, b) => a.spec.localeCompare(b.spec)),
  }
}
