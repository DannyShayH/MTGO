import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261111201354 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "commercial_terms_agreement" drop constraint if exists "commercial_terms_agreement_restaurant_id_unique";`,
    )
    this.addSql(
      `alter table if exists "delivery_area_postal_code" drop constraint if exists "delivery_area_postal_code_restaurant_id_postal_code_unique";`,
    )
    this.addSql(
      `create table if not exists "delivery_area_postal_code" ("id" text not null, "postal_code" text not null, "restaurant_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "delivery_area_postal_code_pkey" primary key ("id"));`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_delivery_area_postal_code_restaurant_id" ON "delivery_area_postal_code" ("restaurant_id") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_delivery_area_postal_code_deleted_at" ON "delivery_area_postal_code" ("deleted_at") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_delivery_area_postal_code_restaurant_id_postal_code_unique" ON "delivery_area_postal_code" ("restaurant_id", "postal_code") WHERE deleted_at IS NULL;`,
    )

    this.addSql(
      `create table if not exists "commercial_terms_agreement" ("id" text not null, "terms_version" text check ("terms_version" in ('common_mvp_v1')) not null, "agreed_at" timestamptz not null, "recorded_by" text not null, "restaurant_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "commercial_terms_agreement_pkey" primary key ("id"));`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_commercial_terms_agreement_restaurant_id" ON "commercial_terms_agreement" ("restaurant_id") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_commercial_terms_agreement_deleted_at" ON "commercial_terms_agreement" ("deleted_at") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_commercial_terms_agreement_restaurant_id_unique" ON "commercial_terms_agreement" ("restaurant_id") WHERE deleted_at IS NULL;`,
    )

    this.addSql(
      `alter table if exists "delivery_area_postal_code" add constraint "delivery_area_postal_code_restaurant_id_foreign" foreign key ("restaurant_id") references "restaurant" ("id") on update cascade;`,
    )

    this.addSql(
      `alter table if exists "commercial_terms_agreement" add constraint "commercial_terms_agreement_restaurant_id_foreign" foreign key ("restaurant_id") references "restaurant" ("id") on update cascade;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "delivery_area_postal_code" cascade;`)

    this.addSql(`drop table if exists "commercial_terms_agreement" cascade;`)
  }
}
