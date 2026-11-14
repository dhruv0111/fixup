"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

async function authPost(path: string, data: Record<string, unknown>) {
  const response = await fetch(`/api/auth/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? "Too many attempts. Wait before trying again."
        : "Verification failed. Check your details and try again.",
    );
  return result;
}

export function MfaChallenge() {
  const router = useRouter();
  const [backup, setBackup] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError("");
    const data = new FormData(e.currentTarget);
    try {
      await authPost(
        `two-factor/${backup ? "verify-backup-code" : "verify-totp"}`,
        { code: String(data.get("code")).trim(), trustDevice: false },
      );
      router.replace("/account");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification unavailable.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-5" aria-busy={pending}>
      <p>
        Enter{" "}
        {backup
          ? "one unused recovery code"
          : "the current code from your authenticator app"}
        . Password verification alone does not grant administrator access.
      </p>
      <label className="label" htmlFor="code">
        {backup ? "Recovery code" : "Authenticator code"}
      </label>
      <input
        className="field"
        id="code"
        name="code"
        autoComplete="one-time-code"
        required
        maxLength={backup ? 100 : 6}
        inputMode={backup ? "text" : "numeric"}
      />
      {error && <p role="alert">{error}</p>}
      <button className="button" disabled={pending}>
        Verify sign in
      </button>
      <button
        type="button"
        className="button button-secondary"
        onClick={() => {
          setBackup(!backup);
          setError("");
        }}
      >
        {backup ? "Use authenticator" : "Use a recovery code"}
      </button>
      <p className="text-sm text-muted">
        Lost both factors? Contact the verified account owner for the controlled
        recovery procedure. Password recovery does not remove MFA.
      </p>
    </form>
  );
}

export function AccountSecurityForm({
  email,
  emailVerified,
  mfaEnabled,
  mfaVerified,
}: {
  email: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  mfaVerified: boolean;
}) {
  const router = useRouter();
  const [setup, setSetup] = useState<{
    totpURI: string;
    backupCodes: string[];
  } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function run(action: () => Promise<void>) {
    setPending(true);
    setMessage("");
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Security action unavailable.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-7">
      <p>
        Administrator access requires verified email, confirmed authenticator
        enrollment and MFA verification for this session.
      </p>
      <section className="rounded-xl border border-line p-6">
        <h2 className="text-xl font-semibold">Email ownership</h2>
        <p>
          {emailVerified ? "Email verified." : "Email verification required."}
        </p>
        {!emailVerified && (
          <button
            className="button mt-4"
            disabled={pending}
            onClick={() =>
              run(async () => {
                await authPost("send-verification-email", {
                  email,
                  callbackURL: `${window.location.origin}/account/security`,
                });
                setMessage(
                  "Verification link requested. Check your email, then refresh this page.",
                );
              })
            }
          >
            Send verification link
          </button>
        )}
      </section>
      <section className="rounded-xl border border-line p-6 space-y-4">
        <h2 className="text-xl font-semibold">Authenticator security</h2>
        <p>
          {mfaEnabled
            ? "Authenticator enrollment confirmed."
            : "Set up a TOTP authenticator app using your current password."}{" "}
          {mfaVerified
            ? "This session has completed MFA."
            : "This session has not completed MFA."}
        </p>
        {!mfaEnabled && !setup && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const password = String(
                new FormData(e.currentTarget).get("password"),
              );
              e.currentTarget.reset();
              void run(async () => {
                const result = await authPost("two-factor/enable", {
                  password,
                  method: "totp",
                });
                setSetup(result);
              });
            }}
          >
            <label className="label" htmlFor="enroll-password">
              Current password
            </label>
            <input
              id="enroll-password"
              name="password"
              type="password"
              className="field"
              autoComplete="current-password"
              required
              maxLength={128}
            />
            <button className="button" disabled={pending}>
              Set up authenticator
            </button>
          </form>
        )}
        {setup && (
          <div className="space-y-4">
            <p>
              Add a time-based account in your authenticator app with this setup
              key. Keep it and your recovery codes private.
            </p>
            <p className="break-all" data-testid="authenticator-setup-key">
              {new URL(setup.totpURI).searchParams.get("secret")}
            </p>
            <p>
              Store these single-use recovery codes offline. They become usable
              only after authenticator confirmation.
            </p>
            <ul>
              {setup.backupCodes.map((code) => (
                <li key={code}>
                  <code>{code}</code>
                </li>
              ))}
            </ul>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                const code = String(new FormData(e.currentTarget).get("code"));
                void run(async () => {
                  await authPost("two-factor/verify-totp", {
                    code,
                    trustDevice: false,
                  });
                  setSetup(null);
                  setMessage(
                    "Authenticator confirmed. Recovery codes will no longer be displayed.",
                  );
                  router.refresh();
                });
              }}
            >
              <label className="label" htmlFor="enroll-code">
                Authenticator code
              </label>
              <input
                id="enroll-code"
                name="code"
                className="field"
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                required
                maxLength={6}
              />
              <button className="button" disabled={pending}>
                Confirm authenticator
              </button>
            </form>
          </div>
        )}
        {mfaEnabled && !mfaVerified && (
          <a className="button" href="/two-factor">
            Verify this session
          </a>
        )}
      </section>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
