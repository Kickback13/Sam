import { z } from "zod";

/** Fonts are whitelisted: each maps to a next/font CSS variable loaded in the root layout. */
export const FONTS = {
  "plus-jakarta-sans": { label: "Plus Jakarta Sans", cssVar: "--font-plus-jakarta" },
  "source-sans-3": { label: "Source Sans 3", cssVar: "--font-source-sans" },
  "big-shoulders-display": { label: "Big Shoulders Display", cssVar: "--font-big-shoulders" },
  barlow: { label: "Barlow", cssVar: "--font-barlow" },
} as const;
export type FontKey = keyof typeof FONTS;
const FONT_KEYS = Object.keys(FONTS) as [FontKey, ...FontKey[]];

const hex = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex color like #2F439A")
  .transform((v) => v.toUpperCase());

export const brandSchema = z.object({
  primary: hex,
  primaryDeep: hex,
  accent: hex,
  accentText: hex,
  danger: hex,
  ink: hex,
  surface: hex,
  displayFont: z.enum(FONT_KEYS),
  bodyFont: z.enum(FONT_KEYS),
  logoText: z.string().trim().min(1).max(6).optional(),
});
export type Brand = z.infer<typeof brandSchema>;

export const DEFAULT_BRAND: Brand = {
  primary: "#2F439A",
  primaryDeep: "#202F8B",
  accent: "#00D9E1",
  accentText: "#007B82",
  danger: "#B42318",
  ink: "#0B0C10",
  surface: "#E8FBFC",
  displayFont: "plus-jakarta-sans",
  bodyFont: "source-sans-3",
};

/** Parse stored brand JSON; any invalid token falls back to the default so the UI never breaks. */
export function parseBrand(value: unknown): Brand {
  const input = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...DEFAULT_BRAND };
  for (const key of Object.keys(brandSchema.shape) as (keyof Brand)[]) {
    const field = brandSchema.shape[key].safeParse(input[key]);
    if (field.success && field.data !== undefined) merged[key] = field.data;
  }
  return brandSchema.parse(merged);
}

/** CSS custom properties for a workspace. Values are validated hex / whitelisted fonts only. */
export function brandCssVars(brand: Brand): Record<string, string> {
  return {
    "--brand-primary": brand.primary,
    "--brand-primary-deep": brand.primaryDeep,
    "--brand-accent": brand.accent,
    "--brand-accent-text": brand.accentText,
    "--brand-danger": brand.danger,
    "--brand-ink": brand.ink,
    "--brand-surface": brand.surface,
    "--brand-font-display": `var(${FONTS[brand.displayFont].cssVar})`,
    "--brand-font-body": `var(${FONTS[brand.bodyFont].cssVar})`,
  };
}

export function brandStyleBlock(brand: Brand): string {
  const vars = brandCssVars(brand);
  return `:root{${Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(";")}}`;
}

// --- WCAG contrast -----------------------------------------------------------

function channel(c: number) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hexColor: string): number {
  const h = hexColor.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG AA checks the brand must pass before an admin can save it. */
export function brandContrastIssues(brand: Brand): string[] {
  const issues: string[] = [];
  const check = (label: string, fg: string, bg: string, min = 4.5) => {
    const ratio = contrastRatio(fg, bg);
    if (ratio < min) issues.push(`${label}: contrast ${ratio.toFixed(2)}:1 is below ${min}:1`);
  };
  check("Black text on accent", "#000000", brand.accent);
  check("Accent text on white", brand.accentText, "#FFFFFF");
  check("White text on primary", "#FFFFFF", brand.primary);
  check("Danger text on white", brand.danger, "#FFFFFF");
  check("Ink text on surface", brand.ink, brand.surface);
  return issues;
}
