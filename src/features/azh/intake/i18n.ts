/** English/Spanish copy for the public homeowner request form. */
export type Lang = "en" | "es";

export function parseLang(value: unknown): Lang {
  return value === "es" ? "es" : "en";
}

const en = {
  title: "Request a free estimate",
  intro:
    "Tell us about your project. Someone from the right AZH Builders office will call you to schedule an estimate visit.",
  language: "Language",
  name: "Full name",
  phone: "Phone",
  email: "Email (optional)",
  address: "Job address",
  zip: "ZIP code",
  service: "Type of work",
  servicePlaceholder: "Choose one…",
  description: "Describe the work",
  descriptionHelp: "What needs to be done, rough size, and anything we should know.",
  photos: "Photos (optional, up to 5)",
  photosHelp: "JPG, PNG, WebP or HEIC, 10 MB each.",
  removePhoto: "Remove photo",
  contactTime: "Best time to call",
  times: { morning: "Morning", afternoon: "Afternoon", evening: "Evening", any: "Any time" },
  consentLabel: "Text message consent (optional)",
  consent:
    "Yes, AZH Builders may send me text messages at the phone number above about this request, including scheduling and project updates. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not required to get an estimate.",
  submit: "Send request",
  sending: "Sending…",
  uploading: "Uploading photos…",
  required: "Required",
  honeypot: "Leave this field empty",
  privacy:
    "We use your information only to respond to this request. We don't send automatic messages, and we never sell your information.",
  errors: {
    generic: "Something went wrong. Please try again, or call us.",
    photoType: "Only JPG, PNG, WebP or HEIC photos.",
    photoSize: "Each photo must be 10 MB or smaller.",
    photoCount: "You can attach up to 5 photos.",
    photoUpload: "A photo didn't upload. Remove it and try again.",
    unavailable: "This request form isn't available right now. Please call us.",
    rateLimited: "Too many requests. Please try again later or call us.",
    fix: "Please fix the highlighted fields.",
    name: "Enter your name",
    phone: "Enter a valid US phone number",
    email: "Enter a valid email address",
    addressShort: "Enter the job address",
    zip: "Enter a 5-digit ZIP code",
    service: "Choose the type of work",
    description: "Describe the work",
  },
  thanksTitle: "Thank you — we got your request",
  thanksBody:
    "The AZH Builders office closest to your job will call you to schedule an estimate visit. If it's urgent, call us:",
  another: "Send another request",
  callUs: "Call us",
};

export type Dict = typeof en;

const es: Dict = {
  title: "Solicite un presupuesto gratis",
  intro:
    "Cuéntenos sobre su proyecto. Alguien de la oficina de AZH Builders que le corresponde lo llamará para programar una visita de presupuesto.",
  language: "Idioma",
  name: "Nombre completo",
  phone: "Teléfono",
  email: "Correo electrónico (opcional)",
  address: "Dirección del trabajo",
  zip: "Código postal",
  service: "Tipo de trabajo",
  servicePlaceholder: "Elija uno…",
  description: "Describa el trabajo",
  descriptionHelp: "Qué se necesita hacer, tamaño aproximado y cualquier detalle importante.",
  photos: "Fotos (opcional, hasta 5)",
  photosHelp: "JPG, PNG, WebP o HEIC, 10 MB cada una.",
  removePhoto: "Quitar foto",
  contactTime: "Mejor hora para llamarle",
  times: { morning: "Mañana", afternoon: "Tarde", evening: "Noche", any: "Cualquier hora" },
  consentLabel: "Consentimiento para mensajes de texto (opcional)",
  consent:
    "Sí, AZH Builders puede enviarme mensajes de texto al número de teléfono indicado sobre esta solicitud, incluyendo citas y novedades del proyecto. La frecuencia de los mensajes varía. Pueden aplicarse tarifas de mensajes y datos. Responda STOP para cancelar o HELP para obtener ayuda. El consentimiento no es necesario para recibir un presupuesto.",
  submit: "Enviar solicitud",
  sending: "Enviando…",
  uploading: "Subiendo fotos…",
  required: "Obligatorio",
  honeypot: "Deje este campo vacío",
  privacy:
    "Usamos su información solo para responder a esta solicitud. No enviamos mensajes automáticos y nunca vendemos su información.",
  errors: {
    generic: "Algo salió mal. Inténtelo de nuevo o llámenos.",
    photoType: "Solo fotos JPG, PNG, WebP o HEIC.",
    photoSize: "Cada foto debe pesar 10 MB o menos.",
    photoCount: "Puede adjuntar hasta 5 fotos.",
    photoUpload: "Una foto no se pudo subir. Quítela e inténtelo de nuevo.",
    unavailable: "Este formulario no está disponible en este momento. Por favor llámenos.",
    rateLimited: "Demasiadas solicitudes. Inténtelo más tarde o llámenos.",
    fix: "Por favor corrija los campos marcados.",
    name: "Escriba su nombre",
    phone: "Escriba un número de teléfono válido de EE. UU.",
    email: "Escriba un correo electrónico válido",
    addressShort: "Escriba la dirección del trabajo",
    zip: "Escriba un código postal de 5 dígitos",
    service: "Elija el tipo de trabajo",
    description: "Describa el trabajo",
  },
  thanksTitle: "Gracias — recibimos su solicitud",
  thanksBody:
    "La oficina de AZH Builders más cercana a su trabajo lo llamará para programar una visita de presupuesto. Si es urgente, llámenos:",
  another: "Enviar otra solicitud",
  callUs: "Llámenos",
};

export const DICTS: Record<Lang, Dict> = { en, es };

/** The consent sentence exactly as shown, stored as TCPA evidence. */
export function consentText(lang: Lang): string {
  return DICTS[lang].consent;
}
