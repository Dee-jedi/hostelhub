import { cn } from "@/lib/utils";

/*
 * HostelHub's "hh" mark: two lowercase h's, white then light teal, on the dark teal tile.
 * Used for the browser icon (app/icon.svg is the same drawing) and the loading screen, until
 * the designed logo arrives. `animated` draws the strokes in, over and over.
 */

const STROKES = [
  // The first h (white): stem, then arch
  { d: "M13 11v26", color: "#ffffff", len: 26 },
  { d: "M13 25.5a5 5 0 0 1 10 0V37", color: "#ffffff", len: 28 },
  // The second h (light teal)
  { d: "M29 11v26", color: "#7bbfba", len: 26 },
  { d: "M29 25.5a5 5 0 0 1 10 0V37", color: "#7bbfba", len: 28 },
];

export function HHMark({ size = 48, animated = false, className }: { size?: number; animated?: boolean; className?: string }) {
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-brand-800 to-brand-950", animated && "hh-animated", className)}
      style={{ width: size, height: size, borderRadius: size * 0.28, ...(animated ? { animation: "hh-breathe 2.4s ease-in-out infinite" } : {}) }}
      aria-hidden
    >
      <svg viewBox="0 0 52 48" width={size * 0.78} height={size * 0.72} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth={4.6}>
        {STROKES.map((s, i) => (
          <path
            key={i}
            d={s.d}
            stroke={s.color}
            style={
              animated
                ? ({
                    "--hh-len": s.len,
                    strokeDasharray: s.len,
                    animation: `hh-draw 2.4s cubic-bezier(0.65, 0, 0.35, 1) ${i * 0.12}s infinite`,
                  } as React.CSSProperties)
                : undefined
            }
          />
        ))}
      </svg>
    </span>
  );
}
