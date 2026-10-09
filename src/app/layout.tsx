import type { Metadata, Viewport } from "next";
import { Barlow, Big_Shoulders, Plus_Jakarta_Sans, Source_Sans_3 } from "next/font/google";

import { HydrationMarker } from "@/components/hydration-marker";
import { Toaster } from "@/components/ui/sonner";
import { APP_NAME } from "@/lib/constants";

import "./globals.css";

// Housing4All: Plus Jakarta Sans (display) + Source Sans 3 (body)
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-plus-jakarta", display: "swap" });
const sourceSans = Source_Sans_3({ subsets: ["latin"], variable: "--font-source-sans", display: "swap" });
// AZH Builders: Big Shoulders (Google's current name for Big Shoulders Display; opsz axis) + Barlow
const bigShoulders = Big_Shoulders({
  subsets: ["latin"],
  variable: "--font-big-shoulders",
  display: "swap",
  axes: ["opsz"],
  preload: false,
  adjustFontFallback: false,
});
const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-barlow",
  display: "swap",
  preload: false,
});

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
    <html
      lang="en"
      className={`${jakarta.variable} ${sourceSans.variable} ${bigShoulders.variable} ${barlow.variable}`}
    >
      <body className="min-h-dvh">
        {children}
        <Toaster />
        <HydrationMarker />
      </body>
    </html>
  );
}
