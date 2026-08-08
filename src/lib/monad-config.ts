export type MonadChain = "mainnet" | "testnet";
export type Caip2Network = `${string}:${string}`;

export const MONAD_TESTNET: { chain: "testnet"; chainId: number; network: Caip2Network; usdcAddress: `0x${string}` } = {
  chain: "testnet",
  chainId: 10143,
  network: "eip155:10143",
  usdcAddress: "0x534b2f3A21130d7a60830c2Df862319e593943A3",
};

export const MONAD_MAINNET: { chain: "mainnet"; chainId: number; network: Caip2Network; usdcAddress: `0x${string}` | null } = {
  chain: "mainnet",
  chainId: 143,
  network: "eip155:143",
  usdcAddress: null,
};

export const MONAD_FACILITATOR_URL =
  process.env.MONAD_FACILITATOR_URL || "https://x402-facilitator.molandak.org";

export function getMonadConfig() {
  const chain: MonadChain =
    process.env.MONAD_CHAIN === "mainnet" ? "mainnet" : "testnet";

  const payTo = (process.env.MONAD_PAY_TO || "").trim() as `0x${string}`;
  if (!payTo.startsWith("0x")) {
    throw new Error(
      "MONAD_PAY_TO is required — set it to the app wallet that receives USDC top-ups"
    );
  }

  if (chain === "testnet") {
    return {
      ...MONAD_TESTNET,
      payTo,
      facilitatorUrl: MONAD_FACILITATOR_URL,
    };
  }

  const usdc = (process.env.MONAD_USDC_MAINNET || "").trim() as `0x${string}`;
  if (!usdc.startsWith("0x")) {
    throw new Error(
      "MONAD_USDC_MAINNET is required when MONAD_CHAIN=mainnet (canonical USDC address)"
    );
  }

  return {
    ...MONAD_MAINNET,
    usdcAddress: usdc,
    payTo,
    facilitatorUrl: MONAD_FACILITATOR_URL,
  };
}
