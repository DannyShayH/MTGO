# Medusa Admin stays English only for MTOGO operators in the MVP

Agreed on 11 November 2026 in the Feature #43 grill (discovery #67). This narrows ADR-0004 for the operator journey: Medusa Admin, including the pages and widgets we add, is English only in the MVP. Danish and English apply to the Customer storefront and the partner app (ADR-0017). Admin 2.22.4 ships no Danish translation of its own screens, so Danish extension pages would sit inside English screens. Translating them now would cost every operator work item without giving operators a consistent Danish journey.

To keep Danish addable later without backend changes, the API reports outcomes such as missing activation requirements as codes, never as sentences, and each UI turns the codes into text.
