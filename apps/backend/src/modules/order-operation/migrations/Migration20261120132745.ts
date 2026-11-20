import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261120132745 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "food_credit" drop constraint if exists "food_credit_order_id_unique";`,
    )
    this.addSql(
      `create table if not exists "food_credit" ("id" text not null, "order_id" text not null, "restaurant_id" text not null, "amount" numeric not null, "currency_code" text not null, "commission_amount" numeric not null, "funded_by" text check ("funded_by" in ('mtogo')) not null, "reason" text not null, "preparation_started_at" timestamptz not null, "ready_at" timestamptz null, "raw_amount" jsonb not null, "raw_commission_amount" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "food_credit_pkey" primary key ("id"));`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_food_credit_deleted_at" ON "food_credit" ("deleted_at") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_food_credit_order_id_unique" ON "food_credit" ("order_id") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_food_credit_restaurant_id_created_at" ON "food_credit" ("restaurant_id", "created_at") WHERE deleted_at IS NULL;`,
    )

    this.addSql(
      `alter table if exists "order_operation" drop constraint if exists "order_operation_cancellation_category_check";`,
    )

    this.addSql(
      `alter table if exists "order_operation" add constraint "order_operation_cancellation_category_check" check("cancellation_category" in ('restaurant_rejected', 'acceptance_timeout', 'customer_cancelled', 'unassigned_timeout'));`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "food_credit" cascade;`)

    this.addSql(
      `alter table if exists "order_operation" drop constraint if exists "order_operation_cancellation_category_check";`,
    )

    this.addSql(
      `alter table if exists "order_operation" add constraint "order_operation_cancellation_category_check" check("cancellation_category" in ('restaurant_rejected', 'acceptance_timeout', 'customer_cancelled'));`,
    )
  }
}
