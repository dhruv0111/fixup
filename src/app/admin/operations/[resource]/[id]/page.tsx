import Link from "next/link";
import { notFound } from "next/navigation";
import { pageActor, Workspace, History } from "@/components/management/shared";
import { ManagedForm } from "@/components/forms/managed-form";
import { reasonField } from "@/components/management/fields";
import { OperationsNav, DataTable, money } from "@/components/inventory/shared";
import { SupplierForm } from "@/components/inventory/supplier-form";
import { PurchaseEditor, ReceiptEditor } from "@/components/inventory/editors";
import { purchaseDetail, receiptDetail } from "@/modules/inventory/service";
import {
  options,
  supplierDetail,
  internalHistory,
  stockRows,
  report,
  lotDetail,
} from "@/modules/inventory/read";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/http/errors";
async function load<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
}
function Action({
  resource,
  id,
  version,
  action,
  label,
}: {
  resource: string;
  id: string;
  version: number;
  action: string;
  label: string;
}) {
  return (
    <section className="info-panel">
      <h2 className="mb-4 text-xl font-semibold">{label}</h2>
      <ManagedForm
        url={`/api/v1/admin/operations/${resource}/${id}`}
        base={{ version, action }}
        fields={[
          reasonField,
          {
            name: "confirmed",
            label: "I confirm this action and have reviewed the details",
            type: "checkbox",
            required: true,
          },
        ]}
        submitLabel={label}
      />
    </section>
  );
}
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ resource: string; id: string }>;
  searchParams: Promise<{ purchaseOrderId?: string }>;
}) {
  const { resource, id } = await params;
  const actor = await pageActor("inventory.read");
  const db = getDb();
  if (resource === "suppliers") {
    const choices = await options(actor);
    const supplier =
      id === "new" ? null : await load(supplierDetail(actor, id));
    return (
      <Workspace admin title={supplier?.name ?? "Add supplier"}>
        <OperationsNav />
        <section className="info-panel">
          <SupplierForm
            variants={choices.variants}
            initial={
              supplier
                ? {
                    ...supplier,
                    variantIds: supplier.variants.map((v) => v.variantId),
                  }
                : undefined
            }
          />
        </section>
        {supplier && (
          <>
            <h2 className="text-xl font-semibold">Products supplied</h2>
            <DataTable
              rows={supplier.variants.map((v) => ({
                product: v.variant.product.name,
                variant: v.variant.name,
                pack: v.variant.packSize,
              }))}
            />
            <h2 className="text-xl font-semibold">Purchase history</h2>
            <p className="text-sm text-muted">
              Most recent 100 purchase orders. Use the filtered report for more
              history.
            </p>
            <Link
              className="text-link"
              href={`/admin/operations/reports?kind=purchases&supplierId=${id}`}
            >
              Supplier purchase report
            </Link>
            {supplier.purchases.map((p) => (
              <Link
                className="text-link block"
                key={p.id}
                href={`/admin/operations/purchase-orders/${p.id}`}
              >
                {p.number} · {p.status} · {money(p.totalPaise)}
              </Link>
            ))}
            <History events={await internalHistory(actor, id)} />
          </>
        )}
      </Workspace>
    );
  }
  if (resource === "purchase-orders") {
    if (id === "new") {
      const choices = await options(actor);
      return (
        <Workspace admin title="Create purchase order">
          <OperationsNav />
          <section className="info-panel">
            <PurchaseEditor {...choices} />
          </section>
        </Workspace>
      );
    }
    const p = await load(purchaseDetail(actor, id));
    const snapshot = p.supplierSnapshot as Record<string, unknown>;
    return (
      <Workspace admin title={p.number}>
        <OperationsNav />
        <p className="badge">{p.status}</p>
        <p>
          PO date:{" "}
          {p.createdAt.toLocaleDateString("en-IN", {
            timeZone: "Asia/Kolkata",
          })}{" "}
          · Expected:{" "}
          {p.expectedDate?.toISOString().slice(0, 10) ?? "Not supplied"}
        </p>
        <section className="info-panel">
          <h2 className="text-xl font-semibold">
            Supplier at time of purchase
          </h2>
          <DataTable rows={[snapshot]} />
          <p className="mt-4 whitespace-pre-wrap">
            Internal notes: {p.notes || "None"}
          </p>
        </section>
        <DataTable
          rows={p.lines.map((l) => ({
            product: l.productName,
            variant: l.variantName,
            pack: l.packSize,
            sku: l.sku,
            ordered: l.quantity,
            received: l.receivedQuantity,
            remaining: l.quantity - l.receivedQuantity,
            ratePaise: l.ratePaise,
            taxBps: l.taxBps,
            discountPaise: l.discountPaise,
            taxPaise: l.taxPaise,
            totalPaise: l.totalPaise,
          }))}
        />
        <section className="info-panel">
          <h2 className="text-xl font-semibold">Server-calculated totals</h2>
          <p>
            Subtotal: {money(p.subtotalPaise)} · Discount:{" "}
            {money(p.discountPaise)} · Tax: {money(p.taxPaise)}
          </p>
          <p className="mt-3 text-2xl font-semibold">
            Total: {money(p.totalPaise)}
          </p>
          <p className="mt-3 text-sm text-muted">
            No stock is created by this purchase order.
          </p>
        </section>
        {p.status === "DRAFT" && (
          <>
            <details className="info-panel">
              <summary className="cursor-pointer font-semibold">
                Edit PO draft
              </summary>
              <div className="mt-6">
                <PurchaseEditor
                  {...await options(actor)}
                  initial={{
                    id: p.id,
                    requestId: p.requestId,
                    supplierId: p.supplierId,
                    expectedDate:
                      p.expectedDate?.toISOString().slice(0, 10) ?? "",
                    notes: p.notes,
                    version: p.version,
                    lines: p.lines,
                  }}
                />
              </div>
            </details>
            <Action
              resource={resource}
              id={id}
              version={p.version}
              action="SUBMIT"
              label="Submit purchase order"
            />
          </>
        )}
        {["DRAFT", "SUBMITTED"].includes(p.status) && (
          <Action
            resource={resource}
            id={id}
            version={p.version}
            action="CANCEL"
            label="Cancel purchase order"
          />
        )}
        {["SUBMITTED", "PARTIALLY_RECEIVED"].includes(p.status) && (
          <Link
            className="button"
            href={`/admin/operations/goods-receiving/new?purchaseOrderId=${id}`}
          >
            Receive goods
          </Link>
        )}
        <h2 className="text-xl font-semibold">Receiving history</h2>
        {p.receipts.map((r) => (
          <Link
            className="text-link block"
            href={`/admin/operations/goods-receiving/${r.id}`}
            key={r.id}
          >
            {r.number} · {r.status} ·{" "}
            {r.invoiceReference || "No invoice reference"}
          </Link>
        ))}
        <History events={await internalHistory(actor, id)} />
      </Workspace>
    );
  }
  if (resource === "goods-receiving") {
    if (id === "new") {
      const query = await searchParams;
      const pos = await db.purchaseOrder.findMany({
        where: { status: { in: ["SUBMITTED", "PARTIALLY_RECEIVED"] } },
        select: { id: true, number: true },
        orderBy: { createdAt: "desc" },
        take: 1000,
      });
      const p = query.purchaseOrderId
        ? await load(purchaseDetail(actor, query.purchaseOrderId))
        : null;
      return (
        <Workspace admin title="Create GRN draft">
          <OperationsNav />
          <form className="management-form flex flex-wrap items-end gap-4">
            <label>
              Purchase order
              <select
                name="purchaseOrderId"
                defaultValue={query.purchaseOrderId ?? ""}
              >
                <option value="">Choose outstanding PO</option>
                {pos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.number}
                  </option>
                ))}
              </select>
            </label>
            <button className="button">Open purchase order</button>
          </form>
          {p && ["SUBMITTED", "PARTIALLY_RECEIVED"].includes(p.status) && (
            <section className="info-panel">
              <h2 className="mb-5 text-xl font-semibold">{p.number}</h2>
              <ReceiptEditor
                purchaseOrderId={p.id}
                lines={p.lines
                  .filter((l) => l.receivedQuantity < l.quantity)
                  .map((l) => ({
                    id: l.id,
                    name: l.variantName,
                    remaining: l.quantity - l.receivedQuantity,
                  }))}
              />
            </section>
          )}
        </Workspace>
      );
    }
    const r = await load(receiptDetail(actor, id));
    return (
      <Workspace admin title={r.number}>
        <OperationsNav />
        <p className="badge">{r.status}</p>
        <Link
          href={`/admin/operations/purchase-orders/${r.purchaseOrderId}`}
          className="text-link"
        >
          {r.purchaseOrder.number}
        </Link>
        <p>
          Supplier invoice/reference: {r.invoiceReference || "Not supplied"}
        </p>
        <p>
          Created by {r.createdById} ·{" "}
          {r.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
        </p>
        {r.completedAt && (
          <p>
            Received by {r.completedById} ·{" "}
            {r.completedAt.toLocaleString("en-IN", {
              timeZone: "Asia/Kolkata",
            })}
          </p>
        )}
        {r.reversedAt && (
          <p>
            Reversed by {r.reversedById}: {r.correctionReason}
          </p>
        )}
        <p>Internal notes: {r.notes || "None"}</p>
        <DataTable
          rows={r.lines.map((l) => ({
            variant: l.purchaseLine.variantName,
            quantity: l.quantity,
            batch: l.batchNumber,
            manufactured: l.manufacturedAt?.toISOString().slice(0, 10) ?? null,
            expiry: l.expiresAt?.toISOString().slice(0, 10) ?? null,
            lot: l.lot?.id ?? null,
          }))}
        />
        {r.status === "DRAFT" && (
          <>
            <details className="info-panel">
              <summary className="cursor-pointer font-semibold">
                Edit GRN draft
              </summary>
              <div className="mt-6">
                <ReceiptEditor
                  purchaseOrderId={r.purchaseOrderId}
                  initial={{
                    id: r.id,
                    requestId: r.requestId,
                    invoiceReference: r.invoiceReference,
                    notes: r.notes,
                    version: r.version,
                  }}
                  lines={r.purchaseOrder.lines
                    .filter((l) => l.receivedQuantity < l.quantity)
                    .map((l) => {
                      const saved = r.lines.find(
                        (s) => s.purchaseLineId === l.id,
                      );
                      return {
                        id: l.id,
                        name: l.variantName,
                        remaining: l.quantity - l.receivedQuantity,
                        quantity: saved?.quantity,
                        batchNumber: saved?.batchNumber,
                        manufacturedAt: saved?.manufacturedAt
                          ?.toISOString()
                          .slice(0, 10),
                        expiresAt: saved?.expiresAt?.toISOString().slice(0, 10),
                      };
                    })}
                />
              </div>
            </details>
            <p className="text-sm text-muted">
              Review the actual received quantities and batch dates.
              Confirmation adds stock exactly once.
            </p>
            <Action
              resource={resource}
              id={id}
              version={r.version}
              action="CONFIRM"
              label="Confirm goods received"
            />
            <Action
              resource={resource}
              id={id}
              version={r.version}
              action="CANCEL"
              label="Cancel GRN draft"
            />
          </>
        )}
        {r.status === "COMPLETED" &&
          actor.permissions.includes("inventory.reverse") && (
            <>
              <p className="text-sm text-muted">
                Reversal is restricted to Super Admin and requires all received
                units to remain available in their original lots.
              </p>
              <Action
                resource={resource}
                id={id}
                version={r.version}
                action="REVERSE"
                label="Reverse completed receipt"
              />
            </>
          )}
        {r.lines
          .filter((l) => l.lot)
          .map((l) => (
            <Link
              className="text-link block"
              key={l.id}
              href={`/admin/operations/lots/${l.lot!.id}`}
            >
              View {l.purchaseLine.variantName} batch traceability
            </Link>
          ))}
        <History events={await internalHistory(actor, id)} />
      </Workspace>
    );
  }
  if (resource === "inventory") {
    const rows = await stockRows(actor, { variantId: id });
    if (!rows.length) notFound();
    const r = rows[0];
    return (
      <Workspace admin title={`${r.variant} inventory`}>
        <OperationsNav />
        <DataTable rows={rows} />
        <section className="info-panel">
          <h2 className="mb-4 text-xl font-semibold">
            Minimum stock threshold
          </h2>
          <ManagedForm
            key={r.settingVersion}
            url={`/api/v1/admin/operations/thresholds/${id}`}
            method="PATCH"
            initial={{ minimumQuantity: r.minimumQuantity }}
            base={{ version: r.settingVersion }}
            fields={[
              {
                name: "minimumQuantity",
                label: "Minimum units (blank disables low-stock threshold)",
                type: "number",
                nullable: true,
                min: 0,
                max: 2000000000,
              },
              reasonField,
            ]}
          />
        </section>
        <h2 className="text-xl font-semibold">Batches and lots</h2>
        <DataTable
          rows={await report(actor, { kind: "batches", variantId: id })}
        />
        {(
          await db.stockLot.findMany({ where: { variantId: id }, take: 100 })
        ).map((l) => (
          <Link
            className="text-link block"
            key={l.id}
            href={`/admin/operations/lots/${l.id}`}
          >
            {l.batchNumber ?? "Unbatched lot"} · {l.id}
          </Link>
        ))}
        <History events={await internalHistory(actor, id)} />
      </Workspace>
    );
  }
  if (resource === "lots") {
    const l = await load(lotDetail(actor, id));
    return (
      <Workspace
        admin
        title={`${l.variant.name} / ${l.batchNumber ?? "Unbatched lot"}`}
      >
        <OperationsNav />
        <DataTable
          rows={[
            {
              lot: l.id,
              variant: l.variant.name,
              product: l.variant.product.name,
              available: l.available,
              damaged: l.damaged,
              manufactured:
                l.manufacturedAt?.toISOString().slice(0, 10) ?? null,
              expiry: l.expiresAt?.toISOString().slice(0, 10) ?? null,
              grn: l.receiptLine?.receipt.number ?? null,
              supplier:
                l.receiptLine?.receipt.purchaseOrder.supplier.name ?? null,
            },
          ]}
        />
        <DataTable
          rows={(
            await report(actor, { kind: "movements", variantId: l.variantId })
          ).filter((m) => m.lotId === id)}
        />
      </Workspace>
    );
  }
  notFound();
}
