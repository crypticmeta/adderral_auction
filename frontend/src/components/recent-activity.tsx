// Recent activity component showing latest auction pledges
import { AuctionActivity } from '@/types/auction';

interface RecentActivityProps {
    activities: AuctionActivity[];
    isConnected: boolean;
}

export function RecentActivity({ activities = [], isConnected = false }: RecentActivityProps) {
    const formatAddress = (address: string | null | undefined) => {
        if (!address) return 'Unknown';
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
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
                {!activities || activities.length === 0 ? (
                    <div className="text-center py-8">
                        <p className="text-gray-400">No recent activity</p>
                    </div>
                ) : (
                    activities.map((activity) => {
                        return activity ? (
                            <div
                                key={activity.id}
                                className="flex items-center justify-between p-4 bg-dark-800/50 rounded-xl border border-gray-700"
                                data-testid={`activity-${activity.id}`}
                            >
                                <div className="flex items-center space-x-3">
                                    <div className="w-8 h-8 bg-gradient-to-r from-acorn-500 to-acorn-600 rounded-full p-1.5">
                                        <img src="/acorn.png" alt="Activity" className="w-full h-full object-contain" />
                                    </div>
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
                                        {activity?.btcAmount ? parseFloat(activity.btcAmount).toFixed(3) : '0.000'} BTC
                                        {activity?.refundedAmount && parseFloat(activity.refundedAmount) > 0 && (
                                            <span className="text-amber-400 ml-1 text-xs">
                                                ({parseFloat(activity.refundedAmount).toFixed(3)} refunded)
                                            </span>
                                        )}
                                    </p>
                                    <p className="text-sm text-gray-400" data-testid={`activity-tokens-${activity.id}`}>
                                        ~{activity?.estimatedTokens ? parseInt(activity.estimatedTokens).toLocaleString() : '0'} ACORN
                                        {activity?.isRefunded && (
                                            <span className="ml-1 text-xs text-amber-400">(refunded)</span>
                                        )}
                                    </p>
                                </div>
                            </div>
                        ) : null;
                    })
                )}
            </div>
        </div>
    );
}
