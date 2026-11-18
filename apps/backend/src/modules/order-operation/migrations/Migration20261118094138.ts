import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261118094138 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "purchase_review" drop constraint if exists "purchase_review_cart_id_unique";`,
    )
    this.addSql(
      `create table if not exists "purchase_review" ("id" text not null, "cart_id" text not null, "items" jsonb not null, "reviewed_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "purchase_review_pkey" primary key ("id"));`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_purchase_review_deleted_at" ON "purchase_review" ("deleted_at") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_purchase_review_cart_id_unique" ON "purchase_review" ("cart_id") WHERE deleted_at IS NULL;`,
    )

    this.addSql(
      `alter table if exists "order_operation" add column if not exists "purchased_items" jsonb null;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "purchase_review" cascade;`)

    this.addSql(
      `alter table if exists "order_operation" drop column if exists "purchased_items";`,
    )
  }
}
