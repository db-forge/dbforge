import type { Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { Providers } from "@/components/Providers";
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

export const metadata: Metadata = {
  title: "DBForge — Real-world data for Physical AI",
  description:
    "Physical AI şirketleri veri görevi açar, sen telefonla çekersin, AI doğrular, Monad üzerinden anında MON kazanırsın.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className={`${grotesk.variable} ${jetbrains.variable}`}>
      <body className="min-h-dvh bg-ice font-sans text-ink">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
