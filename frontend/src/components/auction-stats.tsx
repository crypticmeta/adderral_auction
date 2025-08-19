// Auction stats component showing key auction metrics
interface AuctionStatsProps {
    totalTokens: string;
    ceilingMarketCap: string;
    currentMarketCap?: string;
    duration: string;
}

export function AuctionStats({ totalTokens, ceilingMarketCap, currentMarketCap, duration }: AuctionStatsProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
            <div className="glass-card p-6 rounded-2xl text-center transform hover:scale-105 transition-all duration-300">
                <div className="w-12 h-12 mx-auto mb-4 bg-gradient-to-r from-acorn-500 to-acorn-600 rounded-full p-2">
                    <img src="/acorn.png" alt="Tokens" className="w-full h-full object-contain" />
                </div>
                <h3 className="text-2xl font-bold number-glow" data-testid="text-total-tokens">
                    {totalTokens ?? '0'}M
                </h3>
                <p className="text-gray-400">Total Tokens</p>
            </div>

            <div className="glass-card p-6 rounded-2xl text-center transform hover:scale-105 transition-all duration-300">
                <div className="w-12 h-12 mx-auto mb-4 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full flex items-center justify-center">
                    <span className="text-xl font-bold">$</span>
                </div>
                <h3 className="text-2xl font-bold text-cyan-400" data-testid="text-ceiling-cap">
                    ${ceilingMarketCap ?? '0'}M
                </h3>
                <p className="text-gray-400">Ceiling Market Cap</p>
            </div>

            <div className="glass-card p-6 rounded-2xl text-center transform hover:scale-105 transition-all duration-300">
                <div className="w-12 h-12 mx-auto mb-4 bg-gradient-to-r from-green-500 to-emerald-600 rounded-full flex items-center justify-center">
                    <span className="text-xl font-bold">$</span>
                </div>
                <h3 className="text-2xl font-bold text-green-400" data-testid="text-market-cap">
                    ${currentMarketCap ?? '0'}M
                </h3>
                <p className="text-gray-400">Current Market Cap</p>
            </div>

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
