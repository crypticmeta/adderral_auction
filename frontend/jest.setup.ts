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
