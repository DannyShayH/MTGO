import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261118151215 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "refund_obligation" drop constraint if exists "refund_obligation_idempotency_key_unique";`,
    )
    this.addSql(
      `alter table if exists "refund_obligation" drop constraint if exists "refund_obligation_order_id_unique";`,
    )
    this.addSql(
      `create table if not exists "refund_obligation" ("id" text not null, "order_id" text not null, "payment_id" text not null, "amount" numeric not null, "currency_code" text not null, "idempotency_key" text not null, "status" text check ("status" in ('pending', 'failed', 'succeeded')) not null default 'pending', "attempt_count" integer not null default 0, "last_attempted_at" timestamptz null, "failure_code" text null, "refund_id" text null, "succeeded_at" timestamptz null, "raw_amount" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "refund_obligation_pkey" primary key ("id"));`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_refund_obligation_deleted_at" ON "refund_obligation" ("deleted_at") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_refund_obligation_order_id_unique" ON "refund_obligation" ("order_id") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_refund_obligation_idempotency_key_unique" ON "refund_obligation" ("idempotency_key") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_refund_obligation_status" ON "refund_obligation" ("status") WHERE deleted_at IS NULL;`,
    )

    this.addSql(
      `alter table if exists "order_operation" add column if not exists "cancelled_at" timestamptz null, add column if not exists "cancelled_by" text null, add column if not exists "cancellation_category" text check ("cancellation_category" in ('restaurant_rejected', 'acceptance_timeout', 'customer_cancelled')) null, add column if not exists "cancellation_note" text null, add column if not exists "native_cancelled_at" timestamptz null;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "refund_obligation" cascade;`)

    this.addSql(
      `alter table if exists "order_operation" drop column if exists "cancelled_at", drop column if exists "cancelled_by", drop column if exists "cancellation_category", drop column if exists "cancellation_note", drop column if exists "native_cancelled_at";`,
    )
  }
}
