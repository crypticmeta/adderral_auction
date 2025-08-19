import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { WebSocketProvider } from "../contexts/WebSocketContext";
import WalletProvider from "../contexts/WalletProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ACORN Auction",
  description: "Participate in the ACORN token auction and secure your allocation",
  icons: {
    icon: "/acorn.png",
    shortcut: "/acorn.png",
    apple: "/acorn.png",
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
        <WebSocketProvider>
          <WalletProvider
            customAuthOptions={{
              network: 'mainnet',
              appDetails: {
                name: 'ACORN Auction',
                icon: '/acorn.png',
              },
            }}
          >
            {children}
          </WalletProvider>
        </WebSocketProvider>
      </body>
    </html>
  );
}
