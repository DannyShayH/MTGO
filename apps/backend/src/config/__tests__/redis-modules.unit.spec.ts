import { redisModules } from "../redis-modules"

describe("redisModules", () => {
  it("registers no modules without a Redis URL, so Medusa keeps its local fallbacks", () => {
    expect(redisModules(undefined)).toEqual([])
    expect(redisModules("")).toEqual([])
  })

  it("delivers events, runs workflows and takes locks through Redis when a URL is given", () => {
    const url = "redis://redis:6379"

    expect(redisModules(url)).toEqual([
      {
        resolve: "@medusajs/medusa/event-bus-redis",
        options: { redisUrl: url },
      },
      {
        resolve: "@medusajs/medusa/workflow-engine-redis",
        options: { redis: { redisUrl: url } },
      },
      {
        resolve: "@medusajs/medusa/locking",
        options: {
          providers: [
            {
              resolve: "@medusajs/medusa/locking-redis",
              id: "locking-redis",
              is_default: true,
              options: { redisUrl: url },
            },
          ],
        },
      },
    ])
  })
})
