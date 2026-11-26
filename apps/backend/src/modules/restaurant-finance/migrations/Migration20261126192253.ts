import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261126192253 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "finance_problem" drop constraint if exists "finance_problem_code_check";`,
    )

    this.addSql(
      `alter table if exists "finance_problem" add constraint "finance_problem_code_check" check("code" in ('missing_financial_basis', 'conflicting_recognition', 'missing_outcome_evidence', 'missing_purchase_evidence', 'missing_terms_evidence'));`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "finance_problem" drop constraint if exists "finance_problem_code_check";`,
    )

    this.addSql(
      `alter table if exists "finance_problem" add constraint "finance_problem_code_check" check("code" in ('missing_financial_basis', 'conflicting_recognition', 'missing_outcome_evidence'));`,
    )
  }
}
