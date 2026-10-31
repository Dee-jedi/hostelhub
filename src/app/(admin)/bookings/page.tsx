"use client";

import { ClipboardList, Copy, DoorOpen, Printer, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { AddResidentModal } from "@/components/AddResidentModal";
import { OlderRecords } from "@/components/OlderRecords";
import { toast } from "@/components/toast";
import { Avatar, Badge, BtnLabel, Button, headerBtn, Card, EmptyState, Modal, PageHeader, Tabs } from "@/components/ui";
import { bookingToStudent, roomLabel, useHostel } from "@/lib/store";
import { openResident } from "@/lib/ui-store";
import type { Booking } from "@/lib/types";
import { academicLine, formatDateTime, naira } from "@/lib/utils";

type Tab = "paid" | "attention" | "unfinished";

const inTab = (b: Booking, tab: Tab) =>
  tab === "paid" ? b.status === "paid" || b.status === "resolved" : tab === "attention" ? b.status === "needs_attention" : b.status === "pending";

export default function BookingsPage() {
  const s = useHostel();
  const [tab, setTab] = useState<Tab>("paid");
  const [allocating, setAllocating] = useState<Booking | null>(null);
  const [showQR, setShowQR] = useState(false);
  const link = `${window.location.origin}/book`;
  const list = s.bookings.filter((b) => inTab(b, tab));
  const count = (t: Tab) => s.bookings.filter((b) => inTab(b, t)).length;

  return (
    <>
      <PageHeader
        title="Bookings"
        description="New tenants pick a room, pay online and move straight into the system."
        actions={
          <>
            <Button
              variant="secondary"
              className={headerBtn}
              onClick={() => {
                navigator.clipboard?.writeText(link);
                toast("Booking link copied");
              }}
            >
              <Copy className="size-4" />
              <BtnLabel>Copy link</BtnLabel>
            </Button>
            <Button className={headerBtn} onClick={() => setShowQR(true)}>
              <QrCode className="size-4" />
              <BtnLabel>Show QR code</BtnLabel>
            </Button>
          </>
        }
      />

      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "paid", label: "Paid", count: count("paid") },
            { value: "attention", label: "Needs a room", count: count("attention") },
            { value: "unfinished", label: "Unfinished", count: count("unfinished") },
          ]}
        />
      </div>

      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardList className="size-6" />}
            title={tab === "paid" ? "No online bookings yet" : tab === "attention" ? "Nothing to sort out" : "No unfinished checkouts"}
            description={
              tab === "attention"
                ? "If someone pays while their room gets taken, they show up here so you can give them another."
                : tab === "unfinished"
                  ? "People who started paying but didn't finish."
                  : "Share the booking link or QR code. Paid bookings appear here automatically."
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((b) => (
            <Card key={b.id} bodyClassName="p-5">
              <div className="flex items-start gap-3">
                <Avatar name={b.fullName} src={b.photoUrl} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">{b.fullName}</p>
                  <p className="truncate text-sm text-slate-500">
                    {academicLine(b)}
                  </p>
                </div>
                <span className="text-xs text-slate-400">{formatDateTime(b.paidAt ?? b.createdAt)}</span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">Room</dt>
                  <dd className="font-medium text-slate-900">{roomLabel(b.roomId)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Amount</dt>
                  <dd className="font-medium text-slate-900">{naira(b.amount)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Phone</dt>
                  <dd className="font-medium text-slate-900">{b.phone}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Reference</dt>
                  <dd className="truncate font-mono text-xs leading-5 text-slate-700">{b.id}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Status</dt>
                  <dd>
                    {b.status === "paid" || b.status === "resolved" ? (
                      <Badge tone="green">Paid{b.receiptNo ? ` · ${b.receiptNo}` : ""}</Badge>
                    ) : b.status === "needs_attention" ? (
                      <Badge tone="red">Paid · needs a room</Badge>
                    ) : (
                      <Badge tone="amber">Not paid</Badge>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Brought by</dt>
                  <dd className="font-medium text-slate-900">{b.agent ? <span className="capitalize">{b.agent}</span> : <span className="font-normal text-slate-400">Direct</span>}</dd>
                </div>
              </dl>
              {b.issue && b.status === "needs_attention" && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{b.issue}</p>}
              {b.status === "needs_attention" && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <Button className="w-full" onClick={() => setAllocating(b)}>
                    <DoorOpen className="size-4" /> Allocate a room
                  </Button>
                </div>
              )}
              {(b.status === "paid" || b.status === "resolved") && b.residentId && s.residents.some((r) => r.id === b.residentId) && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <Button variant="secondary" className="w-full" onClick={() => openResident(b.residentId!)}>
                    View tenant
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      {tab !== "attention" && <OlderRecords name="bookings" what="bookings" className="mt-2 border-t-0" />}

      {allocating && (
        <AddResidentModal
          bookingId={allocating.id}
          preferredBlock={allocating.roomId.replace(/\d+$/, "")}
          initial={bookingToStudent(allocating)}
          onClose={() => setAllocating(null)}
        />
      )}

      <Modal
        open={showQR}
        onClose={() => setShowQR(false)}
        title="Booking QR code"
        description="Print it for reception, or show it on your phone. People scan, pick a room and pay."
        footer={
          <Button onClick={() => window.print()}>
            <Printer className="size-4" /> Print
          </Button>
        }
      >
        <div className="print-area flex flex-col items-center gap-4 py-4 text-center">
          <p className="text-xl font-medium text-slate-900">{s.settings.hostelName}</p>
          <p className="text-sm text-slate-600">Scan to book a room</p>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <QRCodeSVG value={link} size={220} />
          </div>
          <p className="font-mono text-xs break-all text-slate-500">{link}</p>
        </div>
      </Modal>
    </>
  );
}
