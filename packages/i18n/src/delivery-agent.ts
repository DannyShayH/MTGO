export const PROBLEM_CATEGORIES = [
  "restaurant_unavailable",
  "food_missing_or_wrong",
  "address_not_found",
  "other",
] as const
export type ProblemCategory = (typeof PROBLEM_CATEGORIES)[number]

export const PROBLEM_CATEGORY_TEXT: Record<
  "da" | "en",
  Record<ProblemCategory, string>
> = {
  da: {
    restaurant_unavailable: "Restauranten er lukket / maden kan ikke hentes",
    food_missing_or_wrong: "Maden mangler eller er forkert",
    address_not_found: "Kan ikke finde adressen",
    other: "Andet",
  },
  en: {
    restaurant_unavailable: "Restaurant closed / can't collect",
    food_missing_or_wrong: "Food missing or wrong",
    address_not_found: "Can't find the address",
    other: "Other",
  },
}

export const DELIVERY_AGENT_TEXT = {
  da: {
    title: "Leveringspartner",
    menu: "Menu",
    menuClose: "Luk menu",
    shareLocationInfo: "Hvorfor deler jeg min position?",
    signInTitle: "Log ind som leveringspartner",
    invitation: "Din invitation",
    email: "E-mail",
    password: "Adgangskode",
    signIn: "Log ind",
    signOut: "Log ud",
    accept: "Acceptér invitation",
    choosePassword: "Vælg en adgangskode",
    invalid: "Linket er ugyldigt eller er udløbet.",
    failed: "Handlingen kunne ikke gennemføres. Prøv igen.",
    wrongCredentials: "Forkert e-mail eller adgangskode.",
    approved: "Godkendte områder",
    noAreas: "Du har endnu ingen godkendte postnumre.",
    filter: "Filtrer områder",
    save: "Gem filter",
    empty: "Der er ingen ledige leveringer i dine valgte områder lige nu.",
    available: "Ledige leveringer",
    refresh: "Opdater",
    connection_connecting: "Opretter forbindelse …",
    connection_live: "Live: ledige og aktuelle leveringer opdateres automatisk",
    connection_reconnecting: "Forbindelsen blev afbrudt. Forbinder igen …",
    connection_fallback:
      "Live-opdatering er ikke tilgængelig. Leveringerne hentes automatisk hvert {seconds}. sekund.",
    connection_offline:
      "Ingen forbindelse. Leveringerne er måske ikke aktuelle. Prøver igen automatisk.",
    loadFailed: "Leveringerne kunne ikke hentes. Prøv igen.",
    pickup: "Afhentning",
    destination: "Levering til postnummer",
    acceptedAt: "Accepteret",
    claimBy: "Frist for at påtage sig",
    preparation: "Tilberedning",
    acceptedStatus: "Accepteret",
    preparingStatus: "Tilberedes",
    readyStatus: "Klar til afhentning",
    loading: "Henter leveringer…",
    next: "Næste side",
    details: "Se detaljer",
    back: "Tilbage til leveringer",
    unavailable: "Leveringen er ikke længere tilgængelig.",
    previous: "Forrige side",
    staff: "Restaurantmedarbejder? Log ind her.",
    agent: "Leveringspartner? Log ind her.",
    language: "Sprog",
    passwordHint: "Mindst 8 tegn.",
    all: "Alle godkendte områder",
    claim: "Påtag mig leveringen",
    claiming: "Påtager…",
    claimHint:
      "Du bliver ansvarlig for netop denne levering. Den kan ikke frigives eller overdrages herfra.",
    checking: "Tjekker status…",
    checkingHint:
      "Vi ved endnu ikke, om du fik leveringen. Vi tjekker igen, når forbindelsen er tilbage.",
    notConfirmed:
      "Leveringen blev ikke påtaget. Prøv igen, hvis den stadig er ledig.",
    claimed: "Du er nu ansvarlig for leveringen.",
    current: "Din aktuelle levering",
    noCurrent: "Du har ingen aktuel levering.",
    busy: "Gør din aktuelle levering færdig, før du påtager dig en ny.",
    customer: "Kunde",
    deliverTo: "Levér til",
    call: "Ring til kunden",
    noPhone: "Intet telefonnummer oplyst.",
    assignedAt: "Ansvarlig siden",
    assignedByOperator: "Tildelt af MTOGO",
    currentFailed: "Din aktuelle levering kunne ikke hentes. Prøv igen.",
    areas: "Områder",
    areasSelected: "{selected} af {total} byer",
    areasAll: "Alle {total} byer",
    areasHint:
      "Vælg de byer, du vil se leveringer fra. Det ændrer ikke, hvor du er godkendt.",
    codesCount: "{count} postnr.",
    unnamedTown: "Postnummer {code}",
    timeLeft: "{minutes} min tilbage",
    underMinute: "Under 1 min tilbage",
    pickupAt: "Hent hos",
    responsible: "Du er ansvarlig",
    reportProblem: "Meld et problem",
    problemCategory: "Hvad er problemet?",
    problemNote: "Note (valgfri)",
    problemNoteHint: "Højst 280 tegn. Skriv ikke personlige oplysninger.",
    sendProblem: "Send rapport",
    problemReported:
      "MTOGO har fået besked. Du er stadig ansvarlig for leveringen.",
    problemAlreadyReported: "Allerede meldt",
    problemUncertain:
      "Vi ved endnu ikke, om rapporten blev modtaget. Prøv igen.",
    problemFailed: "Rapporten kunne ikke sendes. Opdater og prøv igen.",
    availableCount: "{count} ledige",
    confirmPickup: "Jeg har hentet maden",
    confirmPickupTitle: "Har du maden i hånden?",
    confirmPickupHint:
      "Bekræft kun, når du har fået maden udleveret hos {restaurant}. Tidspunktet registreres og kan ikke ændres.",
    confirmCollected: "Ja, bekræft afhentning",
    notYet: "Ikke endnu",
    confirmingPickup: "Registrerer afhentning…",
    pickupWaiting:
      "Du kan bekræfte afhentning, når restauranten har meldt maden klar.",
    pickedUpAt: "Hentet kl.",
    stalledPickup: "Ingen afhentning bekræftet kl. {time}",
    stalledHandover: "Ingen aflevering bekræftet kl. {time}",
    stalledHint:
      "MTOGO har fået besked. Leveringen er stadig din, så fortsæt som normalt.",
    routeToPickup: "Rute til afhentning",
    routeToCustomer: "Rute til kunden",
    appleMaps: "Apple Maps",
    routeToPickupApple: "Rute til afhentning i Apple Maps",
    routeToCustomerApple: "Rute til kunden i Apple Maps",
    nextDeliver: "Næste: Bring maden ud til kunden.",
    pickupCheckingHint:
      "Vi ved endnu ikke, om afhentningen blev registreret. Vi tjekker igen, når forbindelsen er tilbage.",
    pickupNotConfirmed: "Afhentningen blev ikke registreret. Prøv igen.",
    tripDistance: "Turen",
    fromYou: "fra dig",
    distanceUnavailable: "Afstand ikke tilgængelig",
    shareLocation: "Del min position",
    shareLocationHint:
      "Viser, hvor langt du har til hver afhentning, og deler din position med kunden, mens du kører med afhentet mad. Den sendes kun, mens siden er åben og vises på skærmen. Kun den seneste position gemmes, og den slettes, når leveringen slutter.",
    transitShared: "Kunden kan se din position fra kl. {time}.",
    transitWaiting: "Din position deles med kunden, så snart den er fundet.",
    transitOff:
      "Din position deles ikke med kunden. Du kan stadig registrere ankomst og levering.",
    transitOffline:
      "Ingen forbindelse. Din position sendes igen, når forbindelsen er tilbage.",
    transitFailed:
      "Din seneste position kunne ikke sendes. Vi prøver igen om lidt.",
    transitPauseNote:
      "Delingen holder pause, når skærmen er låst, eller du bruger en anden app. Kunden ser, hvornår positionen sidst blev opdateret.",
    locating: "Finder din position…",
    locationDenied:
      "Telefonen giver ikke siden lov til at bruge din position. Du kan tillade det i browserens indstillinger for siden.",
    locationUnavailable:
      "Din position kunne ikke findes lige nu. Afstande til afhentning vises ikke.",
    sortBy: "Sortér",
    sortOldest: "Ældste først",
    sortNearest: "Nærmeste afhentning",
    distanceAttribution:
      "Afstande: © openrouteservice.org | OpenStreetMap contributors",
    accessEnded:
      "Din adgang som leveringspartner er afsluttet. Hvis du har en levering, er den stadig tildelt dig, og MTOGO er gjort opmærksom på den. Kontakt MTOGO.",
    confirmHandover: "Jeg har afleveret maden",
    confirmHandoverTitle: "Er maden afleveret?",
    confirmHandoverHint:
      "Bekræft kun, når kunden eller den, kunden har udpeget, har fået maden i hånden. Tidspunktet registreres og kan ikke ændres.",
    confirmDelivered: "Ja, bekræft aflevering",
    confirmingHandover: "Registrerer aflevering…",
    handoverCheckingHint:
      "Vi ved endnu ikke, om afleveringen blev registreret. Vi tjekker igen, når forbindelsen er tilbage.",
    handoverNotConfirmed: "Afleveringen blev ikke registreret. Prøv igen.",
    recordArrival: "Jeg er fremme hos kunden",
    recordArrivalTitle: "Er du fremme ved kundens adresse?",
    recordArrivalHint:
      "Meld kun din ankomst, når du står ved adressen. Tidspunktet registreres og kan ikke ændres. Det er ikke det samme som aflevering.",
    confirmArrived: "Ja, jeg er fremme",
    recordingArrival: "Registrerer ankomst…",
    arrivalCheckingHint:
      "Vi ved endnu ikke, om din ankomst blev registreret. Vi tjekker igen, når forbindelsen er tilbage.",
    arrivalNotConfirmed: "Din ankomst blev ikke registreret. Prøv igen.",
    arrivedAt: "Fremme kl.",
    arrivedHint:
      "Får du ikke fat i kunden, så ring og registrér hvert forsøg. MTOGO underrettes, hvis maden ikke er afleveret 10 minutter efter din ankomst.",
    contactAttempts: "Kontaktforsøg",
    contactAttemptsNone: "Ingen kontaktforsøg registreret endnu.",
    contactAttemptAt: "Forsøg kl. {time}",
    recordContactAttempt: "Registrér kontaktforsøg",
    recordContactAttemptHint:
      "Tryk efter hvert forsøg på at nå kunden, fx et opkald uden svar. Det betyder ikke, at du har talt med kunden.",
    recordingContactAttempt: "Registrerer kontaktforsøg…",
    contactAttemptRecorded: "Kontaktforsøget er registreret.",
    contactAttemptChecking:
      "Vi ved endnu ikke, om forsøget blev registreret. Prøv igen; det samme forsøg tælles kun én gang.",
    unreachableCustomer:
      "Ingen aflevering 10 minutter efter ankomst (kl. {time})",
    unreachableHint:
      "MTOGO er underrettet og hjælper videre. Leveringen er stadig din, så bliv ved med at prøve at nå kunden.",
    completedTitle: "Levering afsluttet",
    completedAt: "Afleveret kl. {time}",
    completedNext: "Du kan nu påtage dig en ny levering.",
    cancelledTitle: "MTOGO har annulleret leveringen",
    cancelledAt:
      "Annulleret kl. {time}. Du skal hverken hente eller aflevere maden.",
    history: "Afsluttede leveringer",
    bonus: "Bonuspoint",
    bonusLoading: "Henter bonuspoint…",
    bonusProvisional: "Foreløbig denne måned",
    bonusCalculated: "Beregnet",
    bonusEmpty: "Ingen leverede ordrer denne måned endnu.",
    bonusFailed: "Bonuspoint kunne ikke indlæses. Prøv igen.",
    bonusUnavailable: "Point kan ikke beregnes, fordi oplysninger mangler.",
    bonusFood: "Madens værdi uden moms",
    bonusPickup: "Afhentning",
    bonusTimeYes: "Tidlig eller sen afhentning: ×1,25",
    bonusTimeNo: "Ingen tidsbonus",
    bonusRatingYes: "Bedømmelsesbonus: ×1,10",
    bonusRatingNo: "Ingen bedømmelsesbonus",
    bonusPoints: "point",
    bonusSoFar: "Denne måned indtil nu ≈ {amount}",
    bonusDeliveryCount: "Leveringer: {count}",
    bonusNoPool: "Ingen bonuspulje indtil videre denne måned",
    bonusNoPoints: "Du har ingen bonuspoint endnu denne måned",
    bonusDeliveryAmount: "≈ {amount} for denne levering",
    historyLink: "Se afsluttede leveringer",
    historyEmpty: "Du har endnu ingen afsluttede leveringer.",
    historyFailed: "Dine afsluttede leveringer kunne ikke hentes. Prøv igen.",
    historyUnavailable: "Leveringen findes ikke i dine afsluttede leveringer.",
    historyPrivacy:
      "Kundens navn, telefonnummer og adresse vises ikke, når leveringen er afsluttet.",
    backToHistory: "Tilbage til afsluttede leveringer",
    outcome: "Udfald",
    outcomeDelivered: "Afleveret",
    outcomeCancelled: "Annulleret",
    outcomeFailed: "Ikke leveret",
    milestones: "Tidspunkter",
    endedAt: "Afsluttet",
    pickedUp: "Hentet",
    assigned: "Ansvarlig fra",
    accepted: "Accepteret af restauranten",
    notRecorded: "Ikke registreret",
  },
  en: {
    title: "Delivery agent",
    menu: "Menu",
    menuClose: "Close menu",
    shareLocationInfo: "Why share my location?",
    signInTitle: "Sign in as a delivery agent",
    invitation: "Your invitation",
    email: "Email",
    password: "Password",
    signIn: "Sign in",
    signOut: "Sign out",
    accept: "Accept invitation",
    choosePassword: "Choose a password",
    invalid: "This link is invalid or has expired.",
    failed: "The action could not be completed. Please try again.",
    wrongCredentials: "Wrong email or password.",
    approved: "Approved areas",
    noAreas: "You have no approved postal codes yet.",
    filter: "Filter areas",
    save: "Save filter",
    empty: "No deliveries are available in your selected areas right now.",
    available: "Available deliveries",
    refresh: "Refresh",
    connection_connecting: "Connecting …",
    connection_live:
      "Live: available and current deliveries update automatically",
    connection_reconnecting: "Connection lost. Reconnecting …",
    connection_fallback:
      "Live updates are unavailable. Deliveries are reloaded every {seconds} seconds.",
    connection_offline:
      "No connection. Deliveries may be out of date. Retrying automatically.",
    loadFailed: "Deliveries could not be loaded. Try again.",
    pickup: "Pickup",
    destination: "Destination postal code",
    acceptedAt: "Accepted",
    claimBy: "Claim by",
    preparation: "Preparation",
    acceptedStatus: "Accepted",
    preparingStatus: "Preparing",
    readyStatus: "Ready for pickup",
    loading: "Loading deliveries…",
    next: "Next page",
    details: "View details",
    back: "Back to deliveries",
    unavailable: "This delivery is no longer available.",
    previous: "Previous page",
    staff: "Restaurant staff? Sign in here.",
    agent: "Delivery agent? Sign in here.",
    language: "Language",
    passwordHint: "At least 8 characters.",
    all: "All approved areas",
    claim: "Claim this delivery",
    claiming: "Claiming…",
    claimHint:
      "You become responsible for this delivery. It cannot be released or handed over from here.",
    checking: "Checking status…",
    checkingHint:
      "We do not know yet whether the claim went through. We check again when the connection is back.",
    notConfirmed:
      "The delivery was not claimed. Try again if it is still available.",
    claimed: "You are now responsible for this delivery.",
    current: "Your current delivery",
    noCurrent: "You have no current delivery.",
    busy: "Finish your current delivery before claiming another.",
    customer: "Customer",
    deliverTo: "Deliver to",
    call: "Call the Customer",
    noPhone: "No phone number given.",
    assignedAt: "Responsible since",
    assignedByOperator: "Assigned by MTOGO",
    currentFailed: "Your current delivery could not be loaded. Try again.",
    areas: "Areas",
    areasSelected: "{selected} of {total} towns",
    areasAll: "All {total} towns",
    areasHint:
      "Choose the towns you want to see deliveries from. This does not change where you are approved.",
    codesCount: "{count} codes",
    unnamedTown: "Postal code {code}",
    timeLeft: "{minutes} min left",
    underMinute: "Less than 1 min left",
    pickupAt: "Pick up at",
    responsible: "You are responsible",
    reportProblem: "Report a problem",
    problemCategory: "What is the problem?",
    problemNote: "Note (optional)",
    problemNoteHint: "Up to 280 characters. Do not include personal details.",
    sendProblem: "Send report",
    problemReported:
      "MTOGO has been notified. You remain responsible for this delivery.",
    problemAlreadyReported: "Already reported",
    problemUncertain:
      "We do not yet know if the report was received. Try again.",
    problemFailed: "The report could not be sent. Refresh and try again.",
    availableCount: "{count} available",
    confirmPickup: "I have collected the food",
    confirmPickupTitle: "Do you have the food in hand?",
    confirmPickupHint:
      "Only confirm once {restaurant} has handed you the food. The time is recorded and cannot be changed.",
    confirmCollected: "Yes, confirm pickup",
    notYet: "Not yet",
    confirmingPickup: "Recording pickup…",
    pickupWaiting:
      "You can confirm pickup once the Restaurant marks the food ready.",
    pickedUpAt: "Collected at",
    stalledPickup: "No pickup confirmed by {time}",
    stalledHandover: "No handover confirmed by {time}",
    stalledHint:
      "MTOGO has been notified. The delivery is still yours, so carry on as normal.",
    routeToPickup: "Route to pickup",
    routeToCustomer: "Route to the Customer",
    appleMaps: "Apple Maps",
    routeToPickupApple: "Route to pickup in Apple Maps",
    routeToCustomerApple: "Route to the Customer in Apple Maps",
    nextDeliver: "Next: take the food to the Customer.",
    pickupCheckingHint:
      "We do not know yet whether your pickup was recorded. We check again when the connection is back.",
    pickupNotConfirmed: "Your pickup was not recorded. Please try again.",
    tripDistance: "Trip",
    fromYou: "from you",
    distanceUnavailable: "Distance unavailable",
    shareLocation: "Share my location",
    shareLocationHint:
      "Shows how far each pickup is from you, and shares your position with the Customer while you carry collected food. It is sent only while this page is open and on screen. Only the latest position is kept, and it is deleted when the delivery ends.",
    transitShared: "The Customer can see your position from {time}.",
    transitWaiting:
      "Your position will be shared with the Customer as soon as it is found.",
    transitOff:
      "Your position is not shared with the Customer. You can still record arrival and handover.",
    transitOffline:
      "No connection. Your position will be sent again once the connection is back.",
    transitFailed:
      "Your latest position could not be sent. We will try again shortly.",
    transitPauseNote:
      "Sharing pauses while the screen is locked or you use another app. The Customer sees when your position was last updated.",
    locating: "Finding your location…",
    locationDenied:
      "Your phone is not letting this page use your location. You can allow it in the browser's settings for this site.",
    locationUnavailable:
      "Your location could not be found right now. Distances to pickups are not shown.",
    sortBy: "Sort",
    sortOldest: "Oldest first",
    sortNearest: "Nearest pickup",
    distanceAttribution:
      "Distances: © openrouteservice.org | OpenStreetMap contributors",
    accessEnded:
      "Your delivery agent access has ended. If you hold a delivery, it stays assigned to you and MTOGO has been alerted. Contact MTOGO.",
    confirmHandover: "I have handed over the food",
    confirmHandoverTitle: "Has the food been handed over?",
    confirmHandoverHint:
      "Only confirm once the Customer, or the person they chose, has the food in hand. The time is recorded and cannot be changed.",
    confirmDelivered: "Yes, confirm handover",
    confirmingHandover: "Recording handover…",
    handoverCheckingHint:
      "We do not know yet whether your handover was recorded. We check again when the connection is back.",
    handoverNotConfirmed: "Your handover was not recorded. Please try again.",
    recordArrival: "I have arrived at the Customer",
    recordArrivalTitle: "Are you at the Customer's address?",
    recordArrivalHint:
      "Only record your arrival once you are at the address. The time is recorded and cannot be changed. It is not the same as handover.",
    confirmArrived: "Yes, I have arrived",
    recordingArrival: "Recording arrival…",
    arrivalCheckingHint:
      "We do not know yet whether your arrival was recorded. We check again when the connection is back.",
    arrivalNotConfirmed: "Your arrival was not recorded. Please try again.",
    arrivedAt: "Arrived at",
    arrivedHint:
      "If you cannot reach the Customer, call and record each attempt. MTOGO is notified if the food has not been handed over 10 minutes after your arrival.",
    contactAttempts: "Contact attempts",
    contactAttemptsNone: "No contact attempts recorded yet.",
    contactAttemptAt: "Attempt at {time}",
    recordContactAttempt: "Record a contact attempt",
    recordContactAttemptHint:
      "Tap after each try to reach the Customer, such as an unanswered call. It does not mean you spoke to the Customer.",
    recordingContactAttempt: "Recording contact attempt…",
    contactAttemptRecorded: "The contact attempt has been recorded.",
    contactAttemptChecking:
      "We do not know yet whether the attempt was recorded. Try again; the same attempt is only counted once.",
    unreachableCustomer: "No handover 10 minutes after arrival ({time})",
    unreachableHint:
      "MTOGO has been notified and will help. The delivery is still yours, so keep trying to reach the Customer.",
    completedTitle: "Delivery completed",
    completedAt: "Handed over at {time}",
    completedNext: "You can now claim a new delivery.",
    cancelledTitle: "MTOGO cancelled this delivery",
    cancelledAt: "Cancelled at {time}. Do not collect or hand over the food.",
    history: "Completed deliveries",
    bonus: "Bonus points",
    bonusLoading: "Loading Bonus points…",
    bonusProvisional: "Provisional this month",
    bonusCalculated: "Calculated",
    bonusEmpty: "No delivered orders this month yet.",
    bonusFailed: "Could not load Bonus points. Try again.",
    bonusUnavailable:
      "Points cannot be calculated because information is missing.",
    bonusFood: "Food value excluding VAT",
    bonusPickup: "Pickup",
    bonusTimeYes: "Early or late pickup: ×1.25",
    bonusTimeNo: "No time bonus",
    bonusRatingYes: "Rating bonus: ×1.10",
    bonusRatingNo: "No rating bonus",
    bonusPoints: "points",
    bonusSoFar: "This month so far ≈ {amount}",
    bonusDeliveryCount: "Deliveries: {count}",
    bonusNoPool: "No bonus pool so far this month",
    bonusNoPoints: "You have no bonus points yet this month",
    bonusDeliveryAmount: "≈ {amount} for this delivery",
    historyLink: "View completed deliveries",
    historyEmpty: "You have no completed deliveries yet.",
    historyFailed: "Your completed deliveries could not be loaded. Try again.",
    historyUnavailable: "This delivery is not among your completed deliveries.",
    historyPrivacy:
      "The Customer's name, phone number and address are not shown once a delivery has ended.",
    backToHistory: "Back to completed deliveries",
    outcome: "Outcome",
    outcomeDelivered: "Delivered",
    outcomeCancelled: "Cancelled",
    outcomeFailed: "Not delivered",
    milestones: "Times",
    endedAt: "Ended",
    pickedUp: "Collected",
    assigned: "Responsible from",
    accepted: "Accepted by the Restaurant",
    notRecorded: "Not recorded",
  },
} as const

