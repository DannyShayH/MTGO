/**
 * The phone-sized sign-in and invitation form: 44px controls, 16px text (no
 * zoom on focus) and no red outline on load. Medusa UI outlines an empty
 * required field in red before anyone has typed; the last two rules keep the
 * red for fields the person has left invalid.
 */
export const PHONE_FORM =
  "flex flex-col gap-y-4 [&_button]:min-h-11 [&_input:invalid:not(:user-invalid):focus-visible]:!shadow-borders-interactive-with-active [&_input:invalid:not(:user-invalid):not(:focus-visible)]:!shadow-borders-base [&_input]:min-h-11 [&_input]:text-base"
