"use client";

import { Download, UserPlus, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { AddResidentModal } from "@/components/AddResidentModal";
import { Avatar, Button, Card, EmptyState, PageHeader, RentBadge, SearchInput, Select } from "@/components/ui";
import { useHostel } from "@/lib/store";
import { openResident } from "@/lib/ui-store";
import { LEVELS } from "@/lib/seed";
import { daysLeft, describeDaysLeft, downloadCSV, formatDate, rentStatus } from "@/lib/utils";

const PAGE_SIZE = 25;

export default function ResidentsPage() {
  const s = useHostel();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("active");
  const [rent, setRent] = useState("");
  const [block, setBlock] = useState("");
  const [level, setLevel] = useState("");
  const [sex, setSex] = useState("");
  const [page, setPage] = useState(0);
  const [adding, setAdding] = useState(false);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return s.residents
      .filter((r) => {
        if (status && r.status !== status) return false;
        if (rent && (r.status !== "active" || rentStatus(r) !== rent)) return false;
        if (block && !r.roomId?.startsWith(block)) return false;
        if (level && r.level !== level) return false;
        if (sex && r.sex !== sex) return false;
        if (!term) return true;
        return [r.fullName, r.phone, r.roomId ?? "", r.department, r.matricNo, r.email].some((v) => v.toLowerCase().includes(term));
      })
      .sort((a, b) => (a.roomId ?? "zz").localeCompare(b.roomId ?? "zz", undefined, { numeric: true }) || a.fullName.localeCompare(b.fullName));
  }, [s.residents, q, status, rent, block, level, sex]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const rows = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const resetPage = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(0);
  };

  const exportCSV = () =>
    downloadCSV(
      `residents-${new Date().toISOString().slice(0, 10)}.csv`,
      filtered.map((r) => ({
        Name: r.fullName,
        Sex: r.sex,
        Room: r.roomId ?? "",
        Phone: r.phone,
        Email: r.email,
        "Matric No": r.matricNo,
        Department: r.department,
        Faculty: r.faculty,
        Level: r.level,
        "State of Origin": r.stateOfOrigin,
        "Next of Kin": r.nextOfKinName,
        "Next of Kin Phone": r.nextOfKinPhone,
        Relationship: r.nextOfKinRelationship,
        "Sharing With": r.occupants.map((o) => `${o.fullName} (${o.phone})`).join("; "),
        "Rent Start": r.leaseStart,
        "Rent End": r.leaseEnd,
        Status: r.status === "active" ? rentStatus(r) : "moved out",
      })),
    );

  return (
    <>
      <PageHeader
        title="Residents"
        description={`${s.residents.filter((r) => r.status === "active").length} current tenants · rent is per room`}
        actions={
          <>
            <Button variant="secondary" onClick={exportCSV} disabled={!filtered.length}>
              <Download className="size-4" /> Export CSV
            </Button>
            <Button onClick={() => setAdding(true)}>
              <UserPlus className="size-4" /> Add tenant
            </Button>
          </>
        }
      />

      <Card>
        <div className="grid grid-cols-2 gap-3 border-b border-grey-100 p-3 md:grid-cols-3 xl:grid-cols-7">
          <div className="col-span-2 md:col-span-3 xl:col-span-2">
            <SearchInput value={q} onChange={resetPage(setQ)} placeholder="Search name, phone, room, matric no…" />
          </div>
          <Select value={status} onChange={(e) => resetPage(setStatus)(e.target.value)}>
            <option value="active">Current</option>
            <option value="moved_out">Moved out</option>
            <option value="">Everyone</option>
          </Select>
          <Select value={rent} onChange={(e) => resetPage(setRent)(e.target.value)}>
            <option value="">Any rent status</option>
            <option value="active">Paid</option>
            <option value="expiring">Expiring ≤30 days</option>
            <option value="expired">Expired</option>
          </Select>
          <Select value={block} onChange={(e) => resetPage(setBlock)(e.target.value)}>
            <option value="">All blocks</option>
            {s.settings.blocks.map((b) => (
              <option key={b.name} value={b.name}>
                Block {b.name}
              </option>
            ))}
          </Select>
          <Select value={level} onChange={(e) => resetPage(setLevel)(e.target.value)}>
            <option value="">All levels</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l} Level
              </option>
            ))}
          </Select>
          <Select value={sex} onChange={(e) => resetPage(setSex)(e.target.value)}>
            <option value="">Male & female</option>
            <option>Male</option>
            <option>Female</option>
          </Select>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon={<Users className="size-6" />} title="No residents found" description="Try a different search or clear the filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-grey-100 bg-grey-10 text-left text-xs font-medium text-heading-6">
                  <th className="px-4 py-3">Tenant</th>
                  <th className="px-4 py-3">Room</th>
                  <th className="hidden px-4 py-3 xl:table-cell">Sharing with</th>
                  <th className="hidden px-4 py-3 md:table-cell">Department</th>
                  <th className="hidden px-4 py-3 lg:table-cell">Next of kin</th>
                  <th className="hidden px-4 py-3 sm:table-cell">Rent ends</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => openResident(r.id)} className="cursor-pointer hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={r.fullName} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">{r.fullName}</p>
                          <p className="text-xs text-slate-500">{r.phone}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700">{r.roomId ?? "—"}</td>
                    <td className="hidden px-4 py-3 xl:table-cell">
                      {r.occupants.length ? (
                        <span className="text-slate-700">{r.occupants.map((o) => o.fullName).join(", ")}</span>
                      ) : (
                        <span className="text-xs text-slate-400">Alone</span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <p className="text-slate-700">{r.department}</p>
                      <p className="text-xs text-slate-500">{r.level} Level</p>
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <p className="text-slate-700">{r.nextOfKinName}</p>
                      <p className="text-xs text-slate-500">{r.nextOfKinPhone}</p>
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      <p className="text-slate-700">{formatDate(r.leaseEnd)}</p>
                      {r.status === "active" && <p className="text-xs text-slate-500">{describeDaysLeft(daysLeft(r))}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <RentBadge resident={r} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
          <span>
            {filtered.length ? current * PAGE_SIZE + 1 : 0}–{Math.min((current + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={current === 0} onClick={() => setPage(current - 1)}>
              Previous
            </Button>
            <Button size="sm" variant="secondary" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
              Next
            </Button>
          </div>
        </div>
      </Card>

      {adding && <AddResidentModal onClose={() => setAdding(false)} />}
    </>
  );
}
