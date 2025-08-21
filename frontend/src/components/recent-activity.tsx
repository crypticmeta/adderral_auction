// Component: RecentActivity
// Shows latest pledges with random avatars (DiceBear), truncated usernames,
// and estimated ADDERRELS allocations computed from current auction totals.
// Simplified: derives display from activities only (pledges-based), no queue merging.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AuctionActivity } from '@shared/types/auction';
import { useWebSocket } from '../contexts/WebSocketContext';

interface RecentActivityProps {
    activities: AuctionActivity[];
    isConnected: boolean;
}

export function RecentActivity({ activities = [], isConnected = false }: RecentActivityProps) {
    const { auctionState } = useWebSocket();
    // auctionState is used for estimating allocations; no external queue fetching


    const formatAddress = (address: string | null | undefined) => {
        if (!address) return 'Unknown';
        // Only truncate if it looks like a BTC address; otherwise, show as-is (e.g., "user-1")
        if (isLikelyBtcAddress(address)) {
            return `${address.slice(0, 6)}...${address.slice(-4)}`;
        }
        return address;
    };

    // Basic heuristic to detect BTC-like addresses (bech32 or legacy)
    const isLikelyBtcAddress = (s: unknown): s is string => {
        if (typeof s !== 'string') return false;
        const trimmed = s.trim();
        if (!trimmed) return false;
        // bech32 mainnet/testnet (bc1..., tb1...)
        if (/^(bc1|tb1)[0-9a-z]{20,}$/i.test(trimmed)) return true;
        // legacy P2PKH/P2SH (1... or 3... on mainnet)
        if (/^[13][a-km-zA-HJ-NP-Z1-9]{20,}$/i.test(trimmed)) return true;
        return false;
    };

    const avatarFor = (address: string | null | undefined) => {
        const seed = address || 'guest';
        return `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${encodeURIComponent(seed)}`;
    };

    const formatNumber = (n: number | string | null | undefined, maxFrac = 6) => {
        if (n == null) return '—';
        const num = typeof n === 'string' ? Number(n) : n;
        if (!isFinite(Number(num))) return '—';
        return Number(num).toLocaleString(undefined, { maximumFractionDigits: maxFrac });
    };

    const estimateAllocation = (btcAmountStr: string | null | undefined): number | null => {
        if (!btcAmountStr) return null;
        const pledgeBTC = Number(btcAmountStr);
        if (!(pledgeBTC > 0)) return null;
        const totalTokensStr = auctionState?.config?.totalTokens;
        const totalRaisedBTC = auctionState?.totalRaised;
        if (!totalTokensStr || typeof totalRaisedBTC !== 'number' || !(totalRaisedBTC > 0)) return null;
        const totalTokens = Number(totalTokensStr);
        if (!(totalTokens > 0)) return null;
        return (totalTokens / totalRaisedBTC) * pledgeBTC;
    };

    const formatTimeAgo = (timestamp: string | Date | null | undefined) => {
        if (!timestamp) return 'Unknown time';
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMinutes = Math.floor(diffMs / 60000);

        if (diffMinutes < 1) return 'Just now';
        if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;

        const diffHours = Math.floor(diffMinutes / 60);
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;

        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    };

    const merged = useMemo(() => {
        const fromProps = (activities || []).map((a: any) => {
            const cardinal = a?.cardinal_address ?? null;
            const walletAddr = isLikelyBtcAddress(a?.walletAddress) ? a.walletAddress : null;
            return {
                ...a,
                displayAddress: cardinal ?? walletAddr,
            };
        });
        fromProps.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        return fromProps.slice(0, 10);
    }, [activities]);

    // Track new items to animate slide-in
    const [animateIds, setAnimateIds] = useState<Set<string>>(new Set());
    const prevIdsRef = useRef<Set<string>>(new Set());
    useEffect(() => {
        const currentIds = new Set<string>((merged || []).map((m: any) => String(m.id)));
        const prevIds = prevIdsRef.current || new Set<string>();
        const newlyAdded: string[] = [];
        currentIds.forEach((id) => {
            if (!prevIds.has(id)) newlyAdded.push(id);
        });
        if (newlyAdded.length > 0) {
            setAnimateIds((prev) => {
                const next = new Set(prev);
                newlyAdded.forEach((id) => next.add(id));
                return next;
            });
            // Remove animation flag after transition
            const timeout = setTimeout(() => {
                setAnimateIds((prev) => {
                    const next = new Set(prev);
                    newlyAdded.forEach((id) => next.delete(id));
                    return next;
                });
            }, 450);
            return () => clearTimeout(timeout);
        }
        // update prev ids snapshot
        prevIdsRef.current = currentIds;
    }, [merged]);

    const txStatusBadge = (item: any) => {
        if (item?.isRefunded) {
            return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800">Refunded</span>;
        }
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-800">Confirmed</span>;
    };

    return (
        <div className="glass-card p-8 rounded-3xl">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold">Recent Activity</h3>
                <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 ${isConnected ? 'bg-green-400' : 'bg-red-400'} rounded-full ${isConnected ? 'animate-pulse' : ''}`} />
                    <span className="text-sm text-gray-400" data-testid="text-connection-status">
                        {isConnected ? 'Live' : 'Disconnected'}
                    </span>
                </div>
            </div>

            <div className="space-y-4" data-testid="activity-list">
                {!merged || merged.length === 0 ? (
                    <div className="text-center py-8">
                        <p className="text-gray-400">No recent activity</p>
                    </div>
                ) : (
                    merged.map((activity: any) => {
                        const isNew = animateIds.has(String(activity.id));
                        return activity ? (
                            <div
                                key={activity.id}
                                className="flex items-center justify-between p-4 bg-dark-800/50 rounded-xl border border-gray-700"
                                style={{
                                    transition: 'opacity 350ms ease-out, transform 350ms ease-out, background-color 800ms',
                                    opacity: isNew ? 0 : 1,
                                    transform: isNew ? 'translateY(8px)' : 'translateY(0)'
                                }}
                                data-testid={`activity-${activity.id}`}
                            >
                                <div className="flex items-center space-x-3">
                                    {(() => {
                                        const labelAddress = activity?.displayAddress ?? (isLikelyBtcAddress(activity?.walletAddress) ? activity.walletAddress : activity?.walletAddress ?? null);
                                        return (
                                            <>
                                                <img
                                                    src={avatarFor(labelAddress)}
                                                    alt="avatar"
                                                    className="w-8 h-8 rounded-full bg-dark-900/50 border border-white/10"
                                                />
                                                <div>
                                                    <p className="font-semibold" data-testid={`activity-address-${activity.id}`}>
                                                        {formatAddress(labelAddress)}
                                                    </p>
                                                    <p className="text-sm text-gray-400" data-testid={`activity-time-${activity.id}`}>
                                                        {formatTimeAgo(activity?.timestamp)}
                                                    </p>
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>
                                <div className="text-right">
                                    <p className="font-semibold text-cyan-400" data-testid={`activity-btc-${activity.id}`}>
                                        {formatNumber(activity?.btcAmount, 3)} BTC
                                        {activity?.refundedAmount && parseFloat(activity.refundedAmount) > 0 && (
                                            <span className="text-amber-400 ml-1 text-xs">
                                                ({parseFloat(activity.refundedAmount).toFixed(3)} refunded)
                                            </span>
                                        )}
                                    </p>
                                    <p className="text-sm text-gray-400" data-testid={`activity-tokens-${activity.id}`}>
                                        ~{(() => {
                                            const est = estimateAllocation(activity?.btcAmount);
                                            if (est == null) {
                                                // fallback to payload if provided
                                                return activity?.estimatedTokens ? Number(activity.estimatedTokens).toLocaleString() : '0';
                                            }
                                            return Number(est).toLocaleString(undefined, { maximumFractionDigits: 2 });
                                        })()} ADDERRELS*
                                        {activity?.isRefunded && (
                                            <span className="ml-1 text-xs text-amber-400">(refunded)</span>
                                        )}
                                    </p>
                                    <div className="mt-1">
                                        {txStatusBadge(activity)}
                                    </div>
                                </div>
                            </div>
                        ) : null;
                    })
                )}
            </div>
            <p className="mt-3 text-xs text-gray-500">* Estimated; final allocation may vary.</p>
        </div>
    );
}