/** Codes a claim can be refused with; `unknown_error` covers the rest. */
export const DELIVERY_CLAIM_ERROR_CODES = [
  "delivery_already_assigned",
  "delivery_agent_has_active_delivery",
  "claim_deadline_passed",
  "delivery_outside_approved_areas",
  "delivery_not_active",
  "delivery_not_found",
  "assignment_request_reused",
  "unknown_error",
] as const
export type DeliveryClaimErrorCode = (typeof DELIVERY_CLAIM_ERROR_CODES)[number]

export function isDeliveryClaimErrorCode(
  value: unknown,
): value is DeliveryClaimErrorCode {
  return DELIVERY_CLAIM_ERROR_CODES.some((code) => code === value)
}

export const DELIVERY_CLAIM_ERRORS: Record<
  "da" | "en",
  Record<DeliveryClaimErrorCode, string>
> = {
  da: {
    delivery_already_assigned:
      "En anden leveringspartner har allerede påtaget sig leveringen.",
    delivery_agent_has_active_delivery:
      "Du har allerede en aktiv levering. Gør den færdig først.",
    claim_deadline_passed: "Fristen for at påtage sig leveringen er udløbet.",
    delivery_outside_approved_areas:
      "Leveringen ligger ikke længere inden for dine godkendte områder.",
    delivery_not_active: "Ordren er ikke længere aktiv.",
    delivery_not_found: "Leveringen er ikke længere tilgængelig.",
    assignment_request_reused:
      "Handlingen kunne ikke gennemføres. Opdater siden, og prøv igen.",
    unknown_error: "Handlingen kunne ikke gennemføres. Prøv igen.",
  },
  en: {
    delivery_already_assigned:
      "Another delivery agent has already claimed this delivery.",
    delivery_agent_has_active_delivery:
      "You already have an active delivery. Finish it first.",
    claim_deadline_passed:
      "The deadline for claiming this delivery has passed.",
    delivery_outside_approved_areas:
      "This delivery is no longer within your approved areas.",
    delivery_not_active: "This Order is no longer active.",
    delivery_not_found: "This delivery is no longer available.",
    assignment_request_reused:
      "The action could not be completed. Refresh the page and try again.",
    unknown_error: "The action could not be completed. Please try again.",
  },
}

