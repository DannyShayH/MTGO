import Login from "../../../page"

export default async function OrderLogin({
  params,
}: {
  params: Promise<{ countryCode: string; id: string }>
}) {
  const { countryCode, id } = await params
  const next = `/${countryCode}/account/orders/details/${encodeURIComponent(id)}`
  return <Login searchParams={Promise.resolve({ next })} />
}
