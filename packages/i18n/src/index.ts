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
  ORDER_TEXT,
  ORDER_ACTION_ERRORS,
  ORDER_ACTION_ERROR_CODES,
  formatOrderDateTime,
  formatOrderTime,
  isOrderActionErrorCode,
  isSameOrderDay,
  type OrderActionErrorCode,
} from "./orders.ts"

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

export {
  CUSTOMER_ORDER_DETAIL_TEXT,
  CUSTOMER_CANCEL_ERROR_CODES,
  FOOD_STEPS,
  customerCancelErrorCode,
  foodProgressSteps,
  type CustomerCancelErrorCode,
  type FoodProgressFacts,
  type FoodStep,
  type FoodStepKey,
} from "./customer-order-detail.ts"
export { CUSTOMER_ORDER_CONFIRMATION_TEXT } from "./customer-order-confirmation.ts"

export {
  DELIVERY_AGENT_TEXT,
  PROBLEM_CATEGORIES,
  PROBLEM_CATEGORY_TEXT,
  type ProblemCategory,
  DELIVERY_CLAIM_ERROR_CODES,
  DELIVERY_CLAIM_ERRORS,
  isDeliveryClaimErrorCode,
  type DeliveryClaimErrorCode,
  DELIVERY_PICKUP_ERROR_CODES,
  DELIVERY_PICKUP_ERRORS,
  isDeliveryPickupErrorCode,
  type DeliveryPickupErrorCode,
  DELIVERY_HANDOVER_ERROR_CODES,
  DELIVERY_HANDOVER_ERRORS,
  isDeliveryHandoverErrorCode,
  type DeliveryHandoverErrorCode,
  DELIVERY_ARRIVAL_ERROR_CODES,
  DELIVERY_ARRIVAL_ERRORS,
  isDeliveryArrivalErrorCode,
  type DeliveryArrivalErrorCode,
  DELIVERY_CONTACT_ATTEMPT_ERROR_CODES,
  DELIVERY_CONTACT_ATTEMPT_ERRORS,
  isDeliveryContactAttemptErrorCode,
  type DeliveryContactAttemptErrorCode,
} from "./delivery-agent.ts"
export {
  CUSTOMER_FEEDBACK_TEXT,
  CUSTOMER_FEEDBACK_ERROR_CODES,
  ratingLabel,
  type CustomerFeedbackErrorCode,
} from "./customer-feedback.ts"
export {
  ORDER_FINANCIAL_BASIS_TEXT,
  formatExactDkk,
  formatExactPercent,
  commissionTierLabel,
} from "./order-financial-basis.ts"
