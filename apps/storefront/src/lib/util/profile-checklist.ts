/** The parts of a Customer profile that make checkout quicker. */
export type ProfileItemKey = "email" | "name" | "phone" | "address"

export type ProfileChecklist = {
  items: { key: ProfileItemKey; isDone: boolean; href: string }[]
  done: number
  percent: number
  isComplete: boolean
}

type ProfileCustomer = {
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  addresses?: unknown[] | null
}

/**
 * What the Customer has filled in, each with the account page that fills it
 * in. Any saved address counts: MTOGO bills to the delivery address unless
 * the Customer chooses otherwise, so a default billing address is not needed.
 */
export function profileChecklist(
  customer: ProfileCustomer | null,
): ProfileChecklist {
  const filled = (value?: string | null) => Boolean(value?.trim())
  const items = [
    { key: "email", isDone: filled(customer?.email), href: "/account/profile" },
    {
      key: "name",
      isDone: filled(customer?.first_name) && filled(customer?.last_name),
      href: "/account/profile",
    },
    { key: "phone", isDone: filled(customer?.phone), href: "/account/profile" },
    {
      key: "address",
      isDone: Boolean(customer?.addresses?.length),
      href: "/account/addresses",
    },
  ] satisfies ProfileChecklist["items"]
  const done = items.filter(({ isDone }) => isDone).length
  return {
    items,
    done,
    percent: Math.round((done / items.length) * 100),
    isComplete: done === items.length,
  }
}
