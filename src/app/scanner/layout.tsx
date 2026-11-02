import type { Metadata, Viewport } from "next";

export const metadata: Metadata = { title: "Scanner" };
export const viewport: Viewport = { themeColor: "#2563eb" };

export default function ScannerLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-slate-200/70">{children}</div>;
}
