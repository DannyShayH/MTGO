# Background delivery location research

The existing Delivery agent workspace is a Next.js web app. Its location watch
stops when the page is hidden. The [W3C Geolocation specification](https://www.w3.org/TR/geolocation/)
requires position updates to be delivered only to fully active, visible
documents. A web page or service worker therefore cannot provide reliable
tracking with the browser closed or the screen locked.

## Practical approach

Build an installable native Delivery agent app, or a native container for the
existing workspace with a native background location service. The agent must
explicitly start and stop sharing, understand that it continues in the
background, and be able to revoke permission. Start the service during an
active, collected delivery; stop it when sharing is switched off, access is
revoked, or the delivery ends. Show the system's location indicator or
notification and a clear in-app sharing state.

- **iOS:** Enable the Location updates background capability and use Core
  Location's background activity and authorization sessions while tracking.
  When In Use authorization can continue active background updates; Always
  authorization permits the system to relaunch a terminated app for certain
  services, such as significant location changes, but not for ordinary
  continuous updates. A relaunch is not a promise of frequent samples.
  See Apple's [background location guidance](https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background)
  and [authorization comparison](https://developer.apple.com/documentation/corelocation/requesting-authorization-to-use-location-services).
- **Android:** Start a location foreground service while the app is visible,
  with the required location permissions and persistent notification. Android
  restricts starting foreground services from the background; request
  background location permission only if the selected lifecycle needs it.
  Ordinary background location is throttled to a few updates per hour.
  See Google's [location sample](https://developer.android.com/codelabs/while-in-use-location),
  [service start restrictions](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start),
  and [background location limits](https://developer.android.com/develop/sensors-and-location/location/background).

Neither platform promises uninterrupted updates: the device may be powered
off, offline, unable to obtain a fix, denied permission, or subject to OS
restrictions. On Android, the user can explicitly stop an app's foreground
service from Task Manager, which stops the app
([Android documentation](https://developer.android.com/develop/background-work/services/fgs/handle-user-stopping)).
Do not imply that closing or force-stopping an app always permits tracking.
The Customer must continue to see the actual measurement time and stale state.

## Integration with MTOGO

The native service can send the latest measurement to the existing authenticated
`POST /partner/deliveries/{order_id}/location` endpoint: latitude, longitude,
nullable accuracy in metres, and the observation time. The current partner
server action reads a server-side HTTP-only cookie and forwards a bearer token;
a native client needs an explicitly designed secure authentication and session
lifecycle rather than extracting that cookie in JavaScript. The backend already
checks Delivery agent responsibility, accepts samples only after pickup,
coalesces rapid updates, rejects old samples, deletes the latest position when
the delivery ends, and marks it stale after sixty seconds. Preserve these
rules and do not queue a trail of positions offline. See
`apps/partner/README.md` and `apps/backend/src/modules/delivery/README.md`.

Validate on physical iOS and Android devices with the screen locked, another
app open, connectivity lost and restored, permission revoked, delivery ended,
and the app explicitly stopped. Include battery use, permission disclosures,
sign-out and expired-session recovery in the implementation design.
