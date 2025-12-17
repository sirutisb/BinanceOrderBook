import type { OrderBookData, BinanceFuturesDepthDiffEvent } from "@/lib/types";

export type LocalOrderBook = {
  lastUpdateId: number;
  bids: Map<string, string>;
  asks: Map<string, string>;
};

export function createLocalOrderBook(snapshot: OrderBookData): LocalOrderBook {
  const bids = new Map<string, string>();
  const asks = new Map<string, string>();

  for (const [price, qty] of snapshot.bids) {
    if (Number(qty) !== 0) bids.set(price, qty);
  }
  for (const [price, qty] of snapshot.asks) {
    if (Number(qty) !== 0) asks.set(price, qty);
  }

  return {
    lastUpdateId: snapshot.lastUpdateId,
    bids,
    asks,
  };
}

function applySide(side: Map<string, string>, updates: [string, string][]) {
  for (const [price, qty] of updates) {
    if (Number(qty) === 0) side.delete(price);
    else side.set(price, qty);
  }
}

export function applyDepthDiffEvent(book: LocalOrderBook, event: BinanceFuturesDepthDiffEvent) {
  applySide(book.bids, event.b);
  applySide(book.asks, event.a);
  book.lastUpdateId = event.u;
}

export function materializeOrderBookData(book: LocalOrderBook, depth = 1000): OrderBookData {
  const bidsArray: [string, string][] = Array.from(book.bids.entries());
  const asksArray: [string, string][] = Array.from(book.asks.entries());

  bidsArray.sort((a, b) => Number(b[0]) - Number(a[0]));
  asksArray.sort((a, b) => Number(a[0]) - Number(b[0]));

  return {
    lastUpdateId: book.lastUpdateId,
    bids: bidsArray.slice(0, depth),
    asks: asksArray.slice(0, depth),
  };
}
