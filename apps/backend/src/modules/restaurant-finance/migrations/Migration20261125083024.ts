import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261125083024 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "finance_service_fee" drop constraint if exists "finance_service_fee_restaurant_id_month_unique";`,
    )
    this.addSql(
      `create table if not exists "finance_service_fee" ("id" text not null, "restaurant_id" text not null, "month" text not null, "terms_version" text not null, "currency_code" text not null, "policy_amount" numeric not null, "month_day_count" integer not null, "active_dates" jsonb not null, "active_date_count" integer not null, "amount" numeric not null, "accrued_at" timestamptz not null, "raw_policy_amount" jsonb not null, "raw_amount" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "finance_service_fee_pkey" primary key ("id"));`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_finance_service_fee_deleted_at" ON "finance_service_fee" ("deleted_at") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_finance_service_fee_restaurant_id_month_unique" ON "finance_service_fee" ("restaurant_id", "month") WHERE deleted_at IS NULL;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "finance_service_fee" cascade;`)
  }
}
