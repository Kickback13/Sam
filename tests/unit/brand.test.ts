import { describe, expect, it } from "vitest";

import {
  brandContrastIssues,
  brandCssVars,
  brandFontPreloads,
  contrastRatio,
  DEFAULT_BRAND,
  FONTS,
  parseBrand,
} from "@/lib/brand";

// Values seeded in supabase/migrations/*_seed_workspaces.sql
const SEEDED = {
  housing4all: {
    primary: "#2F439A",
    primaryDeep: "#202F8B",
    accent: "#00D9E1",
    accentText: "#007B82",
    danger: "#B42318",
    ink: "#0B0C10",
    surface: "#E8FBFC",
    displayFont: "plus-jakarta-sans",
    bodyFont: "source-sans-3",
    logoText: "H4A",
  },
  "azh-builders": {
    primary: "#111110",
    primaryDeep: "#1C1C1A",
    accent: "#FFC20E",
    accentText: "#8A6400",
    danger: "#D62718",
    ink: "#111110",
    surface: "#F3F3F0",
    displayFont: "big-shoulders-display",
    bodyFont: "barlow",
    logoText: "AZH",
  },
  demo: {
    primary: "#3F3F46",
    primaryDeep: "#27272A",
    accent: "#C4B5FD",
    accentText: "#6D28D9",
    danger: "#B42318",
    ink: "#0B0C10",
    surface: "#F5F3FF",
    displayFont: "plus-jakarta-sans",
    bodyFont: "source-sans-3",
    logoText: "DEMO",
  },
};

describe("WCAG AA brand rules", () => {
  it.each(Object.entries(SEEDED))("%s passes every contrast check", (_slug, brand) => {
    expect(brandContrastIssues(parseBrand(brand))).toEqual([]);
  });

  it("cyan and yellow are fills only — they fail as text on white", () => {
    expect(contrastRatio("#00D9E1", "#FFFFFF")).toBeLessThan(4.5);
    expect(contrastRatio("#FFC20E", "#FFFFFF")).toBeLessThan(4.5);
    expect(contrastRatio("#000000", "#00D9E1")).toBeGreaterThan(4.5);
    expect(contrastRatio("#000000", "#FFC20E")).toBeGreaterThan(4.5);
  });

  it("reports a failing brand", () => {
    const issues = brandContrastIssues({ ...DEFAULT_BRAND, accentText: "#00D9E1" });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/Accent text on white/);
  });
});

describe("parseBrand / brandCssVars", () => {
  it("falls back per token and rejects CSS injection", () => {
    const b = parseBrand({
      accent: "red;}body{display:none",
      primary: "#123456",
      displayFont: "comic-sans",
    });
    expect(b.accent).toBe(DEFAULT_BRAND.accent);
    expect(b.primary).toBe("#123456");
    expect(b.displayFont).toBe(DEFAULT_BRAND.displayFont);
  });

  it("maps fonts to next/font variables", () => {
    const vars = brandCssVars(parseBrand(SEEDED["azh-builders"]));
    expect(vars["--brand-accent"]).toBe("#FFC20E");
    expect(vars["--brand-font-display"]).toBe("var(--font-big-shoulders)");
    expect(vars["--brand-font-body"]).toBe("var(--font-barlow)");
  });
});

describe("brandFontPreloads", () => {
  it("preloads only Housing4All's own fonts for the default brand", () => {
    expect(brandFontPreloads(DEFAULT_BRAND)).toEqual([
      "/fonts/plus-jakarta-sans-latin.v1.woff2",
      "/fonts/source-sans-3-latin.v1.woff2",
    ]);
  });

  it("preloads the self-hosted AZH fonts, display first, without duplicates", () => {
    const azh = {
      ...DEFAULT_BRAND,
      displayFont: "big-shoulders-display",
      bodyFont: "barlow",
    } as const;
    expect(brandFontPreloads(azh)).toEqual([
      "/fonts/big-shoulders-latin.v1.woff2",
      "/fonts/barlow-400-latin.v1.woff2",
      "/fonts/barlow-600-latin.v1.woff2",
    ]);
    expect(brandFontPreloads({ ...azh, displayFont: "barlow" })).toHaveLength(2);
  });

  it("every font file in fonts.css exists, and every preload is one of them", async () => {
    const { existsSync, readFileSync } = await import("node:fs");
    const css = readFileSync("src/app/fonts.css", "utf8");
    const urls = [...css.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThan(20);
    for (const url of urls) expect(existsSync(`public${url}`), url).toBe(true);
    for (const font of Object.values(FONTS)) {
      expect(css).toContain(`${font.cssVar}:`);
      for (const url of font.preload) expect(urls).toContain(url);
    }
  });
});
