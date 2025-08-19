// Countdown timer component for the auction
import { useEffect, useState } from 'react';

interface CountdownTimerProps {
    timeRemaining: {
        hours: number;
        minutes: number;
        seconds: number;
    };
}

export function CountdownTimer({ timeRemaining }: CountdownTimerProps) {
    const [time, setTime] = useState(timeRemaining || { hours: 0, minutes: 0, seconds: 0 });

    useEffect(() => {
        if (timeRemaining) {
            setTime(timeRemaining);
        }
    }, [timeRemaining]);

    return (
        <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-gradient-to-b from-dark-800 to-dark-900 p-4 rounded-xl border border-acorn-500/30">
                <div
                    className="text-3xl font-bold number-glow"
                    data-testid="countdown-hours"
                >
                    {(time?.hours ?? 0).toString().padStart(2, '0')}
                </div>
                <div className="text-sm text-gray-400">Hours</div>
            </div>
            <div className="bg-gradient-to-b from-dark-800 to-dark-900 p-4 rounded-xl border border-acorn-500/30">
                <div
                    className="text-3xl font-bold number-glow"
                    data-testid="countdown-minutes"
                >
                    {(time?.minutes ?? 0).toString().padStart(2, '0')}
                </div>
                <div className="text-sm text-gray-400">Minutes</div>
            </div>
            <div className="bg-gradient-to-b from-dark-800 to-dark-900 p-4 rounded-xl border border-acorn-500/30">
                <div
                    className="text-3xl font-bold number-glow"
                    data-testid="countdown-seconds"
                >
                    {(time?.seconds ?? 0).toString().padStart(2, '0')}
                </div>
                <div className="text-sm text-gray-400">Seconds</div>
            </div>
        </div>
    );
}
