import type { AppLocale } from "@/i18n/routing";

/**
 * Texts of the localized error boundary (`(marketing)/error.tsx`, re-used by the `(auth)` group).
 * They mirror `messages/<locale>/common.json` → `error` word for word; the boundary reads them
 * through `useLocale()` + this table instead of `useTranslations`, because an error boundary is a
 * client entry of every public route and `useTranslations` would put the ICU message-format runtime
 * (~12 KB gzip) into every marketing page for three strings.
 */
export interface ErrorPageCopy {
  title: string;
  text: string;
  retry: string;
}

export const ERROR_PAGE_COPY: Record<AppLocale, ErrorPageCopy> = {
  en: { title: "Something went wrong", text: "The error has been recorded. Please try again.", retry: "Try again" },
  de: { title: "Etwas ist schiefgelaufen", text: "Der Fehler wurde aufgezeichnet. Bitte versuche es erneut.", retry: "Erneut versuchen" },
  fr: { title: "Une erreur s’est produite", text: "L’erreur a été enregistrée. Veuillez réessayer.", retry: "Réessayer" },
  es: { title: "Algo ha salido mal", text: "El error se ha registrado. Inténtalo de nuevo.", retry: "Reintentar" },
  it: { title: "Qualcosa è andato storto", text: "L’errore è stato registrato. Riprova.", retry: "Riprova" },
  nl: { title: "Er is iets misgegaan", text: "De fout is geregistreerd. Probeer het opnieuw.", retry: "Opnieuw proberen" },
};
