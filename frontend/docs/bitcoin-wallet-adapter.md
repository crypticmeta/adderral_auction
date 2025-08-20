# bitcoin-wallet-adapter integration (ADDERREL Frontend)

This document summarizes how we use the `bitcoin-wallet-adapter` package in our Next.js app and the key APIs we rely on.

## Installation
- yarn add bitcoin-wallet-adapter

## Provider
- We wrap the app with `WalletProvider` in `src/app/layout.tsx` via our wrapper `src/contexts/WalletProvider.tsx`.
- Configured with `customAuthOptions`:
  - `network`: "mainnet" | "testnet" (we default to mainnet)
  - `appDetails`: `{ name, icon }` (used primarily by Leather)

Files:
- `src/app/layout.tsx`
- `src/contexts/WalletProvider.tsx`

## Connect UI
- We use the provided multi-wallet connect component in the homepage header:
  - `ConnectMultiButton` (alias of ConnectMultiWallet) from `bitcoin-wallet-adapter`
  - Props we set:
    - `network="mainnet"`
    - `connectionMessage`: custom sign-in message
    - `supportedWallets`: ["unisat", "xverse", "leather", "magiceden", "okx"]
    - `onSignatureCapture(signatureData)`: receive verified BIP-322 signature data

File:
- `src/app/page.tsx`

## Useful Hooks (available from the package)
- `useWalletAddress()` → wallet details `{ cardinal, wallet, ... }`
- `useWalletBalance()` → `{ balance, btcPrice }`
- `useMessageSign()` → `signMessage({ message, address, network, wallet })`
- `usePayBTC()` → `payBTC({ address, amount /* sats */, network })`

Prefer these hooks over manual localStorage state for connection status.

## Notes & Recommendations
- Persistence: The adapter manages connection/auth flows. Avoid storing `walletConnected`/`walletAddress` in `localStorage` manually. Use `useWalletAddress()` to derive connection state.
- Signature capture: `onSignatureCapture` fires after verified BIP-322 signatures; safe to send to backend for auth.
- Supported wallets: Limit via `supportedWallets` for a cleaner UX. If omitted, all detected wallets render.
