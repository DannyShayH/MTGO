const Module = require("node:module")
const path = require("node:path")

/** The packages each Next.js app must load from its own copy. */
const REACT_PACKAGES = ["react", "react-dom"]

const REACT_REQUEST = new RegExp(`^(${REACT_PACKAGES.join("|")})(/|$)`)

/**
 * Makes every `react` and `react-dom` request in this process, subpaths
 * included, resolve to the copy the app at `appDir` sees, whatever npm hoisted
 * next to the requester. Other requests resolve as usual.
 */
function pinOwnReact(appDir) {
  const resolveFromApp = { paths: [path.resolve(appDir)] }
  const originalResolveFilename = Module._resolveFilename
  Module._resolveFilename = function (request, parent, isMain, options) {
    return originalResolveFilename.call(
      this,
      request,
      parent,
      isMain,
      REACT_REQUEST.test(request) ? resolveFromApp : options,
    )
  }
}

module.exports = { pinOwnReact, REACT_PACKAGES }
