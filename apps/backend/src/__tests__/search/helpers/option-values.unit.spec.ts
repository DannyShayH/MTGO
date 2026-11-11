import { toOptionValues } from "../../../search/helpers/option-values"

describe("toOptionValues", () => {
  it("flattens options into title:value entries", () => {
    expect(
      toOptionValues([
        { title: "Size", values: [{ value: "S" }, { value: "M" }] },
        { title: "Color", values: [{ value: "Red" }] },
      ]),
    ).toEqual(["Size:S", "Size:M", "Color:Red"])
  })

  it("trims titles and values and skips blank or missing ones", () => {
    expect(
      toOptionValues([
        { title: "  Size ", values: [{ value: " S " }, { value: "  " }, null] },
        { title: "   ", values: [{ value: "Ignored" }] },
        { title: null, values: [{ value: "Ignored" }] },
        { title: "Material", values: null },
        null,
      ]),
    ).toEqual(["Size:S"])
  })

  it("lists an entry shared by two options once", () => {
    expect(
      toOptionValues([
        { title: "Size", values: [{ value: "S" }] },
        { title: "Size", values: [{ value: "S" }] },
      ]),
    ).toEqual(["Size:S"])
  })

  it("returns no entries for a product without options", () => {
    expect(toOptionValues(undefined)).toEqual([])
    expect(toOptionValues(null)).toEqual([])
  })
})
