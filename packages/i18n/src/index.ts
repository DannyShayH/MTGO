export {
  DEFAULT_LOCALE,
  LOCALES,
  isLocale,
  resolveLocale,
  resolveCustomerLocale,
  type Locale,
} from "./locale.ts"
export {
  LANGUAGE_NAMES,
  MESSAGES,
  isMessageCode,
  type MessageCode,
  type Messages,
} from "./messages.ts"
export { formatText } from "./format.ts"
export { accessEndedMessage } from "./access-ended.ts"
export {
  CUSTOMER_AUTH,
  CUSTOMER_VERIFICATION,
  type CustomerAuthCode,
} from "./customer-auth.ts"
export { MENU_TEXT } from "./menu.ts"

export {
  CATEGORY_SUGGESTIONS,
  CATEGORY_TEXT,
  isCategoryErrorCode,
  remainingCategorySuggestions,
  type CategoryErrorCode,
  type CategorySuggestion,
} from "./categories.ts"
export { CUSTOMER_MENU_TEXT, formatDkk } from "./customer-menu.ts"
export { CUSTOMER_HOME_TEXT } from "./customer-home.ts"
export { CUSTOMER_NAVIGATION_TEXT } from "./customer-navigation.ts"
export { DISH_TEXT, isDishErrorCode, type DishErrorCode } from "./dishes.ts"
