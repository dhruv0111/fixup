import { ManagedForm, type Field } from "@/components/forms/managed-form";
import { reasonField } from "@/components/management/fields";
export function SupplierForm({
  variants,
  initial,
}: {
  variants: { id: string; name: string }[];
  initial?: Record<string, unknown> & { id: string; version: number };
}) {
  const fields: Field[] = [
    { name: "name", label: "Supplier name", required: true },
    { name: "contactName", label: "Contact person", required: true },
    { name: "phone", label: "Mobile number", type: "tel", required: true },
    { name: "email", label: "Email address", type: "email", required: true },
    { name: "address", label: "Business address", required: true },
    { name: "city", label: "City", required: true },
    { name: "state", label: "State", required: true },
    { name: "postalCode", label: "PIN code", required: true },
    { name: "gstin", label: "GSTIN (optional)", nullable: true },
    { name: "supplierType", label: "Supplier type", required: true },
    {
      name: "paymentTerms",
      label: "Payment terms (optional)",
      type: "textarea",
    },
    { name: "notes", label: "Internal notes", type: "textarea" },
    {
      name: "status",
      label: "Supplier status",
      type: "select",
      options: ["ACTIVE", "INACTIVE", "BLOCKED"].map((s) => ({
        value: s,
        label: s,
      })),
    },
    {
      name: "variantIds",
      label: "Products / variants supplied (optional)",
      type: "multi-select",
      options: variants.map((v) => ({ value: v.id, label: v.name })),
      hint: "Select supplied variants. Use Ctrl/Cmd to select more than one.",
    },
    reasonField,
  ];
  return (
    <ManagedForm
      url={`/api/v1/admin/operations/suppliers${initial ? `/${initial.id}` : ""}`}
      method={initial ? "PATCH" : "POST"}
      fields={fields}
      initial={initial ?? { status: "ACTIVE" }}
      base={initial ? { version: initial.version } : {}}
      redirectTo={initial ? undefined : "/admin/operations/suppliers"}
      submitLabel={initial ? "Save supplier" : "Create supplier"}
    />
  );
}
