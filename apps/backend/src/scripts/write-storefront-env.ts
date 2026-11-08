import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import type { ExecArgs } from "@medusajs/framework/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"

const keyName = "NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY"
const backendUrlName = "NEXT_PUBLIC_MEDUSA_BACKEND_URL"
const defaultBackendUrl = "http://localhost:9000"

const setEnvLine = (content: string, name: string, value: string) => {
  const line = `${name}=${value}`
  const pattern = new RegExp(`^${name}=.*$`, "m")

  return pattern.test(content)
    ? content.replace(pattern, () => line)
    : `${content}${content && !content.endsWith("\n") ? "\n" : ""}${line}\n`
}

export default async function writeStorefrontEnv({ container }: ExecArgs) {
  const apiKeyService = container.resolve(Modules.API_KEY)
  const keys = await apiKeyService.listApiKeys({ type: "publishable" })
  const key = keys.find((candidate) => candidate.token && !candidate.revoked_at)

  if (!key) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "No active publishable API key found. Run db:migrate first.",
    )
  }

  const envPath = resolve(process.cwd(), "../storefront/.env.local")
  const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : ""
  const withKey = setEnvLine(existing, keyName, key.token)
  const hasBackendUrl = new RegExp(`^${backendUrlName}=.+$`, "m").test(withKey)
  const next = hasBackendUrl
    ? withKey
    : setEnvLine(withKey, backendUrlName, defaultBackendUrl)

  writeFileSync(envPath, next, { mode: 0o600 })
  console.log(
    "Updated apps/storefront/.env.local with the publishable API key and backend URL",
  )
}
