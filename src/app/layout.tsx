import type { Metadata, Viewport } from "next";

import { HydrationMarker } from "@/components/hydration-marker";
import { Toaster } from "@/components/ui/sonner";
import { APP_NAME } from "@/lib/constants";

import "./globals.css";
import "./fonts.css";

// Brand fonts are self-hosted (./fonts.css) and preloaded per page by BrandFontPreloads, so each
// workspace downloads only its own fonts (next/font would preload all of them on every page).

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "Deal intelligence and CRM for Housing4All Premier Solutions and AZH Builders.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0B0C10",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        {children}
        <Toaster />
        <HydrationMarker />
      </body>
    </html>
  );
}
