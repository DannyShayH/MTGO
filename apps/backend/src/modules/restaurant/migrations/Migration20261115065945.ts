import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261115065945 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "menu_dish" add column if not exists "allergen_declaration" jsonb null;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "menu_dish" drop column if exists "allergen_declaration";`,
    )
  }
}
