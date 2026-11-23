import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261123185049 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "intended_delivery" add column if not exists "order_outcome_recorded_at" timestamptz null;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_intended_delivery_terminal_at_id" ON "intended_delivery" ("terminal_at", "id") WHERE terminal_outcome IS NOT NULL AND order_outcome_recorded_at IS NULL AND deleted_at IS NULL;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_intended_delivery_terminal_at_id";`)
    this.addSql(
      `alter table if exists "intended_delivery" drop column if exists "order_outcome_recorded_at";`,
    )
  }
}
