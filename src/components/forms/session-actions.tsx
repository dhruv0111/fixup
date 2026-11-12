"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/server/auth/client";

export function SignOutButton({ all = false }: { all?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    setPending(true);
    setError("");
    try {
      const result = all
        ? await authClient.revokeSessions()
        : await authClient.signOut();
      if (result.error) {
        setError("Could not sign out. Please try again.");
        return;
      }
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Connection unavailable. Please try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <span>
      <button
        type="button"
        className={
          all
            ? "button button-secondary"
            : "min-h-11 underline underline-offset-4"
        }
        disabled={pending}
        onClick={signOut}
      >
        {pending ? "Signing out…" : all ? "Sign out all devices" : "Sign out"}
      </button>
      {error && (
        <span role="alert" className="block text-sm text-red-800">
          {error}
        </span>
      )}
    </span>
  );
}
