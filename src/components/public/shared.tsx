import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import type { PublicProduct } from "@/modules/catalogue/service";
import { whatsappUrl, generalMessage } from "@/modules/catalogue/content";

export function PageIntro({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-intro">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <div className="intro-copy">{children}</div>
    </header>
  );
}
export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty-state">{children}</div>;
}
export function WhatsAppLink({
  number,
  message = generalMessage,
  children = "Chat on WhatsApp",
}: {
  number: string;
  message?: string;
  children?: ReactNode;
}) {
  const href = whatsappUrl(number, message);
  return href ? (
    <a
      className="button button-secondary"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
      <span className="sr-only"> (opens a new tab)</span> ↗
    </a>
  ) : (
    <p className="text-sm text-muted">
      WhatsApp contact will be available once confirmed.
    </p>
  );
}
export function ProductVisual({ product }: { product: PublicProduct }) {
  const img = product.images[0];
  return (
    <div className="product-visual">
      {img ? (
        <Image
          src={img.url}
          alt={img.alt}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-contain p-7"
        />
      ) : (
        <div className="image-placeholder">
          <span aria-hidden="true" className="placeholder-mark">
            F.
          </span>
          <span>Product image awaiting approval</span>
          {product.isDemo && <small>Development placeholder</small>}
        </div>
      )}
    </div>
  );
}
export function ProductCard({ product }: { product: PublicProduct }) {
  return (
    <article className="product-card">
      <Link
        href={`/products/${product.slug}`}
        aria-label={`View ${product.name}`}
      >
        <ProductVisual product={product} />
      </Link>
      <div className="p-6">
        {product.isDemo && <p className="badge mb-3">DEMO · NOT FOR SALE</p>}
        <p className="eyebrow">
          {product.brand} / {product.category.name}
        </p>
        <h3 className="mt-3 text-xl font-semibold">
          <Link href={`/products/${product.slug}`}>{product.name}</Link>
        </h3>
        <p className="mt-2 text-xs text-muted">
          SKU {product.sku} · {product.packSize}
        </p>
        <p className="my-4 text-sm leading-6 text-muted">{product.summary}</p>
        <div className="flex flex-wrap gap-4">
          <Link className="text-link" href={`/products/${product.slug}`}>
            View details →
          </Link>
          <Link
            className="text-link"
            href={`/contact?product=${encodeURIComponent(product.slug)}`}
          >
            Enquire
          </Link>
        </div>
      </div>
    </article>
  );
}
export function ProductGrid({ products }: { products: PublicProduct[] }) {
  return products.length ? (
    <div className="product-grid">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  ) : (
    <EmptyState>
      <h3 className="text-xl font-semibold">
        Our catalogue is being prepared.
      </h3>
      <p className="mt-2">
        Approved products will appear here. Tell us what you need and we’ll help
        with your enquiry.
      </p>
      <Link className="text-link mt-4 inline-block" href="/contact">
        Contact FIXUP →
      </Link>
    </EmptyState>
  );
}
