/**
 * Relayer nonce allocation.
 *
 * The facilitator settles several invoices at once, all from one relayer EOA.
 * Left to itself, viem fetches the pending nonce per transaction, so concurrent
 * settles all read the same value and the RPC accepts exactly one — the rest are
 * rejected as duplicates with an unhelpful "missing or invalid parameters".
 *
 * The fix is to serialise *allocation* while leaving *broadcast* concurrent:
 * read the chain nonce once, then hand out incrementing values behind a mutex.
 * Four settlements still go out in parallel; they just carry distinct nonces.
 *
 * Scope: this cache is per process. Several serverless instances would each keep
 * their own counter and could collide again, so a multi-instance deployment
 * wants a shared counter or a dedicated relayer per instance. For a single
 * instance — which is what the demo and a Vercel function run as — it is correct.
 */

import { publicClient } from "./clients";

interface NonceState {
  next: bigint;
  /** Serialises allocation so two callers cannot read the same value. */
  chain: Promise<void>;
}

const states = new Map<string, NonceState>();

/** Discards the cached value so the next allocation re-reads from the chain. */
export function resetNonce(address: string): void {
  states.delete(address.toLowerCase());
}

/**
 * Reserves the next nonce for `address`.
 *
 * Allocation is queued: each caller waits for the previous one to finish
 * incrementing, which is what guarantees uniqueness.
 */
export async function allocateNonce(address: `0x${string}`): Promise<number> {
  const key = address.toLowerCase();
  let state = states.get(key);

  if (!state) {
    state = { next: 0n, chain: Promise.resolve() };
    states.set(key, state);
  }

  let reserved = 0n;

  // Chain each allocation onto the previous so the read-modify-write is atomic
  // with respect to other callers.
  const allocation = state.chain.then(async () => {
    if (state.next === 0n) {
      // `pending` counts transactions already in the mempool, so a restart
      // mid-flight picks up after them rather than colliding.
      const onChain = await publicClient.getTransactionCount({
        address,
        blockTag: "pending",
      });
      state.next = BigInt(onChain);
    }

    reserved = state.next;
    state.next += 1n;
  });

  state.chain = allocation.catch(() => {
    // A failed read must not poison the queue for later callers.
    resetNonce(key);
  });

  await allocation;
  return Number(reserved);
}

/**
 * Releases a nonce that was never broadcast.
 *
 * A rejected transaction leaves a hole: every later nonce is then too high and
 * sits unmineable. Rather than track holes, drop the cache and re-read the chain
 * on the next allocation.
 */
export function releaseNonce(address: string): void {
  resetNonce(address);
}
