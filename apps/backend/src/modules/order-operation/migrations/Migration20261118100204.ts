import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261118100204 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "order_operation" add column if not exists "accepted_at" timestamptz null, add column if not exists "accepted_by" text null;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "order_operation" drop column if exists "accepted_at", drop column if exists "accepted_by";`,
    )
  }
}
