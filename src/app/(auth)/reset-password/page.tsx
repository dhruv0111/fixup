import { AuthShell } from "@/components/layout/auth-shell";
import { RecoveryForm } from "@/components/forms/recovery-form";

export const metadata = {
  title: "Reset password",
  referrer: "no-referrer" as const,
};
export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <AuthShell
      title="A fresh start."
      description="Choose a new password of at least 12 characters. Your other sessions will be signed out."
    >
      <RecoveryForm reset token={token} />
    </AuthShell>
  );
}
