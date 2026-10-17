import type { Metadata } from "next";
import { Updates } from "@/components/updates";

export const metadata: Metadata = { title: "Engineer updates" };

export default function UpdatesPage() {
  return <Updates />;
}
