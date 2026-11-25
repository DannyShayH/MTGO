import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261125143121 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "finance_journal_entry" drop constraint if exists "finance_journal_entry_kind_check";`,
    )

    this.addSql(
      `alter table if exists "finance_problem" drop constraint if exists "finance_problem_source_kind_check";`,
    )
    this.addSql(
      `alter table if exists "finance_problem" drop constraint if exists "finance_problem_code_check";`,
    )

    this.addSql(
      `alter table if exists "finance_receipt" drop constraint if exists "finance_receipt_source_kind_check";`,
    )

    this.addSql(
      `alter table if exists "finance_journal_entry" add constraint "finance_journal_entry_kind_check" check("kind" in ('delivered_order', 'prepared_food_compensation'));`,
    )

    this.addSql(
      `alter table if exists "finance_problem" add constraint "finance_problem_source_kind_check" check("source_kind" in ('order_delivered', 'prepared_food_credit', 'order_cancelled'));`,
    )
    this.addSql(
      `alter table if exists "finance_problem" add constraint "finance_problem_code_check" check("code" in ('missing_financial_basis', 'conflicting_recognition', 'missing_outcome_evidence'));`,
    )

    this.addSql(
      `alter table if exists "finance_receipt" add constraint "finance_receipt_source_kind_check" check("source_kind" in ('order_delivered', 'prepared_food_credit', 'order_cancelled'));`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "finance_journal_entry" drop constraint if exists "finance_journal_entry_kind_check";`,
    )

    this.addSql(
      `alter table if exists "finance_problem" drop constraint if exists "finance_problem_source_kind_check";`,
    )
    this.addSql(
      `alter table if exists "finance_problem" drop constraint if exists "finance_problem_code_check";`,
    )

    this.addSql(
      `alter table if exists "finance_receipt" drop constraint if exists "finance_receipt_source_kind_check";`,
    )

    this.addSql(
      `alter table if exists "finance_journal_entry" add constraint "finance_journal_entry_kind_check" check("kind" in ('delivered_order'));`,
    )

    this.addSql(
      `alter table if exists "finance_problem" add constraint "finance_problem_source_kind_check" check("source_kind" in ('order_delivered'));`,
    )
    this.addSql(
      `alter table if exists "finance_problem" add constraint "finance_problem_code_check" check("code" in ('missing_financial_basis', 'conflicting_recognition'));`,
    )

    this.addSql(
      `alter table if exists "finance_receipt" add constraint "finance_receipt_source_kind_check" check("source_kind" in ('order_delivered'));`,
    )
  }
}
