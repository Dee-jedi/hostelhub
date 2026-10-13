"use client";

import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import { naira, nairaShort } from "@/lib/utils";

// Chart tokens — kept in sync with globals.css
const C = {
  brand: "#31847f", // brand-500
  brandStrong: "#1e5754", // brand-700
  brandSoft: "#acd9d5", // brand-200
  grid: "#eaeaea",
  tick: "#777777",
  cursor: "#f4f4f4",
  surface: "#ffffff",
};

const axisTick = { fontSize: 11, fill: C.tick };

function TooltipCard({ title, rows }: { title: string; rows: { label: string; value: ReactNode; swatch?: string }[] }) {
  return (
    <div className="min-w-36 rounded-lg bg-grey-950 px-3 py-2 text-xs text-white shadow-lg">
      <p className="mb-1 font-medium">{title}</p>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-grey-400">
          {r.swatch && <span className="size-2 rounded-sm" style={{ background: r.swatch }} />}
          <span className="flex-1">{r.label}</span>
          <span className="font-medium text-white tabular-nums">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Rent collected per month ───────────────────────────────────────────────

interface CollectionPoint {
  key: string;
  label: string;
  long: string;
  total: number;
  count: number;
}

export function CollectionsChart({ data }: { data: CollectionPoint[] }) {
  const current = data[data.length - 1]?.key;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke={C.grid} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: C.grid }} tick={axisTick} interval={0} />
        <YAxis tickLine={false} axisLine={false} tick={axisTick} width={48} tickFormatter={(v: number) => nairaShort(v)} />
        <Tooltip
          cursor={{ fill: C.cursor }}
          content={({ active, payload }: TooltipContentProps) => {
            const p = active && (payload?.[0]?.payload as CollectionPoint | undefined);
            if (!p) return null;
            return (
              <TooltipCard
                title={p.long}
                rows={[
                  { label: "Collected", value: naira(p.total) },
                  { label: "Payments", value: p.count },
                ]}
              />
            );
          }}
        />
        <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={32}>
          {data.map((d) => (
            <Cell key={d.key} fill={d.key === current ? C.brandStrong : C.brand} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Rent expiry forecast ───────────────────────────────────────────────────

interface ForecastPoint {
  key: string;
  label: string;
  long: string;
  rooms: number;
  value: number;
}

export function ExpiryForecastChart({ data }: { data: ForecastPoint[] }) {
  const current = data[0]?.key;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 20, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke={C.grid} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: C.grid }} tick={axisTick} interval={0} />
        <YAxis tickLine={false} axisLine={false} tick={axisTick} width={32} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: C.cursor }}
          content={({ active, payload }: TooltipContentProps) => {
            const p = active && (payload?.[0]?.payload as ForecastPoint | undefined);
            if (!p) return null;
            return (
              <TooltipCard
                title={p.long}
                rows={[
                  { label: "Rents expiring", value: `${p.rooms} room${p.rooms === 1 ? "" : "s"}` },
                  { label: "Renewal value", value: naira(p.value) },
                ]}
              />
            );
          }}
        />
        <Bar dataKey="rooms" radius={[4, 4, 0, 0]} maxBarSize={32} label={{ position: "top", fontSize: 11, fill: C.tick }}>
          {data.map((d) => (
            <Cell key={d.key} fill={d.key === current ? C.brandStrong : C.brand} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Occupancy by block ─────────────────────────────────────────────────────

interface BlockPoint {
  name: string;
  total: number;
  occupied: number;
  vacant: number;
}

export function BlockOccupancyChart({ data }: { data: BlockPoint[] }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-4 px-1 text-xs text-heading-5">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: C.brand }} /> Occupied
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: C.brandSoft }} /> Vacant
        </span>
      </div>
      <ResponsiveContainer width="100%" height={Math.max(200, data.length * 30)}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid horizontal={false} stroke={C.grid} strokeDasharray="3 3" />
          <XAxis type="number" tickLine={false} axisLine={false} tick={axisTick} allowDecimals={false} />
          <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} tick={{ ...axisTick, fill: "#424242" }} width={64} />
          <Tooltip
            cursor={{ fill: C.cursor }}
            content={({ active, payload }: TooltipContentProps) => {
              const p = active && (payload?.[0]?.payload as BlockPoint | undefined);
              if (!p) return null;
              return (
                <TooltipCard
                  title={p.name}
                  rows={[
                    { label: "Occupied", value: p.occupied, swatch: C.brand },
                    { label: "Vacant", value: p.vacant, swatch: C.brandSoft },
                    { label: "Occupancy", value: `${p.total ? Math.round((p.occupied / p.total) * 100) : 0}%` },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="occupied" stackId="rooms" fill={C.brand} stroke={C.surface} strokeWidth={2} radius={[4, 0, 0, 4]} />
          <Bar dataKey="vacant" stackId="rooms" fill={C.brandSoft} stroke={C.surface} strokeWidth={2} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
