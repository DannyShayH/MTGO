# Module Links

A module link forms an association between two data models of different modules, while maintaining module isolation.

> Learn more about links in [this documentation](https://docs.medusajs.com/learn/fundamentals/module-links)

For example:

```ts
import BlogModule from "../modules/blog"
import ProductModule from "@medusajs/medusa/product"
import { defineLink } from "@medusajs/framework/utils"

export default defineLink(
  ProductModule.linkable.product,
  BlogModule.linkable.post,
)
```

This defines a link between the Product Module's `product` data model and the Blog Module (custom module)'s `post` data model.

MTOGO's `restaurant-stock-location.ts` link is one-to-one. It makes the native
stock location part of each Restaurant's setup, so pickup fulfillment can
resolve the Restaurant that owns the Order instead of a platform-wide location.

`order-feedback.ts` is read-only and one-to-one: `order.feedback` is the
Customer's Feedback (#218) whose `order_id` names the Order. Recording the
Feedback is the only write, so there is no link row to keep in step.

`order-restaurant-finance.ts` is read-only: `order.finance_receipt` is the
Restaurant finance recognition (#227) whose `order_id` names the Order. The
receipt is the only write, and having no link table means removing an Order's
operational data never cascades into financial history.

Then, in the Medusa application, run the following command to sync the links to the database:

```bash
npx medusa db:migrate
```
