import type { ReactNode } from "react";

import { AppHeader } from "@/components/app-header";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <main className="min-h-screen overflow-x-hidden pb-10 pt-0">
      <AppHeader />
      {children}
    </main>
  );
}
