import { createPublicClient, createWalletClient, defineChain, http, type Account, type Chain, type PublicClient, type WalletClient } from "viem";

interface ChainOptions {
  id: number;
  rpcUrl: string;
  name?: string;
  network?: string;
  nativeCurrency?: {
    name?: string;
    symbol?: string;
    decimals?: number;
  };
}

const chainCache = new Map<string, Chain>();

function cacheKey(opts: ChainOptions): string {
  return JSON.stringify({
    id: opts.id,
    rpcUrl: opts.rpcUrl,
    name: opts.name,
    network: opts.network,
    nativeCurrency: opts.nativeCurrency,
  });
}

export function buildChain(opts: ChainOptions): Chain {
  const key = cacheKey(opts);
  const cached = chainCache.get(key);
  if (cached) return cached;

  const {
    id,
    rpcUrl,
    name = `Chain ${opts.id}`,
    network = `custom-${opts.id}`,
    nativeCurrency = {},
  } = opts;

  const currency = {
    name: nativeCurrency.name ?? "Ether",
    symbol: nativeCurrency.symbol ?? "ETH",
    decimals: nativeCurrency.decimals ?? 18,
  } as const;

  const chain = defineChain({
    id,
    name,
    network,
    nativeCurrency: currency,
    rpcUrls: {
      default: { http: [rpcUrl] },
      public: { http: [rpcUrl] },
    },
  });

  chainCache.set(key, chain);
  return chain;
}

export function makePublicClient(opts: ChainOptions): PublicClient {
  const chain = buildChain(opts);
  return createPublicClient({
    chain,
    transport: http(chain.rpcUrls.default.http[0]!),
  });
}

export function makeWalletClient(
  account: Account,
  opts: ChainOptions,
): WalletClient {
  const chain = buildChain(opts);
  return createWalletClient({
    account,
    chain,
    transport: http(chain.rpcUrls.default.http[0]!),
  });
}
