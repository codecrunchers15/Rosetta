import type { Metadata } from "next";
import { Nav } from "@/components/nav";
import { ForgotForm } from "@/components/password-reset";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPage() {
  return (
    <>
      <Nav>
        <ThemeToggle />
      </Nav>
      <ForgotForm />
    </>
  );
}
