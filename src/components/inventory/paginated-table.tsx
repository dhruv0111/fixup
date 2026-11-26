"use client";
import { useState } from "react";
import { wordTone } from "@/components/orders/status";

export function PaginatedTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: string[][];
}) {
  const [page, setPage] = useState(1);
  const perPage = 25;
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const current = Math.min(page, pages);
  return (
    <div data-paginated-table>
      <div
        className="o-card o-scroll"
        tabIndex={0}
        role="region"
        aria-label="Report data"
      >
        <table className="o-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c} scope="col" className="whitespace-nowrap">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows
              .slice((current - 1) * perPage, current * perPage)
              .map((row, i) => (
                <tr key={`${current}-${i}`}>
                  {row.map((cell, j) => {
                    const flag = /^(low|out) stock|out of stock/i.test(
                      columns[j],
                    );
                    const tone =
                      flag && cell === "Yes"
                        ? /out/i.test(columns[j])
                          ? "red"
                          : "amber"
                        : /^status$/i.test(columns[j])
                          ? wordTone(cell)
                          : null;
                    return (
                      <td
                        key={j}
                        className={`max-w-xs break-words ${
                          /^-?[\d.,₹ ]+$/.test(cell) && cell.trim() ? "num" : ""
                        }`}
                      >
                        {tone ? (
                          <span className={`status-badge status-${tone}`}>
                            {flag ? "Yes" : cell}
                          </span>
                        ) : (
                          cell
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <nav
        aria-label="Table pages"
        className="my-4 flex flex-wrap items-center gap-3"
      >
        <p role="status" className="text-sm">
          {rows.length} records · Page {current} of {pages} · Showing{" "}
          {(current - 1) * perPage + 1}–
          {Math.min(current * perPage, rows.length)}
        </p>
        <button
          type="button"
          className="button button-secondary compact"
          disabled={current === 1}
          onClick={() => setPage(current - 1)}
        >
          Previous records
        </button>
        <button
          type="button"
          className="button button-secondary compact"
          disabled={current === pages}
          onClick={() => setPage(current + 1)}
        >
          Next records
        </button>
      </nav>
    </div>
  );
}
