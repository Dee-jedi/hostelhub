import type { Metadata } from "next";
import { AdminConsole } from "@/components/platform/AdminConsole";

export const metadata: Metadata = {
  title: "Admin · HostelHub",
  robots: { index: false },
};

/** HostelHub's own console; admin.hostelhub.africa shows it at "/". */
export default function AdminPage() {
  return <AdminConsole />;
}
