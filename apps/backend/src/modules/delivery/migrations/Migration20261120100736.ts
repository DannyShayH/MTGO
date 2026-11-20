import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261120100736 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "intended_delivery" add column if not exists "pickup_latitude" real null, add column if not exists "pickup_longitude" real null, add column if not exists "destination_latitude" real null, add column if not exists "destination_longitude" real null, add column if not exists "trip_distance_m" integer null, add column if not exists "trip_measured_at" timestamptz null;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "intended_delivery" drop column if exists "pickup_latitude", drop column if exists "pickup_longitude", drop column if exists "destination_latitude", drop column if exists "destination_longitude", drop column if exists "trip_distance_m", drop column if exists "trip_measured_at";`,
    )
  }
}
