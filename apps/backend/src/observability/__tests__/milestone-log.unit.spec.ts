import { milestoneActor } from "../milestone-log"

describe("milestoneActor", () => {
  it.each([
    {
      id: "system",
      actor: { actor_type: "system", actor_id: "system" },
      reason: "EP: automatic outcome",
    },
    {
      id: "user_01",
      actor: { actor_type: "user", actor_id: "user_01" },
      reason: "EP: operator",
    },
    {
      id: "apk_01",
      actor: { actor_type: "api_key", actor_id: "apk_01" },
      reason: "EP: operator using a secret API key",
    },
    {
      id: "rstf_01",
      actor: { actor_type: "restaurant_staff", actor_id: "rstf_01" },
      reason: "EP: Restaurant staff",
    },
    {
      id: "dagt_01",
      actor: { actor_type: "delivery_agent", actor_id: "dagt_01" },
      reason: "EP: Delivery agent",
    },
    {
      id: "cus_01",
      actor: { actor_type: "customer" },
      reason: "EP: a Customer is never named",
    },
    {
      id: "other_01",
      actor: { actor_type: "unknown" },
      reason: "EP: an unknown kind is never named",
    },
    { id: "", actor: { actor_type: "unknown" }, reason: "BVA: empty" },
  ])("$reason", ({ id, actor }) => {
    expect(milestoneActor(id)).toEqual(actor)
  })
})
