import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** DML cannot express a foreign key to the Annex II business number. */
export class Migration20261114073000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "allergen" add constraint "allergen_number_reference" unique ("number");`,
    )
    this.addSql(
      `alter table "allergen_detail" add constraint "allergen_detail_group_fk" foreign key ("parent_number") references "allergen" ("number") on update restrict on delete restrict;`,
    )
  }
  override async down(): Promise<void> {
    this.addSql(
      `alter table "allergen_detail" drop constraint "allergen_detail_group_fk";`,
    )
    this.addSql(
      `alter table "allergen" drop constraint "allergen_number_reference";`,
    )
  }
}
