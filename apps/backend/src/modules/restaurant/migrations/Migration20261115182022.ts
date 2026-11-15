import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261115182022 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "photo_attachment" drop constraint if exists "photo_attachment_restaurant_id_request_id_unique";`,
    )
    this.addSql(
      `alter table if exists "photo_attachment" drop constraint if exists "photo_attachment_kind_resource_id_unique";`,
    )
    this.addSql(
      `create table if not exists "photo_attachment" ("id" text not null, "restaurant_id" text not null, "kind" text check ("kind" in ('dish', 'cover')) not null, "resource_id" text not null, "file_id" text not null, "url" text not null, "size_bytes" integer not null, "request_id" text not null, "actor_id" text not null, "occurred_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "photo_attachment_pkey" primary key ("id"));`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_photo_attachment_deleted_at" ON "photo_attachment" ("deleted_at") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_photo_attachment_kind_resource_id_unique" ON "photo_attachment" ("kind", "resource_id") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_photo_attachment_restaurant_id_request_id_unique" ON "photo_attachment" ("restaurant_id", "request_id") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_photo_attachment_restaurant_id" ON "photo_attachment" ("restaurant_id") WHERE deleted_at IS NULL;`,
    )

    this.addSql(
      `alter table if exists "restaurant" add column if not exists "cover_revision" integer not null default 1;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "photo_attachment" cascade;`)

    this.addSql(
      `alter table if exists "restaurant" drop column if exists "cover_revision";`,
    )
  }
}
