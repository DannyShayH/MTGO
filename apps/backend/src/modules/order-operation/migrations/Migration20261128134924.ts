import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261128134924 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_order_operation_delivery_ended_at" ON "order_operation" ("delivery_ended_at") WHERE delivery_outcome = 'delivered' AND deleted_at IS NULL;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_order_operation_delivery_ended_at";`)
  }
}