/** Codes a pickup can be refused with; `unknown_error` covers the rest. */
export const DELIVERY_PICKUP_ERROR_CODES = [
  "food_not_ready",
  "delivery_not_responsible",
  "delivery_not_active",
  "delivery_not_found",
  "pickup_request_reused",
  "delivery_changed",
  "unknown_error",
] as const
export type DeliveryPickupErrorCode =
  (typeof DELIVERY_PICKUP_ERROR_CODES)[number]

export function isDeliveryPickupErrorCode(
  value: unknown,
): value is DeliveryPickupErrorCode {
  return DELIVERY_PICKUP_ERROR_CODES.some((code) => code === value)
}

export const DELIVERY_PICKUP_ERRORS: Record<
  "da" | "en",
  Record<DeliveryPickupErrorCode, string>
> = {
  da: {
    food_not_ready: "Maden er ikke meldt klar endnu.",
    delivery_not_responsible: "Du er ikke ansvarlig for denne levering.",
    delivery_not_active: "Ordren er ikke længere aktiv.",
    delivery_not_found: "Leveringen findes ikke længere.",
    pickup_request_reused:
      "Handlingen kunne ikke gennemføres. Opdater siden, og prøv igen.",
    delivery_changed: "Leveringen er ændret. Opdater siden, og prøv igen.",
    unknown_error: "Handlingen kunne ikke gennemføres. Prøv igen.",
  },
  en: {
    food_not_ready: "The food has not been marked ready yet.",
    delivery_not_responsible: "You are not responsible for this delivery.",
    delivery_not_active: "This Order is no longer active.",
    delivery_not_found: "This delivery no longer exists.",
    pickup_request_reused:
      "The action could not be completed. Refresh the page and try again.",
    delivery_changed:
      "This delivery has changed. Refresh the page and try again.",
    unknown_error: "The action could not be completed. Please try again.",
  },
}

