export type OrderBookData = {
  lastUpdateId: number;
  bids: [string, string][];
  asks: [string, string][];
};

export type BinanceFuturesDepthDiffEvent = {
  e: "depthUpdate";
  E: number;
  T: number;
  s: string;
  U: number;
  u: number;
  pu: number;
  b: [string, string][];
  a: [string, string][];
};

export type BinanceCombinedStreamMessage<TData> = {
  stream: string;
  data: TData;
};

export type BinanceFuturesExchangeInfoSymbol = {
  symbol: string;
  status: string;
  contractType?: string;
};

export type BinanceFuturesExchangeInfo = {
  timezone: string;
  serverTime: number;
  futuresType?: string;
  symbols: BinanceFuturesExchangeInfoSymbol[];
};
