import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261118110534 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_order_operation_restaurant_id_updated_at" ON "order_operation" ("restaurant_id", "updated_at") WHERE deleted_at IS NULL;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `drop index if exists "IDX_order_operation_restaurant_id_updated_at";`,
    )
  }
}
