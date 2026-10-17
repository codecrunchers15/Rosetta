import type { Metadata } from "next";
import { RoleHome } from "@/components/dashboards";

export const metadata: Metadata = { title: "Home" };

export default function AppHome() {
  return <RoleHome />;
}
