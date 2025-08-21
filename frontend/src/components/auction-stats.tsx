// Auction stats component showing key auction metrics (Raised card removed as progress is visible elsewhere)
import { formatNumberCompact, formatUSDCompact } from '@/lib/format';
interface AuctionStatsProps {
    // totalTokens is passed in as a string representing millions (e.g., "100" for 100M, "0.01" for 10K)
    totalTokens: string;
    // ceiling market cap is in USD (string or number)
    ceilingMarketCap: string | number;
    // current market cap is in USD (string or number)
    currentMarketCap?: string | number;
    // duration label string (e.g., "72h" or "12h 30m")
    duration: string;
}

export function AuctionStats({ totalTokens, ceilingMarketCap, currentMarketCap, duration }: AuctionStatsProps) {
    // Null-safe parsing
    const totalTokensM = Number(totalTokens ?? '0');
    const totalTokensRaw = Number.isFinite(totalTokensM) ? Math.max(0, totalTokensM * 1_000_000) : 0;
    const totalTokensLabel = formatNumberCompact(totalTokensRaw);

    const ceilingUsdRaw = typeof ceilingMarketCap === 'number' ? ceilingMarketCap : Number(ceilingMarketCap ?? '0');
    const ceilingUsd = Number.isFinite(ceilingUsdRaw) ? Math.max(0, ceilingUsdRaw) : 0;
    const currentUsdRaw = typeof currentMarketCap === 'number' ? currentMarketCap : Number(currentMarketCap ?? '0');
    const currentUsd = Number.isFinite(currentUsdRaw) ? Math.max(0, currentUsdRaw) : 0;

    const ceilingLabel = formatUSDCompact(ceilingUsd);
    const currentLabel = formatUSDCompact(currentUsd);

    const durationLabel = `${duration ?? ''}`;

    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
            {/* Total Tokens */}
            <div className="glass-card p-6 rounded-2xl text-center transform hover:scale-105 transition-all duration-300">
                <div className="w-12 h-12 mx-auto mb-4 rounded-full overflow-hidden">
                    <img src="/adderrel.png" alt="Tokens" className="w-full h-full object-contain" />
                </div>
                <h3 className="text-2xl font-bold number-glow" data-testid="text-total-tokens">
                    {totalTokensLabel}
                </h3>
                <p className="text-gray-400">Total Tokens</p>
            </div>

            {/* Ceiling */}
            <div className="glass-card p-6 rounded-2xl text-center transform hover:scale-105 transition-all duration-300">
                <div className="w-12 h-12 mx-auto mb-4 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full flex items-center justify-center">
                    <span className="text-xl font-bold">$</span>
                </div>
                <h3 className="text-2xl font-bold text-cyan-400" data-testid="text-ceiling-cap">
                    {ceilingLabel}
                </h3>
                <p className="text-gray-400">Ceiling Market Cap</p>
            </div>

            {/* Current Market Cap */}
            <div className="glass-card p-6 rounded-2xl text-center transform hover:scale-105 transition-all duration-300">
                <div className="w-12 h-12 mx-auto mb-4 bg-gradient-to-r from-green-500 to-emerald-600 rounded-full flex items-center justify-center">
                    <span className="text-xl font-bold">$</span>
                </div>
                <h3 className="text-2xl font-bold text-green-400" data-testid="text-market-cap">
                    {currentLabel}
                </h3>
                <p className="text-gray-400">Current Market Cap</p>
            </div>

            {/* Max Duration */}
            <div className="glass-card p-6 rounded-2xl text-center transform hover:scale-105 transition-all duration-300">
                <div className="w-12 h-12 mx-auto mb-4 bg-gradient-to-r from-purple-500 to-pink-600 rounded-full flex items-center justify-center">
                    <span className="text-xl font-bold">⏱</span>
                </div>
                <h3 className="text-2xl font-bold text-purple-400" data-testid="text-duration">
                    {durationLabel}
                </h3>
                <p className="text-gray-400">Max Duration</p>
            </div>
        </div>
    );
}
