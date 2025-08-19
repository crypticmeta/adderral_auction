// Auction stats component showing key auction metrics, with a highlight on total raised
interface AuctionStatsProps {
    totalTokens: string;
    ceilingMarketCap: string; // in millions string, e.g., "15"
    currentMarketCap?: string; // in millions string, e.g., "4.25"
    duration: string; // in hours
    totalRaisedBTC?: number; // highlight value
}

export function AuctionStats({ totalTokens, ceilingMarketCap, currentMarketCap, duration, totalRaisedBTC }: AuctionStatsProps) {
    // Null-safe computations
    const ceilM = Number(ceilingMarketCap ?? '0');
    const currM = Number(currentMarketCap ?? '0');
    const pct = ceilM > 0 ? Math.min(100, Math.max(0, (currM / ceilM) * 100)) : 0;

    return (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-12">
            {/* Raised so far */}
            <div className="glass-card p-6 pb-7 rounded-2xl text-center transform hover:scale-105 transition-all duration-300 border border-acorn-500/30 relative z-10 min-h-[180px]">
                <div className="w-12 h-12 mx-auto mb-4  bg-orange-500 rounded-full flex items-center justify-center">
                    <span className="text-xl font-bold">₿</span>
                </div>
                <div className="space-y-1 leading-tight">
                    <div className="text-2xl font-extrabold text-orange-500">
                        {typeof totalRaisedBTC === 'number' && !Number.isNaN(totalRaisedBTC) ? totalRaisedBTC.toFixed(3) : '0.000'} BTC
                    </div>
                    <div className="text-lg font-semibold text-gray-200">
                        ${currM.toFixed(2)}M
                    </div>
                </div>
                <div className="mt-2 inline-flex items-center px-2 py-1 rounded-full text-xs bg-acorn-500/10 border border-acorn-500/30">
                    <span className="h-2 w-2 rounded-full bg-acorn-500 mr-1.5 animate-pulse" />
                    <span>{pct.toFixed(1)}% of ceiling</span>
                </div>
                <p className="text-gray-400 mt-2">Raised so far</p>
            </div>

            {/* Total Tokens */}
            <div className="glass-card p-6 rounded-2xl text-center transform hover:scale-105 transition-all duration-300">
                <div className="w-12 h-12 mx-auto mb-4 rounded-full overflow-hidden">
                    <img src="/acorn.png" alt="Tokens" className="w-full h-full object-contain" />
                </div>
                <h3 className="text-2xl font-bold number-glow" data-testid="text-total-tokens">
                    {totalTokens ?? '0'}M
                </h3>
                <p className="text-gray-400">Total Tokens</p>
            </div>

            {/* Ceiling */}
            <div className="glass-card p-6 rounded-2xl text-center transform hover:scale-105 transition-all duration-300">
                <div className="w-12 h-12 mx-auto mb-4 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full flex items-center justify-center">
                    <span className="text-xl font-bold">$</span>
                </div>
                <h3 className="text-2xl font-bold text-cyan-400" data-testid="text-ceiling-cap">
                    ${ceilingMarketCap ?? '0'}M
                </h3>
                <p className="text-gray-400">Ceiling Market Cap</p>
            </div>

            {/* Current Market Cap */}
            <div className="glass-card p-6 rounded-2xl text-center transform hover:scale-105 transition-all duration-300">
                <div className="w-12 h-12 mx-auto mb-4 bg-gradient-to-r from-green-500 to-emerald-600 rounded-full flex items-center justify-center">
                    <span className="text-xl font-bold">$</span>
                </div>
                <h3 className="text-2xl font-bold text-green-400" data-testid="text-market-cap">
                    ${currentMarketCap ?? '0'}M
                </h3>
                <p className="text-gray-400">Current Market Cap</p>
            </div>

            {/* Duration */}
            <div className="glass-card p-6 rounded-2xl text-center transform hover:scale-105 transition-all duration-300">
                <div className="w-12 h-12 mx-auto mb-4 bg-gradient-to-r from-purple-500 to-pink-600 rounded-full flex items-center justify-center">
                    <span className="text-xl font-bold">⏱</span>
                </div>
                <h3 className="text-2xl font-bold text-purple-400" data-testid="text-duration">
                    {duration ?? '0'}h
                </h3>
                <p className="text-gray-400">Max Duration</p>
            </div>
        </div>
    );
}
