import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261115131618 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "menu_dish" add column if not exists "food_label_declaration" jsonb null;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "menu_dish" drop column if exists "food_label_declaration";`,
    )
  }
}
