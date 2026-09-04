import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.post("/api/finance/historical", async (req, res) => {
    try {
      const { tickers, startDate, endDate } = req.body;
      
      if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
        return res.status(400).json({ error: "Tickers array is required" });
      }

      const period1 = Math.floor(new Date(startDate).getTime() / 1000);
      // Sumar 1 día (86400 segundos) para que la fecha final sea inclusiva
      const period2 = Math.floor(new Date(endDate).getTime() / 1000) + 86400;

      const resultsPromises = tickers.map(async (ticker: string) => {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${period1}&period2=${period2}&interval=1d&events=history`;
        const response = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch ${ticker}: ${response.statusText}`);
        }
        
        const data = await response.json();
        const result = data.chart.result?.[0];
        
        if (!result || !result.timestamp || !result.indicators.adjclose?.[0].adjclose) {
           throw new Error(`No historical data found for ${ticker}`);
        }

        return {
          ticker,
          timestamps: result.timestamp,
          adjclose: result.indicators.adjclose[0].adjclose
        };
      });

      const settledResults = await Promise.allSettled(resultsPromises);
      const results = settledResults.filter(r => r.status === 'fulfilled').map(r => (r as PromiseFulfilledResult<any>).value);
      const warnings = settledResults.filter(r => r.status === 'rejected').map(r => (r as PromiseRejectedResult).reason.message);
      const validTickers = results.map(r => r.ticker);

      if (results.length === 0) {
          return res.status(400).json({ error: "No se encontraron datos para los tickers proporcionados." });
      }

      // Align dates (Merge)
      const allTimestamps = Array.from(new Set(results.flatMap(r => r.timestamps))).sort((a, b) => a - b);
      
      const alignedData = allTimestamps.map(ts => {
        const dateObj = new Date(ts * 1000);
        const row: any = { 
          timestamp: ts,
          date: dateObj.toISOString().split('T')[0] 
        };
        return row;
      });

      // Forward Fill
      results.forEach(r => {
        let lastKnownPrice: number | null = null;
        alignedData.forEach(row => {
          const idx = r.timestamps.indexOf(row.timestamp);
          if (idx !== -1 && r.adjclose[idx] !== null) {
            lastKnownPrice = r.adjclose[idx];
          }
          row[r.ticker] = lastKnownPrice;
        });
      });

      // Filter rows where any ticker is null (optional: just return as is, let client handle)
      // Here we filter out rows if they have completely missing values initially.
      const cleanedData = alignedData.filter(row => {
        return validTickers.every(t => row[t] !== null && row[t] !== undefined);
      });

      res.json({ data: cleanedData, warnings, validTickers });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
