import Link from "next/link";
import { MfaChallenge } from "@/components/forms/account-security";
export const metadata = { title: "Verify sign in" };
export default function TwoFactorPage() {
  return (
    <main id="main" className="mx-auto min-h-[70vh] max-w-xl px-5 py-12">
      <h1 className="mb-6 text-3xl font-semibold">Verify sign in</h1>
      <MfaChallenge />
      <Link className="mt-6 block underline" href="/login">
        Back to sign in
      </Link>
    </main>
  );
}
