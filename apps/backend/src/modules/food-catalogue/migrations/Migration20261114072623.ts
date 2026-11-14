import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261114072623 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "allergen" add constraint allergen_code_number check((code = 'cereals' AND number = 1) OR (code = 'crustaceans' AND number = 2) OR (code = 'eggs' AND number = 3) OR (code = 'fish' AND number = 4) OR (code = 'peanuts' AND number = 5) OR (code = 'soybeans' AND number = 6) OR (code = 'milk' AND number = 7) OR (code = 'nuts' AND number = 8) OR (code = 'celery' AND number = 9) OR (code = 'mustard' AND number = 10) OR (code = 'sesame' AND number = 11) OR (code = 'sulphites' AND number = 12) OR (code = 'lupin' AND number = 13) OR (code = 'molluscs' AND number = 14));`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "allergen" drop constraint if exists allergen_code_number;`,
    )
  }
}
