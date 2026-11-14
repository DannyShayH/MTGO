import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261114095109 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "menu_category" drop constraint if exists "menu_category_restaurant_id_request_id_unique";`,
    )
    this.addSql(
      `create table if not exists "menu_category" ("id" text not null, "name_da" text not null, "name_en" text not null, "revision" integer not null default 1, "request_id" text not null, "creation_name" jsonb not null, "is_removed" boolean not null default false, "history" jsonb not null, "restaurant_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "menu_category_pkey" primary key ("id"));`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_menu_category_restaurant_id" ON "menu_category" ("restaurant_id") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_menu_category_deleted_at" ON "menu_category" ("deleted_at") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_menu_category_restaurant_id_request_id_unique" ON "menu_category" ("restaurant_id", "request_id") WHERE deleted_at IS NULL;`,
    )

    this.addSql(
      `alter table if exists "menu_category" add constraint "menu_category_restaurant_id_foreign" foreign key ("restaurant_id") references "restaurant" ("id") on update cascade;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "menu_category" cascade;`)
  }
}
