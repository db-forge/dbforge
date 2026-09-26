import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { Providers } from "@/components/Providers";
import { getLocale, getServerDict } from "@/lib/frontend/i18n/server";
import "./globals.css";

const grotesk = Space_Grotesk({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "700"],
  variable: "--font-grotesk",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerDict();
  return {
    title: "DBForge — Real-world data for Physical AI",
    description: t.meta.description,
  };
}

export const viewport: Viewport = {
  themeColor: "#15151c",
  colorScheme: "dark",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${grotesk.variable} ${jetbrains.variable}`}>
      <body className="min-h-dvh bg-bg font-sans text-text">
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
