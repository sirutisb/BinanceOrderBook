import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderBookData } from "@/lib/types";

interface OrderBookProps {
  data: OrderBookData | null;
  depth?: number;
}

export function OrderBook({ data, depth = 15 }: OrderBookProps) {
  if (!data) {
    return (
      <Card className="w-full max-w-6xl mx-auto">
        <CardContent className="p-6 text-center text-muted-foreground">
          Loading order book...
        </CardContent>
      </Card>
    );
  }

  const displayDepth = Math.max(1, Math.floor(depth));

  // Calculate max volume for relative bars (based on displayed depth)
  const displayedBids = data.bids.slice(0, displayDepth);
  const displayedAsks = data.asks.slice(0, displayDepth);

  const maxBidVolume = displayedBids.length
    ? Math.max(...displayedBids.map(([, amount]) => parseFloat(amount)))
    : 0;
  const maxAskVolume = displayedAsks.length
    ? Math.max(...displayedAsks.map(([, amount]) => parseFloat(amount)))
    : 0;
  const maxVolume = Math.max(maxBidVolume, maxAskVolume);

  const bestBid = data.bids[0]?.[0] ? parseFloat(data.bids[0][0]) : null;
  const bestAsk = data.asks[0]?.[0] ? parseFloat(data.asks[0][0]) : null;
  const midPrice = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null;
  const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;

  return (
    <Card className="w-full max-w-6xl mx-auto bg-background border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-center text-lg">Order Book</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="flex flex-col">
          
          {/* Asks Column (Red - Top) */}
          <div className="flex flex-col-reverse">
            {displayedAsks.map(([price, amount], idx) => {
               const volPercentage = maxVolume > 0 ? (parseFloat(amount) / maxVolume) * 100 : 0;
               return (
                <div key={`ask-${idx}`} className="relative flex justify-between text-sm px-4 py-0.5 hover:bg-muted/50 transition-colors">
                  <div 
                    className="absolute top-0 right-0 bottom-0 bg-red-900/20 dark:bg-red-900/30 transition-all duration-300" 
                    style={{ width: `${volPercentage}%` }}
                  />
                  <span className="font-mono text-red-600 dark:text-red-500 z-10 relative">{parseFloat(price).toFixed(8)}</span>
                  <span className="font-mono text-foreground/80 z-10 relative">{parseFloat(amount).toFixed(4)}</span>
                </div>
              )
            })}
          </div>

          {/* Spread / Current Price Indicator could go here */}
          <div className="py-2 border-y border-border my-1 text-center font-mono text-lg font-bold">
             {midPrice !== null ? midPrice.toFixed(8) : "---"}{" "}
             <span className="text-xs text-muted-foreground font-normal">USD</span>
             <div className="text-xs text-muted-foreground font-normal">
               Spread: {spread !== null ? spread.toFixed(8) : "---"}
             </div>
          </div>

          {/* Bids Column (Green - Bottom) */}
          <div>
            {displayedBids.map(([price, amount], idx) => {
               const volPercentage = maxVolume > 0 ? (parseFloat(amount) / maxVolume) * 100 : 0;
               return (
                <div key={`bid-${idx}`} className="relative flex justify-between text-sm px-4 py-0.5 hover:bg-muted/50 transition-colors">
                  <div 
                    className="absolute top-0 right-0 bottom-0 bg-green-900/20 dark:bg-green-900/30 transition-all duration-300" 
                    style={{ width: `${volPercentage}%` }}
                  />
                  <span className="font-mono text-green-600 dark:text-green-500 z-10 relative">{parseFloat(price).toFixed(8)}</span>
                  <span className="font-mono text-foreground/80 z-10 relative">{parseFloat(amount).toFixed(4)}</span>
                </div>
              )
            })}
          </div>

        </div>
      </CardContent>
    </Card>
  );
}
