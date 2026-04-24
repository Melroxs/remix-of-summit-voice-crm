import { LineChart, Line, ResponsiveContainer, Tooltip, YAxis } from "recharts";

export interface SparkPoint {
  /** Day label, e.g. "Mon" or "12/02" */
  day: string;
  total: number;
  answered: number;
  /** 0–100 */
  answer_rate: number;
}

interface Props {
  data: SparkPoint[];
  /** Render mode — "rate" colors line by performance, "volume" shows raw call counts. */
  mode?: "rate" | "volume";
}

/**
 * Tiny inline sparkline for a caller ID's last-7-days performance.
 * Designed to fit inside a table cell (~120×32px).
 */
export default function CallerIdSparkline({ data, mode = "rate" }: Props) {
  const hasData = data.some((d) => d.total > 0);
  if (!hasData) {
    return <span className="text-xs text-muted-foreground">No calls</span>;
  }

  const dataKey = mode === "rate" ? "answer_rate" : "total";
  const stroke = mode === "rate" ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))";

  return (
    <div className="h-8 w-28">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          {mode === "rate" && <YAxis hide domain={[0, 100]} />}
          <Tooltip
            cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 6,
              fontSize: 11,
              padding: "6px 8px",
            }}
            labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 500 }}
            itemStyle={{ color: "hsl(var(--foreground))" }}
            formatter={(_v, _n, item: any) => {
              const p: SparkPoint = item?.payload;
              return [`${p.answered}/${p.total} (${p.answer_rate}%)`, "Answered"];
            }}
            labelFormatter={(label) => String(label)}
          />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={stroke}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}