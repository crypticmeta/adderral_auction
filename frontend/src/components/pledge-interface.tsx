// Pledge interface component for users to make BTC pledges
import { useState } from 'react';

interface PledgeInterfaceProps {
    minPledge: number;
    maxPledge: number;
    currentPrice: number;
    isWalletConnected: boolean;
    walletAddress: string;
}

export function PledgeInterface({
    minPledge,
    maxPledge,
    currentPrice,
    isWalletConnected,
    walletAddress
}: PledgeInterfaceProps) {
    const [pledgeAmount, setPledgeAmount] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const estimatedTokens = pledgeAmount && currentPrice ? Math.floor(parseFloat(pledgeAmount) / currentPrice) : 0;

    const handlePledge = async () => {
        if (!isWalletConnected || !walletAddress) {
            alert("Please connect your wallet to make a pledge");
            return;
        }

        const amount = pledgeAmount ? parseFloat(pledgeAmount) : 0;
        if (isNaN(amount) || amount < (minPledge ?? 0) || amount > (maxPledge ?? Infinity)) {
            alert(`Pledge amount must be between ${minPledge ?? 0} and ${maxPledge ?? 'max'} BTC`);
            return;
        }

        try {
            setIsSubmitting(true);
            
            // Send pledge via WebSocket if available, otherwise fallback to fetch
            const wsConnected = (window as any).wsConnected;
            const wsSocket = (window as any).wsSocket;
            
            if (wsConnected && wsSocket) {
                wsSocket.send(JSON.stringify({
                    type: 'pledge',
                    data: {
                        walletAddress,
                        btcAmount: pledgeAmount
                    }
                }));
                alert("Your pledge has been submitted successfully");
                setPledgeAmount('');
            } else {
                // Fallback to fetch API
                const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/auction/pledge`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        walletAddress,
                        btcAmount: pledgeAmount
                    })
                });
                
                if (response.ok) {
                    alert("Your pledge has been submitted successfully");
                    setPledgeAmount('');
                } else {
                    throw new Error('Failed to submit pledge');
                }
            }
        } catch (error) {
            alert("There was an error processing your pledge");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="glass-card p-8 rounded-3xl">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold">Make Your Pledge</h3>
                <div className="w-8 h-8 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full flex items-center justify-center">
                    <span className="text-sm font-bold">₿</span>
                </div>
            </div>

            {/* Pledge Limits */}
            <div className="bg-dark-800/50 p-4 rounded-xl mb-6 border border-gray-700">
                <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                        <p className="text-gray-400 text-sm">Minimum</p>
                        <p className="text-cyan-400 font-semibold" data-testid="text-min-pledge">
                            {minPledge ?? 0} BTC
                        </p>
                    </div>
                    <div>
                        <p className="text-gray-400 text-sm">Maximum</p>
                        <p className="text-cyan-400 font-semibold" data-testid="text-max-pledge">
                            {maxPledge ?? 'max'} BTC
                        </p>
                    </div>
                </div>
            </div>

            {/* Pledge Input */}
            <div className="mb-6">
                <label className="block text-gray-400 text-sm mb-2">BTC Amount</label>
                <div className="relative">
                    <input
                        type="number"
                        placeholder="0.000"
                        min={String(minPledge ?? 0)}
                        max={String(maxPledge ?? 100)}
                        step="0.001"
                        value={pledgeAmount}
                        onChange={(e) => setPledgeAmount(e.target.value)}
                        data-testid="input-pledge-amount"
                        className="w-full bg-dark-800 border border-gray-600 focus:border-acorn-500 rounded-xl px-4 py-4 pr-16 text-xl font-semibold focus:outline-none focus:ring-2 focus:ring-acorn-500/50 transition-all duration-300"
                    />
                    <span className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 font-semibold">
                        BTC
                    </span>
                </div>
            </div>

            {/* Token Estimation */}
            {pledgeAmount && (
                <div className="bg-gradient-to-r from-acorn-500/10 to-acorn-600/10 border border-acorn-500/30 p-4 rounded-xl mb-6">
                    <p className="text-gray-400 text-sm mb-1">Estimated ACORN Tokens</p>
                    <div className="flex items-center space-x-2">
                        <div className="w-6 h-6">
                            <img src="/acorn.png" alt="ACORN" className="w-full h-full object-contain" />
                        </div>
                        <p className="text-xl font-bold text-acorn-400" data-testid="text-estimated-tokens">
                            ~{estimatedTokens.toLocaleString()} ACORN
                        </p>
                    </div>
                </div>
            )}

            {/* Pledge Button */}
            <button
                onClick={handlePledge}
                disabled={!isWalletConnected || isSubmitting || !pledgeAmount}
                data-testid="button-pledge"
                className="w-full bg-gradient-to-r from-acorn-500 to-acorn-600 hover:from-acorn-600 hover:to-acorn-700 py-4 rounded-xl font-bold text-lg transition-all duration-300 transform hover:scale-105 animate-glow flex items-center justify-center space-x-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isSubmitting ? (
                    <span>Processing...</span>
                ) : (
                    <>
                        <div className="w-6 h-6">
                            <img src="/acorn.png" alt="Pledge" className="w-full h-full object-contain" />
                        </div>
                        <span>Pledge BTC</span>
                    </>
                )}
            </button>

            {/* Payment Instructions */}
            <div className="mt-4 text-center">
                <p className="text-sm text-gray-400">
                    {isWalletConnected
                        ? "Enter your BTC amount to participate in the auction"
                        : "Connect your wallet to participate in the auction"
                    }
                </p>
            </div>
        </div>
    );
}
