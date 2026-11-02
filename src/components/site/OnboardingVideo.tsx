"use client";

import { useEffect, useRef, useState } from "react";
import { PLATFORM_HOST } from "@/lib/platform";

/*
 * A real sign-up, from /start to the new hostel's dashboard, played at 1.5x speed.
 * Nothing downloads until it scrolls near the screen; it plays only while in view, and not at
 * all (controls instead) for people who ask for less motion.
 */
export function OnboardingVideo() {
  const ref = useRef<HTMLVideoElement>(null);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- a browser preference, known only here
      setStill(true);
      return;
    }
    const seen = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          video.preload = "auto";
          void video.play().catch(() => {});
        } else video.pause();
      },
      { threshold: 0.35 },
    );
    seen.observe(video);
    return () => seen.disconnect();
  }, []);

  return (
    <figure className="overflow-hidden rounded-2xl bg-white shadow-[0_24px_60px_-20px_rgba(11,35,34,0.3)] ring-1 ring-black/5">
      <div className="flex items-center gap-2 border-b border-grey-100 px-4 py-3">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-grey-150" />
          <span className="size-2.5 rounded-full bg-grey-150" />
          <span className="size-2.5 rounded-full bg-grey-150" />
        </span>
        <span className="mx-auto truncate rounded-full bg-grey-50 px-4 py-1 text-xs text-heading-6">{PLATFORM_HOST === "localhost" ? "hostelhub.africa" : PLATFORM_HOST}/start</span>
      </div>
      <video
        ref={ref}
        className="block aspect-[8/5] w-full bg-grey-50"
        src="/video/onboarding.webm"
        poster="/video/onboarding.jpg"
        muted
        loop
        playsInline
        preload="none"
        controls={still}
        aria-label="A hostel owner signs up: hostel details, rooms and prices, payout account, going live, then their dashboard"
      />
    </figure>
  );
}
