import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261118190040 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "order_operation" add column if not exists "preparation_started_at" timestamptz null, add column if not exists "preparation_started_by" text null, add column if not exists "ready_at" timestamptz null, add column if not exists "ready_by" text null;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "order_operation" drop column if exists "preparation_started_at", drop column if exists "preparation_started_by", drop column if exists "ready_at", drop column if exists "ready_by";`,
    )
  }
}
