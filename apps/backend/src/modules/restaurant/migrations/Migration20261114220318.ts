import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261114220318 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "menu_dish" add column if not exists "published_price" text null;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "menu_dish" drop column if exists "published_price";`,
    )
  }
}
