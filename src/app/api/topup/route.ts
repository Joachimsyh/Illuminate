import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { creditPremium } from "@/lib/premium";
import { PACKAGES, isPackageId } from "@/lib/packages";
import { getMonadConfig } from "@/lib/monad-config";
import { createHTTPContext, getX402Server } from "@/lib/x402";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const packageId = (json as { packageId?: unknown })?.packageId;
  if (!isPackageId(packageId)) {
    return NextResponse.json({ error: "Invalid packageId" }, { status: 400 });
  }

  const config = getMonadConfig();

  try {
    const httpServer = await getX402Server();
    const context = createHTTPContext(request, json);
    const result = await httpServer.processHTTPRequest(context);

    switch (result.type) {
      case "payment-error": {
        const { status, headers, body } = result.response;
        return NextResponse.json(body ?? {}, { status, headers });
      }

      case "no-payment-required":
        return NextResponse.json({ error: "Route is not payable" }, { status: 400 });

      case "payment-verified": {
        const settle = await httpServer.processSettlement(
          result.paymentPayload,
          result.paymentRequirements,
          result.declaredExtensions,
          { request: context }
        );

        if (!settle.success) {
          const { status, headers, body } = settle.response;
          return NextResponse.json(body ?? {}, { status, headers });
        }

        const pkg = PACKAGES[packageId];
        const credit = await creditPremium(session.user.id, {
          packageId,
          amountUsdc: pkg.priceUsdc,
          months: pkg.months,
          txHash: settle.transaction,
          chainId: config.chainId,
          walletFrom: settle.payer,
        });

        return NextResponse.json(
          {
            success: true,
            credited: credit.credited,
            premiumUntil: credit.premiumUntil,
            txHash: settle.transaction,
          },
          { status: 200, headers: settle.headers }
        );
      }
    }
  } catch (err) {
    return NextResponse.json(
      {
        error: "Top-up failed",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
