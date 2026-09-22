import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from 'recharts';

export interface RadarDatum {
  dim: string;
  score: number;
}

/** Radar of the maturity dimensions (0-5 per axis). */
export function MaturityRadar({ data }: { data: RadarDatum[] }) {
  const primary = 'hsl(var(--primary))';
  return (
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid className="stroke-border" />
        <PolarAngleAxis
          dataKey="dim"
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
        />
        <PolarRadiusAxis
          domain={[0, 5]}
          tickCount={6}
          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
          axisLine={false}
        />
        <Radar
          dataKey="score"
          stroke={primary}
          fill={primary}
          fillOpacity={0.35}
          isAnimationActive={false}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
