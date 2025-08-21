// jest.setup.ts - test environment setup for frontend
import 'whatwg-fetch';
import '@testing-library/jest-dom';

// Simple fetch mock helper; individual tests can override implementations
const g: any = globalThis as any;
if (!g.fetch) {
  g.fetch = jest.fn();
}

// Mock bitcoin-wallet-adapter to avoid requiring browser wallet context in tests
jest.mock('bitcoin-wallet-adapter', () => ({
  useWalletAddress: () => ({ cardinal_address: null, ordinal_address: null }),
  ConnectMultiButton: () => null,
}));

// Silence Next.js warnings during tests
jest.spyOn(console, 'error').mockImplementation(((...args: any[]) => {
  const msg = (args && args[0]) ? String(args[0]) : '';
  if (msg.includes('Warning:')) return;
  // forward minimal
  // (noop to reduce noise)
}) as any);

// Suppress expected env warning from PledgeQueue when NEXT_PUBLIC_API_URL is not set in tests
const originalWarn = console.warn;
jest.spyOn(console, 'warn').mockImplementation(((...args: any[]) => {
  const msg = (args && args[0]) ? String(args[0]) : '';
  if (msg.includes('NEXT_PUBLIC_API_URL not set. Using default http://localhost:5000')) return;
  originalWarn.apply(console, args as any);
}) as any);
