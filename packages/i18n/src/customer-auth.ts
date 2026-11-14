/** Public account outcomes. Raw SDK/backend errors never reach the form. */
export const CUSTOMER_AUTH = {
  da: {
    signIn: "Log ind",
    register: "Opret konto",
    welcome: "Velkommen tilbage",
    introduction: "Log ind på din personlige MTOGO-konto.",
    join: "Opret din MTOGO-konto",
    description:
      "Du behøver kun e-mail og adgangskode. Du kan stadig se menuen og bygge din kurv uden en konto.",
    email: "E-mail",
    password: "Adgangskode",
    existing: "Har du allerede en konto?",
    newCustomer: "Har du ikke en konto?",
    verification:
      "Tjek din indbakke for at bekræfte din e-mail, og log derefter ind.",
    language: "Sprog",
    saveLanguage: "Gem sprog",
    savingLanguage: "Gemmer sprog…",
    languageSaved: "Dit sprog er gemt.",
    languageError: "Dit sprog kunne ikke gemmes. Prøv igen.",
    showPassword: "Vis eller skjul adgangskode",
    errors: {
      customer_identity_exists:
        "Der findes allerede en kundekonto med denne e-mail. Log ind på din konto.",
      customer_credentials_invalid: "E-mail eller adgangskode er forkert.",
      customer_auth_unavailable: "Vi kunne ikke logge dig ind. Prøv igen.",
      customer_cart_transfer_failed:
        "Du er logget ind, men kurven kunne ikke overføres. Prøv at logge ind igen. Din kurv er bevaret.",
    },
  },
  en: {
    signIn: "Sign in",
    register: "Create account",
    welcome: "Welcome back",
    introduction: "Sign in to your personal MTOGO account.",
    join: "Create your MTOGO account",
    description:
      "You only need email and password. You can still browse the menu and build your basket without an account.",
    email: "Email",
    password: "Password",
    existing: "Already have an account?",
    newCustomer: "New to MTOGO?",
    verification: "Check your inbox to verify your email, then sign in.",
    language: "Language",
    saveLanguage: "Save language",
    savingLanguage: "Saving language…",
    languageSaved: "Your language has been saved.",
    languageError: "Your language could not be saved. Please try again.",
    showPassword: "Show or hide password",
    errors: {
      customer_identity_exists:
        "A Customer account with this email already exists. Sign in to your account.",
      customer_credentials_invalid: "The email or password is incorrect.",
      customer_auth_unavailable: "We could not sign you in. Please try again.",
      customer_cart_transfer_failed:
        "You are signed in, but your basket could not be transferred. Try signing in again. Your basket has been kept.",
    },
  },
} as const
export type CustomerAuthCode = keyof typeof CUSTOMER_AUTH.en.errors
