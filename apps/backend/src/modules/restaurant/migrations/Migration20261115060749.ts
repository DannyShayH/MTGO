import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261115060749 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "menu_dish" add column if not exists "availability_history" jsonb null;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "menu_dish" drop column if exists "availability_history";`,
    )
  }
}
