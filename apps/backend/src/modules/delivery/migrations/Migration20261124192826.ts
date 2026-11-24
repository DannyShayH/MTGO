import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261124192826 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_intended_delivery_delivered_terminal_at_id" ON "intended_delivery" ("terminal_at", "id") WHERE terminal_outcome = 'delivered' AND deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_intended_delivery_restaurant_id_terminal_at_id" ON "intended_delivery" ("restaurant_id", "terminal_at", "id") WHERE terminal_outcome = 'delivered' AND deleted_at IS NULL;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `drop index if exists "IDX_intended_delivery_delivered_terminal_at_id";`,
    )
    this.addSql(
      `drop index if exists "IDX_intended_delivery_restaurant_id_terminal_at_id";`,
    )
  }
}
