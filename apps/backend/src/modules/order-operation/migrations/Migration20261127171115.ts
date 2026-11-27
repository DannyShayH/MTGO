import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261127171115 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "order_operation" add column if not exists "delivery_assigned_at" timestamptz null;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_order_operation_restaurant_id_state" ON "order_operation" ("restaurant_id", "state") WHERE state <> 'cancelled' AND delivery_outcome IS NULL AND deleted_at IS NULL;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `drop index if exists "IDX_order_operation_restaurant_id_state";`,
    )
    this.addSql(
      `alter table if exists "order_operation" drop column if exists "delivery_assigned_at";`,
    )
  }
}
