# Order Book Live

A Next.js app that displays a live order book powered by Binance market data.

## Getting started

```bash
git clone https://github.com/sirutisb/BinanceOrderBook.git
cd order-book

npm install
npm run dev
```

## How it works

This project keeps a local in-memory copy of the order book and updates it in real time.

1. **Fetch symbols (REST)**
	- On load, it calls Binance Futures exchange info to fetch the list of available trading symbols.
	- Endpoint: `https://fapi.binance.com/fapi/v1/exchangeInfo`

2. **Load an initial order book snapshot (REST)**
	- When you select a symbol, it fetches an initial depth snapshot.
	- Endpoint: `https://fapi.binance.com/fapi/v1/depth?symbol=<SYMBOL>&limit=1000`

3. **Stream delta updates (WebSocket)**
	- It opens a Binance Futures WebSocket stream for depth diffs and continuously applies deltas.
	- Stream: `wss://fstream.binance.com/stream?streams=<symbol>@depth@100ms`

4. **Maintain local state**
	- The snapshot is loaded into local state (bids/asks stored as Maps keyed by price).
	- Each WebSocket update applies inserts/updates/removals (a quantity of `0` removes a level).
	- The UI derives sorted bid/ask arrays from that state and renders the top N levels.

# Preview and Live Demo
[https://binance-order-book.vercel.app/](https://binance-order-book.vercel.app/)
<img width="479" height="978" alt="image" src="https://github.com/user-attachments/assets/ddca9765-c82b-4094-9559-03d68adde844" />
