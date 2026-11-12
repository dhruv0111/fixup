"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { authClient } from "@/server/auth/client";

export function RecoveryForm({
  token,
  reset = false,
}: {
  token?: string;
  reset?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      const result = reset
        ? await authClient.resetPassword({
            token: token ?? "",
            newPassword: String(data.get("password")),
          })
        : await authClient.requestPasswordReset({
            email: String(data.get("email")).trim().toLowerCase(),
            redirectTo: `${window.location.origin}/reset-password`,
          });
      if (result.error) {
        setError(
          reset
            ? "This reset link is invalid or expired. Request a new link."
            : "Could not process the request. Please try again later.",
        );
        return;
      }
      setMessage(
        reset
          ? "Your password has been reset. Sign in with your new password."
          : "If that email has an account, a password reset message will be sent.",
      );
    } catch {
      setError("Connection unavailable. Please try again.");
    } finally {
      setPending(false);
    }
  }
  if (reset && !token)
    return (
      <p role="alert">
        A valid reset link is required.{" "}
        <Link href="/forgot-password" className="underline">
          Request a new link.
        </Link>
      </p>
    );
  return (
    <form onSubmit={submit} className="space-y-5" aria-busy={pending}>
      {reset ? (
        <div>
          <label className="label" htmlFor="password">
            New password
          </label>
          <input
            className="field"
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
          />
        </div>
      ) : (
        <div>
          <label className="label" htmlFor="email">
            Email address
          </label>
          <input
            className="field"
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="rounded-md bg-green-50 p-3 text-sm text-green-900"
        >
          {message}
        </p>
      )}
      <button
        type="submit"
        className="button w-full"
        disabled={pending || (reset && Boolean(message))}
      >
        {pending
          ? "Please wait…"
          : reset
            ? "Reset password"
            : "Send reset link"}
      </button>
      <Link href="/login" className="block text-center text-sm underline">
        Back to sign in
      </Link>
    </form>
  );
}