/** Codes a handover can be refused with; `unknown_error` covers the rest. */
export const DELIVERY_HANDOVER_ERROR_CODES = [
  "pickup_not_recorded",
  "delivery_not_responsible",
  "delivery_not_active",
  "delivery_not_found",
  "handover_request_reused",
  "delivery_changed",
  "unknown_error",
] as const
export type DeliveryHandoverErrorCode =
  (typeof DELIVERY_HANDOVER_ERROR_CODES)[number]

export function isDeliveryHandoverErrorCode(
  value: unknown,
): value is DeliveryHandoverErrorCode {
  return DELIVERY_HANDOVER_ERROR_CODES.some((code) => code === value)
}

export const DELIVERY_HANDOVER_ERRORS: Record<
  "da" | "en",
  Record<DeliveryHandoverErrorCode, string>
> = {
  da: {
    pickup_not_recorded: "Bekræft afhentning, før du bekræfter aflevering.",
    delivery_not_responsible: "Du er ikke ansvarlig for denne levering.",
    delivery_not_active: "Leveringen er ikke længere aktiv.",
    delivery_not_found: "Leveringen findes ikke længere.",
    handover_request_reused:
      "Handlingen kunne ikke gennemføres. Opdater siden, og prøv igen.",
    delivery_changed: "Leveringen er ændret. Opdater siden, og prøv igen.",
    unknown_error: "Handlingen kunne ikke gennemføres. Prøv igen.",
  },
  en: {
    pickup_not_recorded: "Confirm pickup before confirming handover.",
    delivery_not_responsible: "You are not responsible for this delivery.",
    delivery_not_active: "This delivery is no longer active.",
    delivery_not_found: "This delivery no longer exists.",
    handover_request_reused:
      "The action could not be completed. Refresh the page and try again.",
    delivery_changed:
      "This delivery has changed. Refresh the page and try again.",
    unknown_error: "The action could not be completed. Please try again.",
  },
}

