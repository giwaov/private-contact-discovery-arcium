import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans, JetBrains_Mono, Chakra_Petch } from "next/font/google";
import "./globals.css";
import { AppWrapper } from "@/components/AppWrapper";

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["700", "800"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});

const chakraPetch = Chakra_Petch({
  variable: "--font-accent",
  subsets: ["latin"],
  weight: ["500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Private Contact Discovery | Arcium MPC on Solana",
  description:
    "Find mutual contacts without revealing your address book. Powered by Arcium's MPC network for private set intersection on Solana.",
  keywords: [
    "Solana",
    "Arcium",
    "MPC",
    "private contact discovery",
    "PSI",
    "privacy",
    "blockchain",
  ],
  openGraph: {
    title: "Private Contact Discovery | Arcium MPC on Solana",
    description:
      "Find mutual contacts without revealing your address book. Powered by Arcium MPC.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${plusJakarta.variable} ${jetbrainsMono.variable} ${chakraPetch.variable} antialiased`}
      >
        <AppWrapper>{children}</AppWrapper>
      </body>
    </html>
  );
}
