import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261112093941 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "staff_invitation" drop constraint if exists "staff_invitation_staff_id_unique";`,
    )
    this.addSql(
      `create table if not exists "staff_invitation" ("id" text not null, "token" text not null, "expires_at" timestamptz not null, "staff_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "staff_invitation_pkey" primary key ("id"));`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_staff_invitation_staff_id_unique" ON "staff_invitation" ("staff_id") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_staff_invitation_deleted_at" ON "staff_invitation" ("deleted_at") WHERE deleted_at IS NULL;`,
    )

    this.addSql(
      `alter table if exists "staff_invitation" add constraint "staff_invitation_staff_id_foreign" foreign key ("staff_id") references "restaurant_staff" ("id") on update cascade on delete cascade;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "staff_invitation" cascade;`)
  }
}