/** Codes an arrival can be refused with; `unknown_error` covers the rest. */
export const DELIVERY_ARRIVAL_ERROR_CODES = [
  "pickup_not_recorded",
  "delivery_not_responsible",
  "delivery_not_active",
  "delivery_not_found",
  "arrival_request_reused",
  "delivery_changed",
  "unknown_error",
] as const
export type DeliveryArrivalErrorCode =
  (typeof DELIVERY_ARRIVAL_ERROR_CODES)[number]

export function isDeliveryArrivalErrorCode(
  value: unknown,
): value is DeliveryArrivalErrorCode {
  return DELIVERY_ARRIVAL_ERROR_CODES.some((code) => code === value)
}

export const DELIVERY_ARRIVAL_ERRORS: Record<
  "da" | "en",
  Record<DeliveryArrivalErrorCode, string>
> = {
  da: {
    pickup_not_recorded: "Bekræft afhentning, før du melder din ankomst.",
    delivery_not_responsible: "Du er ikke ansvarlig for denne levering.",
    delivery_not_active: "Leveringen er ikke længere aktiv.",
    delivery_not_found: "Leveringen findes ikke længere.",
    arrival_request_reused:
      "Handlingen kunne ikke gennemføres. Opdater siden, og prøv igen.",
    delivery_changed: "Leveringen er ændret. Opdater siden, og prøv igen.",
    unknown_error: "Handlingen kunne ikke gennemføres. Prøv igen.",
  },
  en: {
    pickup_not_recorded: "Confirm pickup before recording your arrival.",
    delivery_not_responsible: "You are not responsible for this delivery.",
    delivery_not_active: "This delivery is no longer active.",
    delivery_not_found: "This delivery no longer exists.",
    arrival_request_reused:
      "The action could not be completed. Refresh the page and try again.",
    delivery_changed:
      "This delivery has changed. Refresh the page and try again.",
    unknown_error: "The action could not be completed. Please try again.",
  },
}

