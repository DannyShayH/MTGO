import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261126063448 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "finance_closure" drop constraint if exists "finance_closure_restaurant_id_month_unique";`,
    )
    this.addSql(
      `create table if not exists "finance_closure" ("id" text not null, "restaurant_id" text not null, "month" text not null, "starts_at" timestamptz not null, "ends_at" timestamptz not null, "snapshot" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "finance_closure_pkey" primary key ("id"));`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_finance_closure_deleted_at" ON "finance_closure" ("deleted_at") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_finance_closure_restaurant_id_month_unique" ON "finance_closure" ("restaurant_id", "month") WHERE deleted_at IS NULL;`,
    )

    this.addSql(
      `alter table if exists "finance_journal_entry" drop constraint if exists "finance_journal_entry_kind_check";`,
    )

    this.addSql(
      `alter table if exists "finance_problem" drop constraint if exists "finance_problem_source_kind_check";`,
    )

    this.addSql(
      `alter table if exists "finance_receipt" drop constraint if exists "finance_receipt_source_kind_check";`,
    )

    this.addSql(
      `alter table if exists "finance_journal_entry" add column if not exists "service_fee" numeric not null default 0, add column if not exists "raw_service_fee" jsonb not null default '{"value":"0","precision":20}';`,
    )
    this.addSql(
      `alter table if exists "finance_journal_entry" add constraint "finance_journal_entry_kind_check" check("kind" in ('delivered_order', 'prepared_food_compensation', 'service_fee_difference'));`,
    )

    this.addSql(
      `alter table if exists "finance_problem" add constraint "finance_problem_source_kind_check" check("source_kind" in ('order_delivered', 'prepared_food_credit', 'order_cancelled', 'service_fee_difference'));`,
    )

    this.addSql(
      `alter table if exists "finance_receipt" add constraint "finance_receipt_source_kind_check" check("source_kind" in ('order_delivered', 'prepared_food_credit', 'order_cancelled', 'service_fee_difference'));`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "finance_closure" cascade;`)

    this.addSql(
      `alter table if exists "finance_journal_entry" drop constraint if exists "finance_journal_entry_kind_check";`,
    )

    this.addSql(
      `alter table if exists "finance_problem" drop constraint if exists "finance_problem_source_kind_check";`,
    )

    this.addSql(
      `alter table if exists "finance_receipt" drop constraint if exists "finance_receipt_source_kind_check";`,
    )

    this.addSql(
      `alter table if exists "finance_journal_entry" drop column if exists "service_fee", drop column if exists "raw_service_fee";`,
    )

    this.addSql(
      `alter table if exists "finance_journal_entry" add constraint "finance_journal_entry_kind_check" check("kind" in ('delivered_order', 'prepared_food_compensation'));`,
    )

    this.addSql(
      `alter table if exists "finance_problem" add constraint "finance_problem_source_kind_check" check("source_kind" in ('order_delivered', 'prepared_food_credit', 'order_cancelled'));`,
    )

    this.addSql(
      `alter table if exists "finance_receipt" add constraint "finance_receipt_source_kind_check" check("source_kind" in ('order_delivered', 'prepared_food_credit', 'order_cancelled'));`,
    )
  }
}
