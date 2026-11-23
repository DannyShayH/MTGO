import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261123144920 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "delivery_attention" drop constraint if exists "delivery_attention_type_check";`,
    )

    this.addSql(
      `alter table if exists "delivery_attention" add column if not exists "category" text check ("category" in ('restaurant_unavailable', 'food_missing_or_wrong', 'address_not_found', 'other')) null, add column if not exists "note" text null, add column if not exists "reported_by" text null;`,
    )
    this.addSql(
      `alter table if exists "delivery_attention" add constraint "delivery_attention_type_check" check("type" in ('unassigned', 'access_revoked', 'assigned_without_pickup', 'in_transit_without_delivery', 'arrived_without_handover', 'agent_reported_problem'));`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "delivery_attention" drop constraint if exists "delivery_attention_type_check";`,
    )

    this.addSql(
      `alter table if exists "delivery_attention" drop column if exists "category", drop column if exists "note", drop column if exists "reported_by";`,
    )

    this.addSql(
      `alter table if exists "delivery_attention" add constraint "delivery_attention_type_check" check("type" in ('unassigned', 'access_revoked', 'assigned_without_pickup', 'in_transit_without_delivery', 'arrived_without_handover'));`,
    )
  }
}
