"use client";

import { NotificationList, useNotifications } from "@/components/notifications";
import { Card, PageHeader } from "@/components/ui";

export default function NotificationsPage() {
  const notices = useNotifications();
  return (
    <>
      <PageHeader title="Notifications" description={notices.length ? `${notices.length} things need your attention` : "You're all caught up"} />
      <Card className="mx-auto max-w-2xl">
        <NotificationList notices={notices} />
      </Card>
    </>
  );
}
