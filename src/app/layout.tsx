import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter_Tight } from "next/font/google";
import "./globals.css";

const interTight = Inter_Tight({
  variable: "--font-ui",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Swtch Toronto Live",
  description:
    "A City of Toronto dashboard for live monitoring, occupancy tracking, and charger intelligence across the SWTCH network.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${interTight.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[var(--surface-0)] text-[var(--ink-900)]">
        {children}
      </body>
    </html>
  );
}
