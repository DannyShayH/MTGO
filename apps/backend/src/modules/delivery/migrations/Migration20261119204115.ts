import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261119204115 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "intended_delivery" drop constraint if exists "intended_delivery_pickup_request_id_unique";`,
    )
    this.addSql(
      `alter table if exists "intended_delivery" add column if not exists "picked_up_at" timestamptz null, add column if not exists "picked_up_by" text null, add column if not exists "pickup_request_id" text null, add column if not exists "native_fulfillment_id" text null, add column if not exists "native_sync_queued_at" timestamptz null;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_intended_delivery_pickup_request_id_unique" ON "intended_delivery" ("pickup_request_id") WHERE pickup_request_id IS NOT NULL AND deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_intended_delivery_native_sync_queued_at" ON "intended_delivery" ("native_sync_queued_at") WHERE picked_up_at IS NOT NULL AND native_fulfillment_id IS NULL AND deleted_at IS NULL;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `drop index if exists "IDX_intended_delivery_pickup_request_id_unique";`,
    )
    this.addSql(
      `drop index if exists "IDX_intended_delivery_native_sync_queued_at";`,
    )
    this.addSql(
      `alter table if exists "intended_delivery" drop column if exists "picked_up_at", drop column if exists "picked_up_by", drop column if exists "pickup_request_id", drop column if exists "native_fulfillment_id", drop column if exists "native_sync_queued_at";`,
    )
  }
}
