import type { Metadata } from "next";
import { Suspense } from "react";
import { JoinForm } from "@/components/join-form";
import { Nav } from "@/components/nav";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = { title: "Join your team" };

export default function JoinPage() {
  return (
    <>
      <Nav>
        <ThemeToggle />
      </Nav>
      <Suspense>
        <JoinForm />
      </Suspense>
    </>
  );
}
