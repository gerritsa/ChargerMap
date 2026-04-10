import type { ReactNode } from "react";

import { AppHeader } from "@/components/app-header";
import { getTrackingStartedAtLabel } from "@/lib/tracking-start";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return <DashboardLayoutContent>{children}</DashboardLayoutContent>;
}

async function DashboardLayoutContent({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const trackingStartedAtLabel = await getTrackingStartedAtLabel();

  return (
    <main className="min-h-screen overflow-x-hidden pb-10 pt-0">
      <AppHeader trackingStartedAtLabel={trackingStartedAtLabel} />
      {children}
    </main>
  );
}
