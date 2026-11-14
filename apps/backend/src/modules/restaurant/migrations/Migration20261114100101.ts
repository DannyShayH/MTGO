import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261114100101 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "menu_category" add column if not exists "position" integer not null default 0;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "menu_category" drop column if exists "position";`,
    )
  }
}
