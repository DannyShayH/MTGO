import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261121034439 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "intended_delivery" drop constraint if exists "intended_delivery_arrival_request_id_unique";`,
    )
    this.addSql(
      `alter table if exists "delivery_contact_attempt" drop constraint if exists "delivery_contact_attempt_request_id_unique";`,
    )
    this.addSql(
      `create table if not exists "delivery_contact_attempt" ("id" text not null, "order_id" text not null, "agent_id" text not null, "request_id" text not null, "attempted_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "delivery_contact_attempt_pkey" primary key ("id"));`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_delivery_contact_attempt_deleted_at" ON "delivery_contact_attempt" ("deleted_at") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_delivery_contact_attempt_request_id_unique" ON "delivery_contact_attempt" ("request_id") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_delivery_contact_attempt_order_id_attempted_at" ON "delivery_contact_attempt" ("order_id", "attempted_at") WHERE deleted_at IS NULL;`,
    )

    this.addSql(
      `alter table if exists "delivery_attention" drop constraint if exists "delivery_attention_type_check";`,
    )

    this.addSql(
      `alter table if exists "delivery_attention" add constraint "delivery_attention_type_check" check("type" in ('unassigned', 'access_revoked', 'assigned_without_pickup', 'in_transit_without_delivery', 'arrived_without_handover'));`,
    )

    this.addSql(
      `alter table if exists "intended_delivery" add column if not exists "arrived_at" timestamptz null, add column if not exists "arrived_by" text null, add column if not exists "arrival_request_id" text null;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_intended_delivery_arrival_request_id_unique" ON "intended_delivery" ("arrival_request_id") WHERE arrival_request_id IS NOT NULL AND deleted_at IS NULL;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "delivery_contact_attempt" cascade;`)

    this.addSql(
      `alter table if exists "delivery_attention" drop constraint if exists "delivery_attention_type_check";`,
    )

    this.addSql(
      `alter table if exists "delivery_attention" add constraint "delivery_attention_type_check" check("type" in ('unassigned', 'access_revoked', 'assigned_without_pickup', 'in_transit_without_delivery'));`,
    )

    this.addSql(
      `drop index if exists "IDX_intended_delivery_arrival_request_id_unique";`,
    )
    this.addSql(
      `alter table if exists "intended_delivery" drop column if exists "arrived_at", drop column if exists "arrived_by", drop column if exists "arrival_request_id";`,
    )
  }
}
