// Component: RecentActivity
// Shows latest pledges with random avatars (DiceBear), truncated usernames,
// and estimated ADDERRELS allocations computed from current auction totals.
// Now also merges items from the live pledge queue and shows a Tx Status badge.
import { useEffect, useMemo, useRef, useState } from 'react';
import { AuctionActivity } from '@/types/auction';
import { useWebSocket } from '../contexts/WebSocketContext';

interface RecentActivityProps {
    activities: AuctionActivity[];
    isConnected: boolean;
}

export function RecentActivity({ activities = [], isConnected = false }: RecentActivityProps) {
    const { auctionState, socket, isAuthenticated } = useWebSocket();
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
    const auctionId = auctionState?.id;

    type QueuePledge = {
        id: string;
        userId: string;
        btcAmount: number;
        timestamp: string | Date;
        processed: boolean;
        needsRefund: boolean;
        user?: { ordinal_address?: string | null; cardinal_address?: string | null };
    };

    const [queue, setQueue] = useState<QueuePledge[]>([]);

    useEffect(() => {
        let cancelled = false;
        const fetchQueue = async () => {
            if (!auctionId) return;
            try {
                const res = await fetch(`${apiUrl}/api/pledges/auction/${auctionId}`);
                if (!res.ok) throw new Error('Failed to fetch queue');
                const data = await res.json();
                if (!cancelled && Array.isArray(data)) setQueue(data);
            } catch (e) {
                // swallow for UI; recent activity still renders
            }
        };
        fetchQueue();
        // subscribe to pledge events for live updates
        if (socket && isAuthenticated) {
            const onRefetch = () => fetchQueue();
            socket.on('pledge:queue:update', onRefetch);
            socket.on('pledge_created', onRefetch);
            socket.on('pledge:processed', onRefetch);
        }
        return () => { cancelled = true; };
    }, [auctionId, apiUrl, socket, isAuthenticated]);

    const formatAddress = (address: string | null | undefined) => {
        if (!address) return 'Unknown';
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
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
        // Map queue pledges into activity-like items, preserving ability to compute status
        const mapQueue = queue.map((p) => {
            const wallet = p?.user?.ordinal_address || p?.user?.cardinal_address || p.userId;
            return {
                id: p.id,
                walletAddress: String(wallet ?? 'unknown'),
                btcAmount: String(p.btcAmount ?? '0'),
                estimatedTokens: undefined, // computed on the fly
                timestamp: String(p.timestamp ?? new Date().toISOString()),
                refundedAmount: undefined,
                isRefunded: p.needsRefund && p.processed ? true : false,
                __queueMeta: { processed: p.processed, needsRefund: p.needsRefund } as any,
            } as any;
        });

        const fromProps = (activities || []).map((a) => ({ ...a }));
        const combined = [...mapQueue, ...fromProps];
        combined.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        return combined.slice(0, 10);
    }, [queue, activities]);

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
        const meta = item?.__queueMeta as { processed?: boolean; needsRefund?: boolean } | undefined;
        if (meta) {
            if (meta.processed) {
                if (meta.needsRefund) {
                    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800">Refunded</span>;
                }
                return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-800">Processed</span>;
            }
            return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-800">In Queue</span>;
        }
        // Non-queue activity fallback
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
                                    <img
                                        src={avatarFor(activity?.walletAddress)}
                                        alt="avatar"
                                        className="w-8 h-8 rounded-full bg-dark-900/50 border border-white/10"
                                    />
                                    <div>
                                        <p className="font-semibold" data-testid={`activity-address-${activity.id}`}>
                                            {formatAddress(activity?.walletAddress)}
                                        </p>
                                        <p className="text-sm text-gray-400" data-testid={`activity-time-${activity.id}`}>
                                            {formatTimeAgo(activity?.timestamp)}
                                        </p>
                                    </div>
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
