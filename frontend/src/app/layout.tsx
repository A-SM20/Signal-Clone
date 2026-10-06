import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { InlineScript } from "@/components/app/InlineScript";
import { ToastViewport } from "@/components/ui/Toast";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Signal",
  description: "A Signal messenger clone — private, real-time messaging.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <InlineScript html={THEME_BOOT_SCRIPT} />
      </head>
      <body className="h-full overflow-hidden">
        <Providers>{children}</Providers>
        <ToastViewport />
      </body>
    </html>
  );
}
