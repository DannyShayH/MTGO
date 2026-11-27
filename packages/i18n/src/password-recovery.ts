export const PASSWORD_RECOVERY_TEXT = {
  da: {
    forgot: "Glemt adgangskode?",
    requestTitle: "Nulstil din adgangskode",
    requestIntro:
      "Indtast din login-e-mail for at få et link til at vælge en ny adgangskode.",
    email: "E-mail",
    send: "Send link",
    sent: "Hvis der findes en aktiv konto med denne e-mail, modtager du et link. Linket er gyldigt i 15 minutter.",
    resetTitle: "Vælg en ny adgangskode",
    password: "Ny adgangskode",
    confirmPassword: "Gentag ny adgangskode",
    passwordHint: "Brug mindst 8 tegn.",
    save: "Gem adgangskode",
    success:
      "Din adgangskode er ændret. Du kan nu logge ind med den nye adgangskode.",
    invalid:
      "Linket er ugyldigt, er udløbet eller er allerede brugt. Bed om et nyt link.",
    mismatch: "Adgangskoderne er ikke ens.",
    too_short: "Adgangskoden skal indeholde mindst 8 tegn.",
    failed: "Handlingen kunne ikke gennemføres. Prøv igen.",
    back: "Tilbage til login",
    newLink: "Bed om et nyt link",
    loading: "Åbner dit link …",
  },
  en: {
    forgot: "Forgot password?",
    requestTitle: "Reset your password",
    requestIntro:
      "Enter your login email to receive a link to choose a new password.",
    email: "Email",
    send: "Send reset link",
    sent: "If an active account exists for this email, you will receive a link. The link is valid for 15 minutes.",
    resetTitle: "Choose a new password",
    password: "New password",
    confirmPassword: "Repeat new password",
    passwordHint: "Use at least 8 characters.",
    save: "Save password",
    success:
      "Your password has changed. You can now sign in with your new password.",
    invalid:
      "This link is invalid, has expired or has already been used. Request a new link.",
    mismatch: "The passwords do not match.",
    too_short: "Your password must contain at least 8 characters.",
    failed: "This could not be completed. Try again.",
    back: "Back to sign in",
    newLink: "Request a new link",
    loading: "Opening your link …",
  },
} as const
