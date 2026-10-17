import type { Metadata } from "next";
import { CardView } from "@/components/card-view";

export const metadata: Metadata = { title: "Explained commit" };

export default async function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CardView id={id} />;
}
