export type RedisModuleConfig = {
  resolve: string
  options: Record<string, unknown>
}

/**
 * Medusa infrastructure modules backed by Redis: the event bus, the workflow
 * engine and the locking provider. Without a URL no modules are registered,
 * and Medusa keeps its local event bus, in-memory workflow engine and
 * in-memory locking. CI and the browser verification harness rely on that.
 */
export function redisModules(
  redisUrl: string | undefined,
): RedisModuleConfig[] {
  if (!redisUrl) {
    return []
  }

  return [
    {
      resolve: "@medusajs/medusa/event-bus-redis",
      options: { redisUrl },
    },
    {
      resolve: "@medusajs/medusa/workflow-engine-redis",
      options: { redis: { redisUrl } },
    },
    {
      resolve: "@medusajs/medusa/locking",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/locking-redis",
            id: "locking-redis",
            is_default: true,
            options: { redisUrl },
          },
        ],
      },
    },
  ]
}
