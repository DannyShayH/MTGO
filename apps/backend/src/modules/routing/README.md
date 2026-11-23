# Routing module

Route distances on OpenStreetMap data from
[openrouteservice](https://openrouteservice.org) (#191). It has no data model:
`RoutingModuleService` is an adapter with three calls, all for cycling
(`cycling-regular`), the same mode as the route links (#190):

- `geocode({ street, postal_code, city })`: the structured geocoder, limited to
  Denmark, returning `{ latitude, longitude }`. It sends only the street name and
  house number (`streetAndNumber` drops the floor and door, so
  "Rømersgade 9, 1. tv" is sent as "Rømersgade 9") and the postal code, not the
  town: a postal district such as "København N" makes the geocoder fall back to
  the centre of Denmark. Only an `address` or `street` result counts; a country,
  town or district centre answers `null`, so no made-up trip is measured. DAWA,
  the Danish public address API, is being retired during 2026, so it is not
  used.
- `tripDistance(from, to)`: one directions call without geometry or
  instructions, in meters rounded to 100 m.
- `distancesFrom(origin, destinations)`: one matrix call from the origin to
  every destination, in the same order, rounded to 100 m.

Every call answers `null` for "no distance": no `ORS_API_KEY`, a provider
error, an over-quota response (429), no route, an unreadable body or a timeout
(3 seconds). It never throws, so a missing distance never blocks work. The key
goes in the `authorization` header, never in a URL, and failures are logged as
`upstream.request.failed` with only the route pattern, method and status,
never the key, coordinates or addresses.

It calls HeiGIT's API at `https://api.heigit.org`: the geocoder under
`/pelias/v1/search/structured`, directions and matrix under
`/openrouteservice/v2`. openrouteservice deprecated
`api.openrouteservice.org` in 2026 and limited it to a tenth of the plan
quota; on 23 November 2026 it answered `403 Quota exceeded` for staging's
key while the same key worked on the new host. Keys come from the HeiGIT
account dashboard (sign up from [openrouteservice.org](https://openrouteservice.org)).

`medusa-config.ts` registers it with `ORS_API_KEY` and, for tests only,
`ORS_BASE_URL`. The free Standard key needs no payment card; its published
quota (about 2,000 directions and 500 matrix calls a day) is far above this
project's needs. Results are shown with the attribution "© openrouteservice.org
| OpenStreetMap contributors". Check the provider's terms before a real release.

`src/modules/routing/__tests__/service.unit.spec.ts` stubs `fetch` and covers
the requests, rounding and every unavailable case.
`integration-tests/http/delivery-distance.spec.ts` runs a local stand-in for
openrouteservice, so no test calls the network. Medusa loads `.env` in tests
too, so `integration-tests/setup.js` sets `ORS_API_KEY` to empty before any
spec: a developer's key never reaches the provider from a test run, which
once spent the whole day's quota.
