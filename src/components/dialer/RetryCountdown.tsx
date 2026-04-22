import { useState, useEffect } from "react";
import { Timer } from "lucide-react";

interface RetryCountdownProps {
  /** ISO timestamp when the soonest deferred lead becomes eligible. */
  targetTime: string;
  /** Called when the countdown reaches zero so the parent can refresh stats. */
  onExpired?: () => void;
}

export function RetryCountdown({ targetTime, onExpired }: RetryCountdownProps) {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    const target = new Date(targetTime).getTime();

    const tick = () => {
      const diff = Math.max(0, Math.round((target - Date.now()) / 1000));
      if (diff <= 0) {
        setRemaining("now");
        onExpired?.();
        return;
      }
      const m = Math.floor(diff / 60);
      const s = diff % 60;
      setRemaining(`${m}:${String(s).padStart(2, "0")}`);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetTime, onExpired]);

  return (
    <div className="flex justify-between items-center text-xs">
      <span className="text-muted-foreground flex items-center gap-1">
        <Timer className="w-3 h-3" /> Next retry in
      </span>
      <span className="font-mono font-medium text-amber-400">{remaining}</span>
    </div>
  );
}
