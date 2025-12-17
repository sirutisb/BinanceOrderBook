"use client";

import axios from "axios";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { OrderBook } from "@/components/OrderBook";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type {
  BinanceCombinedStreamMessage,
  BinanceFuturesExchangeInfo,
  BinanceFuturesDepthDiffEvent,
  OrderBookData,
} from "@/lib/types";
import {
  applyDepthDiffEvent,
  createLocalOrderBook,
  materializeOrderBookData,
  type LocalOrderBook,
} from "@/lib/orderBook";

const DEFAULT_SYMBOL = "BTCUSDT";
const EXCHANGE_INFO_URL = "https://fapi.binance.com/fapi/v1/exchangeInfo";

function wsUrlForSymbol(symbol: string) {
  const stream = `${symbol.toLowerCase()}@depth@100ms`;
  return `wss://fstream.binance.com/stream?streams=${stream}`;
}

function snapshotUrlForSymbol(symbol: string) {
  return `https://fapi.binance.com/fapi/v1/depth?symbol=${symbol}&limit=1000`;
}

const Home = () => {
  const [orderBook, setOrderBook] = useState<OrderBookData | null>(null);
  const [connectionState, setConnectionState] = useState<"connecting" | "live" | "resyncing" | "error">(
    "connecting",
  );

  const [displayDepth, setDisplayDepth] = useState(15);

  const [validSymbols, setValidSymbols] = useState<Set<string> | null>(null);
  const [allSymbols, setAllSymbols] = useState<string[]>([]);
  const [exchangeInfoError, setExchangeInfoError] = useState<string | null>(null);
  const [symbolInput, setSymbolInput] = useState(DEFAULT_SYMBOL);
  const [selectedSymbol, setSelectedSymbol] = useState(DEFAULT_SYMBOL);
  const [symbolError, setSymbolError] = useState<string | null>(null);
  const [isSymbolInputFocused, setIsSymbolInputFocused] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const symbolInputRef = useRef<HTMLInputElement | null>(null);
  const bufferRef = useRef<BinanceFuturesDepthDiffEvent[]>([]);
  const bookRef = useRef<LocalOrderBook | null>(null);
  const snapshotLastUpdateIdRef = useRef<number | null>(null);
  const lastAppliedURef = useRef<number | null>(null);
  const isSyncingRef = useRef(false);
  const syncLockGenerationRef = useRef<number>(0);
  const scheduledUpdateRef = useRef(false);
  const resyncScheduledRef = useRef(false);
  const resyncTimeoutRef = useRef<number | null>(null);
  const syncGenerationRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    const loadExchangeInfo = async () => {
      try {
        const res = await axios.get<BinanceFuturesExchangeInfo>(EXCHANGE_INFO_URL, { timeout: 10_000 });
        if (cancelled) return;

        const symbols: string[] = [];
        for (const s of res.data.symbols ?? []) {
          if (s.status === "TRADING") symbols.push(s.symbol);
        }
        symbols.sort();
        setAllSymbols(symbols);
        setValidSymbols(new Set(symbols));
        setExchangeInfoError(null);
      } catch {
        if (cancelled) return;
        setExchangeInfoError("Failed to load exchangeInfo");
        setValidSymbols(null);
        setAllSymbols([]);
      }
    };

    loadExchangeInfo();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const generation = ++syncGenerationRef.current;

    const MAX_BUFFERED_EVENTS = 5000;

    const publish = () => {
      if (scheduledUpdateRef.current) return;
      scheduledUpdateRef.current = true;
      requestAnimationFrame(() => {
        scheduledUpdateRef.current = false;
        const book = bookRef.current;
        if (!book || cancelled) return;
        setOrderBook(materializeOrderBookData(book, 1000));
      });
    };

    const resetLocalState = () => {
      bufferRef.current = [];
      bookRef.current = null;
      snapshotLastUpdateIdRef.current = null;
      lastAppliedURef.current = null;
      isSyncingRef.current = false;
      setOrderBook(null);
    };

    const bufferEvent = (evt: BinanceFuturesDepthDiffEvent) => {
      bufferRef.current.push(evt);
      if (bufferRef.current.length > MAX_BUFFERED_EVENTS) {
        bufferRef.current.splice(0, bufferRef.current.length - MAX_BUFFERED_EVENTS);
      }
    };

    const scheduleResync = () => {
      if (syncGenerationRef.current !== generation) return;
      if (resyncScheduledRef.current) return;
      resyncScheduledRef.current = true;
      setConnectionState("resyncing");
      resetLocalState();
      if (resyncTimeoutRef.current !== null) window.clearTimeout(resyncTimeoutRef.current);
      resyncTimeoutRef.current = window.setTimeout(() => {
        if (syncGenerationRef.current !== generation) return;
        resyncScheduledRef.current = false;
        fetchSnapshotAndSync();
        resyncTimeoutRef.current = null;
      }, 250);
    };

    const tryStartFromBuffer = () => {
      const book = bookRef.current;
      const snapshotLastUpdateId = snapshotLastUpdateIdRef.current;
      if (!book || snapshotLastUpdateId === null) return;
      if (lastAppliedURef.current !== null) return;

      // Drop any event where u < lastUpdateId
      bufferRef.current = bufferRef.current.filter((evt) => evt.u >= snapshotLastUpdateId);

      // First processed event should have U <= lastUpdateId AND u >= lastUpdateId
      const startIndex = bufferRef.current.findIndex(
        (evt) => evt.U <= snapshotLastUpdateId && evt.u >= snapshotLastUpdateId,
      );
      if (startIndex === -1) return;

      const toProcess = bufferRef.current.slice(startIndex);
      bufferRef.current = [];

      for (const evt of toProcess) {
        const lastAppliedU = lastAppliedURef.current;
        if (lastAppliedU !== null && evt.pu !== lastAppliedU) {
          scheduleResync();
          return;
        }
        applyDepthDiffEvent(book, evt);
        lastAppliedURef.current = evt.u;
      }

      publish();
      setConnectionState("live");
    };

    const fetchSnapshotAndSync = async () => {
      if (syncGenerationRef.current !== generation) return;
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;
      syncLockGenerationRef.current = generation;
      setConnectionState((prev) => (prev === "live" ? "resyncing" : "connecting"));

      try {
        const snapshotRes = await axios.get<OrderBookData>(snapshotUrlForSymbol(selectedSymbol), {
          timeout: 10_000,
        });
        if (cancelled || syncGenerationRef.current !== generation) return;

        const snapshot = snapshotRes.data;
        const book = createLocalOrderBook(snapshot);
        bookRef.current = book;

        snapshotLastUpdateIdRef.current = snapshot.lastUpdateId;
        lastAppliedURef.current = null;

        // We may have already buffered the bridging event.
        tryStartFromBuffer();

        // If we still haven't started applying diffs, keep buffering until the bridging event arrives.
        if (lastAppliedURef.current === null) setConnectionState("connecting");
      } catch {
        if (!cancelled && syncGenerationRef.current === generation) setConnectionState("error");
      } finally {
        if (syncLockGenerationRef.current === generation) isSyncingRef.current = false;
      }
    };

    const onDepthEvent = (evt: BinanceFuturesDepthDiffEvent) => {
      const book = bookRef.current;
      const lastAppliedU = lastAppliedURef.current;

      // If we haven't initialized via snapshot, just buffer.
      if (!book) {
        bufferEvent(evt);
        fetchSnapshotAndSync();
        return;
      }

      // Snapshot loaded but we haven't started processing diffs yet.
      if (lastAppliedU === null) {
        bufferEvent(evt);
        tryStartFromBuffer();
        return;
      }

      // Continuity check: pu should equal previous u.
      if (evt.pu !== lastAppliedU) {
        scheduleResync();
        return;
      }

      applyDepthDiffEvent(book, evt);
      lastAppliedURef.current = evt.u;
      publish();
    };

    resetLocalState();
    setConnectionState("connecting");
    const ws = new WebSocket(wsUrlForSymbol(selectedSymbol));
    wsRef.current = ws;

    ws.onopen = () => {
      if (cancelled || syncGenerationRef.current !== generation) return;
      setConnectionState("connecting");
      fetchSnapshotAndSync();
    };

    ws.onmessage = (msg) => {
      if (cancelled || syncGenerationRef.current !== generation) return;

      try {
        const parsed = JSON.parse(
          typeof msg.data === "string" ? msg.data : "",
        ) as BinanceCombinedStreamMessage<BinanceFuturesDepthDiffEvent>;

        if (!parsed?.data) return;
        onDepthEvent(parsed.data);
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onerror = () => {
      if (!cancelled && syncGenerationRef.current === generation) setConnectionState("error");
    };

    ws.onclose = () => {
      if (!cancelled && syncGenerationRef.current === generation) setConnectionState("error");
    };

    return () => {
      cancelled = true;
      wsRef.current?.close();
      wsRef.current = null;
      if (resyncTimeoutRef.current !== null) {
        window.clearTimeout(resyncTimeoutRef.current);
        resyncTimeoutRef.current = null;
      }
    };
  }, [selectedSymbol]);

  const symbolInputUpper = symbolInput.trim().toUpperCase();
  const exchangeInfoLoading = validSymbols === null && !exchangeInfoError;

  const symbolMatches = useMemo(() => {
    if (!validSymbols || exchangeInfoError) return [];
    if (!symbolInputUpper) return [];

    const MAX_RESULTS = 20;
    const starts: string[] = [];
    const contains: string[] = [];

    for (const s of allSymbols) {
      if (s === selectedSymbol) continue;
      if (s.startsWith(symbolInputUpper)) starts.push(s);
      else if (s.includes(symbolInputUpper)) contains.push(s);
      if (starts.length + contains.length >= MAX_RESULTS) break;
    }

    return starts.concat(contains).slice(0, MAX_RESULTS);
  }, [allSymbols, exchangeInfoError, selectedSymbol, symbolInputUpper, validSymbols]);

  const onSubmitSymbol = (e: FormEvent) => {
    e.preventDefault();
    if (!symbolInputUpper) {
      setSymbolError("Enter a symbol (e.g. BTCUSDT)");
      return;
    }

    if (validSymbols && !validSymbols.has(symbolInputUpper)) {
      setSymbolError("Unknown or not trading on Futures");
      return;
    }

    setSymbolError(null);
    setSelectedSymbol(symbolInputUpper);
    setSymbolInput(symbolInputUpper);
  };

  const onPickSymbol = (symbol: string) => {
    setSymbolError(null);
    setSelectedSymbol(symbol);
    setSymbolInput(symbol);
    symbolInputRef.current?.focus();
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="text-xs text-muted-foreground">Market: {selectedSymbol}</div>
        <div className="text-xs text-muted-foreground">Status: {connectionState}</div>

        <div className="flex items-start gap-3">
          <div className="flex flex-col items-center gap-2">
            <form onSubmit={onSubmitSymbol} className="flex items-center gap-2">
              <input
                ref={symbolInputRef}
                value={symbolInput}
                onChange={(ev) => {
                  setSymbolInput(ev.target.value);
                  if (symbolError) setSymbolError(null);
                }}
                onFocus={() => setIsSymbolInputFocused(true)}
                onBlur={() => setIsSymbolInputFocused(false)}
                placeholder="BTCUSDT"
                spellCheck={false}
                autoCapitalize="characters"
                className="h-9 w-40 rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button type="submit" size="sm" disabled={exchangeInfoLoading}>
                Load
              </Button>
            </form>

            {isSymbolInputFocused && symbolMatches.length > 0 ? (
              <Card className="w-56">
                <CardContent className="p-1">
                  <div className="flex flex-col">
                    {symbolMatches.map((s) => (
                      <Button
                        key={s}
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start font-mono"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onPickSymbol(s)}
                      >
                        {s}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {exchangeInfoLoading ? (
              <div className="text-xs text-muted-foreground">Loading symbols…</div>
            ) : null}
            {exchangeInfoError ? (
              <div className="text-xs text-muted-foreground">
                {exchangeInfoError} (symbol validation disabled)
              </div>
            ) : null}
            {symbolError ? <div className="text-xs text-muted-foreground">{symbolError}</div> : null}
          </div>

          <Card className="w-56">
            <CardContent className="h-9 px-3 py-0 flex items-center gap-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap">
                <span>Depth</span>
                <span className="font-mono">{displayDepth}</span>
              </div>
              <input
                aria-label="Order book depth"
                type="range"
                min={5}
                max={50}
                step={1}
                value={displayDepth}
                onChange={(e) => setDisplayDepth(Number(e.target.value))}
                className="w-full h-2"
              />
            </CardContent>
          </Card>
        </div>

        <OrderBook data={orderBook} depth={displayDepth} />
      </div>
    </main>
  );
}

export default Home;