import { AgentSpend } from "@/lib/api/admin";

const money = (usd: number) => (usd > 0 && usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`);

/** "$0.42 of $3.00 (14%)" with a bar that turns amber at 80% and red at 100%. */
export default function SpendBar({ spend, compact = false }: { spend: AgentSpend; compact?: boolean }) {
  const pct = Math.min(100, Math.max(0, spend.percent_used));
  const colour = spend.percent_used >= 100 ? "bg-destructive" : spend.percent_used >= 80 ? "bg-amber-500" : "bg-primary";
  return (
    <div className={compact ? "space-y-1" : "space-y-1.5"}>
      <div className={`flex justify-between gap-2 ${compact ? "text-xs" : "text-sm"}`}>
        <span>
          <strong className="font-semibold">{money(spend.spend_usd)}</strong> of {money(spend.budget_usd)}
          {spend.budget_is_default && !compact ? " (default budget)" : ""}
        </span>
        <span className={spend.over_budget ? "font-semibold text-destructive" : "text-muted-foreground"}>
          {spend.percent_used}%{spend.over_budget ? " · AI paused" : ""}
        </span>
      </div>
      <div
        className="h-1.5 w-full rounded-full bg-muted overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Budget used"
      >
        <div className={`h-full ${colour}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
