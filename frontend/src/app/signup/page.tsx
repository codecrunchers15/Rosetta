import type { Metadata } from "next";
import { Nav } from "@/components/nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { WorkspaceForm } from "@/components/workspace-form";

export const metadata: Metadata = { title: "Create a workspace" };

export default function SignupPage() {
  return (
    <>
      <Nav>
        <ThemeToggle />
      </Nav>
      <WorkspaceForm />
    </>
  );
}
