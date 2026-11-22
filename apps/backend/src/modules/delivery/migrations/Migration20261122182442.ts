import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261122182442 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "delivery_location" drop column if exists "agent_id";`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "delivery_location" add column if not exists "agent_id" text not null;`,
    )
  }
}
