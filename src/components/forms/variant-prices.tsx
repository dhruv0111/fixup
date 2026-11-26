"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AddCart } from "./sales";
export function VariantPrices({
  productId,
  targets,
}: {
  productId: string;
  targets: { id: string; label: string; variant: boolean }[];
}) {
  const [prices, setPrices] = useState<
    | {
        productId: string | null;
        variantId: string | null;
        amountPaise: number;
      }[]
    | null
  >(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [login, setLogin] = useState(false);
  const money = (paise: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(paise / 100);
  async function load() {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch(
        `/api/v1/me/prices?productId=${encodeURIComponent(productId)}`,
        { cache: "no-store" },
      );
      const body = await r.json();
      if (r.ok) {
        setPrices(body.data.prices);
        setMessage(
          `Your ${body.data.category === "APPROVED_DEALER" ? "approved dealer" : "retail"} prices.`,
        );
      } else {
        setLogin(r.status === 401);
        setPrices(null);
        setMessage(body.error?.message ?? "Prices unavailable.");
      }
    } catch {
      setMessage("Unable to load prices.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    // Load the signed-in customer's prices once so Add to cart is visible immediately.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);
  return (
    <section id="account-pricing" className="info-panel mt-8 scroll-mt-24">
      <h2 className="text-xl font-semibold">Order & account pricing</h2>
      <p className="my-3 text-sm text-muted">
        Sign in to compare pack sizes and your prices, then add items to your
        cart. Approved, active dealers see their dealer prices. Contact FIXUP
        for unlisted prices.
      </p>
      <button
        disabled={busy}
        onClick={load}
        className="button button-secondary"
      >
        {busy ? "Loading…" : "Check my prices"}
      </button>
      <p role="status" className="mt-3 text-sm">
        {message}
      </p>
      {login && (
        <Link href="/login" className="text-link">
          Sign in
        </Link>
      )}
      {prices && (
        <ul className="mt-4 divide-y divide-line">
          {targets.map((t) => {
            const entry = prices.find((p) =>
              t.variant ? p.variantId === t.id : p.productId === t.id,
            );
            return (
              <li key={t.id} className="flex justify-between gap-4 py-3">
                <span>{t.label}</span>
                <span>
                  {entry ? money(entry.amountPaise) : "Enquire for price"}
                  {entry && t.variant && <AddCart variantId={t.id} />}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
