import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getPublicProduct, getWebsite } from "@/modules/catalogue/service";
import { ProductVisual, WhatsAppLink } from "@/components/public/shared";
import { productMessage } from "@/modules/catalogue/content";
import { pageMetadata, siteUrl } from "@/modules/catalogue/seo";
import { VariantPrices } from "@/components/forms/variant-prices";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props) {
  const product = await getPublicProduct((await params).slug);
  if (!product) return { title: "Product not found", robots: { index: false } };
  const metadata = pageMetadata(
    product.name,
    product.summary,
    `/products/${product.slug}`,
  );
  return {
    ...metadata,
    openGraph: {
      ...metadata.openGraph,
      images: product.images.map((i) => ({ url: siteUrl(i.url), alt: i.alt })),
    },
  };
}
export default async function ProductPage({ params }: Props) {
  const product = await getPublicProduct((await params).slug);
  if (!product) notFound();
  const site = await getWebsite();
  const specs = Array.isArray(product.specifications)
    ? product.specifications.filter(
        (s): s is { label: string; value: string } =>
          !!s &&
          typeof s === "object" &&
          !Array.isArray(s) &&
          typeof s.label === "string" &&
          typeof s.value === "string",
      )
    : [];
  const structured = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.sku,
    description: product.summary,
    brand: { "@type": "Brand", name: product.brand },
    url: siteUrl(`/products/${product.slug}`),
    ...(product.images.length
      ? { image: product.images.map((i) => siteUrl(i.url)) }
      : {}),
  };
  return (
    <main id="main" className="container py-10 sm:py-16">
      {!product.isDemo && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structured).replace(/</g, "\\u003c"),
          }}
        />
      )}
      <Link href="/products" className="text-link">
        ← Product catalogue
      </Link>
      <div className="product-detail mt-8">
        <div>
          <ProductVisual product={product} />
          {product.images.length > 1 && (
            <div className="mt-4 grid grid-cols-3 gap-3">
              {product.images.slice(1).map((img) => (
                <Image
                  key={img.url}
                  src={img.url}
                  alt={img.alt}
                  width={300}
                  height={300}
                  className="rounded-lg border border-line object-contain"
                />
              ))}
            </div>
          )}
        </div>
        <div>
          {product.isDemo && (
            <p className="badge">DEVELOPMENT DEMO · NOT FOR SALE</p>
          )}
          <p className="eyebrow mt-4">
            {product.brand} / {product.category.name}
          </p>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
            {product.name}
          </h1>
          <p className="mt-4 text-sm text-muted">
            {product.sku ? `SKU: ${product.sku} · ` : ""}Pack size:{" "}
            {product.packSize}
          </p>
          <p className="body-copy">{product.summary}</p>
          <p className="mb-6 text-sm font-medium">
            {product.availability === "UNAVAILABLE"
              ? "Currently unavailable"
              : product.availability === "AVAILABLE_ON_REQUEST"
                ? "Available on request — please confirm"
                : "Enquire for availability"}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              className="button"
              href={`/contact?product=${encodeURIComponent(product.slug)}`}
            >
              Enquire about this product ↗
            </Link>
            <WhatsAppLink
              number={site.whatsapp}
              message={productMessage(product)}
            />
          </div>
          <p className="mt-5 text-xs text-muted">
            Supplied through FIXUP. Product brand: {product.brand}. Confirm
            suitability using approved manufacturer documentation.
          </p>
        </div>
      </div>
      {product.variants.length > 0 && (
        <section className="mt-12" aria-label="Available variants">
          <h2 className="text-2xl font-semibold">Available pack sizes</h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {product.variants.map((v) => (
              <article
                key={v.id}
                className="overflow-hidden rounded-xl border border-line bg-white"
              >
                <div className="relative aspect-[4/3] bg-white">
                  {v.imageUrl ? (
                    <Image
                      src={v.imageUrl}
                      alt={v.imageAlt}
                      fill
                      sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 22vw"
                      className="object-contain"
                    />
                  ) : (
                    <p className="p-6 text-sm text-muted">
                      Pack photograph awaited
                    </p>
                  )}
                </div>
                <div className="p-5">
                  <h3 className="text-xl font-semibold">{v.packSize}</h3>
                  <p className="mt-2 text-sm">{v.name}</p>
                  {v.sku && <p className="mt-2 text-xs">SKU: {v.sku}</p>}
                  <p className="mt-3 text-xs text-muted">
                    {v.representative
                      ? `Representative imagery; not a photograph of the ${v.packSize} pack.`
                      : "Supplied packaging photograph."}
                  </p>
                  {v.mrpPaise !== null && (
                    <p className="mt-3 text-sm">
                      MRP:{" "}
                      {new Intl.NumberFormat("en-IN", {
                        style: "currency",
                        currency: "INR",
                      }).format(v.mrpPaise / 100)}
                    </p>
                  )}
                  <div className="mt-4">
                    <WhatsAppLink
                      number={site.whatsapp}
                      message={productMessage({
                        name: product.name,
                        sku: v.sku,
                        packSize: v.packSize,
                      })}
                    />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      <VariantPrices
        productId={product.id}
        targets={
          product.variants.length
            ? product.variants.map((v) => ({
                id: v.id,
                label: v.name,
                variant: true,
              }))
            : [{ id: product.id, label: product.name, variant: false }]
        }
      />
      {product.sourceNotes && (
        <section className="info-panel mt-8">
          <h2 className="text-xl font-semibold">
            About the supplied packaging
          </h2>
          <p className="mt-4 text-sm leading-7 text-muted">
            {product.sourceNotes}
          </p>
        </section>
      )}
      <div className="detail-sections">
        <section>
          <h2>Product description</h2>
          <p className="whitespace-pre-line">{product.description}</p>
        </section>
        <section>
          <h2>Approved applications</h2>
          {product.applications.length ? (
            <ul>
              {product.applications.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          ) : (
            <p>Application details are awaiting approved documentation.</p>
          )}
          <h3 className="mt-6 font-semibold">Compatible materials</h3>
          <p>
            {product.materials.join(", ") ||
              "Contact us for verified material compatibility."}
          </p>
        </section>
        <section>
          <h2>Specifications & storage</h2>
          {specs.length ? (
            <dl>
              {specs.map((s) => (
                <div className="spec-row" key={s.label}>
                  <dt>{s.label}</dt>
                  <dd>{s.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>No approved specifications have been published.</p>
          )}
          <p className="mt-5 whitespace-pre-line">
            {product.storageInstructions ||
              "Storage instructions are awaiting approved documentation."}
          </p>
        </section>
        <section>
          <h2>Technical documents</h2>
          {product.documents.length ? (
            <ul>
              {product.documents.map((d) => (
                <li key={`${d.kind}-${d.publicUrl}`}>
                  <a
                    className="text-link"
                    href={d.publicUrl!}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {d.title} ({d.kind}, PDF) ↗
                    <span className="sr-only"> opens a new tab</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p>No approved public TDS/SDS documents are available yet.</p>
          )}
        </section>
      </div>
    </main>
  );
}
