import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261119201226 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "delivery_attention" drop constraint if exists "delivery_attention_order_id_type_unique";`,
    )
    this.addSql(
      `create table if not exists "delivery_attention" ("id" text not null, "order_id" text not null, "type" text check ("type" in ('unassigned')) not null, "due_at" timestamptz not null, "raised_at" timestamptz null, "resolved_at" timestamptz null, "resolution" text check ("resolution" in ('assigned', 'order_ended')) null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "delivery_attention_pkey" primary key ("id"));`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_delivery_attention_deleted_at" ON "delivery_attention" ("deleted_at") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_delivery_attention_order_id_type_unique" ON "delivery_attention" ("order_id", "type") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_delivery_attention_due_at_id" ON "delivery_attention" ("due_at", "id") WHERE resolved_at IS NULL AND deleted_at IS NULL;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "delivery_attention" cascade;`)
  }
}
