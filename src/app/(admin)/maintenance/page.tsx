"use client";

import { Plus, Wrench } from "lucide-react";
import { useState } from "react";
import { toast } from "@/components/toast";
import { Badge, BtnLabel, Button, headerBtn, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Tabs } from "@/components/ui";
import { addTicket, setTicketStatus, useHostel } from "@/lib/store";
import type { Ticket, TicketCategory } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

const CATEGORIES: TicketCategory[] = ["Plumbing", "Electrical", "Furniture", "Cleaning", "Security", "Other"];
const statusTone = { open: "red", in_progress: "amber", resolved: "green" } as const;
const statusLabel = { open: "Open", in_progress: "In progress", resolved: "Resolved" };

export default function MaintenancePage() {
  const s = useHostel();
  const [tab, setTab] = useState<Ticket["status"] | "all">("open");
  const [creating, setCreating] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<TicketCategory>("Plumbing");

  const residentsById = new Map(s.residents.map((r) => [r.id, r]));
  const list = s.tickets.filter((t) => tab === "all" || t.status === tab);
  const count = (st: Ticket["status"]) => s.tickets.filter((t) => t.status === st).length;

  const create = () => {
    if (!roomId || !title.trim()) return toast("Pick a room and describe the issue", "info");
    addTicket({ roomId, residentId: null, title: title.trim(), category });
    toast("Maintenance request logged");
    setCreating(false);
    setTitle("");
    setRoomId("");
  };

  return (
    <>
      <PageHeader
        title="Maintenance"
        description="Track repairs and complaints from rooms until they are fixed."
        actions={
          <Button className={headerBtn} onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            <BtnLabel>New request</BtnLabel>
          </Button>
        }
      />
      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "open", label: "Open", count: count("open") },
            { value: "in_progress", label: "In progress", count: count("in_progress") },
            { value: "resolved", label: "Resolved", count: count("resolved") },
            { value: "all", label: "All", count: s.tickets.length },
          ]}
        />
      </div>

      <Card>
        {list.length === 0 ? (
          <EmptyState icon={<Wrench className="size-6" />} title="No requests here" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.map((t) => {
              const r = t.residentId ? residentsById.get(t.residentId) : null;
              return (
                <li key={t.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-slate-900">{t.title}</p>
                      <Badge tone={statusTone[t.status]}>{statusLabel[t.status]}</Badge>
                      <Badge>{t.category}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Room {t.roomId}
                      {r ? ` · reported by ${r.fullName}` : ""} · {formatDateTime(t.createdAt)}
                      {t.resolvedAt ? ` · resolved ${formatDateTime(t.resolvedAt)}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {t.status === "open" && (
                      <Button size="sm" variant="secondary" onClick={() => setTicketStatus(t.id, "in_progress")}>
                        Start work
                      </Button>
                    )}
                    {t.status !== "resolved" ? (
                      <Button size="sm" variant="success" onClick={() => { setTicketStatus(t.id, "resolved"); toast("Marked as resolved"); }}>
                        Mark resolved
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setTicketStatus(t.id, "open")}>
                        Reopen
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New maintenance request"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button onClick={create}>Log request</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Room" required>
              <Select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                <option value="">Select room</option>
                {s.rooms.map((r) => (
                  <option key={r.id}>{r.id}</option>
                ))}
              </Select>
            </Field>
            <Field label="Category">
              <Select value={category} onChange={(e) => setCategory(e.target.value as TicketCategory)}>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="What's wrong?" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Ceiling fan not working" />
          </Field>
        </div>
      </Modal>
    </>
  );
}
