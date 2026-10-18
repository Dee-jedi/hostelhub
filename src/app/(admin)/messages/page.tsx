"use client";

import { Bot, Megaphone, MessageSquare, Send } from "lucide-react";
import { useMemo, useState } from "react";
import { ComposeModal } from "@/components/ComposeModal";
import { OlderRecords } from "@/components/OlderRecords";
import { Badge, Button, Panel, EmptyState, Field, PageHeader, Select } from "@/components/ui";
import { useHostel } from "@/lib/store";
import type { Resident } from "@/lib/types";
import { activeResidents, formatDateTime, rentStatus } from "@/lib/utils";

type Audience = "all" | "block" | "expiring" | "expired" | "level" | "sex";

export default function MessagesPage() {
  const s = useHostel();
  const [audience, setAudience] = useState<Audience>("all");
  const [block, setBlock] = useState(s.settings.blocks[0]?.name ?? "");
  const [level, setLevel] = useState("100");
  const [sex, setSex] = useState("Male");
  const [compose, setCompose] = useState<Resident[] | null>(null);

  const recipients = useMemo(() => {
    const all = activeResidents(s);
    switch (audience) {
      case "block":
        return all.filter((r) => r.roomId?.startsWith(block));
      case "expiring":
        return all.filter((r) => rentStatus(r) === "expiring");
      case "expired":
        return all.filter((r) => rentStatus(r) === "expired");
      case "level":
        return all.filter((r) => r.level === level);
      case "sex":
        return all.filter((r) => r.sex === sex);
      default:
        return all;
    }
  }, [s, audience, block, level, sex]);

  return (
    <>
      <PageHeader title="Messages" description="Broadcast notices and reminders to residents by SMS, WhatsApp or email." />

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel className="h-fit" title="New broadcast" description="Pick who should receive it">
          <div className="space-y-4 p-5">
            <Field label="Audience">
              <Select value={audience} onChange={(e) => setAudience(e.target.value as Audience)}>
                <option value="all">All current residents</option>
                <option value="block">A specific block</option>
                <option value="expiring">Rent expiring within 30 days</option>
                <option value="expired">Rent expired</option>
                <option value="level">A level</option>
                <option value="sex">Male / female residents</option>
              </Select>
            </Field>
            {audience === "block" && (
              <Field label="Block">
                <Select value={block} onChange={(e) => setBlock(e.target.value)}>
                  {s.settings.blocks.map((b) => (
                    <option key={b.name} value={b.name}>
                      Block {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {audience === "level" && (
              <Field label="Level">
                <Select value={level} onChange={(e) => setLevel(e.target.value)}>
                  {["100", "200", "300", "400", "500", "600"].map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </Select>
              </Field>
            )}
            {audience === "sex" && (
              <Field label="Sex">
                <Select value={sex} onChange={(e) => setSex(e.target.value)}>
                  <option>Male</option>
                  <option>Female</option>
                </Select>
              </Field>
            )}
            <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              <span className="font-semibold text-slate-900">{recipients.length}</span> resident{recipients.length === 1 ? "" : "s"} will receive this message.
            </div>
            <Button className="w-full" disabled={!recipients.length} onClick={() => setCompose(recipients)}>
              <Send className="size-4" /> Write message
            </Button>
          </div>
        </Panel>

        <Panel className="lg:col-span-2" title="History" description={`${s.messages.length} messages sent`}>
          {s.messages.length === 0 ? (
            <EmptyState icon={<MessageSquare className="size-6" />} title="No messages yet" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {s.messages.map((m) => (
                <li key={m.id} className="flex gap-4 px-5 py-4">
                  <div className={`h-fit rounded-lg p-2 ${m.automated ? "bg-violet-50 text-violet-600" : "bg-brand-50 text-brand-600"}`}>
                    {m.automated ? <Bot className="size-4" /> : <Megaphone className="size-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-slate-900">
                        {m.automated ? "Automatic reminder" : m.kind === "reminder" ? "Rent reminder" : m.kind === "notice" ? "Notice" : "Broadcast"}
                      </span>
                      <Badge tone="slate">{m.channel}</Badge>
                      <span className="text-xs text-slate-500">
                        to {m.recipientIds.length} resident{m.recipientIds.length === 1 ? "" : "s"} · {formatDateTime(m.sentAt)}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-600">{m.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <OlderRecords name="messages" what="messages" />
        </Panel>
      </div>

      {compose && <ComposeModal recipients={compose} kind="broadcast" defaultTemplate="notice" onClose={() => setCompose(null)} />}
    </>
  );
}
