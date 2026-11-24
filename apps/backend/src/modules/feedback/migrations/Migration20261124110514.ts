import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261124110514 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "feedback" drop constraint if exists "feedback_order_id_unique";`,
    )
    this.addSql(
      `create table if not exists "feedback" ("id" text not null, "order_id" text not null, "customer_id" text not null, "restaurant_id" text not null, "agent_id" text not null, "delivered_at" timestamptz not null, "food_rating" integer not null, "experience_rating" integer not null, "agent_rating" integer not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "feedback_pkey" primary key ("id"), constraint feedback_food_rating_range check (food_rating BETWEEN 1 AND 5), constraint feedback_experience_rating_range check (experience_rating BETWEEN 1 AND 5), constraint feedback_agent_rating_range check (agent_rating BETWEEN 1 AND 5));`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_feedback_deleted_at" ON "feedback" ("deleted_at") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_feedback_order_id_unique" ON "feedback" ("order_id") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_feedback_delivered_at" ON "feedback" ("delivered_at") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_feedback_restaurant_id_delivered_at" ON "feedback" ("restaurant_id", "delivered_at") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_feedback_agent_id_delivered_at" ON "feedback" ("agent_id", "delivered_at") WHERE deleted_at IS NULL;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "feedback" cascade;`)
  }
}
