import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261118081157 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "order_operation" drop constraint if exists "order_operation_order_id_unique";`,
    )
    this.addSql(
      `create table if not exists "order_operation" ("id" text not null, "order_id" text not null, "restaurant_id" text not null, "placed_at" timestamptz null, "acceptance_deadline" timestamptz null, "state" text check ("state" in ('awaiting_acceptance', 'accepted', 'preparing', 'ready', 'cancelled')) not null default 'awaiting_acceptance', "revision" integer not null default 1, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "order_operation_pkey" primary key ("id"));`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_order_operation_deleted_at" ON "order_operation" ("deleted_at") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_order_operation_order_id_unique" ON "order_operation" ("order_id") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_order_operation_restaurant_id_state_acceptance_deadline_id" ON "order_operation" ("restaurant_id", "state", "acceptance_deadline", "id") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_order_operation_restaurant_id_state_placed_at_id" ON "order_operation" ("restaurant_id", "state", "placed_at", "id") WHERE deleted_at IS NULL;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "order_operation" cascade;`)
  }
}
