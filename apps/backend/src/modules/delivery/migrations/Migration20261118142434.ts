import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261118142434 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "intended_delivery" drop constraint if exists "intended_delivery_order_id_unique";`,
    )
    this.addSql(
      `create table if not exists "intended_delivery" ("id" text not null, "order_id" text not null, "restaurant_id" text not null, "restaurant_name" text not null, "pickup_address" text not null, "pickup_postal_code" text not null, "destination_postal_code" text not null, "order_reference" integer not null, "accepted_at" timestamptz not null, "claim_deadline" timestamptz not null, "assigned_agent_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "intended_delivery_pkey" primary key ("id"));`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_intended_delivery_deleted_at" ON "intended_delivery" ("deleted_at") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_intended_delivery_order_id_unique" ON "intended_delivery" ("order_id") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_intended_delivery_assigned_agent_id_accepted_at_id" ON "intended_delivery" ("assigned_agent_id", "accepted_at", "id") WHERE deleted_at IS NULL;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "intended_delivery" cascade;`)
  }
}
