import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261120083118 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "intended_delivery" drop constraint if exists "intended_delivery_handover_request_id_unique";`,
    )
    this.addSql(
      `alter table if exists "intended_delivery" add column if not exists "terminal_outcome" text check ("terminal_outcome" in ('delivered', 'cancelled', 'failed')) null, add column if not exists "terminal_at" timestamptz null, add column if not exists "terminal_by" text null, add column if not exists "handover_request_id" text null, add column if not exists "native_delivered_at" timestamptz null;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_intended_delivery_handover_request_id_unique" ON "intended_delivery" ("handover_request_id") WHERE handover_request_id IS NOT NULL AND deleted_at IS NULL;`,
    )
    // The recovery sweep now also reads handovers still owing native delivery.
    this.addSql(
      `drop index if exists "IDX_intended_delivery_native_sync_queued_at";`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_intended_delivery_native_sync_queued_at" ON "intended_delivery" ("native_sync_queued_at") WHERE ((picked_up_at IS NOT NULL AND native_fulfillment_id IS NULL) OR (terminal_outcome = 'delivered' AND native_delivered_at IS NULL)) AND deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_intended_delivery_assigned_agent_id_terminal_at_id" ON "intended_delivery" ("assigned_agent_id", "terminal_at", "id") WHERE terminal_outcome IS NOT NULL AND deleted_at IS NULL;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `drop index if exists "IDX_intended_delivery_handover_request_id_unique";`,
    )
    this.addSql(
      `drop index if exists "IDX_intended_delivery_assigned_agent_id_terminal_at_id";`,
    )
    this.addSql(
      `drop index if exists "IDX_intended_delivery_native_sync_queued_at";`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_intended_delivery_native_sync_queued_at" ON "intended_delivery" ("native_sync_queued_at") WHERE picked_up_at IS NOT NULL AND native_fulfillment_id IS NULL AND deleted_at IS NULL;`,
    )
    this.addSql(
      `alter table if exists "intended_delivery" drop column if exists "terminal_outcome", drop column if exists "terminal_at", drop column if exists "terminal_by", drop column if exists "handover_request_id", drop column if exists "native_delivered_at";`,
    )
  }
}
