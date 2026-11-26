import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261126162054 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "order_operation" add column if not exists "delivery_picked_up_at" timestamptz null;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "order_operation" drop column if exists "delivery_picked_up_at";`,
    )
  }
}
