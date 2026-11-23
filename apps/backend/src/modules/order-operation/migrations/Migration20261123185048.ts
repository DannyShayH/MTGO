import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261123185048 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "order_operation" add column if not exists "delivery_outcome" text check ("delivery_outcome" in ('delivered', 'not_delivered')) null, add column if not exists "delivery_ended_at" timestamptz null;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "order_operation" drop column if exists "delivery_outcome", drop column if exists "delivery_ended_at";`,
    )
  }
}
