/**
 * Header component
 * Purpose: Top navigation bar with app branding and wallet connect.
 * Styling: Tailwind, adderrels theme accents.
 * Null-safety: Defensive checks around window usage if extended; no props required now.
 */
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ConnectMultiButton } from 'bitcoin-wallet-adapter';

export default function Header() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-dark-900/70 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-24 items-center justify-between">
          {/* Brand */}
          <Link href="/" className="flex items-center gap-3">
            {/* If the image is missing, fallback to text via alt */}
            <Image
              src="/adderrel.png"
              alt="Adderrels"
              width={28}
              height={28}
              className="rounded-md"
            />
            <span className="text-sm sm:text-base font-semibold tracking-wide">
              Adderrels Auction
            </span>
          </Link>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <ConnectMultiButton
              network="mainnet"
              connectionMessage="Connect your wallet to participate in the auction."
              buttonClassname="bg-adderrels-500 text-white hover:bg-adderrels-500/90 transition-colors rounded-md px-3 py-2 text-sm font-medium"
            />
          </div>
        </div>
      </div>
    </header>
  );
}
