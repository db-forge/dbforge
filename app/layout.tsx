import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DBForge",
  description: "A Monad-based real-world data marketplace for Physical AI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
