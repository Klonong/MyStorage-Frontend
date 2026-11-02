import { ScanFlow } from "@/components/scanner/scan-flow";

export const metadata = { title: "Putaway" };

export default function PutawayPage() {
  return <ScanFlow flow="putaway" />;
}
