import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261124160509 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "order_operation" add column if not exists "financial_basis" jsonb null;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "order_operation" drop column if exists "financial_basis";`,
    )
  }
}
