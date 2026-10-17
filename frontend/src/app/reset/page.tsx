import type { Metadata } from "next";
import { Suspense } from "react";
import { Nav } from "@/components/nav";
import { ResetForm } from "@/components/password-reset";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPage() {
  return (
    <>
      <Nav>
        <ThemeToggle />
      </Nav>
      <Suspense>
        <ResetForm />
      </Suspense>
    </>
  );
}
