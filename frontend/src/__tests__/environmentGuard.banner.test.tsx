// File: environmentGuard.banner.test.tsx - Tests EnvironmentGuard error and mismatch overlays
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';

// Mock env to a stable baseline
jest.mock('../config/env', () => ({
  env: {
    apiUrl: 'http://localhost:5000',
    wsUrl: 'ws://localhost:5000',
    appEnv: 'development',
    testing: false,
    btcNetwork: 'mainnet',
  },
}));

import EnvironmentGuard from '@/components/EnvironmentGuard';

describe('EnvironmentGuard - banner behavior', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    (global as any).fetch = jest.fn();
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
    (global as any).fetch = originalFetch as any;
    jest.resetAllMocks();
  });

  it('shows backend unavailable overlay on fetch error', async () => {
    (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network down'));

    render(<EnvironmentGuard />);

    await waitFor(() => {
      expect(screen.getByText(/Backend status unavailable/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Network down/i)).toBeInTheDocument();
  });

  it('shows mismatch overlay when backend env differs', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ network: 'testnet', testing: true }),
    });

    render(<EnvironmentGuard />);

    await waitFor(() => {
      expect(screen.getByText(/Environment mismatch detected/i)).toBeInTheDocument();
    });

    const overlay = screen.getByText(/Environment mismatch detected/i).closest('div')!;
    const scope = within(overlay);
    expect(scope.getAllByText(/Frontend/i).length).toBeGreaterThan(0);
    expect(scope.getAllByText(/Backend/i).length).toBeGreaterThan(0);
    expect(scope.getByText(/network: mainnet/i)).toBeInTheDocument();
    expect(scope.getByText(/network: testnet/i)).toBeInTheDocument();
  });
});
