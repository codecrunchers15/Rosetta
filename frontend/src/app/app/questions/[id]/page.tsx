import type { Metadata } from "next";
import { QuestionThread } from "@/components/questions";

export const metadata: Metadata = { title: "Question" };

export default async function QuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <QuestionThread id={id} />;
}
