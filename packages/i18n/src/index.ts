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
export {
  ALLERGEN_SHORT_NAMES,
  CUSTOMER_MENU_TEXT,
  allergenShortName,
  formatDkk,
} from "./customer-menu.ts"
export { CUSTOMER_HOME_TEXT } from "./customer-home.ts"
export { CUSTOMER_NAVIGATION_TEXT } from "./customer-navigation.ts"
export { CUSTOMER_CART } from "./customer-cart.ts"
export {
  CUSTOMER_CHECKOUT_TEXT,
  customerCheckoutErrorMessage,
  reviewedCheckoutLanguage,
} from "./customer-checkout.ts"
export {
  ACCOUNT_INFO_TEXT,
  CUSTOMER_PROFILE_TEXT,
  validateCustomerName,
  validateCustomerPhone,
  isCustomerProfileError,
  type CustomerProfileError,
} from "./customer-profile.ts"
export {
  CUSTOMER_ADDRESS_TEXT,
  customerAddressErrorMessage,
  validateCustomerAddress,
  type CustomerAddressError,
  type CustomerAddressText,
} from "./customer-address.ts"
export { DISH_TEXT, isDishErrorCode, type DishErrorCode } from "./dishes.ts"
export { PHOTO_TEXT, isPhotoErrorCode, type PhotoErrorCode } from "./photos.ts"
export {
  CHECKOUT_REVIEW_METADATA_KEY,
  CHECKOUT_REVIEW_VERSION,
  createReviewedCheckout,
  isReviewedCheckout,
  reviewedCheckoutMatchesCart,
  reviewedCheckoutIsComplete,
  type ReviewedCheckout,
  type ReviewedCheckoutAddress,
  type ReviewedCheckoutCartFacts,
  type ReviewedCheckoutInput,
} from "./checkout.ts"
export {
  MENU_ARRANGEMENT_TEXT,
  isMenuArrangementError,
  type MenuArrangementError,
} from "./menu-arrangement.ts"
