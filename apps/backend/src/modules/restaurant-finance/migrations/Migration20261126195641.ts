import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261126195641 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "finance_closure" add column if not exists "summary" jsonb null;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "finance_closure" drop column if exists "summary";`,
    )
  }
}
