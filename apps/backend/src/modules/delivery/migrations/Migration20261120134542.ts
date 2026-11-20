import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261120134542 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "delivery_attention" drop constraint if exists "delivery_attention_type_check";`,
    )
    this.addSql(
      `alter table if exists "delivery_attention" drop constraint if exists "delivery_attention_resolution_check";`,
    )

    this.addSql(
      `alter table if exists "delivery_attention" add constraint "delivery_attention_type_check" check("type" in ('unassigned', 'access_revoked', 'assigned_without_pickup', 'in_transit_without_delivery'));`,
    )
    this.addSql(
      `alter table if exists "delivery_attention" add constraint "delivery_attention_resolution_check" check("resolution" in ('assigned', 'picked_up', 'delivered', 'order_ended'));`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "delivery_attention" drop constraint if exists "delivery_attention_type_check";`,
    )
    this.addSql(
      `alter table if exists "delivery_attention" drop constraint if exists "delivery_attention_resolution_check";`,
    )

    this.addSql(
      `alter table if exists "delivery_attention" add constraint "delivery_attention_type_check" check("type" in ('unassigned', 'access_revoked'));`,
    )
    this.addSql(
      `alter table if exists "delivery_attention" add constraint "delivery_attention_resolution_check" check("resolution" in ('assigned', 'order_ended'));`,
    )
  }
}
