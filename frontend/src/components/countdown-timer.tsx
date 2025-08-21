/**
 * CountdownTimer component
 * Purpose: Displays countdown for auction start or end.
 * Behavior: If serverTimeMs/startTimeMs indicate pre-start, counts down to start; otherwise to end.
 *           Shows Days when remaining >= 24h; otherwise Hours/Minutes/Seconds.
 *           Ticks locally and can synchronize to server time via target ms inputs.
 * Styling: Tailwind UI using the adderrels theme (border-adderrels-500/30 cards).
 * Null-safety: Falls back to safe defaults when props are missing or undefined.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

interface CountdownTimerProps {
    timeRemaining: {
        hours: number;
        minutes: number;
        seconds: number;
    };
    // Optional synchronized timing inputs from server (ms since epoch)
    startTimeMs?: number;
    endTimeMs?: number;
    serverTimeMs?: number;
}

export function CountdownTimer({ timeRemaining, startTimeMs, endTimeMs, serverTimeMs }: CountdownTimerProps) {
    const [time, setTime] = useState(timeRemaining || { hours: 0, minutes: 0, seconds: 0 });
    const startWallClock = useRef<number | null>(null);
    const [days, setDays] = useState(0);

    // Helper to compute h/m/s from ms
    const toDHMS = (ms: number) => {
        const clamped = Math.max(0, Math.floor(ms / 1000));
        const days = Math.floor(clamped / 86400);
        const hours = Math.floor((clamped % 86400) / 3600);
        const minutes = Math.floor((clamped % 3600) / 60);
        const seconds = clamped % 60;
        return { days, hours, minutes, seconds };
    };

    // Reset snapshot when props change
    useEffect(() => {
        if (timeRemaining) {
            setTime(timeRemaining);
        }
        startWallClock.current = null; // reset drift baseline when data updates
    }, [timeRemaining, endTimeMs, serverTimeMs]);

    const hasSync = useMemo(() => typeof serverTimeMs === 'number' && (typeof startTimeMs === 'number' || typeof endTimeMs === 'number'), [startTimeMs, endTimeMs, serverTimeMs]);

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
                // Determine target: prefer start when in the future, else end
                let target: number | undefined = undefined;
                if (typeof startTimeMs === 'number' && nowApprox < (startTimeMs as number)) {
                    target = startTimeMs as number;
                } else if (typeof endTimeMs === 'number') {
                    target = endTimeMs as number;
                }
                const remaining = Math.max(0, (target ?? nowApprox) - nowApprox);
                const d = toDHMS(remaining);
                setDays(d.days);
                setTime({ hours: d.hours, minutes: d.minutes, seconds: d.seconds });
            } else if (time) {
                // Fallback: decrement the snapshot each second
                const ms = Math.max(0, ((days * 86400) + (time.hours * 3600) + (time.minutes * 60) + time.seconds - 1) * 1000);
                const d = toDHMS(ms);
                setDays(d.days);
                setTime({ hours: d.hours, minutes: d.minutes, seconds: d.seconds });
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [hasSync, startTimeMs, endTimeMs, serverTimeMs, time, days]);

    const showDays = (days ?? 0) > 0;
    return (
        <div className={`grid ${showDays ? 'grid-cols-4' : 'grid-cols-3'} gap-4 text-center`}>
            {showDays && (
                <div className="bg-gradient-to-b from-dark-800 to-dark-900 p-4 rounded-xl border border-adderrels-500/30">
                    <div className="text-3xl font-bold number-glow" data-testid="countdown-days">
                        {(days ?? 0).toString().padStart(2, '0')}
                    </div>
                    <div className="text-sm text-gray-400">Days</div>
                </div>
            )}
            <div className="bg-gradient-to-b from-dark-800 to-dark-900 p-4 rounded-xl border border-adderrels-500/30">
                <div
                    className="text-3xl font-bold number-glow"
                    data-testid="countdown-hours"
                >
                    {(time?.hours ?? 0).toString().padStart(2, '0')}
                </div>
                <div className="text-sm text-gray-400">Hours</div>
            </div>
            <div className="bg-gradient-to-b from-dark-800 to-dark-900 p-4 rounded-xl border border-adderrels-500/30">
                <div
                    className="text-3xl font-bold number-glow"
                    data-testid="countdown-minutes"
                >
                    {(time?.minutes ?? 0).toString().padStart(2, '0')}
                </div>
                <div className="text-sm text-gray-400">Minutes</div>
            </div>
            <div className="bg-gradient-to-b from-dark-800 to-dark-900 p-4 rounded-xl border border-adderrels-500/30">
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
