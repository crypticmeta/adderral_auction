// Auction progress component showing time remaining and progress bar
import { CountdownTimer } from './countdown-timer';

interface AuctionProgressProps {
    timeRemaining: {
        hours: number;
        minutes: number;
        seconds: number;
    };
    totalRaised: number;
    refundedBTC?: number;
    currentMarketCap: number;
    ceilingMarketCap: number;
    ceilingReached?: boolean;
    progressPercentage: number;
    currentPrice: number;
}

export function AuctionProgress({
    timeRemaining,
    totalRaised,
    refundedBTC = 0,
    currentMarketCap,
    ceilingMarketCap,
    ceilingReached = false,
    progressPercentage,
    currentPrice
}: AuctionProgressProps) {
    return (
        <div className="glass-card p-8 rounded-3xl">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold">Auction Progress</h3>
                <div className="w-8 h-8 bg-gradient-to-r from-acorn-500 to-acorn-600 rounded-full p-1.5">
                    <img src="/acorn.png" alt="Progress" className="w-full h-full object-contain" />
                </div>
            </div>

            {/* Countdown Timer */}
            <div className="mb-8">
                <p className="text-gray-400 mb-4">Time Remaining</p>
                <CountdownTimer timeRemaining={timeRemaining} />
            </div>

            {/* Progress Bar */}
            <div className="mb-6">
                <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-400">Market Cap Progress</span>
                    <span className="text-acorn-400 font-semibold" data-testid="text-market-cap-amount">
                        ${currentMarketCap != null ? (currentMarketCap / 1000000).toFixed(2) : '0.00'}M / ${(ceilingMarketCap / 1000000).toFixed(2)}M
                    </span>
                </div>
                <div className="w-full bg-dark-800 rounded-full h-4 overflow-hidden">
                    <div
                        className={`h-full bg-gradient-to-r ${ceilingReached ? 'from-amber-500 to-amber-600' : 'from-acorn-500 to-acorn-600'} progress-glow transition-all duration-500 ease-out`}
                        style={{ width: `${progressPercentage}%` }}
                        data-testid="progress-bar"
                    />
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-2">
                    <span>$0</span>
                    <span data-testid="text-progress-percentage">
                        {progressPercentage != null ? progressPercentage.toFixed(1) : '0.0'}% Complete
                        {ceilingReached && <span className="text-amber-400 ml-1">(Ceiling Reached)</span>}
                    </span>
                    <span>${(ceilingMarketCap / 1000000).toFixed(2)}M</span>
                </div>
                
                <div className="flex justify-between text-sm mt-4 mb-2">
                    <span className="text-gray-400">BTC Raised</span>
                    <span className="text-acorn-400 font-semibold" data-testid="text-raised-amount">
                        {totalRaised != null ? totalRaised.toFixed(3) : '0.000'} BTC
                        {refundedBTC > 0 && (
                            <span className="text-amber-400 text-xs ml-2">({refundedBTC.toFixed(3)} BTC refunded)</span>
                        )}
                    </span>
                </div>
            </div>

            {/* Current Price */}
            <div className="bg-gradient-to-r from-acorn-500/10 to-acorn-600/10 border border-acorn-500/30 p-4 rounded-xl">
                <p className="text-gray-400 text-sm mb-1">Current Token Price</p>
                <p className="text-2xl font-bold text-acorn-400" data-testid="text-current-price">
                    ${currentPrice != null ? currentPrice.toFixed(6) : '0.000000'} ACORN
                </p>
            </div>
        </div>
    );
}
