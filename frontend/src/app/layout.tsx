import type { Metadata } from "next";
import { Inter, Fira_Code } from "next/font/google";
import "./globals.css";
import { AppWrapper } from "@/components/AppWrapper";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const firaCode = Fira_Code({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
        className={`${inter.variable} ${firaCode.variable} antialiased`}
      >
        <AppWrapper>{children}</AppWrapper>
      </body>
    </html>
  );
}
