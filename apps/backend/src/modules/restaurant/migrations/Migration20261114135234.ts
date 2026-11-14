import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261114135234 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "menu_dish" ("id" text not null, "name_da" text not null, "name_en" text not null, "description_da" text null, "description_en" text null, "is_sold_out" boolean not null default false, "position" integer not null default 0, "revision" integer not null default 1, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "menu_dish_pkey" primary key ("id"));`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_menu_dish_deleted_at" ON "menu_dish" ("deleted_at") WHERE deleted_at IS NULL;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "menu_dish" cascade;`)
  }
}
