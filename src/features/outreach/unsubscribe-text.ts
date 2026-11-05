/** The public unsubscribe page in English or Spanish (ADR-045). Pure. */
export type UnsubscribeLang = "en" | "es";

export const UNSUBSCRIBE_TEXT = {
  en: {
    title: "Unsubscribe",
    invalidTitle: "This link isn't valid",
    invalidBody:
      "It may have been copied incompletely. Reply to the email and ask to be removed, and we'll take care of it.",
    doneTitle: "You're unsubscribed",
    thisAddress: "This address",
    doneBody: (who: string, ws: string) => `${who} won't get newsletters from ${ws} anymore.`,
    askTitle: (ws: string) => `Unsubscribe from ${ws}?`,
    askBody: (who: string, ws: string) => `${who} will stop getting newsletters from ${ws}.`,
    button: "Unsubscribe",
  },
  es: {
    title: "Cancelar suscripción",
    invalidTitle: "Este enlace no es válido",
    invalidBody:
      "Puede que se haya copiado incompleto. Responda al correo y pida que lo quitemos de la lista; nosotros nos encargamos.",
    doneTitle: "Su suscripción fue cancelada",
    thisAddress: "Esta dirección",
    doneBody: (who: string, ws: string) => `${who} ya no recibirá boletines de ${ws}.`,
    askTitle: (ws: string) => `¿Cancelar la suscripción a ${ws}?`,
    askBody: (who: string, ws: string) => `${who} dejará de recibir boletines de ${ws}.`,
    button: "Cancelar suscripción",
  },
} as const;
