"use client";

import { ArrowRight, MapPin, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DirectoryHostel } from "@/app/api/directory/route";
import { PLATFORM_HOST } from "@/lib/platform";
import { naira } from "@/lib/utils";

/*
 * Every live hostel, searchable by name or town. Picking one opens its own site, where people
 * book a room or log in. Shown on the platform's login page.
 */

function hostelOrigin(id: string) {
  const { protocol, port } = window.location;
  return `${protocol}//${id}.${PLATFORM_HOST}${port ? `:${port}` : ""}`;
}

export function HostelDirectory() {
  const [hostels, setHostels] = useState<DirectoryHostel[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/directory")
      .then(async (res) => {
        const data = (await res.json()) as { hostels?: DirectoryHostel[]; error?: string };
        if (!res.ok || !data.hostels) throw new Error(data.error ?? "Couldn't load hostels.");
        setHostels(data.hostels);
      })
      .catch((err: Error) => setProblem(err.message));
  }, []);

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!hostels || !words.length) return hostels ?? [];
    return hostels.filter((h) => {
      const text = `${h.name} ${h.city ?? ""} ${h.state ?? ""}`.toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [hostels, query]);

  return (
    <section className="w-full">
      <h2 className="text-xl font-semibold tracking-tight text-grey-950">Find your hostel</h2>
      <p className="mt-1 text-sm text-heading-6">Book a room, or log in to the one you live in.</p>
      <label className="mt-4 flex h-12 items-center gap-2 rounded-2xl bg-white px-4 ring-1 ring-grey-150 focus-within:ring-2 focus-within:ring-brand-500">
        <Search className="size-4 shrink-0 text-heading-6" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by hostel name or town"
          aria-label="Search hostels"
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-grey-950 outline-none placeholder:text-grey-400"
        />
      </label>

      {problem ? (
        <p className="mt-4 text-sm text-rose-600">{problem}</p>
      ) : !hostels ? (
        <ul className="mt-4 space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-[72px] animate-pulse rounded-2xl bg-white/70 ring-1 ring-black/5" />
          ))}
        </ul>
      ) : shown.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-white p-4 text-sm text-heading-5 ring-1 ring-black/5">
          {hostels.length ? `No hostel matches “${query.trim()}”.` : "No hostels are listed yet."} Ask your hostel for their HostelHub link.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {shown.map((h) => (
            <li key={h.id}>
              <a
                href={`${hostelOrigin(h.id)}/book`}
                className="flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-black/5 transition hover:ring-brand-300"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-base font-bold text-brand-800">{h.name.charAt(0)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-grey-950">{h.name}</span>
                  <span className="flex flex-wrap items-center gap-x-3 text-xs text-heading-6">
                    {(h.city || h.state) && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3" />
                        {[h.city, h.state].filter(Boolean).join(", ")}
                      </span>
                    )}
                    {h.from ? (
                      <span>
                        From {naira(h.from)} per {h.per}
                      </span>
                    ) : null}
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-heading-6" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
