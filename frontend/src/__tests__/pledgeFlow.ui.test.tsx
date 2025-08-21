// File: pledgeFlow.ui.test.tsx
// Purpose: Verify pledge lifecycle appears in PledgeQueue and RecentActivity and AuctionStatus updates totals.
// - After creation: pledge visible in PledgeQueue and RecentActivity
// - After verification: removed from PledgeQueue, remains in RecentActivity, AuctionStatus totals update

import React, { PropsWithChildren, useEffect, useMemo, useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import PledgeQueue from '@/components/PledgeQueue';
import { RecentActivity } from '@/components/recent-activity';
import AuctionStatus from '@/components/AuctionStatus';
import { WebSocketContext } from '@/contexts/WebSocketContext';
import type { AuctionActivity, AuctionState } from '@shared/types/auction';

type Handler = (payload: any) => void;
class MockSocket {
    private handlers: Record<string, Handler[]> = {};
    on(event: string, cb: Handler) {
        this.handlers[event] = this.handlers[event] || [];
        this.handlers[event].push(cb);
    }
    off(event: string) {
        delete this.handlers[event];
    }
    emit(event: string, payload: any) {
        (this.handlers[event] || []).forEach((cb) => cb(payload));
    }
    disconnect() { }
    close() { }
}

function MockWsProvider({ children, initialState }: PropsWithChildren<{ initialState: AuctionState }>) {
    const [state, setState] = useState<AuctionState | null>(initialState);
    const socket = useMemo(() => new MockSocket() as any, []);

    // keep internal state in sync with prop changes
    useEffect(() => {
        setState(initialState);
    }, [initialState]);

    // expose socket for tests to emit events
    (globalThis as any).__mockSocket = socket;
    // expose state setter for tests to update AuctionStatus values
    (globalThis as any).__setAuctionState = setState;

    const ctx = useMemo(() => ({
        isConnected: true,
        isAuthenticated: true,
        sendMessage: jest.fn(),
        auctionState: state,
        connect: jest.fn(),
        disconnect: jest.fn(),
        error: null as string | null,
        socket: socket as any,
        // test-only helper
        __setState: setState,
    }), [state, socket]);

    return (
        <WebSocketContext.Provider value={ctx as any}>
            {children}
        </WebSocketContext.Provider>
    );
}

const btc = (sats: number) => (sats / 1e8);

describe('Frontend pledge lifecycle UI', () => {
    const auctionId = 'a1';
    const satsAmount = 100_000; // 0.001 BTC
    const walletAddr = 'bc1ptestxxxxxyyyyyzzzz';

    const makeAuctionState = (totalRaisedBtc: number): AuctionState => ({
        id: auctionId,
        config: { totalTokens: '100000000', ceilingMarketCapUSD: '15000000', minPledgeBTC: '0.0001', maxPledgeBTC: '1' },
        totalRaised: totalRaisedBtc,
        refundedBTC: 0,
        currentMarketCap: totalRaisedBtc * 100_000, // arbitrary mapping for test
        ceilingMarketCap: 15_000_000,
        ceilingReached: false,
        progressPercentage: 0,
        currentPrice: 0,
        priceError: false,
        isActive: true,
        isCompleted: false,
        minPledge: 0.0001,
        maxPledge: 1,
        timeRemaining: { hours: 10, minutes: 0, seconds: 0 },
        recentActivity: [],
    });

    beforeEach(() => {
        jest.useFakeTimers();
        jest.spyOn(global, 'fetch' as any);
        (global.fetch as jest.Mock).mockReset();
    });
    afterEach(() => {
        jest.useRealTimers();
    });

    it('shows pledge in queue and activity after creation; after verification it leaves queue, stays in activity, and totals update', async () => {
        // First fetch: pending pledge
        (global.fetch as jest.Mock).mockResolvedValueOnce(new Response(JSON.stringify([
            {
                id: 'p1',
                userId: 'u1',
                satsAmount,
                queuePosition: 1,
                verified: false,
                status: 'pending',
                user: { cardinal_address: walletAddr, ordinal_address: null },
                timestamp: new Date().toISOString(),
            }
        ]), { status: 200, headers: { 'Content-Type': 'application/json' } } as any));

        const initialState = makeAuctionState(0);

        // Prepare activity list (stays even after verification)
        const activities: AuctionActivity[] = [
            {
                id: 'p1',
                walletAddress: walletAddr,
                cardinal_address: walletAddr,
                ordinal_address: null,
                btcAmount: String(btc(satsAmount)),
                estimatedTokens: '0',
                timestamp: new Date().toISOString(),
                refundedAmount: undefined,
                isRefunded: false,
            }
        ];

        const { rerender } = render(
            <MockWsProvider initialState={initialState}>
                <div>
                    <AuctionStatus />
                    <PledgeQueue auctionId={auctionId} />
                    <RecentActivity activities={activities} isConnected={true} />
                </div>
            </MockWsProvider>
        );

        // The pledge should appear in the queue (amount and status In Queue)
        const queueSection = screen.getByRole('heading', { name: /Pledge Queue/i }).closest('div') as HTMLElement;
        await waitFor(() => expect(within(queueSection).getByText(/0\.001 BTC/i)).toBeInTheDocument());
        expect(within(queueSection).getByText(/In Queue/i)).toBeInTheDocument();

        // AuctionStatus should initially show 0 BTC pledged
        const totalLabel1 = screen.getByText(/Total BTC Pledged/i);
        const totalValue1 = totalLabel1.nextElementSibling as HTMLElement | null;
        expect(totalValue1).not.toBeNull();
        expect(totalValue1!).toHaveTextContent(/0\.00000000 BTC/);

        // After verification: next fetch returns pledge as processed (verified)
        ; (global.fetch as jest.Mock).mockResolvedValueOnce(new Response(JSON.stringify([
            {
                id: 'p1',
                userId: 'u1',
                satsAmount,
                queuePosition: 1,
                verified: true,
                confirmations: 2,
                status: 'verified',
                user: { cardinal_address: walletAddr, ordinal_address: null },
                timestamp: new Date().toISOString(),
            }
        ]), { status: 200, headers: { 'Content-Type': 'application/json' } } as any));
        // Any further fetches should also return processed
        (global.fetch as jest.Mock).mockResolvedValue(new Response(JSON.stringify([
            {
                id: 'p1',
                userId: 'u1',
                satsAmount,
                queuePosition: 1,
                verified: true,
                confirmations: 2,
                status: 'verified',
                user: { cardinal_address: walletAddr, ordinal_address: null },
                timestamp: new Date().toISOString(),
            }
        ]), { status: 200, headers: { 'Content-Type': 'application/json' } } as any));

        // Update Auction totals in context (simulate auction_status after verification)
        // Find provider via document? We exposed nothing; instead re-render with new provider would reset components.
        // Workaround: trigger state update by dispatch event through context value via global leak:
        // Simpler: Directly change DOM expectations after re-render with new totals.

        // Update provider state with new totals (simulate auction_status update)
        const updatedState = makeAuctionState(btc(satsAmount));
        const setAuctionState = (globalThis as any).__setAuctionState as (s: AuctionState) => void;
        if (typeof setAuctionState === 'function') setAuctionState(updatedState);

        // Trigger a processed event to cause the component to debounce-refetch
        const mockSocket = (globalThis as any).__mockSocket;
        if (mockSocket && typeof mockSocket.emit === 'function') {
            mockSocket.emit('pledge:processed', { auctionId });
        }
        // Queue should refetch (debounced by 300ms) and now hide processed pledge
        jest.advanceTimersByTime(600);
        await waitFor(() => {
            const newQueueSection = screen.getByRole('heading', { name: /Pledge Queue/i }).closest('div') as HTMLElement;
            expect(within(newQueueSection).getByText(/No pledges in the queue yet/i)).toBeInTheDocument();
        });

        // Recent activity still shows the entry
        expect(screen.getByTestId('activity-btc-p1')).toBeInTheDocument();

        // AuctionStatus should reflect updated totals
        await waitFor(() => {
            const totalLabel2 = screen.getByText(/Total BTC Pledged/i);
            const totalValue2 = totalLabel2.nextElementSibling as HTMLElement | null;
            expect(totalValue2).not.toBeNull();
            expect(totalValue2!).toHaveTextContent(/0\.00100000 BTC/);
        });
    });
});
