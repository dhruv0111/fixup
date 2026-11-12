import { AuthShell } from "@/components/layout/auth-shell";
import { AuthForm } from "@/components/forms/auth-form";

export const metadata = { title: "Create account" };
export default function RegisterPage() {
  return (
    <AuthShell
      title="Let’s get connected."
      description="Create your personal FIXUP account. Business and dealer access is reviewed separately."
    >
      <AuthForm mode="register" />
    </AuthShell>
  );
}
