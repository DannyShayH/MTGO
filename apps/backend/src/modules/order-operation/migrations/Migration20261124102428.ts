import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261124102428 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "order_operation" drop constraint if exists "order_operation_cancellation_category_check";`,
    )

    this.addSql(
      `alter table if exists "order_operation" add constraint "order_operation_cancellation_category_check" check("cancellation_category" in ('restaurant_rejected', 'acceptance_timeout', 'customer_cancelled', 'unassigned_timeout', 'operator_cancelled'));`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "order_operation" drop constraint if exists "order_operation_cancellation_category_check";`,
    )

    this.addSql(
      `alter table if exists "order_operation" add constraint "order_operation_cancellation_category_check" check("cancellation_category" in ('restaurant_rejected', 'acceptance_timeout', 'customer_cancelled', 'unassigned_timeout'));`,
    )
  }
}
