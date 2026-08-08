export type PackageId = "1m" | "3m" | "6m" | "12m";

export interface PremiumPackage {
  id: PackageId;
  label: string;
  priceUsdc: number;
  months: number;
}

export const PACKAGES: Record<PackageId, PremiumPackage> = {
  "1m": { id: "1m", label: "1 month", priceUsdc: 4.99, months: 1 },
  "3m": { id: "3m", label: "3 months", priceUsdc: 12.99, months: 3 },
  "6m": { id: "6m", label: "6 months", priceUsdc: 21.99, months: 6 },
  "12m": { id: "12m", label: "12 months", priceUsdc: 40.0, months: 12 },
};

export const USDC_DECIMALS = 6;

export function isPackageId(value: unknown): value is PackageId {
  return typeof value === "string" && value in PACKAGES;
}

export function priceToAtomic(priceUsdc: number): string {
  return Math.floor(priceUsdc * 10 ** USDC_DECIMALS).toString();
}
