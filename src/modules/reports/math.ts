export function roundedRatio(
  numerator: bigint,
  quantity: number,
  denominator: number,
) {
  if (numerator < 0n || denominator < 1 || !Number.isSafeInteger(quantity))
    throw new Error("INVALID_COST");
  return (
    (numerator * BigInt(quantity) + BigInt(Math.floor(denominator / 2))) /
    BigInt(denominator)
  );
}
export function safeNumber(n: bigint | number) {
  const v = Number(n);
  if (!Number.isSafeInteger(v)) throw new Error("REPORT_AMOUNT_LIMIT");
  return v;
}
export function sum(values: number[]) {
  return safeNumber(values.reduce((s, n) => s + BigInt(n), 0n));
}
export function merchandiseRevenue(
  line: { linePricePaise: number; taxPaise: number },
  taxMode: string,
) {
  return line.linePricePaise - (taxMode === "INCLUSIVE" ? line.taxPaise : 0);
}
export function rupees(paise: number) {
  return (paise / 100).toFixed(2);
}
