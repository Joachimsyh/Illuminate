import { queryOne, withTransaction } from "@/lib/db";

const MS_PER_MONTH = 30 * 24 * 60 * 60 * 1000;

export function addMonths(from: Date, months: number): Date {
  return new Date(from.getTime() + months * MS_PER_MONTH);
}

export async function getPremiumUntil(userId: string): Promise<Date | null> {
  const row = await queryOne<{ premiumUntil: Date | null }>(
    `SELECT premium_until AS "premiumUntil" FROM users WHERE id = $1`,
    [userId]
  );
  return row?.premiumUntil ?? null;
}

export async function isPremium(userId: string): Promise<boolean> {
  const until = await getPremiumUntil(userId);
  return !!until && until.getTime() > Date.now();
}

export interface CreditPremiumMeta {
  packageId: string;
  amountUsdc: string | number;
  months: number;
  txHash?: string | null;
  chainId: number;
  walletFrom?: string | null;
}

export interface CreditResult {
  credited: boolean;
  premiumUntil: Date | null;
}

/**
 * Credits months of premium access. Stacking rule: extends from the current
 * expiry when it is still in the future, otherwise from now.
 *
 * Idempotent per (userId, txHash): a duplicate settlement returns the original
 * result without re-crediting.
 */
export async function creditPremium(
  userId: string,
  meta: CreditPremiumMeta
): Promise<CreditResult> {
  const now = new Date();

  return withTransaction(async (tx) => {
    if (meta.txHash) {
      const existing = await tx.queryOne<{ creditedUntil: Date | null }>(
        `SELECT credited_until AS "creditedUntil" FROM topups WHERE user_id = $1 AND tx_hash = $2`,
        [userId, meta.txHash]
      );
      if (existing) {
        return { credited: false, premiumUntil: existing.creditedUntil };
      }
    }

    const user = await tx.queryOne<{ premiumUntil: Date | null }>(
      `SELECT premium_until AS "premiumUntil" FROM users WHERE id = $1 FOR UPDATE`,
      [userId]
    );
    if (!user) throw new Error("User not found");

    const base =
      user.premiumUntil && user.premiumUntil.getTime() > now.getTime()
        ? user.premiumUntil
        : now;

    const creditedUntil = addMonths(base, meta.months);

    await tx.query(
      `UPDATE users SET premium_until = $2, updated_at = NOW() WHERE id = $1`,
      [userId, creditedUntil]
    );

    await tx.query(
      `INSERT INTO topups
         (user_id, package_id, amount_usdc, months, tx_hash, chain_id, wallet_from, credited_until)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        userId,
        meta.packageId,
        meta.amountUsdc,
        meta.months,
        meta.txHash ?? null,
        meta.chainId,
        meta.walletFrom ?? null,
        creditedUntil,
      ]
    );

    return { credited: true, premiumUntil: creditedUntil };
  });
}
