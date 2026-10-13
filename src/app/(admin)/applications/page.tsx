"use client";

import { Check, ClipboardList, Copy, Printer, QrCode, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { AddResidentModal } from "@/components/AddResidentModal";
import { toast } from "@/components/toast";
import { Avatar, Badge, BtnLabel, Button, headerBtn, Card, EmptyState, Modal, PageHeader, Tabs } from "@/components/ui";
import { applicationToStudent, setApplicationStatus, useHostel } from "@/lib/store";
import type { Application } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

export default function ApplicationsPage() {
  const s = useHostel();
  const [tab, setTab] = useState<Application["status"]>("pending");
  const [approving, setApproving] = useState<Application | null>(null);
  const [showQR, setShowQR] = useState(false);
  const link = `${window.location.origin}/register`;
  const list = s.applications.filter((a) => a.status === tab);
  const count = (st: Application["status"]) => s.applications.filter((a) => a.status === st).length;

  return (
    <>
      <PageHeader
        title="Applications"
        description="Students fill the registration form on their phones — no more paper."
        actions={
          <>
            <Button
              variant="secondary"
              className={headerBtn}
              onClick={() => {
                navigator.clipboard?.writeText(link);
                toast("Registration link copied");
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
            { value: "pending", label: "Pending", count: count("pending") },
            { value: "approved", label: "Approved", count: count("approved") },
            { value: "rejected", label: "Rejected", count: count("rejected") },
          ]}
        />
      </div>

      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardList className="size-6" />}
            title={tab === "pending" ? "No pending applications" : `No ${tab} applications`}
            description="Share the registration link or QR code with new students."
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((a) => (
            <Card key={a.id} bodyClassName="p-5">
              <div className="flex items-start gap-3">
                <Avatar name={a.fullName} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">{a.fullName}</p>
                  <p className="text-sm text-slate-500">
                    {a.department} · {a.level} Level
                  </p>
                </div>
                <span className="text-xs text-slate-400">{formatDateTime(a.submittedAt)}</span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">Phone</dt>
                  <dd className="font-medium text-slate-900">{a.phone}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Sex / preferred block</dt>
                  <dd className="font-medium text-slate-900">
                    {a.sex} · {a.preferredBlock ? `Block ${a.preferredBlock}` : "Any"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Next of kin</dt>
                  <dd className="font-medium text-slate-900">
                    {a.nextOfKinName} <span className="text-slate-500">({a.nextOfKinPhone})</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Sharing with</dt>
                  <dd className="font-medium text-slate-900">
                    {a.occupants?.length ? a.occupants.map((o) => o.fullName).join(", ") : <span className="font-normal text-slate-400">Nobody</span>}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Payment reference</dt>
                  <dd>{a.paymentReference ? <Badge tone="green">{a.paymentReference}</Badge> : <Badge tone="amber">Not paid yet</Badge>}</dd>
                </div>
              </dl>
              {tab === "pending" && (
                <div className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
                  <Button className="flex-1" onClick={() => setApproving(a)}>
                    <Check className="size-4" /> Approve & allocate
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setApplicationStatus(a.id, "rejected");
                      toast("Application rejected", "info");
                    }}
                  >
                    <X className="size-4" /> Reject
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {approving && (
        <AddResidentModal
          applicationId={approving.id}
          preferredBlock={approving.preferredBlock}
          initial={applicationToStudent(approving)}
          onClose={() => setApproving(null)}
        />
      )}

      <Modal
        open={showQR}
        onClose={() => setShowQR(false)}
        title="Registration QR code"
        description="Print and paste at the reception. Students scan, fill the form, and you approve."
        footer={
          <Button onClick={() => window.print()}>
            <Printer className="size-4" /> Print
          </Button>
        }
      >
        <div className="print-area flex flex-col items-center gap-4 py-4 text-center">
          <p className="text-xl font-medium text-slate-900">{s.settings.hostelName}</p>
          <p className="text-sm text-slate-600">Scan to register for a room</p>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <QRCodeSVG value={link} size={220} />
          </div>
          <p className="font-mono text-xs break-all text-slate-500">{link}</p>
        </div>
      </Modal>
    </>
  );
}
