import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";
import { Nav } from "@/components/nav";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <>
      <Nav>
        <ThemeToggle />
      </Nav>
      <Suspense>
        <LoginForm />
      </Suspense>
    </>
  );
}
