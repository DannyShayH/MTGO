import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261123143152 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "refund_attempt" ("id" text not null, "refund_obligation_id" text not null, "order_id" text not null, "attempted_at" timestamptz not null, "attempted_by" text not null, "outcome" text check ("outcome" in ('succeeded', 'failed', 'in_progress')) not null, "failure_code" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "refund_attempt_pkey" primary key ("id"));`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_refund_attempt_deleted_at" ON "refund_attempt" ("deleted_at") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_refund_attempt_refund_obligation_id_attempted_at" ON "refund_attempt" ("refund_obligation_id", "attempted_at") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_refund_attempt_order_id_attempted_at" ON "refund_attempt" ("order_id", "attempted_at") WHERE deleted_at IS NULL;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "refund_attempt" cascade;`)
  }
}
