import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261112081803 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "restaurant_staff" drop constraint if exists "restaurant_staff_email_unique";`,
    )
    this.addSql(
      `create table if not exists "restaurant_staff" ("id" text not null, "name" text not null, "email" text not null, "status" text check ("status" in ('pending', 'authorized', 'revoked')) not null, "invited_by" text null, "accepted_at" timestamptz null, "revoked_at" timestamptz null, "revoked_by" text null, "restaurant_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "restaurant_staff_pkey" primary key ("id"));`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_restaurant_staff_restaurant_id" ON "restaurant_staff" ("restaurant_id") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_restaurant_staff_deleted_at" ON "restaurant_staff" ("deleted_at") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_restaurant_staff_email_unique" ON "restaurant_staff" ("email") WHERE status != 'revoked' AND deleted_at IS NULL;`,
    )

    this.addSql(
      `alter table if exists "restaurant_staff" add constraint "restaurant_staff_restaurant_id_foreign" foreign key ("restaurant_id") references "restaurant" ("id") on update cascade;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "restaurant_staff" cascade;`)
  }
}
