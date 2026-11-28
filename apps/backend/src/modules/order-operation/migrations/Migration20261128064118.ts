import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261128064118 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_order_operation_placed_at" ON "order_operation" ("placed_at") WHERE placed_at IS NOT NULL AND deleted_at IS NULL;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_order_operation_placed_at";`)
  }
}
