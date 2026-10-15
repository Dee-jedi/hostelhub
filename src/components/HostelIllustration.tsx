import { useId } from "react";

/**
 * A hostel block at dusk, drawn for the dark brand panel on the login screen.
 * Pure SVG in the brand palette, so it stays crisp at any size and costs no download.
 */

// Which windows are lit, row by row (main block is 4 × 4, wings are 2 × 3)
const MAIN_LIT = [
  [1, 0, 1, 1],
  [0, 1, 0, 1],
  [1, 1, 0, 0],
  [0, 1, 1, 0],
];
const LEFT_LIT = [
  [1, 0],
  [0, 1],
  [1, 1],
];
const RIGHT_LIT = [
  [0, 1],
  [1, 0],
  [1, 1],
];

const LIT = "#fde68a";
const DARK = "#1b4745";

function Windows({ x, y, grid, w, h, gapX, gapY }: { x: number; y: number; grid: number[][]; w: number; h: number; gapX: number; gapY: number }) {
  return (
    <>
      {grid.flatMap((row, r) =>
        row.map((lit, c) => (
          <g key={`${r}-${c}`}>
            <rect x={x + c * gapX} y={y + r * gapY} width={w} height={h} rx={2.5} fill={lit ? LIT : DARK} />
            {lit ? <rect x={x + c * gapX} y={y + r * gapY + h - 4} width={w} height={4} rx={1} fill="#f59e0b" opacity={0.35} /> : null}
          </g>
        )),
      )}
    </>
  );
}

function Tree({ x, base, scale = 1 }: { x: number; base: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${base}) scale(${scale})`}>
      <rect x={-3} y={-26} width={6} height={26} rx={2} fill="#0b2322" />
      <circle cx={0} cy={-44} r={22} fill="#31847f" />
      <circle cx={-11} cy={-34} r={14} fill="#236b67" />
      <circle cx={10} cy={-56} r={11} fill="#4c9f9a" />
    </g>
  );
}

export function HostelIllustration({ className }: { className?: string }) {
  // Unique per copy: the login page renders one for desktop and one for phones (one hidden),
  // and a mask defined inside a hidden SVG doesn't paint
  const uid = useId().replace(/:/g, "");
  const fade = `hh-fade-${uid}`;
  const edges = `hh-edges-${uid}`;
  return (
    <svg viewBox="0 0 420 330" className={className} role="img" aria-label="A hostel building at dusk">
      <defs>
        {/* Ground and hills fade out at the sides so the scene has no hard edges */}
        <linearGradient id={fade} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity={0} />
          <stop offset="0.18" stopColor="#fff" stopOpacity={1} />
          <stop offset="0.82" stopColor="#fff" stopOpacity={1} />
          <stop offset="1" stopColor="#fff" stopOpacity={0} />
        </linearGradient>
        <mask id={edges}>
          <rect x={0} y={0} width={420} height={330} fill={`url(#${fade})`} />
        </mask>
      </defs>
      {/* moon and stars */}
      <circle cx={340} cy={58} r={26} fill={LIT} opacity={0.18} />
      <circle cx={340} cy={58} r={17} fill={LIT} opacity={0.9} />
      <circle cx={348} cy={52} r={14} fill="#193c3b" />
      {[
        [70, 40],
        [120, 22],
        [250, 34],
        [290, 82],
        [40, 96],
        [380, 120],
        [200, 12],
      ].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={i % 3 === 0 ? 1.8 : 1.2} fill="#d5ecea" opacity={0.75} />
      ))}

      {/* distant hills */}
      <path d="M0 250 C 70 215, 140 230, 210 222 S 350 205, 420 236 V330 H0 Z" fill="#1e5754" opacity={0.55} mask={`url(#${edges})`} />

      {/* left wing */}
      <rect x={58} y={150} width={70} height={132} rx={5} fill="#acd9d5" />
      <rect x={52} y={142} width={82} height={12} rx={4} fill="#7bbfba" />
      <Windows x={72} y={166} grid={LEFT_LIT} w={16} h={20} gapX={26} gapY={34} />

      {/* right wing */}
      <rect x={292} y={168} width={70} height={114} rx={5} fill="#acd9d5" />
      <rect x={286} y={160} width={82} height={12} rx={4} fill="#7bbfba" />
      <Windows x={306} y={182} grid={RIGHT_LIT} w={16} h={18} gapX={26} gapY={30} />

      {/* main block */}
      <rect x={118} y={84} width={184} height={198} rx={6} fill="#d5ecea" />
      <rect x={110} y={72} width={200} height={16} rx={5} fill="#7bbfba" />
      <rect x={180} y={58} width={60} height={18} rx={4} fill="#4c9f9a" />
      <text x={210} y={71} textAnchor="middle" fontSize={9} fontWeight={700} letterSpacing={1.5} fill="#eef7f6">
        HOSTEL
      </text>
      <Windows x={136} y={102} grid={MAIN_LIT} w={24} h={22} gapX={40} gapY={36} />

      {/* entrance */}
      <rect x={186} y={236} width={48} height={8} rx={2} fill="#4c9f9a" />
      <path d="M192 282 V258 a18 18 0 0 1 36 0 V282 Z" fill="#236b67" />
      <path d="M197 282 V259 a13 13 0 0 1 26 0 V282 Z" fill={LIT} opacity={0.85} />
      <line x1={210} y1={247} x2={210} y2={282} stroke="#236b67" strokeWidth={2} />

      {/* ground and path */}
      <rect x={0} y={280} width={420} height={50} fill="#0b2322" opacity={0.45} mask={`url(#${edges})`} />
      <path d="M196 282 L224 282 L262 330 L158 330 Z" fill="#31847f" opacity={0.45} />

      <Tree x={36} base={284} scale={0.95} />
      <Tree x={384} base={284} scale={1.1} />
      <Tree x={268} base={286} scale={0.6} />
      <Tree x={150} base={286} scale={0.55} />

      {/* lamp post */}
      <rect x={252} y={232} width={3} height={52} fill="#0b2322" />
      <circle cx={253.5} cy={230} r={5} fill={LIT} />
      <circle cx={253.5} cy={230} r={14} fill={LIT} opacity={0.15} />
    </svg>
  );
}
