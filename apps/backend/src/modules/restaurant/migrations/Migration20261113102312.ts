import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261113102312 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "restaurant_history_entry" ("id" text not null, "kind" text check ("kind" in ('activated', 'deactivated', 'opened', 'closed')) not null, "occurred_at" timestamptz not null, "actor_type" text check ("actor_type" in ('user', 'restaurant_staff')) not null, "actor_id" text not null, "actor_name" text not null, "reason" text null, "restaurant_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "restaurant_history_entry_pkey" primary key ("id"));`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_restaurant_history_entry_restaurant_id" ON "restaurant_history_entry" ("restaurant_id") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_restaurant_history_entry_deleted_at" ON "restaurant_history_entry" ("deleted_at") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_restaurant_history_entry_restaurant_id_occurred_at" ON "restaurant_history_entry" ("restaurant_id", "occurred_at") WHERE deleted_at IS NULL;`,
    )

    this.addSql(
      `alter table if exists "restaurant_history_entry" add constraint "restaurant_history_entry_restaurant_id_foreign" foreign key ("restaurant_id") references "restaurant" ("id") on update cascade;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "restaurant_history_entry" cascade;`)
  }
}
