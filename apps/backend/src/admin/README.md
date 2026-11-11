# Admin Customizations

You can extend the Medusa Admin to add widgets and new pages. Your customizations interact with API routes to provide merchants with custom functionalities.

> Learn more about Admin Extensions in [this documentation](https://docs.medusajs.com/learn/fundamentals/admin).

## Example: Create a Widget

A widget is a React component that can be injected into an existing page in the admin dashboard.

For example, create the file `src/admin/widgets/product-widget.tsx` with the following content:

```tsx title="src/admin/widgets/product-widget.tsx"
import { defineWidgetConfig } from "@medusajs/admin-sdk"

// The widget
const ProductWidget = () => {
  return (
    <div>
      <h2>Product Widget</h2>
    </div>
  )
}

// The widget's configurations
export const config = defineWidgetConfig({
  zone: "product.details.after",
})

export default ProductWidget
```

This inserts a widget with the text “Product Widget” at the end of a product’s details page.

## Restaurants

The Restaurants route registers and edits pickup details and contacts through
the authenticated Restaurant APIs. The Restaurant page also shows the activation
readiness checklist with the read-only menu status, the delivery area (search
the postal code register, add or remove a whole town or single codes) and the commercial terms (record or remove the agreement,
with the commission tiers and service fee read-only). Requirement and error codes
are turned into English text in `lib/restaurant-api.ts` (ADR-0018). React Query is pinned to the Dashboard version
(5.64.2). The Admin Vite configuration deduplicates React Query and its core so
Dashboard and extensions share one provider even with nested npm installations.
The operator journey in the disposable browser suite guards this integration.

The `admin.vite` callback returns only overrides: Medusa merges them with its base
configuration. Returning the base plugins would apply React Refresh twice in
`medusa develop`, even though production builds pass. Run root
`npm run verify:admin-development` to compile both Restaurant pages through the
real development bundler in a disposable frontend workspace, without a database
or API server. This also runs in `verify:applications` after the browser journeys.
