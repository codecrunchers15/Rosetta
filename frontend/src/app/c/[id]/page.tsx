import { redirect } from "next/navigation";

export default async function OldCardPage({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/app/c/${(await params).id}`);
}
