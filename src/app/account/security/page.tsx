import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getActor } from "@/server/permissions/service";
import { AccountSecurityForm } from "@/components/forms/account-security";
export const metadata = { title: "Account security" };
export default async function SecurityPage() {
  const actor = await getActor(await headers());
  if (!actor) redirect("/login");
  return (
    <main id="main" className="mx-auto min-h-[70vh] max-w-3xl px-5 py-12">
      <h1 className="mb-6 text-3xl font-semibold">Account security</h1>
      <AccountSecurityForm email={actor.email} {...actor.security} />
    </main>
  );
}
