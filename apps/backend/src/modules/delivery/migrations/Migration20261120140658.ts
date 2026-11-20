import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261120140658 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_intended_delivery_claim_deadline_id" ON "intended_delivery" ("claim_deadline", "id") WHERE assigned_agent_id IS NULL AND terminal_outcome IS NULL AND deleted_at IS NULL;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `drop index if exists "IDX_intended_delivery_claim_deadline_id";`,
    )
  }
}
