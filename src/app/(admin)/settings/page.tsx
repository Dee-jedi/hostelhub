"use client";

import { Database, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { RoomTypesPanel } from "@/components/RoomTypesPanel";
import { toast } from "@/components/toast";
import { BtnLabel, Button, headerBtn, Panel, Field, Input, Modal, PageHeader } from "@/components/ui";
import { IS_LIVE_DATABASE } from "@/lib/env";
import { getState, resetDemoData, startFresh, updateSettings, useHostel } from "@/lib/store";
import type { Settings } from "@/lib/types";


export default function SettingsPage() {
  const s = useHostel();
  const [form, setForm] = useState<Settings>(s.settings);
  const [reminders, setReminders] = useState(s.settings.reminderDays.join(", "));
  const [confirm, setConfirm] = useState<"reset" | "fresh" | null>(null);
  const [resetting, setResetting] = useState(false);
  const [saving, setSaving] = useState(false);
  /** Rooms the new layout would delete, waiting for the manager to confirm */
  const [removeRooms, setRemoveRooms] = useState<string[] | null>(null);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (confirmRemoveRooms?: string[]) => {
    const reminderDays = reminders
      .split(/[,\s]+/)
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0);
    setSaving(true);
    const result = await updateSettings({ ...form, reminderDays: [...new Set(reminderDays)].sort((a, b) => b - a) }, confirmRemoveRooms);
    setSaving(false);
    if (result.ok) {
      setRemoveRooms(null);
      toast("Settings saved");
    } else if (result.removeRooms) setRemoveRooms(result.removeRooms);
    else {
      setRemoveRooms(null);
      toast(result.error, "info");
    }
  };

  const backup = () => {
    const blob = new Blob([JSON.stringify(getState(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `hostel-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  const totalRooms = form.blocks.length * form.roomsPerBlock;

  return (
    <>
      <PageHeader
        title="Settings"
        description="Hostel details, room types and prices, rooms and reminder schedule."
        actions={
          <Button className={headerBtn} onClick={() => save()} disabled={saving}>
            <Save className="size-4" />
            <BtnLabel>{saving ? "Saving…" : "Save changes"}</BtnLabel>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Hostel details">
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Hostel name" className="sm:col-span-2">
              <Input value={form.hostelName} onChange={(e) => set("hostelName", e.target.value)} />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
            </Field>
            <Field label="Manager name">
              <Input value={form.managerName} onChange={(e) => set("managerName", e.target.value)} />
            </Field>
            <Field label="Manager phone">
              <Input value={form.managerPhone} onChange={(e) => set("managerPhone", e.target.value)} />
            </Field>
            <Field label="WhatsApp group invite link" className="sm:col-span-2" hint="Shown to students after they register">
              <Input value={form.whatsappGroupLink} onChange={(e) => set("whatsappGroupLink", e.target.value)} />
            </Field>
          </div>
        </Panel>

        <Panel title="Rent & payment">
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Rent period (months)" hint="Rent for each room size is under Room types">
              <Input type="number" min={1} value={form.leaseMonths} onChange={(e) => set("leaseMonths", Math.max(1, Number(e.target.value)))} />
            </Field>
            <Field label="Bank">
              <Input value={form.bankName} onChange={(e) => set("bankName", e.target.value)} />
            </Field>
            <Field label="Account number">
              <Input value={form.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} />
            </Field>
            <Field label="Account name" className="sm:col-span-2">
              <Input value={form.accountName} onChange={(e) => set("accountName", e.target.value)} />
            </Field>
            <Field label="Send reminders (days before expiry)" className="sm:col-span-2" hint="Comma separated, e.g. 30, 14, 7, 1">
              <Input value={reminders} onChange={(e) => setReminders(e.target.value)} />
            </Field>
          </div>
        </Panel>

        <RoomTypesPanel />

        <Panel className="lg:col-span-2" title="Blocks & rooms" description={`${form.blocks.length} blocks × ${form.roomsPerBlock} rooms = ${totalRooms} rooms`}>
          <div className="p-5">
            <div className="mb-5 grid gap-4 sm:grid-cols-3">
              <Field label="Rooms per block">
                <Input type="number" min={1} value={form.roomsPerBlock} onChange={(e) => set("roomsPerBlock", Math.max(1, Number(e.target.value)))} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {form.blocks.map((b, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2">
                  <span className="pl-1 text-xs text-heading-6">Block</span>
                  <Input
                    value={b.name}
                    className="min-w-0 flex-1"
                    onChange={(e) => set("blocks", form.blocks.map((x, j) => (j === i ? { ...x, name: e.target.value.toUpperCase().slice(0, 3) } : x)))}
                  />
                  <button
                    onClick={() => set("blocks", form.blocks.filter((_, j) => j !== i))}
                    className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    aria-label={`Remove block ${b.name}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
              <Button
                variant="secondary"
                onClick={() => set("blocks", [...form.blocks, { name: String.fromCharCode(65 + form.blocks.length) }])}
              >
                <Plus className="size-4" /> Add block
              </Button>
            </div>
            <p className="mt-3 text-xs text-slate-500">New rooms get your first room type; change sizes on the Rooms page. A block with tenants can&apos;t be removed.</p>
          </div>
        </Panel>

        <Panel
          className="lg:col-span-2"
          title="Data"
          description={IS_LIVE_DATABASE ? "Stored securely in the cloud." : "Test site. Resetting affects everyone using this hostel's account."}
        >
          <div className="flex flex-wrap gap-2 p-5">
            <Button variant="secondary" onClick={backup}>
              <Database className="size-4" /> Download backup
            </Button>
            {/* Live hostels hold real tenants and payments; resetting is a test-site tool */}
            {!IS_LIVE_DATABASE && (
              <>
                <Button variant="secondary" onClick={() => setConfirm("reset")}>
                  <RotateCcw className="size-4" /> Reset demo data
                </Button>
                <Button variant="danger" onClick={() => setConfirm("fresh")}>
                  <Trash2 className="size-4" /> Start with empty hostel
                </Button>
              </>
            )}
          </div>
        </Panel>
      </div>

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm === "reset" ? "Reset to demo data?" : "Start with an empty hostel?"}
        description="All residents, payments, bookings and messages will be replaced, and tenant logins recreated. Your staff login stays."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={resetting}
              onClick={async () => {
                setResetting(true);
                try {
                  await (confirm === "reset" ? resetDemoData() : startFresh());
                  setForm(getState().settings);
                  setReminders(getState().settings.reminderDays.join(", "));
                  setConfirm(null);
                  toast("Done");
                } catch (err) {
                  toast(err instanceof Error ? err.message : "Reset failed", "info");
                } finally {
                  setResetting(false);
                }
              }}
            >
              {resetting ? "Working… (about 20s)" : "Yes, continue"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">Download a backup first if you want to keep anything.</p>
      </Modal>

      <Modal
        open={!!removeRooms}
        onClose={() => setRemoveRooms(null)}
        title={`Delete ${removeRooms?.length ?? 0} room${removeRooms?.length === 1 ? "" : "s"}?`}
        description="The new blocks and rooms-per-block don't include these rooms. They're empty, but saving deletes them along with their room size and any maintenance note."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoveRooms(null)}>
              Keep the rooms
            </Button>
            <Button variant="danger" disabled={saving} onClick={() => save(removeRooms ?? [])}>
              {saving ? "Saving…" : "Delete and save"}
            </Button>
          </>
        }
      >
        <p className="text-sm font-medium text-slate-900 tabular-nums">
          {removeRooms?.slice(0, 40).join(", ")}
          {(removeRooms?.length ?? 0) > 40 && ` and ${removeRooms!.length - 40} more`}
        </p>
        <p className="mt-3 text-sm text-slate-600">Renamed a block by mistake? Choose Keep the rooms and change the name back.</p>
      </Modal>
    </>
  );
}
