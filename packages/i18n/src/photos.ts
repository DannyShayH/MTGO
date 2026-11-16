export type PhotoErrorCode =
  | "photo_invalid"
  | "photo_quota"
  | "photo_rate_limit"
  | "photo_stale"
  | "photo_exists"
  | "photo_retry_conflict"
  | "photo_target_not_found"
  | "photo_storage_failed"
  | "unknown_error"

export const PHOTO_TEXT = {
  da: {
    dish: "Tilføj foto af retten",
    cover: "Tilføj restaurantens forsidefoto",
    choose: "Vælg JPEG, PNG eller WebP (højst 5 MB)",
    select: "Vælg et foto",
    change: "Vælg et andet foto",
    currentDish: "Rettens foto",
    currentCover: "Restaurantens forsidefoto",
    upload: "Tilføj foto",
    replace: "Erstat foto",
    remove: "Fjern foto",
    saved: "Fotoet er opdateret.",
    errors: {
      photo_invalid:
        "Billedet kunne ikke bruges. Vælg en gyldig JPEG, PNG eller WebP på højst 5 MB og 20 megapixel.",
      photo_quota: "Restaurantens fotolager er fyldt. Kontakt MTOGO.",
      photo_rate_limit:
        "Der er tilføjet for mange fotos i dag. Prøv igen i morgen.",
      photo_stale: "Indholdet blev ændret. Genindlæs siden og prøv igen.",
      photo_exists: "Der er allerede et foto. Genindlæs siden.",
      photo_retry_conflict:
        "Denne anmodning er allerede brugt til et andet foto. Prøv igen.",
      photo_target_not_found:
        "Retten eller restauranten kunne ikke findes. Genindlæs siden.",
      photo_storage_failed: "Fotoet kunne ikke gemmes. Prøv igen senere.",
      unknown_error: "Fotoet kunne ikke tilføjes. Prøv igen senere.",
    },
  },
  en: {
    dish: "Add a dish photo",
    cover: "Add a Restaurant cover photo",
    choose: "Choose JPEG, PNG or WebP (up to 5 MB)",
    select: "Choose a photo",
    change: "Choose another photo",
    currentDish: "Dish photo",
    currentCover: "Restaurant cover photo",
    upload: "Add photo",
    replace: "Replace photo",
    remove: "Remove photo",
    saved: "The photo has been updated.",
    errors: {
      photo_invalid:
        "This image cannot be used. Choose a valid JPEG, PNG or WebP up to 5 MB and 20 megapixels.",
      photo_quota: "The Restaurant's photo storage is full. Contact MTOGO.",
      photo_rate_limit: "Too many photos were added today. Try again tomorrow.",
      photo_stale: "The content changed. Reload this page and try again.",
      photo_exists: "There is already a photo. Reload this page.",
      photo_retry_conflict:
        "This request was already used for another photo. Try again.",
      photo_target_not_found:
        "The dish or Restaurant could not be found. Reload this page.",
      photo_storage_failed: "The photo could not be saved. Try again later.",
      unknown_error: "The photo could not be added. Try again later.",
    },
  },
} as const

export const isPhotoErrorCode = (code: unknown): code is PhotoErrorCode =>
  typeof code === "string" && code in PHOTO_TEXT.en.errors
