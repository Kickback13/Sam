import { type Brand, brandFontPreloads } from "@/lib/brand";

/**
 * Preload hints for the brand's self-hosted fonts. Rendered as real <link> elements (React hoists
 * them into <head>, or streams them right after it): ReactDOM.preload() from a layout that awaits
 * data only reached the browser inside the RSC payload, after hydration, which is too late to help.
 */
export function BrandFontPreloads({ brand }: { brand: Brand }) {
  return brandFontPreloads(brand).map((href) => (
    <link
      key={href}
      rel="preload"
      href={href}
      as="font"
      type="font/woff2"
      crossOrigin="anonymous"
    />
  ));
}
