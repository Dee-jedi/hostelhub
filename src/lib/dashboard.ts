"use client";

import { useMemo } from "react";
import { useHostel } from "./store";
import { spaceIdsOf } from "./spaces";
import { activeResidents, blockTitle, isSameMonth, parseDate, peopleInRoom, rentStatus, isPerBed, occupantsByRoom, rentFor, roomTypeOf, todayISO } from "./utils";

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Month buckets relative to today: offset 0 is the current month. */
function monthRange(from: number, to: number) {
  const base = parseDate(todayISO());
  base.setDate(1);
  const out: { key: string; label: string; long: string }[] = [];
  for (let i = from; i <= to; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
    out.push({
      key: monthKey(d),
      label: d.toLocaleDateString("en-NG", { month: "short" }),
      long: d.toLocaleDateString("en-NG", { month: "long", year: "numeric" }),
    });
  }
  return out;
}

/** Derived figures for the dashboard. */
export function useDashboard() {
  const s = useHostel();
  return useMemo(() => {
    const today = todayISO();
    const residents = activeResidents(s);
    // Per-bed hostels count beds; per-room hostels count rooms (a space is one or the other)
    const unit: "bed" | "room" = isPerBed(s) ? "bed" : "room";
    const occupants = occupantsByRoom(s);
    const usableRooms = s.rooms.filter((r) => !r.underMaintenance);
    const spacesIn = (r: (typeof s.rooms)[number]) => spaceIdsOf(r.id, roomTypeOf(s, r)).length;
    const takenIn = (r: (typeof s.rooms)[number]) => Math.min(spacesIn(r), roomTypeOf(s, r).pricingMode === "per_bed" ? (occupants.get(r.id) ?? []).length : occupants.has(r.id) ? 1 : 0);
    const totalSpaces = usableRooms.reduce((n, r) => n + spacesIn(r), 0);
    const occupiedSpaces = usableRooms.reduce((n, r) => n + takenIn(r), 0);
    const vacantSpaces = totalSpaces - occupiedSpaces;
    const maintenanceRooms = s.rooms.length - usableRooms.length;
    const people = residents.reduce((n, r) => n + peopleInRoom(r), 0);
    const sharedRooms = residents.filter((r) => r.occupants.length > 0).length;

    const expiringThisMonth = residents.filter((r) => isSameMonth(r.leaseEnd, today) && r.leaseEnd >= today);
    const expired = residents.filter((r) => rentStatus(r) === "expired");
    const due30 = residents.filter((r) => rentStatus(r) === "expiring");
    const collectedThisMonth = s.payments.filter((p) => isSameMonth(p.date, today)).reduce((n, p) => n + p.amount, 0);
    const outstanding = expired.reduce((n, r) => n + rentFor(s, r), 0);

    const collections = monthRange(-11, 0).map((m) => {
      const ps = s.payments.filter((p) => p.date.startsWith(m.key));
      return { ...m, total: ps.reduce((n, p) => n + p.amount, 0), count: ps.length };
    });

    // When current rents run out — tells management when renewals (and cash) are coming
    const forecast = monthRange(0, 11).map((m) => {
      const due = residents.filter((r) => r.leaseEnd.startsWith(m.key));
      return { ...m, rooms: due.length, value: due.reduce((n, r) => n + rentFor(s, r), 0) };
    });

    const blocks = s.settings.blocks.map((b) => {
      const rooms = usableRooms.filter((r) => r.block === b.name);
      const total = rooms.reduce((n, r) => n + spacesIn(r), 0);
      const occupied = rooms.reduce((n, r) => n + takenIn(r), 0);
      return { name: blockTitle(b.name), total, occupied, vacant: total - occupied };
    });

    const statusCounts = {
      active: residents.filter((r) => rentStatus(r) === "active").length,
      expiring: due30.length,
      expired: expired.length,
    };

    const upcoming = [...expired, ...due30].sort((a, b) => a.leaseEnd.localeCompare(b.leaseEnd));

    return {
      residents,
      unit,
      /** Spaces: beds in a per-bed hostel, rooms otherwise */
      usableRooms: totalSpaces,
      occupiedRooms: occupiedSpaces,
      vacantRooms: vacantSpaces,
      maintenanceRooms,
      people,
      sharedRooms,
      expiringThisMonth,
      expired,
      due30,
      collectedThisMonth,
      outstanding,
      collections,
      forecast,
      blocks,
      statusCounts,
      upcoming,
    };
  }, [s]);
}
