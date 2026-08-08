import { HTTPFacilitatorClient, x402HTTPResourceServer, x402ResourceServer } from "@x402/core/server";
import type {
  HTTPAdapter,
  HTTPRequestContext,
  RoutesConfig,
} from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { getMonadConfig } from "@/lib/monad-config";
import { PACKAGES, isPackageId, USDC_DECIMALS } from "@/lib/packages";

export const TOPUP_PATH = "/api/topup";

class NextHTTPAdapter implements HTTPAdapter {
  constructor(
    private readonly req: Request,
    private readonly body?: unknown
  ) {}

  getHeader(name: string): string | undefined {
    return this.req.headers.get(name) ?? undefined;
  }

  getMethod(): string {
    return this.req.method;
  }

  getPath(): string {
    return new URL(this.req.url).pathname;
  }

  getUrl(): string {
    return this.req.url;
  }

  getAcceptHeader(): string {
    return this.req.headers.get("accept") ?? "";
  }

  getUserAgent(): string {
    return this.req.headers.get("user-agent") ?? "";
  }

  getQueryParams(): Record<string, string | string[]> {
    return Object.fromEntries(new URL(this.req.url).searchParams);
  }

  getQueryParam(name: string): string | string[] | undefined {
    return new URL(this.req.url).searchParams.get(name) ?? undefined;
  }

  getBody(): unknown {
    return this.body;
  }
}

export function createHTTPContext(req: Request, body?: unknown): HTTPRequestContext {
  return {
    adapter: new NextHTTPAdapter(req, body),
    path: new URL(req.url).pathname,
    method: req.method,
  };
}

function buildRoutes(config: ReturnType<typeof getMonadConfig>): RoutesConfig {
  return {
    [`POST ${TOPUP_PATH}`]: {
      accepts: {
        scheme: "exact",
        network: config.network,
        payTo: config.payTo,
        price: (ctx) => {
          const body = (ctx.adapter.getBody?.() ?? {}) as { packageId?: unknown };
          if (!isPackageId(body.packageId)) {
            throw new Error("Invalid packageId");
          }
          return PACKAGES[body.packageId].priceUsdc;
        },
      },
      resource: TOPUP_PATH,
      description: "Top up premium access with USDC",
      mimeType: "application/json",
      unpaidResponseBody: async () => ({
        contentType: "application/json",
        body: { error: "payment_required" },
      }),
    },
  };
}

let cached: Promise<x402HTTPResourceServer> | undefined;

export function getX402Server(): Promise<x402HTTPResourceServer> {
  if (!cached) {
    cached = (async () => {
      const config = getMonadConfig();
      const facilitator = new HTTPFacilitatorClient({ url: config.facilitatorUrl });
      const server = new x402ResourceServer(facilitator);

      const scheme = new ExactEvmScheme();
      scheme.registerMoneyParser(async (amount, network) => {
        if (network === config.network) {
          return {
            amount: Math.floor(amount * 10 ** USDC_DECIMALS).toString(),
            asset: config.usdcAddress,
            extra: { name: "USDC", version: "2" },
          };
        }
        return null;
      });
      server.register(config.network, scheme);

      const httpServer = new x402HTTPResourceServer(server, buildRoutes(config));
      await httpServer.initialize();
      return httpServer;
    })();
  }
  return cached;
}
