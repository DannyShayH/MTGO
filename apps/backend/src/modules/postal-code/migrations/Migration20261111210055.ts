import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261111210055 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "postal_code" drop constraint if exists "postal_code_postal_code_unique";`,
    )
    this.addSql(
      `create table if not exists "postal_code" ("id" text not null, "postal_code" text not null, "name" text not null, "municipality" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "postal_code_pkey" primary key ("id"));`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_postal_code_deleted_at" ON "postal_code" ("deleted_at") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_postal_code_postal_code_unique" ON "postal_code" ("postal_code") WHERE deleted_at IS NULL;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "postal_code" cascade;`)
  }
}
