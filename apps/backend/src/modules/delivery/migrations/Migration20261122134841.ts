import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261122134841 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "delivery_location" drop constraint if exists "delivery_location_order_id_unique";`,
    )
    this.addSql(
      `create table if not exists "delivery_location" ("id" text not null, "order_id" text not null, "agent_id" text not null, "latitude" real not null, "longitude" real not null, "accuracy_m" real null, "observed_at" timestamptz not null, "received_at" timestamptz not null, "revision" integer not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "delivery_location_pkey" primary key ("id"));`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_delivery_location_deleted_at" ON "delivery_location" ("deleted_at") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_delivery_location_order_id_unique" ON "delivery_location" ("order_id") WHERE deleted_at IS NULL;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "delivery_location" cascade;`)
  }
}
