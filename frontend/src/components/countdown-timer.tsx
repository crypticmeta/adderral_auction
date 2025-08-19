// Countdown timer component for the auction
// Ticks locally but synchronizes to server time using endTimeMs and serverTimeMs
import { useEffect, useMemo, useRef, useState } from 'react';

interface CountdownTimerProps {
    timeRemaining: {
        hours: number;
        minutes: number;
        seconds: number;
    };
    // Optional synchronized timing inputs from server (ms since epoch)
    endTimeMs?: number;
    serverTimeMs?: number;
}

export function CountdownTimer({ timeRemaining, endTimeMs, serverTimeMs }: CountdownTimerProps) {
    const [time, setTime] = useState(timeRemaining || { hours: 0, minutes: 0, seconds: 0 });
    const startWallClock = useRef<number | null>(null);

    // Helper to compute h/m/s from ms
    const toHMS = (ms: number) => {
        const clamped = Math.max(0, Math.floor(ms / 1000));
        const hours = Math.floor(clamped / 3600);
        const minutes = Math.floor((clamped % 3600) / 60);
        const seconds = clamped % 60;
        return { hours, minutes, seconds };
    };

    // Reset snapshot when props change
    useEffect(() => {
        if (timeRemaining) {
            setTime(timeRemaining);
        }
        startWallClock.current = null; // reset drift baseline when data updates
    }, [timeRemaining, endTimeMs, serverTimeMs]);

    const hasSync = useMemo(() => typeof endTimeMs === 'number' && typeof serverTimeMs === 'number', [endTimeMs, serverTimeMs]);

    // Ticking interval
    useEffect(() => {
        const interval = setInterval(() => {
            if (hasSync) {
                // Initialize baseline at first tick
                if (startWallClock.current == null) {
                    startWallClock.current = Date.now();
                }
                const elapsed = Date.now() - (startWallClock.current as number);
                const nowApprox = (serverTimeMs as number) + elapsed;
                const remaining = Math.max(0, (endTimeMs as number) - nowApprox);
                setTime(toHMS(remaining));
            } else if (time) {
                // Fallback: decrement the snapshot each second
                const ms = Math.max(0, (time.hours * 3600 + time.minutes * 60 + time.seconds - 1) * 1000);
                setTime(toHMS(ms));
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [hasSync, endTimeMs, serverTimeMs, time]);

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
