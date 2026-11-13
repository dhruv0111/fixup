import Link from "next/link";
import { listProducts, listCategories } from "@/modules/catalogue/service";
import { catalogueQuery } from "@/modules/catalogue/validation";
import { PageIntro, ProductGrid } from "@/components/public/shared";
import { pageMetadata } from "@/modules/catalogue/seo";
type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
export function generateMetadata() {
  return pageMetadata(
    "Product Catalogue",
    "Explore approved adhesive products by name, SKU or category and enquire with FIXUP.",
    "/products",
  );
}
export default async function ProductsPage({ searchParams }: Props) {
  const parsed = catalogueQuery.safeParse(await searchParams);
  const filters = parsed.success
    ? parsed.data
    : { q: "", category: "", page: 1 };
  const [result, categories] = await Promise.all([
    listProducts(filters),
    listCategories(),
  ]);
  const href = (page: number) =>
    `/products?${new URLSearchParams({ q: filters.q, category: filters.category, page: String(page) })}`;
  return (
    <main id="main" className="container pb-20">
      <PageIntro
        eyebrow="THE FIXUP CATALOGUE"
        title="The right product starts here."
      >
        Explore approved product information. Ask us about availability,
        quantities and your requirements.
      </PageIntro>
      <form action="/products" className="catalogue-filters">
        <div>
          <label className="label" htmlFor="q">
            Search products
          </label>
          <input
            className="field"
            id="q"
            name="q"
            maxLength={100}
            defaultValue={filters.q}
            placeholder="Product, brand or SKU"
          />
        </div>
        <div>
          <label className="label" htmlFor="category">
            Category
          </label>
          <select
            className="field"
            id="category"
            name="category"
            defaultValue={filters.category}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
                {c.isDemo ? " (Demo)" : ""}
              </option>
            ))}
          </select>
        </div>
        <button className="button" type="submit">
          Find products
        </button>
        <Link className="text-link" href="/products">
          Clear
        </Link>
      </form>
      {!parsed.success && (
        <p role="alert" className="mb-5">
          Invalid filters were cleared. Please try your search again.
        </p>
      )}
      <p className="my-6 text-sm text-muted">
        {result.total} product{result.total === 1 ? "" : "s"} found
      </p>
      {result.total === 0 && (filters.q || filters.category) ? (
        <div className="empty-state">
          <h2>No matching products</h2>
          <p>Try another search or clear the filters.</p>
        </div>
      ) : (
        <ProductGrid products={result.products} />
      )}
      {result.pages > 1 && (
        <nav
          aria-label="Catalogue pagination"
          className="mt-10 flex flex-wrap items-center justify-center gap-6"
        >
          {filters.page > 1 && (
            <Link
              className="button button-secondary"
              href={href(filters.page - 1)}
            >
              Previous
            </Link>
          )}
          <span>
            Page {filters.page} of {result.pages}
          </span>
          {filters.page < result.pages && (
            <Link
              className="button button-secondary"
              href={href(filters.page + 1)}
            >
              Next
            </Link>
          )}
        </nav>
      )}
    </main>
  );
}
