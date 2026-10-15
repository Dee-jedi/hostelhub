"use client";

import { MessageCircle, Send } from "lucide-react";
import { useState } from "react";
import { sendMessage, useHostel } from "@/lib/store";
import { PLACEHOLDERS, TEMPLATES } from "@/lib/templates";
import type { Channel, Message, Resident } from "@/lib/types";
import { fillTemplate, whatsappLink } from "@/lib/utils";
import { toast } from "./toast";
import { Avatar, Button, Field, Modal, Select, Textarea } from "./ui";

export function ComposeModal({
  recipients,
  onClose,
  defaultTemplate = "renew",
  kind = "reminder",
}: {
  recipients: Resident[];
  onClose: () => void;
  defaultTemplate?: string;
  kind?: Message["kind"];
}) {
  const s = useHostel();
  const [channel, setChannel] = useState<Channel>("SMS");
  const [body, setBody] = useState(TEMPLATES.find((t) => t.id === defaultTemplate)?.body ?? "");
  const [sent, setSent] = useState(false);
  const preview = recipients[0] ? fillTemplate(body, recipients[0], s) : body;

  const send = () => {
    if (!body.trim()) return toast("Write a message first", "info");
    sendMessage({ kind, channel, recipientIds: recipients.map((r) => r.id), body });
    toast(`Message queued for ${recipients.length} resident${recipients.length === 1 ? "" : "s"}`);
    setSent(true);
  };

  if (sent) {
    return (
      <Modal
        open
        onClose={onClose}
        size="lg"
        title="Message sent"
        description="Logged to message history. Use the WhatsApp buttons to send personally from your phone."
        footer={<Button onClick={onClose}>Done</Button>}
      >
        <div className="mb-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
          Demo mode: bulk SMS is simulated. In production this goes out through an SMS gateway (e.g. Termii) or the WhatsApp Business API automatically.
        </div>
        <ul className="divide-y divide-slate-100">
          {recipients.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2.5">
              <Avatar name={r.fullName} src={r.photoUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{r.fullName}</p>
                <p className="text-xs text-slate-500">
                  {r.roomId} · {r.phone}
                </p>
              </div>
              <a
                href={whatsappLink(r.phone, fillTemplate(body, r, s))}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
              >
                <MessageCircle className="size-3.5" /> WhatsApp
              </a>
            </li>
          ))}
        </ul>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Send message"
      description={`To ${recipients.length} resident${recipients.length === 1 ? "" : "s"}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={send} disabled={recipients.length === 0}>
            <Send className="size-4" /> Send to {recipients.length}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Channel">
            <Select value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
              <option>SMS</option>
              <option>WhatsApp</option>
              <option>Email</option>
            </Select>
          </Field>
          <Field label="Template">
            <Select defaultValue={defaultTemplate} onChange={(e) => setBody(TEMPLATES.find((t) => t.id === e.target.value)?.body ?? "")}>
              {TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Message" hint="Placeholders are replaced with each resident's details.">
          <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {PLACEHOLDERS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setBody((b) => b + p)}
              className="rounded-md bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-600 hover:bg-brand-50 hover:text-brand-700"
            >
              {p}
            </button>
          ))}
        </div>
        {recipients[0] && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-500">Preview for {recipients[0].fullName}</p>
            <div className="rounded-2xl rounded-tl-sm bg-emerald-50 p-3 text-sm whitespace-pre-wrap text-slate-800 ring-1 ring-emerald-100">{preview}</div>
          </div>
        )}
      </div>
    </Modal>
  );
}