/** Codes a contact attempt can be refused with; `unknown_error` covers the rest. */
export const DELIVERY_CONTACT_ATTEMPT_ERROR_CODES = [
  "arrival_not_recorded",
  "delivery_not_responsible",
  "delivery_not_active",
  "delivery_not_found",
  "contact_attempt_limit_reached",
  "contact_attempt_request_reused",
  "unknown_error",
] as const
export type DeliveryContactAttemptErrorCode =
  (typeof DELIVERY_CONTACT_ATTEMPT_ERROR_CODES)[number]

export function isDeliveryContactAttemptErrorCode(
  value: unknown,
): value is DeliveryContactAttemptErrorCode {
  return DELIVERY_CONTACT_ATTEMPT_ERROR_CODES.some((code) => code === value)
}

export const DELIVERY_CONTACT_ATTEMPT_ERRORS: Record<
  "da" | "en",
  Record<DeliveryContactAttemptErrorCode, string>
> = {
  da: {
    arrival_not_recorded:
      "Meld din ankomst, før du registrerer et kontaktforsøg.",
    delivery_not_responsible: "Du er ikke ansvarlig for denne levering.",
    delivery_not_active: "Leveringen er ikke længere aktiv.",
    delivery_not_found: "Leveringen findes ikke længere.",
    contact_attempt_limit_reached:
      "Der kan ikke registreres flere kontaktforsøg. MTOGO er underrettet.",
    contact_attempt_request_reused:
      "Handlingen kunne ikke gennemføres. Opdater siden, og prøv igen.",
    unknown_error: "Handlingen kunne ikke gennemføres. Prøv igen.",
  },
  en: {
    arrival_not_recorded:
      "Record your arrival before recording a contact attempt.",
    delivery_not_responsible: "You are not responsible for this delivery.",
    delivery_not_active: "This delivery is no longer active.",
    delivery_not_found: "This delivery no longer exists.",
    contact_attempt_limit_reached:
      "No more contact attempts can be recorded. MTOGO has been notified.",
    contact_attempt_request_reused:
      "The action could not be completed. Refresh the page and try again.",
    unknown_error: "The action could not be completed. Please try again.",
  },
}
