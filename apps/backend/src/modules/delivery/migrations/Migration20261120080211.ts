import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261120080211 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "delivery_attention" drop constraint if exists "delivery_attention_type_check";`,
    )

    this.addSql(
      `alter table if exists "delivery_attention" add constraint "delivery_attention_type_check" check("type" in ('unassigned', 'access_revoked'));`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "delivery_attention" drop constraint if exists "delivery_attention_type_check";`,
    )

    this.addSql(
      `alter table if exists "delivery_attention" add constraint "delivery_attention_type_check" check("type" in ('unassigned'));`,
    )
  }
}
