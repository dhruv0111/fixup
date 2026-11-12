import { AuthShell } from "@/components/layout/auth-shell";
import { RecoveryForm } from "@/components/forms/recovery-form";

export const metadata = { title: "Password recovery" };
export default function ForgotPage() {
  return (
    <AuthShell
      title="Back to your account."
      description="Enter your account email to request a password reset link."
    >
      <RecoveryForm />
    </AuthShell>
  );
}
