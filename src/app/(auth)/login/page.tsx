import { AuthShell } from "@/components/layout/auth-shell";
import { AuthForm } from "@/components/forms/auth-form";

export const metadata = { title: "Sign in" };
export default function LoginPage() {
  return (
    <AuthShell
      title="Good to see you again."
      description="Sign in to your FIXUP account to view your profile and manage your access."
    >
      <AuthForm mode="login" />
    </AuthShell>
  );
}
