---
title: Customer accounts specification
description: Feature 45 specification synthesized from the agreed Customer accounts and delivery-details discovery.
sidebar:
  order: 4
---

Specification for [Feature #45](https://github.com/DannyShayH/MTGO/issues/45), synthesized on 12 November 2026 from [discovery #69](https://github.com/DannyShayH/MTGO/issues/69) and the team's answers to Q1–Q25. The [discovery record](/MTGO/product/customer-accounts/) contains source evidence and acceptance examples. Browser and direct HTTP testing boundaries were confirmed in Q24. This document specifies required behavior; implementation and verification remain outstanding.

## Problem Statement

Customers need a personal account that keeps their basket, delivery details and language usable through sign-in and recovery. They need to know which destination and phone an Order will use, see their own purchase history, and change account details without altering an ongoing delivery or exposing private information to another person sharing a browser.

The starter supplies account and address functionality, but its source does not establish the required verified checkout, protected Order retrieval, working recovery/email editing, cross-device session revocation or persistent account language. Customers must not encounter account editors that report success without saving.

## Solution

Provide email/password Customer accounts with verified checkout access, preserved and isolated baskets, editable account and saved delivery details, Danish/English preferences and private Order history. Confirm each Order's destination, contact details and language independently of later account edits. Demonstrate complete verification, password recovery and email-change journeys through a private test mailbox, including delivery failures and retry.

## User Stories

1. As a visitor, I want to browse Restaurants and menus before signing in, so that I can choose food before creating an account.
2. As a visitor, I want to build a basket before signing in, so that my food selection does not depend on registration.
3. As a visitor, I want to register with only email and password, so that I can provide delivery details when ordering.
4. As a visitor, I want my basket preserved through registration or sign-in and a return to checkout, so that I do not repeat my selection.
5. As a Customer, I want to verify my email before entering checkout, so that account email access is confirmed.
6. As a Customer, I want to resend an expired verification message while keeping my basket, so that I can recover from an interrupted registration.
7. As a Customer, I want verification-delivery failures to leave browsing available and checkout locked, so that a failed email does not bypass verification.
8. As a Customer, I want sign-in errors to explain the next action in my language, so that I can recover without seeing technical details.
9. As a Customer, I want to request a password reset, so that I can regain access after forgetting my password.
10. As a Customer, I want an expiring, single-use password-reset link and fresh sign-in afterward, so that an old link cannot be reused.
11. As a visitor, I want the same reset-request confirmation for known and unknown emails, so that recovery does not disclose account membership.
12. As a Customer, I want to use the reset flow to change my password, so that password changes follow one working journey.
13. As a Customer, I want failed reset-email delivery to leave my existing password usable and allow retry, so that delivery failure does not lock me out.
14. As a Customer, I want to edit my name and phone, so that future Orders can use current details.
15. As a Customer, I want multiple saved delivery addresses, so that I can reuse the locations where I receive food.
16. As a Customer, I want one optional default saved delivery address, so that I can choose a convenient starting destination.
17. As a Customer, I want deleting my default address to leave no default, so that the system does not choose a different destination for me.
18. As a Customer, I want to edit and delete saved delivery addresses, so that my address book remains useful.
19. As a Customer, I want a one-time delivery destination without saving it, so that occasional destinations do not fill my address book.
20. As a Customer, I want clear errors for missing name, phone, street, house number, Danish postal code or city, so that I can complete delivery details before ordering.
21. As a Customer, I want apartment and floor details to be optional, so that I provide them only when needed.
22. As a Customer, I want to use a valid international mobile number with a country code for a Danish delivery, so that I can be contacted on my own phone.
23. As a Customer, I want to review the phone's delivery-contact and status-message use, so that I understand what confirming it means.
24. As a Customer, I want validation failures to retain entered values, so that correcting one field does not erase my work.
25. As a Customer, I want checkout to keep the destination I reviewed when the address book changes in another tab, so that my delivery does not silently move.
26. As a Customer, I want to review an updated address when selecting it again, so that changes become part of my explicit confirmation.
27. As a Customer, I want each Order to retain its confirmed destination, name and phone, so that later account edits do not redirect an ongoing delivery.
28. As a visitor, I want to select Danish or English before signing in, so that I can use the website in my preferred language.
29. As a visitor, I want a remembered choice, then browser preference, then Danish as the language fallback, so that the first visit has predictable text.
30. As a Customer, I want my saved account language to apply after sign-in across devices, so that my preference follows my account.
31. As a newly registered Customer, I want the registration language saved to my account, so that creating an account preserves my choice.
32. As a Customer, I want later explicit language changes to update my account, so that future visits and security messages use my new preference.
33. As a Customer, I want to confirm the Order language at checkout, so that its status communications use the language I reviewed.
34. As a Customer, I want an existing Order's language preserved after preference changes, so that its communication history stays consistent.
35. As a Customer, I want security messages generated in my current account language, so that recovery does not depend on an old Order's language.
36. As a Customer, I want to change my login email after entering my current password and verifying the new mailbox, so that I can keep my account when changing email providers.
37. As a Customer, I want the old login to work until the email change completes, so that expired links, duplicate emails or failed updates leave my account usable.
38. As a Customer, I want a successful email change to update both sign-in and profile email while keeping my Orders and addresses, so that the change does not create a replacement account.
39. As a Customer, I want a notification sent to my old address after the email change, so that the old mailbox receives notice without needing to approve the change.
40. As a Customer, I want email changes to work without access to my old mailbox when I still know my password, so that losing that mailbox alone does not end access to my account.
41. As a Customer, I want failed notification to the old address to remain retryable after a completed email change, so that delivery failure does not undo my new login.
42. As a Customer, I want a successful password reset or email change to revoke my existing Customer sessions on all devices, so that old sessions cannot retain private access.
43. As a Customer who also has Restaurant staff or MTOGO operator access, I want Customer security changes to leave that other access unaffected, so that my roles stay separate.
44. As a Customer, I want session expiry to preserve my basket for sign-in recovery, so that an interruption does not erase my selection.
45. As a Customer, I want a different person signing in on the same browser to receive none of my preserved basket or delivery details, so that account switching protects my information.
46. As a Customer, I want explicit sign-out to clear this browser's access to my basket and private details, so that the next visitor starts fresh.
47. As a Customer, I want a failed basket transfer to retain the basket and offer retry before checkout, so that sign-in does not silently lose my selection.
48. As a Customer, I want a newest-first, paginated list of my own Orders showing reference, date, Restaurant, total and current status, so that I can find a purchase.
49. As a Customer, I want basic Order details with purchased items and confirmed delivery information, so that I can review what I ordered and where it is going.
50. As a Customer, I want clear empty and failed-loading states in Order history, so that I can distinguish no purchases from a retrieval problem.
51. As a Customer, I want private account, address and Order access enforced through the API as well as the website, so that another caller cannot bypass the interface.
52. As a Customer, I want Orders to remain owned by the Customer who placed them, so that another account cannot obtain them through a transfer request or link.
53. As a Customer, I want the complete account journey usable with a keyboard in Danish and English, so that forms and recovery do not depend on a mouse or English proficiency.
54. As an MTOGO operator, I want failed old-address notifications visible for retry, so that a completed email change can retain delivery follow-up without exposing recovery links publicly.
55. As a teammate demonstrating the MVP, I want a private test mailbox that exercises actual security links, expiry, resend and delivery failures, so that the account journey can be demonstrated without real outbound email or verification shortcuts.

## Implementation Decisions

### Reuse and application boundaries

- Keep installed Medusa 2.22.4 and reuse Customer, CustomerAddress, Auth, Order and commerce workflows. The Restaurant recipe remains a reference with the adaptations recorded in its compatibility review; it does not replace agreed access or history rules.
- Extend the existing account, address, Order-history and checkout-entry surfaces, the backend account/authentication workflows and HTTP enforcement, shared translations and the notification integration. The separate partner app and operator role retain their own access boundaries.
- Keep business decisions in workflows and steps, validation/authentication at the HTTP boundary, and persistence in module services. Commerce mutations use core-flows. Apps use shared packages without importing each other.
- Use the existing Medusa JS SDK boundary for storefront server-side API access, including authentication and the publishable key. Return stable error codes that the interface maps to Danish/English messages. Replace placeholder account editors with the agreed working behavior.

### Authentication, recovery and role isolation

- Registration requires only email/password. Browsing and basket building stay public. Checkout entry requires a signed-in, email-verified Customer, and direct submission must independently enforce the same identity, verification and basket-ownership conditions. Verification tokens never act as unrestricted Customer sessions.
- Reuse Medusa verification and password-reset capabilities while enforcing expiring, single-use reset links and neutral recovery confirmations. Keep resend and delivery-failure recovery available. Changing a password uses the reset journey and requires sign-in afterward.
- Login-email change is pending until the current password is confirmed and the new mailbox verified. The public result is either the original usable login or a completed change to both login/profile email for the same Customer. Reject unavailable addresses and handle competing confirmations consistently; partial updates must not strand the Customer or move Order ownership.
- Keep Customer ownership tied to the stable Customer identity rather than email. Preserve saved addresses and Orders through email changes. Expired, reused or superseded confirmation attempts must not complete a different change or restore an old email.
- Successful password reset or email change revokes existing Customer sessions across devices, including old bearer tokens, refresh attempts and any supported session authentication. Require fresh sign-in while retaining the basket for recovery by its owner. Removing only the current browser cookie does not satisfy revocation.
- The installed provider can share an Auth identity across actor links and identifies email/password logins by provider identity. Changing a shared provider record is not evidence of Customer-only behavior. Implement and verify Customer credential, verification, recovery and revocation isolation from Restaurant staff and MTOGO operator access, including a person using the same email in multiple roles.
- Preserve existing Customer and Auth modules. Document any required account-security state, migration, configured token lifetimes and resend controls in the relevant implementation work item before using them. The discovery established behavioral requirements, not an unverified claim that built-in APIs already supply role isolation or revocation.

### Basket and delivery contracts

- Preserve an anonymous visitor's basket through registration/sign-in and return them to checkout. If transfer fails, retain it and offer retry before continuing. Recover an expired Customer basket only for that Customer; another Customer starts fresh. Explicit sign-out clears browser access to private details and the basket.
- Reuse saved delivery addresses with at most one optional default. Removing the default leaves no default. One-time destinations are not automatically saved. Checkout holds its reviewed destination independently of later address-book changes; reselecting an updated entry requires review.
- Require Customer name, mobile-number format with a country code, street and house number, four-digit Danish postal code and city before ordering. Accept international mobile numbers for Danish destinations; apartment/floor remain optional. Confirmation is Customer review, not proof of phone ownership or address existence. Preserve field values on validation failure.
- Supply Feature #46 with an authenticated, verified Customer and the confirmed destination, Order contact details and Order language. Feature #46 checks Restaurant delivery eligibility before payment and preserves those reviewed facts when placing the Order. Later account/address edits do not mutate an existing Order; active-Order corrections use the separate operator process.

### Language, email delivery and Order history

- Support Danish and English throughout the Customer journey. Signed-out resolution is remembered choice, browser preference, then Danish. An existing account's saved preference wins after sign-in; a new account keeps its registration language. Explicit later changes persist to the account across devices.
- Confirm and preserve Order language independently of current account language. Generate security emails in the saved account language at message creation, using registration language for the initial verification. Recovery-page responses do not disclose account existence.
- Use a private test mailbox for verification, password reset, new-address confirmation and old-address notice. Exercise actual security links and delivery failures without public recovery links or verification bypass. Failed verification keeps checkout locked; failed reset delivery leaves the old password usable; failed new-address confirmation keeps the old login. Failed old-address notice after completion leaves the new login effective and remains visible for retry and operator attention.
- Reuse newest-first Order list/detail capabilities and add the required presentation, pagination and empty/error states. Display Order reference, date, Restaurant, total, current status, purchased items and confirmed delivery information. The later timeline Feature supplies business progress events.
- Enforce Customer ownership on account, address, history and direct Order-detail access; possession of an Order ID or link is insufficient. Remove the transfer interface and disable transfer APIs. Role-authorized operational views remain governed by the separate role rules and do not grant access to Customer account history.

## Testing Decisions

### Confirmed seams

- **Primary: complete application journeys through the browser.** Extend existing Playwright storefront coverage against the real built backend and disposable database. Exercise registration, verification, sign-in, account/address editing, language, recovery, email change and private Order history through visible controls. Assert user-visible outcomes and externally observable state rather than React internals or workflow call counts.
- **Complement: direct public HTTP contracts.** Extend the existing Medusa HTTP integration runner. The partner sign-in/access suite already demonstrates real email/password registration, authentication, wrong-role checks and table-driven authorization; Restaurant setup suites demonstrate workflow-backed state. Reuse these patterns for Customer ownership, verification, validation and security-state tests. Seed fixtures through supported workflows; do not mock ownership checks or issue only fabricated tokens for successful account journeys.
- These seams match the team's Q24 approval of storefront journeys plus direct API checks. Use focused unit tests for custom validation and security-state rules when needed by the repository standard; add module integration only for new persistence guarantees that application tests cannot express adequately. Avoid tests that merely repeat implementation structure.

### Required cases

- Treat the discovery acceptance examples and numbered stories as the expected behavior. Use equivalence partitioning, boundary values and decision tables; collect each rule set in a data-driven table with a reason per row. Cover missing, empty, whitespace-only, malformed and valid delivery fields; expiry boundaries; actor type, sign-in, verification, ownership and revoked-state combinations.
- Prove direct access cannot bypass checkout authentication, basket ownership, Customer-address ownership, Order-detail protection or transfer restrictions. Include signed-out callers, unverified Customers, another Customer, Restaurant staff and Delivery agents; retain separately authorized operator behavior.
- Exercise two browser/device sessions for reset and email-change revocation, then try old API tokens and token refresh. Include same-email Customer/staff/operator identities and prove other-role credentials and sessions remain usable.
- Exercise duplicate/new-email conflicts, expired/reused/superseded links, repeated and competing confirmations, interrupted updates, and retry after delivery failures. Assert the original usable account or the completed new login, stable Customer/Order ownership and no partial credential state. Use fixed clocks and synthetic mailboxes; tokens and personal data must not appear in public reports or logs.
- Demonstrate basket preservation after sign-in, transfer failure, expiry and security changes; separately demonstrate explicit sign-out and different-Customer sign-in isolation. Exercise address-book edits/deletion in another tab without silently changing reviewed checkout details.
- Demonstrate registration language, signed-out fallbacks, saved-account precedence after sign-in and cross-device preference persistence. Confirm security-email language is current while existing Order language remains historical. Verify name, phone and destination preservation through the later ordering integration.
- Exercise the complete Customer journey in Danish and English with keyboard-operable controls, understandable validation and recoverable errors. Operators' existing English-only Admin boundary remains intact.

### Environment and evidence

- Use the existing source-snapshot application verification and Playwright setup with disposable CI configuration and a loopback PostgreSQL database named for CI. Tests must never target a live store or use developer secrets. The private mailbox must permit deterministic success/failure, expiry and retry scenarios without weakening public authentication.
- Use synthetic Customers with different owners and enough historical Orders to span pages. Verify newest-first history, pagination, details, empty results, retrieval failure and ownership after profile/email edits. Coordinate paid-Order fixture contracts with Feature #46 rather than treating the starter's guest checkout as approved behavior.
- Measure account-history/detail reads under twenty simultaneous journeys, with 95% completing within two seconds. Record environment, workload, data and results. Full reporting-scale data remains with reporting Features; the five-second mock-payment submission target remains with Feature #46.
- Implementation work items run applicable lint, architecture, unit and HTTP/module tests and application/browser verification. Keep traceable evidence for each story and acceptance rule. The present specification does not claim those application tests or performance measurements have passed.

## Out of Scope

- Social sign-in, sign-in without a password, operator-created Customer accounts, telephone ordering, native apps and scheduled ordering.
- Real outbound email delivery; the MVP demonstrates captured private email instead.
- Manual recovery after losing both password and mailbox access, self-service account deletion and a separate password editor.
- SMS phone-ownership verification and external address verification. Mobile format validation cannot guarantee phone ownership or reachability.
- Customer-to-Customer Order transfers, automatic account/Order merging and ordering for a separate recipient. Creating another account does not transfer existing Orders.
- Location-based language suggestion, tracked separately as Could have [#83](https://github.com/DannyShayH/MTGO/issues/83).
- Payment, Restaurant delivery-eligibility enforcement and paid-Order placement, owned by Feature #46; detailed progress events and status-notification delivery, owned by the later timeline/notification Feature. Their integration must consume the account contracts defined here.
- New operator correction policy, broad staff/operator account redesign and full reporting-scale benchmarks. Preserve the existing role and correction rules.

## Further Notes

- Feature #45 remains Must have with the evolving week-47 paid-ordering demo goal. This is not a delivery promise or a fixed implementation budget. Discovery #69 is separate from Feature completion.
- The team confirmed the grill in Q25 and explicitly invoked this specification. Test seams were confirmed in Q24. Work-item creation requires the team's separate invocation of the next step; eventual slices must be independently demonstrable and effort M or smaller.
- Reuse is subject to installed-version evidence. The discovered unprotected Order-detail route, unauthenticated cart-completion boundary, placeholder editors, missing email delivery, shared actor identities and unproven token revocation are explicit implementation gaps.
- [ADR-0004](/MTGO/architecture/decisions/0004-website-mvp-with-mocked-external-services/) includes the agreed private-email extension. [ADR-0005](/MTGO/architecture/decisions/0005-single-restaurant-orders-and-historical-facts/), [ADR-0008](/MTGO/architecture/decisions/0008-role-boundaries-and-restaurant-activation/) and [ADR-0013](/MTGO/architecture/decisions/0013-order-timeline-and-independent-notification-delivery/) govern ownership, history and language. [ADR-0017](/MTGO/architecture/decisions/0017-partner-app-for-restaurant-staff-and-delivery-agents/) and [ADR-0018](/MTGO/architecture/decisions/0018-english-only-medusa-admin-for-operators/) preserve partner/operator boundaries.
- Follow the [recipe compatibility review](/MTGO/architecture/restaurant-recipe-review/), [shared acceptance requirements](/MTGO/quality/product-acceptance/) and [coding standard](/MTGO/way-of-working/coding-standard/). Technical choices still requiring implementation evidence include the exact role-isolated identity arrangement, revocation state, pending-email persistence, migration shape and configured expiry/resend policy. Resolve and document them within the implementation work items while satisfying these observable contracts.
