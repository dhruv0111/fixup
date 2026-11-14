"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/server/auth/client";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const register = mode === "register";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    setPending(true);
    try {
      const email = String(form.get("email")).trim().toLowerCase();
      const password = String(form.get("password"));
      const result = register
        ? await authClient.signUp.email({
            name: String(form.get("name")).trim(),
            email,
            password,
          })
        : await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(
          result.error.status === 429
            ? "Too many attempts. Please wait a minute and try again."
            : register
              ? "We couldn’t create the account. Check your details, or sign in if you already have an account."
              : "Unable to sign in. Check your email and password.",
        );
        return;
      }
      if (
        result.data &&
        "twoFactorRedirect" in result.data &&
        result.data.twoFactorRedirect
      ) {
        router.replace("/two-factor");
        router.refresh();
        return;
      }
      router.replace("/account");
      router.refresh();
    } catch {
      setError("Connection unavailable. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" aria-busy={pending}>
      {register && (
        <div>
          <label className="label" htmlFor="name">
            Full name
          </label>
          <input
            className="field"
            id="name"
            name="name"
            autoComplete="name"
            minLength={2}
            maxLength={100}
            required
          />
        </div>
      )}
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
          maxLength={254}
          required
        />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          className="field"
          id="password"
          name="password"
          type="password"
          autoComplete={register ? "new-password" : "current-password"}
          minLength={register ? 12 : undefined}
          maxLength={128}
          aria-describedby={register ? "password-help" : undefined}
          required
        />
        {register && (
          <p id="password-help" className="mt-2 text-xs text-muted">
            Use at least 12 characters. A memorable passphrase works well.
          </p>
        )}
      </div>
      {!register && (
        <Link
          href="/forgot-password"
          className="inline-block text-sm underline underline-offset-4"
        >
          Forgot your password?
        </Link>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-md bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      <button className="button w-full" disabled={pending} type="submit">
        {pending ? "Please wait…" : register ? "Create account" : "Sign in"}
        <span aria-hidden="true">→</span>
      </button>
      <p className="text-center text-sm text-muted">
        {register ? "Already have an account?" : "New to FIXUP?"}{" "}
        <Link
          className="font-semibold text-ink underline underline-offset-4"
          href={register ? "/login" : "/register"}
        >
          {register ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}
