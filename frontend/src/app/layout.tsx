/**
 * RootLayout
 * Purpose: Global HTML/body wrapper, providers, and universal header.
 * Styling: Tailwind base via globals.css, Geist fonts.
 */
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppProviders from "@/components/AppProviders";
import Header from "@/components/Header";
import EnvironmentGuard from "@/components/EnvironmentGuard";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Adderrels Auction",
  description: "Participate in the Adderrels token auction and secure your allocation",
  icons: {
    icon: "/adderrel.png",
    shortcut: "/adderrel.png",
    apple: "/adderrel.png",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AppProviders>
          <Header />
          <EnvironmentGuard />
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
