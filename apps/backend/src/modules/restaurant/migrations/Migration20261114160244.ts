import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261114160244 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "menu_dish_creation" drop constraint if exists "menu_dish_creation_restaurant_id_request_id_unique";`,
    )
    this.addSql(
      `create table if not exists "menu_dish_creation" ("id" text not null, "restaurant_id" text not null, "request_id" text not null, "input" jsonb not null, "actor_id" text not null, "actor_name" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "menu_dish_creation_pkey" primary key ("id"));`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_menu_dish_creation_deleted_at" ON "menu_dish_creation" ("deleted_at") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_menu_dish_creation_restaurant_id_request_id_unique" ON "menu_dish_creation" ("restaurant_id", "request_id") WHERE deleted_at IS NULL;`,
    )

    this.addSql(
      `alter table if exists "menu_dish" add column if not exists "publication_committed" boolean not null default true, add column if not exists "successful_change" jsonb null;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "menu_dish_creation" cascade;`)

    this.addSql(
      `alter table if exists "menu_dish" drop column if exists "publication_committed", drop column if exists "successful_change";`,
    )
  }
}
