import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261124192805 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "finance_receipt" drop constraint if exists "finance_receipt_source_kind_source_id_unique";`,
    )
    this.addSql(
      `alter table if exists "finance_problem" drop constraint if exists "finance_problem_source_kind_source_id_code_unique";`,
    )
    this.addSql(
      `alter table if exists "finance_journal_entry" drop constraint if exists "finance_journal_entry_receipt_id_unique";`,
    )
    this.addSql(
      `create table if not exists "finance_journal_entry" ("id" text not null, "receipt_id" text not null, "kind" text check ("kind" in ('delivered_order')) not null, "restaurant_id" text not null, "order_id" text null, "occurred_at" timestamptz not null, "original_month" text not null, "posted_at" timestamptz not null, "posting_month" text not null, "currency_code" text not null, "food_credit" numeric not null, "commission" numeric not null, "funded_by" text check ("funded_by" in ('customer', 'mtogo')) not null, "raw_food_credit" jsonb not null, "raw_commission" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "finance_journal_entry_pkey" primary key ("id"));`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_finance_journal_entry_deleted_at" ON "finance_journal_entry" ("deleted_at") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_finance_journal_entry_receipt_id_unique" ON "finance_journal_entry" ("receipt_id") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_finance_journal_entry_restaurant_id_posting_month_posted_at_id" ON "finance_journal_entry" ("restaurant_id", "posting_month", "posted_at", "id") WHERE deleted_at IS NULL;`,
    )

    this.addSql(
      `create table if not exists "finance_problem" ("id" text not null, "source_kind" text check ("source_kind" in ('order_delivered')) not null, "source_id" text not null, "restaurant_id" text not null, "order_id" text null, "code" text check ("code" in ('missing_financial_basis', 'conflicting_recognition')) not null, "original_month" text not null, "detected_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "finance_problem_pkey" primary key ("id"));`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_finance_problem_deleted_at" ON "finance_problem" ("deleted_at") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_finance_problem_source_kind_source_id_code_unique" ON "finance_problem" ("source_kind", "source_id", "code") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_finance_problem_restaurant_id_original_month" ON "finance_problem" ("restaurant_id", "original_month") WHERE deleted_at IS NULL;`,
    )

    this.addSql(
      `create table if not exists "finance_receipt" ("id" text not null, "source_kind" text check ("source_kind" in ('order_delivered')) not null, "source_id" text not null, "restaurant_id" text not null, "order_id" text null, "outcome" text not null, "occurred_at" timestamptz not null, "original_month" text not null, "posted_at" timestamptz not null, "posting_month" text not null, "terms_version" text not null, "currency_code" text not null, "evidence" jsonb not null, "payload_digest" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "finance_receipt_pkey" primary key ("id"));`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_finance_receipt_deleted_at" ON "finance_receipt" ("deleted_at") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_finance_receipt_source_kind_source_id_unique" ON "finance_receipt" ("source_kind", "source_id") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_finance_receipt_restaurant_id_original_month" ON "finance_receipt" ("restaurant_id", "original_month") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_finance_receipt_order_id" ON "finance_receipt" ("order_id") WHERE deleted_at IS NULL;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "finance_journal_entry" cascade;`)

    this.addSql(`drop table if exists "finance_problem" cascade;`)

    this.addSql(`drop table if exists "finance_receipt" cascade;`)
  }
}
