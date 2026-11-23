import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261123164043 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`drop index if exists "IDX_refund_obligation_status";`)

    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_refund_obligation_status_created_at_id" ON "refund_obligation" ("status", "created_at", "id") WHERE deleted_at IS NULL;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `drop index if exists "IDX_refund_obligation_status_created_at_id";`,
    )

    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_refund_obligation_status" ON "refund_obligation" ("status") WHERE deleted_at IS NULL;`,
    )
  }
}
