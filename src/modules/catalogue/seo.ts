import type { Metadata } from "next";
import { getEnv } from "@/config/env";
export function siteUrl(path = "/") {
  return new URL(path, getEnv().BETTER_AUTH_URL).toString();
}
export function pageMetadata(
  title: string,
  description: string,
  path: string,
): Metadata {
  return {
    title,
    description,
    alternates: { canonical: siteUrl(path) },
    openGraph: {
      title: `${title} | FIXUP`,
      description,
      url: siteUrl(path),
      siteName: "FIXUP",
      type: "website",
      locale: "en_IN",
    },
    robots: { index: false, follow: false },
  };
}
