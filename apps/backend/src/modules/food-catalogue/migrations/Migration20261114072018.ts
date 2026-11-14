import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261114072018 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "food_label" drop constraint if exists "food_label_code_unique";`,
    )
    this.addSql(
      `alter table if exists "allergen_detail" drop constraint if exists "allergen_detail_code_unique";`,
    )
    this.addSql(
      `alter table if exists "allergen" drop constraint if exists "allergen_number_unique";`,
    )
    this.addSql(
      `alter table if exists "allergen" drop constraint if exists "allergen_code_unique";`,
    )
    this.addSql(
      `create table if not exists "allergen" ("id" text not null, "code" text not null, "number" integer not null, "name_da" text not null, "name_en" text not null, "description_da" text not null, "description_en" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "allergen_pkey" primary key ("id"), constraint allergen_number_range check (number BETWEEN 1 AND 14), constraint allergen_bilingual check (length(trim(name_da)) > 0 AND length(trim(name_en)) > 0 AND length(trim(description_da)) > 0 AND length(trim(description_en)) > 0));`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_allergen_deleted_at" ON "allergen" ("deleted_at") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_allergen_code_unique" ON "allergen" ("code") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_allergen_number_unique" ON "allergen" ("number") WHERE deleted_at IS NULL;`,
    )

    this.addSql(
      `create table if not exists "allergen_detail" ("id" text not null, "code" text not null, "parent_number" integer not null, "name_da" text not null, "name_en" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "allergen_detail_pkey" primary key ("id"), constraint allergen_detail_parent check ((parent_number = 1 AND code IN ('wheat', 'spelt', 'khorasan_wheat', 'rye', 'barley', 'oats', 'hybridised_cereals')) OR (parent_number = 8 AND code IN ('almond', 'hazelnut', 'walnut', 'cashew', 'pecan', 'brazil_nut', 'pistachio', 'macadamia'))), constraint allergen_detail_bilingual check (length(trim(name_da)) > 0 AND length(trim(name_en)) > 0));`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_allergen_detail_deleted_at" ON "allergen_detail" ("deleted_at") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_allergen_detail_code_unique" ON "allergen_detail" ("code") WHERE deleted_at IS NULL;`,
    )

    this.addSql(
      `create table if not exists "food_label" ("id" text not null, "code" text check ("code" in ('halal', 'chili', 'garlic')) not null, "name_da" text not null, "name_en" text not null, "description_da" text not null, "description_en" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "food_label_pkey" primary key ("id"), constraint food_label_bilingual check (length(trim(name_da)) > 0 AND length(trim(name_en)) > 0 AND length(trim(description_da)) > 0 AND length(trim(description_en)) > 0));`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_food_label_deleted_at" ON "food_label" ("deleted_at") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_food_label_code_unique" ON "food_label" ("code") WHERE deleted_at IS NULL;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "allergen" cascade;`)

    this.addSql(`drop table if exists "allergen_detail" cascade;`)

    this.addSql(`drop table if exists "food_label" cascade;`)
  }
}
