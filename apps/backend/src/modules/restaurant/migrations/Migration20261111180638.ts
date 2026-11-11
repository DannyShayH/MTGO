import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261111180638 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "restaurant" ("id" text not null, "name" text not null, "address_street" text not null, "address_postal_code" text not null, "address_city" text not null, "contact_phone" text not null, "contact_email" text not null, "is_active" boolean not null default false, "is_open" boolean not null default false, "pickup_address_key" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "restaurant_pkey" primary key ("id"));`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_restaurant_deleted_at" ON "restaurant" ("deleted_at") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_restaurant_pickup_address_key" ON "restaurant" ("pickup_address_key") WHERE deleted_at IS NULL;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "restaurant" cascade;`)
  }
}
