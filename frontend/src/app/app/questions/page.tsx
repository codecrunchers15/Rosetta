import type { Metadata } from "next";
import { QuestionsList } from "@/components/questions";

export const metadata: Metadata = { title: "Questions" };

export default function QuestionsPage() {
  return <QuestionsList />;
}
