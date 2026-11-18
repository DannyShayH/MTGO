import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261118101022 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "delivery_agent_invitation" drop constraint if exists "delivery_agent_invitation_token_unique";`,
    )
    this.addSql(
      `alter table if exists "delivery_agent_invitation" drop constraint if exists "delivery_agent_invitation_agent_id_unique";`,
    )
    this.addSql(
      `alter table if exists "delivery_agent_area" drop constraint if exists "delivery_agent_area_agent_id_postal_code_unique";`,
    )
    this.addSql(
      `alter table if exists "delivery_agent" drop constraint if exists "delivery_agent_email_unique";`,
    )
    this.addSql(
      `create table if not exists "delivery_agent" ("id" text not null, "name" text not null, "email" text not null, "status" text check ("status" in ('pending', 'authorized', 'revoked')) not null, "invited_by" text not null, "accepted_at" timestamptz null, "revoked_at" timestamptz null, "revoked_by" text null, "authorization_revision" integer not null default 1, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "delivery_agent_pkey" primary key ("id"));`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_delivery_agent_deleted_at" ON "delivery_agent" ("deleted_at") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_delivery_agent_email_unique" ON "delivery_agent" ("email") WHERE status != 'revoked' AND deleted_at IS NULL;`,
    )

    this.addSql(
      `create table if not exists "delivery_agent_area" ("id" text not null, "postal_code" text not null, "agent_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "delivery_agent_area_pkey" primary key ("id"));`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_delivery_agent_area_agent_id" ON "delivery_agent_area" ("agent_id") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_delivery_agent_area_deleted_at" ON "delivery_agent_area" ("deleted_at") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_delivery_agent_area_agent_id_postal_code_unique" ON "delivery_agent_area" ("agent_id", "postal_code") WHERE deleted_at IS NULL;`,
    )

    this.addSql(
      `create table if not exists "delivery_agent_invitation" ("id" text not null, "token" text not null, "expires_at" timestamptz not null, "agent_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "delivery_agent_invitation_pkey" primary key ("id"));`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_delivery_agent_invitation_agent_id_unique" ON "delivery_agent_invitation" ("agent_id") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_delivery_agent_invitation_deleted_at" ON "delivery_agent_invitation" ("deleted_at") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_delivery_agent_invitation_token_unique" ON "delivery_agent_invitation" ("token") WHERE deleted_at IS NULL;`,
    )

    this.addSql(
      `alter table if exists "delivery_agent_area" add constraint "delivery_agent_area_agent_id_foreign" foreign key ("agent_id") references "delivery_agent" ("id") on update cascade;`,
    )

    this.addSql(
      `alter table if exists "delivery_agent_invitation" add constraint "delivery_agent_invitation_agent_id_foreign" foreign key ("agent_id") references "delivery_agent" ("id") on update cascade;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "delivery_agent_area" drop constraint if exists "delivery_agent_area_agent_id_foreign";`,
    )

    this.addSql(
      `alter table if exists "delivery_agent_invitation" drop constraint if exists "delivery_agent_invitation_agent_id_foreign";`,
    )

    this.addSql(`drop table if exists "delivery_agent" cascade;`)

    this.addSql(`drop table if exists "delivery_agent_area" cascade;`)

    this.addSql(`drop table if exists "delivery_agent_invitation" cascade;`)
  }
}
