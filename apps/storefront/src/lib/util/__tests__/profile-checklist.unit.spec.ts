import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { profileChecklist } from "../profile-checklist.ts"

const complete = {
  email: "test@test.dk",
  first_name: "Test",
  last_name: "Jensen",
  phone: "+4522949411",
  addresses: [{ id: "addr_1" }],
}

describe("the profile checklist on the account overview", () => {
  it("EP: a complete profile is 100% and has nothing left to do", () => {
    const list = profileChecklist(complete)
    assert.equal(list.percent, 100)
    assert.equal(list.isComplete, true)
    assert.ok(list.items.every(({ isDone }) => isDone))
  })

  it("EP: a saved address counts, default billing or not", () => {
    assert.equal(profileChecklist(complete).percent, 100)
    assert.equal(profileChecklist({ ...complete, addresses: [] }).percent, 75)
  })

  it("BVA: a name needs both first and last name", () => {
    const list = profileChecklist({ ...complete, last_name: "" })
    assert.equal(list.items.find(({ key }) => key === "name")?.isDone, false)
    assert.equal(list.percent, 75)
  })

  it("EP: each missing part links to the page that fills it in", () => {
    const list = profileChecklist({
      ...complete,
      phone: null,
      addresses: [],
    })
    assert.deepEqual(
      list.items
        .filter(({ isDone }) => !isDone)
        .map(({ key, href }) => [key, href]),
      [
        ["phone", "/account/profile"],
        ["address", "/account/addresses"],
      ],
    )
    assert.equal(list.done, 2)
  })

  it("EP: no customer has nothing done", () => {
    assert.equal(profileChecklist(null).percent, 0)
  })
})
