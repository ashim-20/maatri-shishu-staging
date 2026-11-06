import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "@fontsource-variable/dm-sans";
import "@fontsource/noto-sans-devanagari/400.css";
import "@fontsource/noto-sans-devanagari/500.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Maatri-Shishu · A little care, every day",
  description:
    "A mother and child health follow-up workspace for FCHVs and health-post staff.",
  applicationName: "Maatri-Shishu",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#28705b",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
