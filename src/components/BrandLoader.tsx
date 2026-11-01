import { HHMark } from "./BrandMark";

/** The loading screen everywhere: the hh mark drawing itself, centred, with a short line under it. */
export function BrandLoader({ label, fullScreen = true }: { label?: string; fullScreen?: boolean }) {
  return (
    <div role="status" aria-live="polite" className={fullScreen ? "flex min-h-dvh flex-col items-center justify-center gap-5 bg-[#f6f8f7] px-6" : "flex flex-col items-center justify-center gap-5 py-16"}>
      <HHMark size={64} animated />
      {label && <p className="text-sm font-medium text-heading-6">{label}</p>}
    </div>
  );
}
