import type { Metadata } from "next";
import { Fraunces, DM_Sans } from "next/font/google";
import { Providers } from "@/components/providers";
import { AmbientBg } from "@/components/ambient-bg";
import { Nav } from "@/components/nav";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
});

const sans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Illuminate",
  description:
    "Illuminate — auto-apply to Luma events with LinkedIn OAuth and your interests.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="font-sans antialiased">
        <Providers>
          <AmbientBg />
          <Nav />
          <main className="relative min-h-screen">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
