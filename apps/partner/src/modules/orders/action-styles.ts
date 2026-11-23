/**
 * MTOGO's primary action on Medusa UI's Button: lagoon teal, as the design
 * brief gives primary actions, instead of Medusa's dark default. Medusa's
 * `clx` merges these over its own colours. Busy buttons stay teal (they are
 * `aria-disabled`, not disabled), so a pressed step never looks unavailable.
 */
export const PRIMARY_ACTION =
  "bg-mtogo-action-primary text-mtogo-text-on-primary shadow-none after:hidden hover:bg-mtogo-action-primary-hover active:bg-mtogo-action-primary-pressed aria-[busy=true]:bg-mtogo-action-primary-hover"

/** Press feedback and the 48px kitchen target shared by the Order actions. */
export const ACTION_BUTTON =
  "ease-out-strong focus-visible:ring-mtogo-focus-ring min-h-12 gap-x-2 px-5 transition-[background-color,transform] duration-150 focus-visible:ring-2 focus-visible:ring-offset-2 motion-safe:active:scale-[0.97] w-full sm:w-auto"
