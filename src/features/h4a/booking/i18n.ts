/**
 * Public booking page in English or Spanish (ADR-044). Pure: no React, no server code.
 *
 * The visitor's language comes from `?lang=` when they picked it, otherwise from the
 * browser's Accept-Language header, otherwise English. The text the owner typed (title,
 * intro, location) is shown as entered.
 */

export type BookingLang = "en" | "es";

/** `?lang=` wins; then the first supported language in Accept-Language (by q value). */
export function pickBookingLang(
  query: string | string[] | undefined | null,
  acceptLanguage: string | null | undefined,
): BookingLang {
  const q = Array.isArray(query) ? query[0] : query;
  if (q === "es" || q === "en") return q;
  const ranked = (acceptLanguage ?? "")
    .split(",")
    .map((part, i) => {
      const [tag, ...params] = part.trim().toLowerCase().split(";");
      const qp = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = qp ? Number(qp.slice(2)) : 1;
      return { lang: tag.split("-")[0], weight: Number.isFinite(weight) ? weight : 0, i };
    })
    .filter((x) => x.lang && x.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.i - b.i);
  const first = ranked.find((x) => x.lang === "en" || x.lang === "es");
  return first?.lang === "es" ? "es" : "en";
}

/** Locale for dates and times. es-US keeps US conventions (12-hour clock) in Spanish. */
export const BOOKING_LOCALE: Record<BookingLang, string> = { en: "en-US", es: "es-US" };

export const BOOKING_TEXT = {
  en: {
    switchTo: "Español",
    switchLang: "es",
    with: (name: string) => `With ${name}`,
    minutes: (n: number) => `${n} minutes`,
    timesIn: (zone: string) => `Times in ${zone} time`,
    pickDay: "Pick a day",
    pickTime: "Pick a time",
    day: "Day",
    noSlots: "No open times right now. Please check back soon or call us.",
    pickAnother: "Pick another time",
    yourName: "Your name",
    email: "Email",
    phone: "Phone",
    reachHint: "Email or phone — at least one, so we can reach you.",
    note: "What would you like to talk about? (optional)",
    book: "Book this time",
    footer: "We only use your details to reach you about this call. Nothing is sent automatically.",
    bookedTitle: "You're booked",
    bookedBody: (host: string | null) =>
      `${host ?? "We"} will reach out at the time you picked. No confirmation email is sent, so add it to your calendar now.`,
    addToCalendar: "Add to my calendar",
    bookAnother: "Book another time",
    pageTitle: "Book a call",
    genericError: "Something went wrong. Please try again or call us.",
  },
  es: {
    switchTo: "English",
    switchLang: "en",
    with: (name: string) => `Con ${name}`,
    minutes: (n: number) => `${n} minutos`,
    timesIn: (zone: string) => `Horario de ${zone}`,
    pickDay: "Elija un día",
    pickTime: "Elija una hora",
    day: "Día",
    noSlots: "No hay horarios disponibles por ahora. Vuelva pronto o llámenos.",
    pickAnother: "Elegir otra hora",
    yourName: "Su nombre",
    email: "Correo electrónico",
    phone: "Teléfono",
    reachHint: "Correo o teléfono: al menos uno, para poder comunicarnos con usted.",
    note: "¿De qué le gustaría hablar? (opcional)",
    book: "Reservar esta hora",
    footer:
      "Solo usamos sus datos para comunicarnos con usted sobre esta llamada. No se envía nada automáticamente.",
    bookedTitle: "Su cita está reservada",
    bookedBody: (host: string | null) =>
      `${host ?? "Nosotros"} se comunicará con usted a la hora que eligió. No se envía correo de confirmación, así que agréguela a su calendario ahora.`,
    addToCalendar: "Agregar a mi calendario",
    bookAnother: "Reservar otra hora",
    pageTitle: "Reserve una llamada",
    genericError: "Algo salió mal. Inténtelo de nuevo o llámenos.",
  },
} as const;

/**
 * Spanish for the messages the booking checks can return (the form's checks and the
 * database's). Anything not listed stays as is.
 */
const ES_ERRORS: Record<string, string> = {
  "Enter your name": "Escriba su nombre",
  "Enter an email or a phone number so we can reach you":
    "Escriba un correo o un teléfono para poder comunicarnos con usted",
  "Enter a valid email address": "Escriba un correo electrónico válido",
  "Enter a valid US phone number": "Escriba un número de teléfono de EE. UU. válido",
  "Keep the note under 2,000 characters": "La nota debe tener menos de 2,000 caracteres",
  "This booking page isn't open right now": "Esta página de reservas no está abierta por ahora",
  "Too many bookings from here. Please try again later or call us.":
    "Demasiadas reservas desde aquí. Inténtelo más tarde o llámenos.",
  "Too many bookings today. Please call us instead.":
    "Demasiadas reservas hoy. Por favor llámenos.",
  "You already have upcoming calls booked. We look forward to talking.":
    "Ya tiene llamadas reservadas. Esperamos hablar con usted.",
  "That time was just taken. Please pick another.":
    "Esa hora se acaba de ocupar. Por favor elija otra.",
  "Something went wrong. Please try again or call us.":
    "Algo salió mal. Inténtelo de nuevo o llámenos.",
  "Check the form": "Revise el formulario",
  "Invalid request": "Solicitud no válida",
};

export function bookingError(message: string, lang: BookingLang): string {
  return lang === "es" ? (ES_ERRORS[message] ?? message) : message;
}

/** True when the slot was taken by someone else (either language). */
export function isSlotTaken(message: string): boolean {
  return (
    message === "That time was just taken. Please pick another." ||
    message === ES_ERRORS["That time was just taken. Please pick another."]
  );
}
