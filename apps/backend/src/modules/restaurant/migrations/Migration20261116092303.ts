import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261116092303 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "photo_file" drop constraint if exists "photo_file_file_id_unique";`,
    )
    this.addSql(
      `alter table if exists "photo_change" drop constraint if exists "photo_change_restaurant_id_request_id_unique";`,
    )
    this.addSql(
      `create table if not exists "photo_change" ("id" text not null, "restaurant_id" text not null, "resource_id" text not null, "kind" text check ("kind" in ('dish', 'cover')) not null, "action" text check ("action" in ('attach', 'remove')) not null, "request_id" text not null, "actor_id" text not null, "occurred_at" timestamptz not null, "revision" integer not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "photo_change_pkey" primary key ("id"));`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_photo_change_deleted_at" ON "photo_change" ("deleted_at") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_photo_change_restaurant_id_request_id_unique" ON "photo_change" ("restaurant_id", "request_id") WHERE deleted_at IS NULL;`,
    )

    this.addSql(
      `create table if not exists "photo_file" ("id" text not null, "restaurant_id" text not null, "file_id" text not null, "state" text check ("state" in ('pending', 'cleanup')) not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "photo_file_pkey" primary key ("id"));`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_photo_file_file_id_unique" ON "photo_file" ("file_id") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_photo_file_deleted_at" ON "photo_file" ("deleted_at") WHERE deleted_at IS NULL;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "photo_change" cascade;`)

    this.addSql(`drop table if exists "photo_file" cascade;`)
  }
}
