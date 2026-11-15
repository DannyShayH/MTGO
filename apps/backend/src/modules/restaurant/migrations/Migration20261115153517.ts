import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261115153517 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "menu_dish" add column if not exists "category_id" text;`,
    )
    // Copy existing membership before link synchronization retires its pivot table.
    this.addSql(`do $$ begin
      if to_regclass('restaurant_menu_category_product_product') is not null
        and to_regclass('product_product_restaurant_menu_dish') is not null then
        update menu_dish as dish set category_id = category.menu_category_id
        from product_product_restaurant_menu_dish as content,
          restaurant_menu_category_product_product as category
        where content.menu_dish_id = dish.id and content.product_id = category.product_id
          and dish.category_id is null;
      end if;
    end $$;`)
    this.addSql(
      `alter table if exists "menu_dish" add constraint "menu_dish_category_id_foreign" foreign key ("category_id") references "menu_category" ("id") on update cascade on delete set null;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_menu_dish_category_id" ON "menu_dish" ("category_id") WHERE deleted_at IS NULL;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "menu_dish" drop constraint if exists "menu_dish_category_id_foreign";`,
    )

    this.addSql(`drop index if exists "IDX_menu_dish_category_id";`)
    this.addSql(
      `alter table if exists "menu_dish" drop column if exists "category_id";`,
    )
  }
}
