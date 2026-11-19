import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261119182413 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "intended_delivery" drop constraint if exists "intended_delivery_assignment_request_id_unique";`,
    )
    this.addSql(
      `alter table if exists "intended_delivery" drop constraint if exists "intended_delivery_active_agent_id_unique";`,
    )
    this.addSql(
      `alter table if exists "intended_delivery" add column if not exists "active_agent_id" text null, add column if not exists "assigned_at" timestamptz null, add column if not exists "assigned_by" text null, add column if not exists "assignment_source" text check ("assignment_source" in ('agent_claim', 'operator_assignment')) null, add column if not exists "assignment_request_id" text null;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_intended_delivery_active_agent_id_unique" ON "intended_delivery" ("active_agent_id") WHERE active_agent_id IS NOT NULL AND deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_intended_delivery_assignment_request_id_unique" ON "intended_delivery" ("assignment_request_id") WHERE assignment_request_id IS NOT NULL AND deleted_at IS NULL;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `drop index if exists "IDX_intended_delivery_active_agent_id_unique";`,
    )
    this.addSql(
      `drop index if exists "IDX_intended_delivery_assignment_request_id_unique";`,
    )
    this.addSql(
      `alter table if exists "intended_delivery" drop column if exists "active_agent_id", drop column if exists "assigned_at", drop column if exists "assigned_by", drop column if exists "assignment_source", drop column if exists "assignment_request_id";`,
    )
  }
}
