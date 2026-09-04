import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Settings, Download, Search, Info, TrendingUp, TrendingDown, BookOpen, Filter, Calculator, BarChart3, PieChart, Maximize, Activity, X, Loader2, RefreshCw, ArrowUpDown, ArrowDownRight } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as XLSX from 'xlsx';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler, ArcElement
} from 'chart.js';
import { Line, Scatter, Doughnut } from 'react-chartjs-2';
import { calculateStats, calculateCorrelation, runMarkowitz, calculateERC } from '../data';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler, ArcElement);

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

const CHART_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16'];

const ASSET_NAMES: Record<string, string> = {
  AAPL: 'Apple Inc.',
  MSFT: 'Microsoft Corp.',
  SPY: 'SPDR S&P 500 ETF Trust',
  VHT: 'Vanguard Health Care ETF',
  VFH: 'Vanguard Financials ETF',
  KO: 'The Coca-Cola Company',
  EEM: 'iShares MSCI Emerging Ma...'
};

const Card = ({ children, className, ...props }: { children?: React.ReactNode, className?: string } & React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("bg-white rounded-lg border border-slate-200 shadow-sm", className)} {...props}>{children}</div>
);

const fmtPct = (val: number, decimals: number = 2, showPlus: boolean = false) => {
    const str = (Math.abs(val) * 100).toFixed(decimals) + '%';
    if (val > 0) return (showPlus ? '+' : '') + str;
    if (val < 0) return '-' + str;
    return '0.00%';
};

export default function Dashboard() {
  const [tickers, setTickers] = useState<string[]>(['AAPL', 'MSFT', 'KO', 'VFH', 'VHT', 'EEM']);
  const [newTicker, setNewTicker] = useState('');

  const [benchmarks, setBenchmarks] = useState<string[]>(['SPY', 'QQQ', 'IWB']);
  const [newBenchmark, setNewBenchmark] = useState('');
  const [benchmark, setBenchmark] = useState('SPY');
  
  const [horizon, setHorizon] = useState('1y');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [rawPayload, setRawPayload] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'historicas' | 'mpt' | 'erc' | 'comparativa'>('historicas');
  const [chartMode, setChartMode] = useState<'cumulative' | 'base100' | 'prices' | 'daily'>('cumulative');
  const [riskFreeRate, setRiskFreeRate] = useState(0.045);

  const [covFormat, setCovFormat] = useState<'decimal' | 'scientific' | 'percent'>('decimal');
  const [covPeriod, setCovPeriod] = useState<'annual' | 'daily'>('annual');

  const [showSettings, setShowSettings] = useState(false);
  const [tempRf, setTempRf] = useState(0.045);
  const [tempBmk, setTempBmk] = useState('SPY');
  const [customBmk, setCustomBmk] = useState('');

  const [mptMaxWeight, setMptMaxWeight] = useState(1);
  const [mptMinWeight, setMptMinWeight] = useState(0);
  const [mptTab, setMptTab] = useState<'frontera' | 'pesos' | 'simulador' | 'teoria'>('frontera');
  const [mptSimulations, setMptSimulations] = useState(5000);
  const [compChartTab, setCompChartTab] = useState<'crecimiento' | 'drawdown' | 'volatilidad'>('crecimiento');
  const [compFilters, setCompFilters] = useState<Record<string, boolean>>({'maxSharpe': true, 'minVar': true, 'erc': true, 'spy': true, 'qqq': true, 'iwb': true, 'eq': true});
  const [customSimWeights, setCustomSimWeights] = useState<Record<string, number>>({});

  const [showNube, setShowNube] = useState(true);
  const [showCAL, setShowCAL] = useState(true);
  const [showArea, setShowArea] = useState(true);
  const [showLabels, setShowLabels] = useState(true);

  const chartRef = useRef<any>(null);

  const allFetchedTickers = useMemo(() => {
    return Array.from(new Set([...tickers, ...benchmarks, benchmark]));
  }, [tickers, benchmarks, benchmark]);

  const handleHorizonChange = (h: string) => {
    setHorizon(h);
    const end = new Date();
    const start = new Date();
    if (h === '1m') start.setMonth(start.getMonth() - 1);
    else if (h === '3m') start.setMonth(start.getMonth() - 3);
    else if (h === '6m') start.setMonth(start.getMonth() - 6);
    else if (h === 'ytd') { start.setMonth(0); start.setDate(1); }
    else if (h === '1y') start.setFullYear(start.getFullYear() - 1);
    else if (h === '3y') start.setFullYear(start.getFullYear() - 3);
    else if (h === '5y') start.setFullYear(start.getFullYear() - 5);
    else if (h === '10y') start.setFullYear(start.getFullYear() - 10);
    
    if (h !== 'custom') {
        setStartDate(start.toISOString().split('T')[0]);
        setEndDate(end.toISOString().split('T')[0]);
    }
  };

  const handleAddTicker = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const t = newTicker.trim().toUpperCase();
    if (t && !tickers.includes(t)) setTickers(prev => [...prev, t]);
    setNewTicker('');
  };

  const handleRemoveTicker = (t: string) => { setTickers(tickers.filter(x => x !== t)); };

  const handleAddBenchmark = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const b = newBenchmark.trim().toUpperCase();
    if (b && !benchmarks.includes(b)) setBenchmarks(prev => [...prev, b]);
    setNewBenchmark('');
  };

  const handleRemoveBenchmark = (b: string) => {
    const updated = benchmarks.filter(x => x !== b);
    setBenchmarks(updated);
    if (benchmark === b && updated.length > 0) {
      setBenchmark(updated[0]);
    }
  };

  useEffect(() => {
    if (allFetchedTickers.length === 0) {
        setRawPayload([]);
        return;
    }

    const timer = setTimeout(async () => {
        setIsProcessing(true);
        try {
            const res = await fetch('/api/finance/historical', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tickers: allFetchedTickers, startDate, endDate })
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Error al conectar');
            
            setRawPayload(json.data);
            
            if (json.warnings && json.warnings.length > 0) {
                alert(`Advertencia:\n${json.warnings.join('\n')}`);
                if (json.validTickers) {
                    const newTickers = tickers.filter(t => json.validTickers.includes(t));
                    if (newTickers.length !== tickers.length) {
                        setTickers(newTickers);
                    }
                }
            }
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        } finally {
            setIsProcessing(false);
        }
    }, 400);

    return () => clearTimeout(timer);
  }, [allFetchedTickers, startDate, endDate]);

  const processedData = useMemo(() => {
    if (!rawPayload.length) return [];
    const peak: Record<string, number> = {};
    return rawPayload.map((row, i, arr) => {
      const newRow: any = { date: row.date, timestamp: row.timestamp };
      allFetchedTickers.forEach(t => {
        const price = row[t];
        newRow[t] = price;
        if (price !== undefined && price !== null) {
          if (peak[t] === undefined || price > peak[t]) peak[t] = price;
          if (i > 0 && arr[i-1][t] != null) newRow[`${t}_daily`] = (price / arr[i-1][t]) - 1;
          else newRow[`${t}_daily`] = 0;
          const firstValid = arr.find(r => r[t] != null)?.[t] || price;
          newRow[`${t}_cum`] = (price / firstValid) - 1;
          newRow[`${t}_base100`] = (price / firstValid) * 100;
        }
      });
      return newRow;
    });
  }, [rawPayload, allFetchedTickers]);

  const stats = useMemo(() => {
    const s: Record<string, ReturnType<typeof calculateStats>> = {};
    if (!processedData.length) return s;
    allFetchedTickers.forEach(asset => { s[asset] = calculateStats(processedData, asset, riskFreeRate); });
    return s;
  }, [processedData, riskFreeRate, allFetchedTickers]);

  const { correlationMatrix, covarianceMatrix, dailyCovarianceMatrix, avgCorrelation, divIndex } = useMemo(() => {
    const corr: Record<string, Record<string, number>> = {};
    const cov: Record<string, Record<string, number>> = {};
    const dailyCov: Record<string, Record<string, number>> = {};
    
    if (!processedData.length) return { correlationMatrix: corr, covarianceMatrix: cov, dailyCovarianceMatrix: dailyCov, avgCorrelation: 0, divIndex: 0 };
    
    let totalCorr = 0; let corrCount = 0;
    const portfolioAssets = tickers;

    allFetchedTickers.forEach(a1 => {
      corr[a1] = {}; cov[a1] = {}; dailyCov[a1] = {};
      allFetchedTickers.forEach(a2 => {
        if (a1 === a2) {
            corr[a1][a2] = 1.0; 
            cov[a1][a2] = stats[a1]?.annualVariance || 0;
            dailyCov[a1][a2] = Math.pow(stats[a1]?.stdDev || 0, 2);
        } else {
            const { correlation, covariance } = calculateCorrelation(processedData, a1, a2);
            corr[a1][a2] = correlation; 
            cov[a1][a2] = covariance;
            dailyCov[a1][a2] = covariance / 252; // roughly daily cov
            
            if (portfolioAssets.includes(a1) && portfolioAssets.includes(a2)) {
                totalCorr += correlation;
                corrCount++;
            }
        }
      });
    });

    const avgCorr = corrCount > 0 ? totalCorr / corrCount : 0;
    // Simple naive diversification index 1 - avgCorr (scaled)
    const divIdx = Math.max(0, Math.min(100, (1 - avgCorr) * 100));

    return { correlationMatrix: corr, covarianceMatrix: cov, dailyCovarianceMatrix: dailyCov, avgCorrelation: avgCorr, divIndex: divIdx };
  }, [processedData, stats, allFetchedTickers, tickers]);

  const mptResults = useMemo(() => {
    if (!processedData.length || Object.keys(covarianceMatrix).length === 0) return null;
    const portfolioAssets = tickers;
    if (portfolioAssets.length < 2) return null;
    return runMarkowitz(portfolioAssets, stats, covarianceMatrix, riskFreeRate, mptSimulations, mptMinWeight, mptMaxWeight);
  }, [stats, covarianceMatrix, riskFreeRate, tickers, processedData.length, mptSimulations, mptMinWeight, mptMaxWeight]);

  const ercWeights = useMemo(() => {
    if (!processedData.length || Object.keys(covarianceMatrix).length === 0) return null;
    return calculateERC(tickers, stats, covarianceMatrix);
  }, [stats, tickers, covarianceMatrix, processedData.length]);

  const exportChartPNG = () => {
     if (chartRef.current) {
        const url = chartRef.current.toBase64Image();
        const a = document.createElement('a');
        a.href = url; a.download = 'Grafico_Historico.png'; a.click();
     }
  };

  const exportExcel = (chartOnly = false) => {
    if (!processedData.length) return;
    const wb = XLSX.utils.book_new();

    if (chartOnly) {
        const data = processedData.map(d => {
          const row: any = { Fecha: d.date };
          tickers.forEach(t => {
            const suffix = chartMode === 'cumulative' ? '_cum' : chartMode === 'base100' ? '_base100' : chartMode === 'daily' ? '_daily' : '';
            row[t] = (chartMode === 'cumulative' || chartMode === 'daily') ? d[`${t}${suffix}`] * 100 : d[`${t}${suffix}`];
          });
          return row;
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), "Datos Grafico");
        XLSX.writeFile(wb, "Grafico_Data.xlsx");
        return;
    }

    const prices = processedData.map(d => {
      const row: any = { Fecha: d.date };
      tickers.forEach(t => row[t] = d[t]); return row;
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(prices), "Precios Ajustados");

    const daily = processedData.map(d => {
      const row: any = { Fecha: d.date };
      tickers.forEach(t => row[t] = d[`${t}_daily`]); return row;
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(daily), "Rendimientos Diarios");

    const cum = processedData.map(d => {
      const row: any = { Fecha: d.date };
      tickers.forEach(t => row[t] = d[`${t}_cum`]); return row;
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cum), "Rendimiento Acumulado");

    const summary = tickers.map(t => ({
      Activo: t, 'Precio Actual ($)': stats[t]?.lastPrice,
      'Retorno Total (%)': stats[t]?.totalReturn, 'Retorno Anualizado (%)': stats[t]?.annualReturn,
      'Volatilidad Anualizada (%)': stats[t]?.annualStdDev, 'Ratio Sharpe': stats[t]?.sharpeRatio,
      'Max Drawdown (%)': stats[t]?.maxDrawdown,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Resumen Métricas");
    XLSX.writeFile(wb, "Analisis_Financiero.xlsx");
  };

  const openSettings = () => {
      setTempRf(riskFreeRate);
      setTempBmk(benchmark);
      setCustomBmk('');
      setShowSettings(true);
  };

  const handleSaveSettings = () => {
      setRiskFreeRate(tempRf);
      
      let finalBmk = tempBmk;
      if (customBmk.trim() !== '') {
         finalBmk = customBmk.trim().toUpperCase();
      }
      setBenchmark(finalBmk);
      
      if (!benchmarks.includes(finalBmk)) {
          setBenchmarks(prev => [...prev, finalBmk]);
      }
      
      setShowSettings(false);
  };

  const handleActualizar = () => {
    setIsProcessing(true);
    setTimeout(() => setIsProcessing(false), 800);
  };

  const renderSettingsModal = () => {
      if (!showSettings) return null;
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-[#1e3a8a] px-6 py-4 flex justify-between items-center text-white shrink-0">
               <div className="flex items-center gap-3">
                  <Settings className="w-6 h-6 text-blue-200" />
                  <div>
                     <h2 className="text-lg font-bold">Parámetros Cuantitativos de Análisis</h2>
                     <p className="text-xs text-blue-200">Tasa Libre de Riesgo (Rf) e Índices de Benchmark de Mercado (Rm)</p>
                  </div>
               </div>
               <button onClick={() => setShowSettings(false)} className="text-blue-200 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
               </button>
            </div>
  
            <div className="p-6 overflow-y-auto flex-1 space-y-8 bg-slate-50 text-left">
               <div>
                  <div className="flex justify-between items-end mb-4 border-b border-slate-200 pb-2">
                     <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                        <span className="bg-[#1e3a8a] text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">1</span>
                        Tasa Libre de Riesgo (Rf)
                     </h3>
                     <span className="text-xs text-slate-400 font-medium">Utilizada para Sp, Tp y αi</span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                     <div className="col-span-1">
                        <label className="block text-xs font-bold text-slate-500 mb-2">Tasa Anualizada (%):</label>
                        <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden bg-white focus-within:ring-2 focus-within:ring-[#1e3a8a] shadow-sm">
                           <input type="number" step="0.01" value={(tempRf * 100).toFixed(2)} onChange={e => setTempRf(Number(e.target.value) / 100)} className="w-full px-4 py-2 text-lg font-black text-slate-800 border-none focus:ring-0 outline-none" />
                           <span className="bg-slate-100 px-4 py-2 font-bold text-slate-500 border-l border-slate-300">%</span>
                        </div>
                     </div>
                     
                     <div className="col-span-2">
                        <label className="block text-xs font-bold text-slate-500 mb-2">Pre-sintonías de Mercado:</label>
                        <div className="grid grid-cols-2 gap-3">
                           {[
                               { label: 'US 3-Month T-Bill', val: 4.50 },
                               { label: 'US Fed Funds Rate', val: 5.25 },
                               { label: 'BCE Depo Rate', val: 3.50 },
                               { label: 'Bono Tesoro 10Y', val: 4.25 },
                           ].map(preset => (
                               <button key={preset.label} onClick={() => setTempRf(preset.val / 100)} className="flex justify-between items-center bg-white border border-slate-200 rounded-md p-2 hover:border-[#1e3a8a] hover:bg-blue-50 transition-colors shadow-sm text-left">
                                   <span className="text-xs font-bold text-slate-600">{preset.label}</span>
                                   <span className="text-xs font-black bg-[#1e3a8a] text-white px-2 py-0.5 rounded">{preset.val.toFixed(2)}%</span>
                               </button>
                           ))}
                        </div>
                     </div>
                  </div>
               </div>
  
               <div>
                  <div className="flex justify-between items-end mb-4 border-b border-slate-200 pb-2">
                     <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                        <span className="bg-[#1e3a8a] text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">2</span>
                        Índice de Benchmark de Mercado (Rm)
                     </h3>
                     <span className="text-xs text-slate-400 font-medium">Base para cálculo de βi, αi y comparativa de mercado (Exclusivo Benchmark)</span>
                  </div>
                  
                  <p className="text-sm text-slate-600 mb-4 font-medium">Selecciona el Benchmark principal de referencia o añade tickers de benchmark adicionales:</p>
  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                     {[
                          { ticker: 'SPY', type: 'S&P 500 ETF', desc: 'SPDR S&P 500 ETF Trust' },
                          { ticker: 'QQQ', type: 'Nasdaq 100 ETF', desc: 'Invesco QQQ Trust Series 1' },
                          { ticker: 'IWB', type: 'Russell 1000 ETF', desc: 'iShares Russell 1000 ETF' },
                          { ticker: 'VTI', type: 'Mercado Total EE.UU.', desc: 'Vanguard Total Stock Market ETF' },
                          { ticker: 'ACWI', type: 'Renta Variable Global', desc: 'MSCI All Country World Index ETF' },
                          { ticker: 'EEM', type: 'Mercados Emergentes', desc: 'iShares MSCI Emerging Markets ETF' },
                          { ticker: 'ILF', type: 'América Latina', desc: 'iShares Latin America 40 ETF' },
                          { ticker: 'TLT', type: 'Renta Fija Soberana', desc: 'iShares 20+ Year Treasury Bond ETF' },
                          { ticker: 'GLD', type: 'Materias Primas', desc: 'SPDR Gold Shares (Oro ETF)' },
                     ].map(b => (
                          <button key={b.ticker} onClick={() => { setTempBmk(b.ticker); setCustomBmk(''); }} className={cn("p-3 rounded-lg border text-left flex flex-col gap-1 transition-all shadow-sm", tempBmk === b.ticker && customBmk === '' ? "border-[#1e3a8a] bg-blue-50 ring-1 ring-[#1e3a8a]" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50")}>
                             <div className="flex justify-between items-center w-full">
                                 <span className="font-black text-slate-800">{b.ticker}</span>
                                 <span className="text-[9px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">{b.type}</span>
                             </div>
                             <span className="text-xs text-slate-500 font-medium truncate w-full">{b.desc}</span>
                          </button>
                     ))}
                  </div>
  
                  <div className="mt-6">
                      <label className="block text-xs font-bold text-slate-500 mb-2">O escribe otro ticker de Benchmark personalizado (exclusivo para referencia):</label>
                      <input type="text" value={customBmk} onChange={e => { setCustomBmk(e.target.value.toUpperCase()); setTempBmk(''); }} placeholder="Ej. IWB, ^GSPC, VOO, ACWI, IWDA.L, VT..." className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-[#1e3a8a] outline-none shadow-sm uppercase font-mono bg-white" />
                  </div>
  
               </div>
            </div>
  
            <div className="bg-white border-t border-slate-200 px-6 py-4 flex justify-between items-center shrink-0">
               <div className="text-xs font-medium text-slate-500">
                  Benchmark Principal (Rm): <span className="font-bold text-slate-800">{customBmk || tempBmk}</span> | Rf: <span className="font-bold text-slate-800">{(tempRf * 100).toFixed(2)}%</span>
               </div>
               <div className="flex gap-3">
                   <button onClick={() => setShowSettings(false)} className="px-4 py-2 text-sm font-bold text-slate-600 hover:text-slate-800 transition-colors">Cancelar</button>
                   <button onClick={handleSaveSettings} className="px-6 py-2 text-sm font-bold text-white bg-[#1e3a8a] hover:bg-blue-900 rounded-lg shadow-md transition-colors flex items-center gap-2">
                       <Settings className="w-4 h-4" />
                       Guardar y Recalcular
                   </button>
               </div>
            </div>
          </div>
        </div>
      );
  };

  const renderHeader = () => (
    <div className="bg-[#1e3a8a] py-4 px-6 flex justify-between items-center shrink-0 shadow-md z-10 relative">
      {renderSettingsModal()}
      <div className="flex items-center gap-4">
        <div className="bg-white p-1 rounded-lg shadow-sm">
          <img src="https://www.iesa.edu.ve/img/logo.png" alt="IESA" className="w-10 h-10 object-contain" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Teoría Moderna de Portafolios y Optimización</h1>
          <p className="text-xs text-blue-200 mt-0.5 font-medium">Modelos y Simulaciones Financieras - IESA - Desarrollada por Fernando De Quintal R.</p>
        </div>
      </div>
      <div className="flex items-center gap-4 text-sm">
        <button onClick={openSettings} className="flex items-center gap-4 bg-blue-900/40 hover:bg-blue-800/60 transition-colors border border-blue-700/50 px-4 py-1.5 rounded-lg shadow-inner text-white text-sm group">
            <div className="flex items-center gap-2 border-r border-blue-700/50 pr-4">
                <span className="font-semibold text-blue-300">RF:</span>
                <span className="font-bold text-white tracking-wide">{(riskFreeRate * 100).toFixed(2)}%</span>
            </div>
            <div className="flex items-center gap-2 border-r border-blue-700/50 pr-4">
                <span className="font-semibold text-blue-300">BMK:</span>
                <span className="font-bold text-white tracking-wide">{benchmark}</span>
            </div>
            <Settings className="w-4 h-4 text-blue-300 group-hover:rotate-45 transition-transform" />
        </button>
        <button onClick={handleActualizar} disabled={isProcessing} className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 transition-colors py-1.5 px-4 rounded-md text-white flex items-center gap-2 font-bold shadow-sm">
          <RefreshCw className={cn("w-4 h-4", isProcessing && "animate-spin")} /><span>Actualizar</span>
        </button>
        <button onClick={() => exportExcel(false)} className="bg-rose-600 hover:bg-rose-700 transition-colors py-1.5 px-4 rounded-md text-white flex items-center gap-2 font-bold shadow-sm">
          <Download className="w-4 h-4" /><span>Descargar Excel (.xlsx)</span>
        </button>
      </div>
    </div>
  );

  const renderControlPanel = () => (
    <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0 shadow-sm relative z-0 space-y-3">
        <div className="flex flex-wrap lg:flex-nowrap gap-6 items-end justify-between">
            <div className="flex-1 min-w-[300px]">
                <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Horizonte de Análisis:</label>
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                    <div className="flex bg-slate-100 p-1 rounded-md border border-slate-200 shadow-inner">
                        {['1m', '3m', '6m', 'ytd', '1y', '3y', '5y', '10y', 'custom'].map(h => (
                            <button key={h} onClick={() => handleHorizonChange(h)} className={cn("px-3 py-1.5 text-xs font-bold rounded transition-all", horizon === h ? "bg-white text-blue-700 shadow border border-slate-200" : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 border border-transparent")}>
                                {h === '1m' ? '1 mes' : h === '3m' ? '3 meses' : h === '6m' ? '6 meses' : h === 'ytd' ? 'YTD' : h === '1y' ? '1 año' : h === '3y' ? '3 años' : h === '5y' ? '5 años' : h === '10y' ? '10 años' : 'Personalizado'}
                            </button>
                        ))}
                    </div>
                    {horizon === 'custom' && (
                        <div className="flex gap-2 items-center">
                            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-xs font-mono text-slate-700 shadow-sm focus:ring-1 focus:ring-blue-500" />
                            <span className="text-slate-400 font-bold">-</span>
                            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border border-slate-300 rounded-md px-2 py-1.5 text-xs font-mono text-slate-700 shadow-sm focus:ring-1 focus:ring-blue-500" />
                        </div>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap items-end gap-6">
                {/* Add Portfolio Asset */}
                <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Añadir Activo al Portafolio:</label>
                    <form onSubmit={handleAddTicker} className="flex gap-2">
                        <input type="text" value={newTicker} onChange={e => setNewTicker(e.target.value)} placeholder="Ticker (ej. NVDA)..." className="w-40 border border-slate-300 rounded-md px-3 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 uppercase font-mono shadow-sm" />
                        <button type="submit" className="bg-[#1e3a8a] text-white hover:bg-blue-900 px-3 py-1.5 rounded-md text-sm font-bold shadow-sm transition-colors">+ Activo</button>
                    </form>
                </div>

                {/* Add Benchmark Asset */}
                <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Añadir Benchmark Exclusivo:</label>
                    <form onSubmit={handleAddBenchmark} className="flex gap-2">
                        <input type="text" value={newBenchmark} onChange={e => setNewBenchmark(e.target.value)} placeholder="Benchmark (ej. IWB)..." className="w-40 border border-slate-300 rounded-md px-3 py-1.5 text-sm focus:ring-1 focus:ring-amber-500 uppercase font-mono shadow-sm" />
                        <button type="submit" className="bg-amber-600 text-white hover:bg-amber-700 px-3 py-1.5 rounded-md text-sm font-bold shadow-sm transition-colors">+ Benchmark</button>
                    </form>
                </div>

                {isProcessing && (
                    <div className="flex items-center gap-2 text-blue-600 text-sm font-bold pb-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Procesando...</span>
                    </div>
                )}
            </div>
        </div>
        
        {/* Portafolio Activos Chips & Benchmarks Chips */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-100">
            {/* Portafolio Section */}
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Portafolio ({tickers.length} Activos):</span>
                <div className="flex flex-wrap gap-1.5">
                    {tickers.map((t, i) => (
                        <div key={t} className="flex items-center gap-1.5 bg-slate-50 hover:bg-white text-slate-800 px-3 py-1 rounded-full border border-slate-200 text-xs font-bold shadow-sm transition-all">
                            <span className="w-2.5 h-2.5 rounded-full shadow-xs" style={{backgroundColor: CHART_COLORS[i % CHART_COLORS.length]}}></span>
                            {t}
                            <button onClick={() => handleRemoveTicker(t)} className="ml-1 text-slate-400 hover:text-rose-500 transition-colors" title={`Eliminar ${t} del portafolio`}><X className="w-3.5 h-3.5" /></button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Benchmarks Section */}
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5" /> Benchmarks ({benchmarks.length}):
                </span>
                <div className="flex flex-wrap gap-1.5">
                    {benchmarks.map(b => {
                        const isPrimary = benchmark === b;
                        return (
                            <div key={b} className={cn("flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold shadow-sm transition-all cursor-pointer", isPrimary ? "bg-amber-100 border-amber-400 text-amber-900 ring-2 ring-amber-400" : "bg-white border-slate-200 text-slate-600 hover:border-amber-300 hover:bg-amber-50/50")} onClick={() => setBenchmark(b)} title={`Hacer clic para fijar ${b} como Benchmark Principal (Rm)`}>
                                <span>{b}</span>
                                {isPrimary ? (
                                    <span className="text-[9px] bg-amber-600 text-white px-1.5 py-0.2 rounded font-black tracking-tight">Rm Principal</span>
                                ) : (
                                    <span className="text-[9px] text-slate-400 font-medium">(Referencia)</span>
                                )}
                                {benchmarks.length > 1 && (
                                    <button onClick={(e) => { e.stopPropagation(); handleRemoveBenchmark(b); }} className="ml-1 text-slate-400 hover:text-rose-500 transition-colors" title={`Eliminar benchmark ${b}`}><X className="w-3.5 h-3.5" /></button>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    </div>
  );

  const renderTabs = () => (
    <div className="px-6 pt-4 flex gap-2 border-b border-slate-200 bg-slate-50 shrink-0 overflow-x-auto custom-scrollbar shadow-sm">
      <button className={cn("px-5 py-3 text-sm font-bold border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap", activeTab === 'historicas' ? "border-blue-600 text-blue-700 bg-white rounded-t-lg shadow-sm" : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-t-lg")} onClick={() => setActiveTab('historicas')}>
        <BarChart3 className="w-4 h-4" /> 1. Históricas & Cálculos Previos
      </button>
      <button className={cn("px-5 py-3 text-sm font-bold border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap", activeTab === 'mpt' ? "border-blue-600 text-blue-700 bg-white rounded-t-lg shadow-sm" : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-t-lg")} onClick={() => setActiveTab('mpt')}>
        <Calculator className="w-4 h-4" /> 2. Optimización Markowitz (MPT)
      </button>
      <button className={cn("px-5 py-3 text-sm font-bold border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap", activeTab === 'erc' ? "border-blue-600 text-blue-700 bg-white rounded-t-lg shadow-sm" : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-t-lg")} onClick={() => setActiveTab('erc')}>
        <PieChart className="w-4 h-4" /> 3. Paridad de Riesgo (ERC)
      </button>
      <button className={cn("px-5 py-3 text-sm font-bold border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap", activeTab === 'comparativa' ? "border-blue-600 text-blue-700 bg-white rounded-t-lg shadow-sm" : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-t-lg")} onClick={() => setActiveTab('comparativa')}>
        <TrendingUp className="w-4 h-4" /> 4. Comparativa de Portafolios
      </button>
    </div>
  );

  const renderHistoricas = () => {
    if (!processedData.length) return <div className="p-12 text-center text-slate-400 font-medium">Procesando datos...</div>;
    const suffix = chartMode === 'cumulative' ? '_cum' : chartMode === 'base100' ? '_base100' : chartMode === 'daily' ? '_daily' : '';

    const chartConfig = {
      labels: processedData.map(d => d.date),
      datasets: allFetchedTickers.map((t, i) => {
        const isBmk = benchmarks.includes(t) || t === benchmark;
        const bmkColor = t === benchmark ? '#dc2626' : '#d97706';
        const color = isBmk ? bmkColor : CHART_COLORS[tickers.indexOf(t) % CHART_COLORS.length];
        
        return {
          label: isBmk ? (t === benchmark ? `${t} (Rm Principal)` : `${t} (Benchmark)`) : t,
          data: processedData.map(d => (chartMode === 'cumulative' || chartMode === 'daily') ? d[`${t}${suffix}`] * 100 : d[`${t}${suffix}`]),
          borderColor: color,
          backgroundColor: color + '20',
          borderWidth: isBmk ? (t === benchmark ? 2.5 : 2) : 2,
          borderDash: isBmk ? [5, 5] : [],
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.1, 
          fill: false
        };
      })
    };

    const chartOptions = {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index' as const, intersect: false },
        plugins: {
            legend: { position: 'bottom' as const, labels: { color: '#475569', usePointStyle: true, boxWidth: 8 } },
            tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)', titleColor: '#f8fafc', bodyColor: '#f8fafc', padding: 12, cornerRadius: 8 }
        },
        scales: {
            x: { grid: { display: false }, ticks: { color: '#64748b' } },
            y: { grid: { color: '#e2e8f0', drawBorder: false }, ticks: { color: '#64748b' } }
        }
    };

    const getCorrelationColor = (val: number) => {
       if (val >= 0.8) return 'bg-[#1e3a8a] text-white font-bold'; // darkest blue
       if (val >= 0.5) return 'bg-blue-600 text-white font-bold';
       if (val >= 0.2) return 'bg-blue-300 text-blue-900 font-semibold';
       if (val >= -0.2) return 'bg-slate-50 text-slate-500';
       if (val >= -0.5) return 'bg-rose-300 text-rose-900 font-semibold';
       return 'bg-rose-600 text-white font-bold';
    };

    const renderSharpeBadge = (sharpe: number) => {
        if (sharpe >= 1.5) return <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 uppercase tracking-wide">Excelente</span>;
        if (sharpe >= 1.0) return <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-700 border border-blue-200 uppercase tracking-wide">Bueno</span>;
        return <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-700 border border-amber-200 uppercase tracking-wide">Bajo</span>;
    };

    const sortedPortfolioAssets = [...tickers].sort((a, b) => {
        return (stats[b]?.sharpeRatio || 0) - (stats[a]?.sharpeRatio || 0);
    });

    const sortedBenchmarkAssets = [...benchmarks].sort((a, b) => {
        if (a === benchmark) return -1;
        if (b === benchmark) return 1;
        return (stats[b]?.sharpeRatio || 0) - (stats[a]?.sharpeRatio || 0);
    });

    const formatCov = (val: number) => {
        if (covFormat === 'decimal') return val.toFixed(5);
        if (covFormat === 'percent') return (val * 100).toFixed(4) + '%';
        if (covFormat === 'scientific') return val.toExponential(3);
        return val;
    };

    const activeCovMatrix = covPeriod === 'annual' ? covarianceMatrix : dailyCovarianceMatrix;

    const analysisAssets = tickers.filter(a => a !== benchmark);
    let bestSharpe = analysisAssets[0];
    let lowestVol = analysisAssets[0];
    let highestReturn = analysisAssets[0];
    
    analysisAssets.forEach(a => {
        if (stats[a]?.sharpeRatio > (stats[bestSharpe]?.sharpeRatio || -Infinity)) bestSharpe = a;
        if (stats[a]?.annualStdDev < (stats[lowestVol]?.annualStdDev || Infinity)) lowestVol = a;
        if (stats[a]?.totalReturn > (stats[highestReturn]?.totalReturn || -Infinity)) highestReturn = a;
    });

    let minCorr = Infinity;
    let minCorrPair = ['', ''];
    let maxCorr = -Infinity;
    let maxCorrPair = ['', ''];

    for (let i = 0; i < analysisAssets.length; i++) {
        for (let j = i + 1; j < analysisAssets.length; j++) {
            const a1 = analysisAssets[i];
            const a2 = analysisAssets[j];
            const corr = correlationMatrix[a1]?.[a2] ?? 0;
            if (corr < minCorr) { minCorr = corr; minCorrPair = [a1, a2]; }
            if (corr > maxCorr) { maxCorr = corr; maxCorrPair = [a1, a2]; }
        }
    }

    return (
      <div className="p-6 space-y-6">
        {/* SUMMARY CARDS */}
        {analysisAssets.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Mayor Eficiencia (Sharpe) */}
                <Card className="p-4">
                    <div className="flex justify-between items-start mb-2">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mayor Eficiencia (Sharpe)</div>
                        <div className="bg-emerald-50 p-1.5 rounded-md"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500"><path d="M12 15a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"/><path d="M8.2 13.8 7 23l5-3 5 3-1.2-9.2"/></svg></div>
                    </div>
                    <div className="flex items-end gap-2 mb-1">
                        <div className="text-xl font-black text-slate-800">{bestSharpe}</div>
                        <div className="bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded text-xs font-bold mb-0.5">Sharpe: {stats[bestSharpe]?.sharpeRatio.toFixed(2)}</div>
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium truncate mb-4">{ASSET_NAMES[bestSharpe] || bestSharpe}</div>
                    <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono border-t border-slate-100 pt-3 mt-auto">
                        <div>Rend. Anual: <span className="font-bold text-slate-700">{fmtPct(stats[bestSharpe]?.annualReturn || 0, 1)}</span></div>
                        <div>Vol: <span className="font-bold text-slate-700">{fmtPct(stats[bestSharpe]?.annualStdDev || 0, 1)}</span></div>
                    </div>
                </Card>

                {/* 2. Menor Volatilidad (Defensivo) */}
                <Card className="p-4">
                    <div className="flex justify-between items-start mb-2">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Menor Volatilidad (Defensivo)</div>
                        <div className="bg-blue-50 p-1.5 rounded-md"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
                    </div>
                    <div className="flex items-end gap-2 mb-1">
                        <div className="text-xl font-black text-slate-800">{lowestVol}</div>
                        <div className="bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded text-xs font-bold mb-0.5">σ: {fmtPct(stats[lowestVol]?.annualStdDev || 0, 1)}</div>
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium truncate mb-4">{ASSET_NAMES[lowestVol] || lowestVol}</div>
                    <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono border-t border-slate-100 pt-3 mt-auto">
                        <div>Max Drawdown: <span className="font-bold text-rose-600">{fmtPct(stats[lowestVol]?.maxDrawdown || 0, 1)}</span></div>
                        <div>Var: <span className="font-bold text-slate-700">{(stats[lowestVol]?.annualVariance || 0).toFixed(4)}</span></div>
                    </div>
                </Card>

                {/* 3. Mayor Retorno en Periodo */}
                <Card className="p-4">
                    <div className="flex justify-between items-start mb-2">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mayor Retorno en Periodo</div>
                        <div className="bg-amber-50 p-1.5 rounded-md"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg></div>
                    </div>
                    <div className="flex items-end gap-2 mb-1">
                        <div className="text-xl font-black text-slate-800">{highestReturn}</div>
                        <div className="bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded text-xs font-bold mb-0.5">{fmtPct(stats[highestReturn]?.totalReturn || 0, 1, true)}</div>
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium truncate mb-4">{ASSET_NAMES[highestReturn] || highestReturn}</div>
                    <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono border-t border-slate-100 pt-3 mt-auto">
                        <div>Rend. Diario: <span className="font-bold text-slate-700">{fmtPct(stats[highestReturn]?.meanReturn || 0, 3)}</span></div>
                        <div>Mejor Día: <span className="font-bold text-emerald-600">{fmtPct(stats[highestReturn]?.bestDay || 0, 1, true)}</span></div>
                    </div>
                </Card>

                {/* 4. Diversificación & Co-Movimiento */}
                <Card className="p-4">
                    <div className="flex justify-between items-start mb-2">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Diversificación & Co-Movimiento</div>
                        <div className="bg-purple-50 p-1.5 rounded-md"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-purple-500"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg></div>
                    </div>
                    <div className="flex items-end gap-2 mb-1">
                        <div className="text-xl font-black text-slate-800">{divIndex.toFixed(0)}%</div>
                        <div className="text-xs text-slate-500 mb-1">Índice Diversificación</div>
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium truncate mb-4">Mayor cobertura: <span className="font-bold text-slate-700">{minCorrPair[0]} ↔ {minCorrPair[1]}</span> ({minCorr === Infinity ? '-' : minCorr.toFixed(2)})</div>
                    <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono border-t border-slate-100 pt-3 mt-auto">
                        <div>Corr. Media: <span className="font-bold text-slate-700">{avgCorrelation.toFixed(3)}</span></div>
                        <div>Max Corr: <span className="font-bold text-slate-700">{maxCorrPair[0]}-{maxCorrPair[1]}</span></div>
                    </div>
                </Card>
            </div>
        )}

        <Card>
          <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap justify-between items-center gap-4 bg-slate-50/50 rounded-t-lg">
            <div>
               <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                 <TrendingUp className="w-5 h-5 text-blue-600" /> Dinámica Temporal & Historial de Precios
               </h3>
               <p className="text-xs text-slate-500 mt-1 font-medium">Rendimiento porcentual acumulado normalizado (Base t0 = 0%)</p>
            </div>
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex bg-slate-100 rounded-md p-1 border border-slate-200 shadow-inner">
                 <button onClick={() => setChartMode('cumulative')} className={cn("px-4 py-2 text-xs font-bold rounded transition-all shadow-sm", chartMode === 'cumulative' ? "bg-slate-800 text-white" : "bg-transparent text-slate-600 hover:bg-slate-200/50")}>% Retorno % Normalizado</button>
                 <button onClick={() => setChartMode('base100')} className={cn("px-4 py-2 text-xs font-bold rounded transition-all shadow-sm", chartMode === 'base100' ? "bg-slate-800 text-white" : "bg-transparent text-slate-600 hover:bg-slate-200/50")}>Simple Acumulado</button>
                 <button onClick={() => setChartMode('prices')} className={cn("px-4 py-2 text-xs font-bold rounded transition-all shadow-sm", chartMode === 'prices' ? "bg-slate-800 text-white" : "bg-transparent text-slate-600 hover:bg-slate-200/50")}>$ Precios Nominales ($)</button>
                 <button onClick={() => setChartMode('daily')} className={cn("px-4 py-2 text-xs font-bold rounded transition-all shadow-sm", chartMode === 'daily' ? "bg-slate-800 text-white" : "bg-transparent text-slate-600 hover:bg-slate-200/50")}>Simple Diario (Rt)</button>
              </div>
              <div className="flex gap-2">
                 <button onClick={exportChartPNG} className="px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-md flex items-center gap-1.5 hover:bg-slate-50 shadow-sm transition-colors">
                    <Download className="w-3.5 h-3.5" /> PNG
                 </button>
                 <button onClick={() => exportExcel(true)} className="px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-md flex items-center gap-1.5 hover:bg-slate-50 shadow-sm transition-colors">
                    <Download className="w-3.5 h-3.5" /> XLSX
                 </button>
              </div>
            </div>
          </div>
          <div className="px-6 pt-3 pb-1 flex justify-start">
             <button className="px-3 py-1.5 text-xs font-bold text-white bg-slate-800 rounded flex items-center gap-1.5 hover:bg-slate-700 transition-colors shadow-sm">
                <Maximize className="w-3.5 h-3.5" /> Pantalla Completa
             </button>
          </div>
          <div className="p-6 h-[450px]">
            <Line ref={chartRef} data={chartConfig} options={chartOptions as any} />
          </div>
        </Card>

        <Card>
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap gap-4 justify-between items-center rounded-t-lg">
             <div>
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2"><Activity className="w-5 h-5 text-[#1e3a8a]"/> Tabla de Estadísticos Principales & Métricas de Riesgo</h3>
                <p className="text-xs text-slate-500 mt-1 font-medium">Rendimientos simples, Sharpe (Rf = {(riskFreeRate*100).toFixed(2)}%) y métricas relativas al Benchmark ({benchmark})</p>
             </div>
             <div className="flex gap-2">
                <button className="px-4 py-2 text-xs font-bold text-white bg-[#1e3a8a] rounded-md shadow-sm hover:bg-blue-900 flex items-center gap-1.5"><BarChart3 className="w-3.5 h-3.5"/> Métricas Clásicas</button>
                <button className="px-4 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-300 rounded-md shadow-sm hover:bg-slate-50">vs Benchmark ({benchmark})</button>
                <button className="px-4 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-300 rounded-md shadow-sm hover:bg-slate-50">Todas</button>
                <button className="px-4 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-300 rounded-md shadow-sm hover:bg-slate-50">Fórmulas</button>
                <button onClick={() => exportExcel(false)} className="px-4 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md shadow-sm hover:bg-emerald-100 flex items-center gap-1.5"><Download className="w-3.5 h-3.5"/> Descargar .xlsx</button>
                <button className="px-4 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-300 rounded-md shadow-sm hover:bg-slate-50">CSV</button>
             </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-[10px] text-white bg-[#1e3a8a] uppercase font-bold tracking-wider">
                <tr>
                  <th className="px-6 py-4 flex items-center gap-1">ACTIVO <ArrowUpDown className="w-3 h-3 opacity-50" /></th>
                  <th className="px-6 py-4 text-right">RETORNO<br/>PERIODO</th>
                  <th className="px-6 py-4 text-right">REND. PROM.<br/>DIARIO</th>
                  <th className="px-6 py-4 text-right">DESV. EST.<br/>DIARIA</th>
                  <th className="px-6 py-4 text-right">REND. ESPERADO<br/>ANUAL</th>
                  <th className="px-6 py-4 text-right">VOLATILIDAD<br/>ANUAL</th>
                  <th className="px-6 py-4 text-right">VARIANZA<br/>ANUAL</th>
                  <th className="px-6 py-4 text-right">RATIO DE<br/>SHARPE</th>
                  <th className="px-6 py-4 text-right">MAX<br/>DRAWDOWN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {/* Portafolio Section Header */}
                <tr className="bg-slate-100/75 border-y border-slate-200">
                  <td colSpan={9} className="px-6 py-2 text-xs font-black text-slate-700 uppercase tracking-wider">
                    Activos del Portafolio ({sortedPortfolioAssets.length})
                  </td>
                </tr>
                {sortedPortfolioAssets.map((asset) => {
                  const s = stats[asset];
                  if (!s) return null;
                  const colorIdx = tickers.indexOf(asset);
                  return (
                    <tr key={asset} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                             <div className="w-2.5 h-2.5 rounded-full shadow-sm shrink-0" style={{ backgroundColor: CHART_COLORS[colorIdx % CHART_COLORS.length] }}></div>
                             <div>
                                 <div className="font-bold text-slate-800 text-sm flex items-center gap-2">
                                     {asset}
                                 </div>
                                 <div className="text-[10px] text-slate-500 font-medium truncate max-w-[150px]" title={ASSET_NAMES[asset] || asset}>{ASSET_NAMES[asset] || asset}</div>
                             </div>
                          </div>
                      </td>
                      <td className={cn("px-6 py-4 font-bold text-right font-mono text-[13px]", s.totalReturn >= 0 ? "text-emerald-600" : "text-rose-600")}>{fmtPct(s.totalReturn, 2, true)}</td>
                      <td className={cn("px-6 py-4 text-right font-mono text-[13px] font-medium", s.meanReturn >= 0 ? "text-emerald-600" : "text-rose-600")}>{fmtPct(s.meanReturn, 4, true)}</td>
                      <td className="px-6 py-4 text-slate-600 text-right font-mono text-[13px]">{fmtPct(s.stdDev, 4, false)}</td>
                      <td className={cn("px-6 py-4 font-bold text-right font-mono text-[13px]", s.annualReturn >= 0 ? "text-emerald-600" : "text-rose-600")}>{fmtPct(s.annualReturn, 2, true)}</td>
                      <td className="px-6 py-4 text-slate-800 font-bold text-right font-mono text-[13px]">{fmtPct(s.annualStdDev, 2, false)}</td>
                      <td className="px-6 py-4 text-slate-600 text-right font-mono text-[13px]">{s.annualVariance.toFixed(6)}</td>
                      <td className="px-6 py-4 text-right">
                         <div className="flex items-center justify-end">
                             <span className="font-bold font-mono text-[13px] text-slate-800">{s.sharpeRatio.toFixed(3)}</span>
                             {renderSharpeBadge(s.sharpeRatio)}
                         </div>
                      </td>
                      <td className="px-6 py-4 text-rose-600 font-bold text-right font-mono text-[13px]">{fmtPct(s.maxDrawdown, 2, false)}</td>
                    </tr>
                  )
                })}

                {/* Benchmarks Section Header */}
                {sortedBenchmarkAssets.length > 0 && (
                  <tr className="bg-amber-50/80 border-y border-amber-200">
                    <td colSpan={9} className="px-6 py-2 text-xs font-black text-amber-900 uppercase tracking-wider flex items-center gap-2">
                      <TrendingUp className="w-3.5 h-3.5" /> Benchmarks de Mercado (Exclusivos de Referencia - {sortedBenchmarkAssets.length})
                    </td>
                  </tr>
                )}
                {sortedBenchmarkAssets.map((asset) => {
                  const s = stats[asset];
                  if (!s) return null;
                  const isPrimary = asset === benchmark;
                  return (
                    <tr key={asset} className="hover:bg-amber-50/40 bg-amber-50/15 transition-colors group">
                      <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                             <div className={cn("w-2.5 h-2.5 rounded-full shadow-sm shrink-0", isPrimary ? "bg-red-600" : "bg-amber-500")}></div>
                             <div>
                                 <div className="font-bold text-slate-800 text-sm flex items-center gap-2">
                                     {asset}
                                     {isPrimary ? (
                                       <span className="bg-amber-600 text-white text-[9px] px-1.5 py-0.5 rounded font-bold tracking-wide">Rm Principal</span>
                                     ) : (
                                       <span className="bg-slate-200 text-slate-700 text-[9px] px-1.5 py-0.5 rounded font-bold tracking-wide">Benchmark</span>
                                     )}
                                 </div>
                                 <div className="text-[10px] text-slate-500 font-medium truncate max-w-[150px]" title={ASSET_NAMES[asset] || asset}>{ASSET_NAMES[asset] || asset}</div>
                             </div>
                          </div>
                      </td>
                      <td className={cn("px-6 py-4 font-bold text-right font-mono text-[13px]", s.totalReturn >= 0 ? "text-emerald-600" : "text-rose-600")}>{fmtPct(s.totalReturn, 2, true)}</td>
                      <td className={cn("px-6 py-4 text-right font-mono text-[13px] font-medium", s.meanReturn >= 0 ? "text-emerald-600" : "text-rose-600")}>{fmtPct(s.meanReturn, 4, true)}</td>
                      <td className="px-6 py-4 text-slate-600 text-right font-mono text-[13px]">{fmtPct(s.stdDev, 4, false)}</td>
                      <td className={cn("px-6 py-4 font-bold text-right font-mono text-[13px]", s.annualReturn >= 0 ? "text-emerald-600" : "text-rose-600")}>{fmtPct(s.annualReturn, 2, true)}</td>
                      <td className="px-6 py-4 text-slate-800 font-bold text-right font-mono text-[13px]">{fmtPct(s.annualStdDev, 2, false)}</td>
                      <td className="px-6 py-4 text-slate-600 text-right font-mono text-[13px]">{s.annualVariance.toFixed(6)}</td>
                      <td className="px-6 py-4 text-right">
                         <div className="flex items-center justify-end">
                             <span className="font-bold font-mono text-[13px] text-slate-800">{s.sharpeRatio.toFixed(3)}</span>
                             {renderSharpeBadge(s.sharpeRatio)}
                         </div>
                      </td>
                      <td className="px-6 py-4 text-rose-600 font-bold text-right font-mono text-[13px]">{fmtPct(s.maxDrawdown, 2, false)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 pb-12">
           <Card className="flex flex-col h-full">
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-start rounded-t-lg bg-slate-50/50">
                  <div>
                     <h3 className="text-base font-bold text-slate-800 flex items-center gap-2"><PieChart className="w-4 h-4 text-slate-400"/> Mapa de Calor de Correlaciones (Matriz de Pearson)</h3>
                     <p className="text-[11px] text-slate-500 mt-1 font-medium max-w-sm leading-snug">Coeficientes de correlación lineal entre rendimientos simples diarios de cada par de activos [-1.00 a +1.00]</p>
                  </div>
                  <div className="flex gap-4 items-center">
                     <div className="flex flex-col items-end">
                         <span className="text-[9px] font-bold text-slate-400 uppercase">Correlación Media</span>
                         <span className="text-sm font-black font-mono text-slate-700">{avgCorrelation > 0 ? '+' : ''}{avgCorrelation.toFixed(3)}</span>
                     </div>
                     <div className="flex flex-col items-end">
                         <span className="text-[9px] font-bold text-slate-400 uppercase">Índice de Diversificación</span>
                         <div className="flex items-center gap-1.5">
                             <span className="text-sm font-black font-mono text-slate-700">{divIndex.toFixed(1)}%</span>
                             {divIndex >= 75 ? (
                                 <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">Excelente Diversificación</span>
                             ) : divIndex >= 50 ? (
                                 <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-700 border border-blue-200">Moderada</span>
                             ) : (
                                 <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-700 border border-amber-200">Baja Diversificación</span>
                             )}
                         </div>
                     </div>
                  </div>
              </div>
              <div className="p-6 overflow-x-auto flex-1 flex items-center justify-center">
                  <table className="text-sm border-collapse mx-auto">
                      <thead>
                          <tr>
                              <th className="p-2 w-14"></th>
                              {tickers.map(asset => <th key={asset} className="p-2 font-bold text-slate-500 text-center w-14 text-[11px]">{asset}</th>)}
                          </tr>
                      </thead>
                      <tbody>
                           {tickers.map(rowAsset => (
                              <tr key={rowAsset}>
                                  <th className="p-2 font-bold text-slate-500 text-right pr-4 text-[11px]">{rowAsset}</th>
                                  {tickers.map(colAsset => {
                                      const val = correlationMatrix[rowAsset][colAsset];
                                      return (
                                          <td key={colAsset} className="p-1">
                                              <div className={cn("w-12 h-10 flex items-center justify-center text-center rounded text-[11px] font-mono shadow-sm transition-transform hover:scale-105 cursor-default border border-black/5", getCorrelationColor(val))}>{val?.toFixed(2) || '-'}</div>
                                          </td>
                                      )
                                  })}
                              </tr>
                           ))}
                      </tbody>
                  </table>
              </div>
           </Card>

           <Card className="flex flex-col h-full">
               <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-start rounded-t-lg bg-slate-50/50">
                  <div>
                     <h3 className="text-base font-bold text-slate-800 flex items-center gap-2"><Settings className="w-4 h-4 text-slate-400"/> Matriz de Covarianzas (Σ)</h3>
                     <p className="text-[11px] text-slate-500 mt-1 font-medium max-w-sm leading-snug">Covarianza muestral de los rendimientos simples. La diagonal principal corresponde a la varianza individual (σ²).</p>
                  </div>
                  <div className="flex flex-col gap-2 items-end">
                      <div className="flex bg-[#1e3a8a] rounded p-0.5 shadow-sm text-[10px] font-bold text-white">
                         <button onClick={() => setCovPeriod('annual')} className={cn("px-3 py-1 rounded transition-colors", covPeriod === 'annual' ? "bg-white text-[#1e3a8a] shadow-sm" : "hover:bg-white/20")}>Covarianza Anual (252 días)</button>
                         <button onClick={() => setCovPeriod('daily')} className={cn("px-3 py-1 rounded transition-colors", covPeriod === 'daily' ? "bg-white text-[#1e3a8a] shadow-sm" : "hover:bg-white/20")}>Covarianza Diaria</button>
                      </div>
                      <div className="flex bg-slate-100 rounded border border-slate-200 p-0.5 shadow-inner text-[10px] font-bold text-slate-600">
                         <button onClick={() => setCovFormat('decimal')} className={cn("px-2.5 py-0.5 rounded transition-colors", covFormat === 'decimal' ? "bg-white text-slate-800 shadow-sm border border-slate-200" : "hover:bg-slate-200/50")}>Decimal</button>
                         <button onClick={() => setCovFormat('scientific')} className={cn("px-2.5 py-0.5 rounded transition-colors", covFormat === 'scientific' ? "bg-white text-slate-800 shadow-sm border border-slate-200" : "hover:bg-slate-200/50")}>Científica</button>
                         <button onClick={() => setCovFormat('percent')} className={cn("px-2.5 py-0.5 rounded transition-colors", covFormat === 'percent' ? "bg-white text-slate-800 shadow-sm border border-slate-200" : "hover:bg-slate-200/50")}>%</button>
                      </div>
                  </div>
              </div>
              <div className="p-6 overflow-x-auto flex-1 flex items-center justify-center">
                  <table className="text-sm border-separate border-spacing-0 mx-auto">
                      <thead>
                          <tr>
                              <th className="p-2.5 border-b border-slate-700 bg-[#1e3a8a] text-white w-16 rounded-tl font-bold text-[10px] uppercase">ACTIVO</th>
                              {tickers.map((asset, idx) => <th key={asset} className={cn("p-2.5 border-b border-slate-700 font-bold text-white text-center w-20 bg-[#1e3a8a] text-[10px]", idx === tickers.length - 1 ? "rounded-tr" : "")}>{asset}</th>)}
                          </tr>
                      </thead>
                      <tbody>
                           {tickers.map((rowAsset, rowIdx) => (
                              <tr key={rowAsset} className="hover:bg-blue-50/50 group">
                                  <th className={cn("p-2.5 font-bold text-[#1e3a8a] bg-blue-50 border-r border-b border-white text-[11px]", rowIdx === tickers.length - 1 ? "rounded-bl" : "")}>{rowAsset}</th>
                                  {tickers.map(colAsset => {
                                      const val = activeCovMatrix[rowAsset][colAsset];
                                      return <td key={colAsset} className="p-2.5 text-center text-[11px] font-mono text-slate-600 border-b border-slate-100 bg-white">{val != null ? formatCov(val) : '-'}</td>
                                  })}
                              </tr>
                           ))}
                      </tbody>
                  </table>
              </div>
           </Card>
        </div>
      </div>
    );
  };

    const renderMPT = () => {
    if (!mptResults) return <div className="p-12 text-center text-slate-500 font-medium">Ejecuta con al menos 2 activos.</div>;
    const analysisAssets = tickers.filter(a => a !== benchmark);

    const bmkVar = covarianceMatrix[benchmark]?.[benchmark] || 1;
    const calcPortBeta = (weights: Record<string, number>) => {
        let beta = 0;
        analysisAssets.forEach(a => {
            const assetBeta = covarianceMatrix[a][benchmark] / bmkVar;
            beta += weights[a] * assetBeta;
        });
        return beta;
    };

    const maxSharpeBeta = calcPortBeta(mptResults.maxSharpePort.weights);
    const minVarBeta = calcPortBeta(mptResults.minVariancePort.weights);
    
    const maxSharpeTreynor = maxSharpeBeta > 0 ? (mptResults.maxSharpePort.return - riskFreeRate) / maxSharpeBeta : 0;
    const minVarTreynor = minVarBeta > 0 ? (mptResults.minVariancePort.return - riskFreeRate) / minVarBeta : 0;
    
    // Normal VaR 95% = E[R] - 1.645 * Vol
    const z95 = 1.645;
    const calcVaR = (ret: number, risk: number) => ret - z95 * risk;
    // Normal CVaR 95% = E[R] - (exp(-z^2/2) / (sqrt(2*pi) * 0.05)) * Vol = ret - 2.0627 * risk
    const calcCVaR = (ret: number, risk: number) => ret - 2.0627 * risk;

    const renderCard = (title: string, badgeText: string, badgeColor: string, desc: string, E: number, Vol: number, Sharpe: number, borderCol: string) => (
        <Card className={`p-5 border ${borderCol} rounded-xl shadow-sm hover:shadow-md transition-shadow bg-white flex flex-col h-full`}>
            <div className="flex justify-between items-center mb-2">
                <h3 className="text-base font-black text-slate-800 flex items-center gap-2">
                    {title === 'Máximo Sharpe' && <span className="text-emerald-500 text-xl">★</span>}
                    {title === 'Mínima Varianza' && <span className="text-blue-500 text-xl">●</span>}
                    {title}
                </h3>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${badgeColor}`}>{badgeText}</span>
            </div>
            <p className="text-xs text-slate-500 leading-normal mb-4 flex-1">{desc}</p>
            <div className="grid grid-cols-3 gap-3 border-t border-slate-100 pt-3 mt-auto">
                <div className="text-center">
                    <div className="text-[10px] font-bold text-slate-400 uppercase">E[Rp] Anual</div>
                    <div className="text-lg font-black text-emerald-600 font-mono">{(E * 100).toFixed(2)}%</div>
                </div>
                <div className="text-center border-l border-r border-slate-100">
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Volatilidad (σp)</div>
                    <div className="text-lg font-black text-slate-800 font-mono">{(Vol * 100).toFixed(2)}%</div>
                </div>
                <div className="text-center">
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Ratio Sharpe</div>
                    <div className="text-lg font-black text-blue-600 font-mono">{Sharpe.toFixed(2)}</div>
                </div>
            </div>
        </Card>
    );

    const scatterData = {
        datasets: []
    };
    if (showNube) {
        scatterData.datasets.push({ label: 'Portafolios Simulados', data: mptResults.portfolios.map(p => ({ x: p.risk * 100, y: p.return * 100 })), backgroundColor: 'rgba(59, 130, 246, 0.2)', pointRadius: 2, pointHoverRadius: 4 } as any);
    }
    
    // Add points
    scatterData.datasets.push({ label: 'Máximo Sharpe (Tangente)', data: [{ x: mptResults.maxSharpePort.risk * 100, y: mptResults.maxSharpePort.return * 100 }], backgroundColor: '#10b981', pointRadius: 8, pointStyle: 'star', borderColor: '#059669', borderWidth: 2 } as any);
    scatterData.datasets.push({ label: 'Mínima Varianza Global (GMV)', data: [{ x: mptResults.minVariancePort.risk * 100, y: mptResults.minVariancePort.return * 100 }], backgroundColor: '#3b82f6', pointRadius: 6, pointStyle: 'circle', borderColor: '#1d4ed8', borderWidth: 2 } as any);

    if (showLabels) {
        analysisAssets.forEach((a, i) => {
            scatterData.datasets.push({ label: a, data: [{ x: stats[a].annualStdDev * 100, y: stats[a].annualReturn * 100 }], backgroundColor: CHART_COLORS[i % CHART_COLORS.length], pointRadius: 5, pointStyle: 'rectRot' } as any);
        });
    }

    if (showCAL) {
        // Line from Rf to maxSharpe and beyond
        const rf = riskFreeRate * 100;
        const shX = mptResults.maxSharpePort.risk * 100;
        const shY = mptResults.maxSharpePort.return * 100;
        const slope = (shY - rf) / shX;
        const maxX = shX * 2.5; // extend beyond
        const maxY = rf + slope * maxX;
        scatterData.datasets.push({
            type: 'line',
            label: 'Línea CAL',
            data: [{ x: 0, y: rf }, { x: shX, y: shY }, { x: maxX, y: maxY }],
            borderColor: '#ef4444',
            borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false
        } as any);
    }


    // Simulador logic
    const eqWeight = 1 / analysisAssets.length;
    let simTotalWeight = 0;
    analysisAssets.forEach(a => {
        simTotalWeight += (customSimWeights[a] !== undefined ? customSimWeights[a] : eqWeight);
    });
    
    // Normalize weights for calculations if total > 0
    const normalizedSimWeights: Record<string, number> = {};
    analysisAssets.forEach(a => {
        const rawW = customSimWeights[a] !== undefined ? customSimWeights[a] : eqWeight;
        normalizedSimWeights[a] = simTotalWeight > 0 ? rawW / simTotalWeight : 0;
    });

    let simRet = 0; let simVar = 0;
    analysisAssets.forEach(a => simRet += normalizedSimWeights[a] * stats[a].annualReturn);
    analysisAssets.forEach(a => { analysisAssets.forEach(b => { simVar += normalizedSimWeights[a] * normalizedSimWeights[b] * covarianceMatrix[a][b]; }); });
    const simRisk = Math.sqrt(simVar);
    const simSharpe = simRisk > 0 ? (simRet - riskFreeRate) / simRisk : 0;
    
    // Update scatterData to include the custom sim portfolio
    if (mptTab === 'simulador' || mptTab === 'frontera') {
        scatterData.datasets.push({ label: 'Personalizado', data: [{ x: simRisk * 100, y: simRet * 100 }], backgroundColor: '#a855f7', pointRadius: 8, pointStyle: 'circle', borderColor: '#7e22ce', borderWidth: 2 } as any);
    }
    const scatterOptions = {
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)', titleColor: '#f8fafc', bodyColor: '#f8fafc', padding: 12, cornerRadius: 8, callbacks: { label: (ctx: any) => `${ctx.dataset.label}: Riesgo ${ctx.parsed.x.toFixed(2)}% | Retorno ${ctx.parsed.y.toFixed(2)}%` } }
        },
        scales: {
            x: { title: { display: true, text: 'Volatilidad Anualizada σp (Desviación Estándar Anual)', color: '#475569', font: { weight: 'bold' } }, grid: { color: '#e2e8f0', borderDash: [4, 4] }, ticks: { color: '#64748b', font: { family: 'monospace' }, callback: (v: any) => v.toFixed(2) + '%' } },
            y: { title: { display: true, text: 'Rendimiento Esperado Anualizado E[Rp]', color: '#475569', font: { weight: 'bold' } }, grid: { color: '#e2e8f0', borderDash: [4, 4] }, ticks: { color: '#64748b', font: { family: 'monospace' }, callback: (v: any) => v.toFixed(2) + '%' } }
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-[#1e3a8a] text-white p-4 rounded-t-xl flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/10 rounded-lg">
                        <Activity className="w-6 h-6 text-blue-200" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold">Optimización de Portafolio — Modelo de Markowitz (MPT)</h2>
                        <p className="text-xs text-blue-200">Frontera Eficiente de Pareto, Portafolio Tangente (Máximo Sharpe) y Mínima Varianza Global (GMV)</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 text-sm">
                    <div className="bg-blue-900/50 border border-blue-800 px-3 py-1 rounded shadow-inner">Rf: <span className="font-bold text-blue-200">{(riskFreeRate * 100).toFixed(2)}%</span></div>
                    <div className="bg-blue-900/50 border border-blue-800 px-3 py-1 rounded shadow-inner">Bench: <span className="font-bold text-blue-200">{benchmark}</span></div>
                    <div className="bg-blue-900/50 border border-blue-800 px-3 py-1 rounded shadow-inner">Activos: <span className="font-bold text-blue-200">{analysisAssets.length}</span></div>
                </div>
            </div>

            <div className="bg-slate-50 border-x border-b border-slate-200 p-4 rounded-b-xl flex flex-col xl:flex-row justify-between items-center gap-4 mb-6 shadow-sm -mt-6">
                <div className="flex items-center gap-1 bg-slate-200/50 p-1 rounded-lg">
                    {['frontera', 'pesos', 'simulador', 'teoria'].map(t => (
                        <button key={t} onClick={() => setMptTab(t as any)} className={cn("px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-2", mptTab === t ? "bg-white text-[#1e3a8a] shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-800 hover:bg-slate-200")}>
                            {t === 'frontera' && <TrendingUp className="w-3.5 h-3.5" />}
                            {t === 'pesos' && <PieChart className="w-3.5 h-3.5" />}
                            {t === 'simulador' && <Calculator className="w-3.5 h-3.5" />}
                            {t === 'teoria' && <Info className="w-3.5 h-3.5" />}
                            {t === 'frontera' ? 'Frontera Numérica MPT' : t === 'pesos' ? 'Distribución de Pesos' : t === 'simulador' ? 'Simulador' : 'Teoría'}
                        </button>
                    ))}
                </div>
                {mptTab === 'frontera' && (
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-500">Límite Máx / Activo:</span>
                        <select value={mptMaxWeight} onChange={(e) => setMptMaxWeight(Number(e.target.value))} className="text-xs font-bold bg-white border border-slate-300 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500">
                            <option value={1}>100% (Sin límite)</option>
                            <option value={0.5}>50%</option>
                            <option value={0.4}>40%</option>
                            <option value={0.3}>30%</option>
                            <option value={0.25}>25%</option>
                            <option value={0.2}>20%</option>
                            <option value={0.15}>15%</option>
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-500">Piso Mín / Activo:</span>
                        <select value={mptMinWeight} onChange={(e) => setMptMinWeight(Number(e.target.value))} className="text-xs font-bold bg-white border border-slate-300 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500">
                            <option value={0}>0% (Long-Only estándar)</option>
                            <option value={0.05}>5%</option>
                            <option value={0.1}>10%</option>
                        </select>
                    </div>
                </div>
                )}
            </div>

            {mptTab === 'frontera' && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {renderCard('Máximo Sharpe', 'Tangente (Óptimo)', 'bg-emerald-100 text-emerald-700', 'Máxima rentabilidad esperada por unidad de riesgo total en la frontera eficiente.', mptResults.maxSharpePort.return, mptResults.maxSharpePort.risk, mptResults.maxSharpePort.sharpe, 'border-emerald-300 ring-1 ring-emerald-200')}
                        {renderCard('Mínima Varianza', 'GMV (Menor Riesgo)', 'bg-blue-100 text-blue-700', 'Menor volatilidad teóricamente posible combinando la matriz de covarianzas de los activos.', mptResults.minVariancePort.return, mptResults.minVariancePort.risk, mptResults.minVariancePort.sharpe, 'border-blue-300 ring-1 ring-blue-200')}
                    </div>

                    <Card className="p-0 border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex flex-wrap justify-between items-center gap-4">
                            <div>
                                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                    <TrendingUp className="w-4 h-4 text-slate-500"/>
                                    Diagrama de Riesgo-Retorno & Frontera Eficiente de Markowitz
                                </h3>
                                <p className="text-[10px] text-slate-500 mt-0.5">Eje X: Volatilidad Anualizada (σp) | Eje Y: Rendimiento Esperado Anualizado (E[Rp]) | Curva de Pareto y Línea CAL</p>
                            </div>
                        </div>
                        
                        <div className="bg-white border-b border-slate-100 px-4 py-2 flex flex-wrap justify-between items-center gap-4">
                            <div className="flex items-center gap-4 text-xs font-bold text-slate-600">
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input type="checkbox" checked={showNube} onChange={e => setShowNube(e.target.checked)} className="rounded text-blue-600 focus:ring-blue-500" />
                                    Nube Factible
                                </label>
                                <div className="flex items-center gap-1">
                                    <span className="font-normal">Muestras:</span>
                                    <select value={mptSimulations} onChange={e => setMptSimulations(Number(e.target.value))} className="bg-transparent font-bold outline-none cursor-pointer">
                                        <option value={1000}>1.000 pts</option>
                                        <option value={3000}>3.000 pts</option>
                                        <option value={5000}>5.000 pts (Máx)</option>
                                    </select>
                                </div>
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input type="checkbox" checked={showCAL} onChange={e => setShowCAL(e.target.checked)} className="rounded text-blue-600 focus:ring-blue-500" />
                                    Línea CAL
                                </label>
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input type="checkbox" checked={showArea} onChange={e => setShowArea(e.target.checked)} className="rounded text-blue-600 focus:ring-blue-500" />
                                    Área Eficiente
                                </label>
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input type="checkbox" checked={showLabels} onChange={e => setShowLabels(e.target.checked)} className="rounded text-blue-600 focus:ring-blue-500" />
                                    Etiquetas Tickers
                                </label>
                            </div>
                            <div className="flex items-center gap-2">
                                <button className="p-1 hover:bg-slate-100 rounded text-slate-500"><Search className="w-3.5 h-3.5"/></button>
                                <button className="p-1 hover:bg-slate-100 rounded text-slate-500"><Search className="w-3.5 h-3.5"/></button>
                                <span className="text-[10px] font-bold text-slate-400">100%</span>
                                <button onClick={exportChartPNG} className="flex items-center gap-1 px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-[10px] font-bold transition-colors ml-2"><Download className="w-3 h-3"/> PNG</button>
                            </div>
                        </div>

                        <div className="p-4 h-[500px]">
                            <Scatter data={scatterData} options={scatterOptions as any} />
                        </div>
                        
                        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4">
                            <div className="flex flex-wrap items-center gap-6 text-[11px] font-bold text-slate-600">
                                <div className="flex items-center gap-2"><span className="text-emerald-500 text-sm">★</span> Máximo Sharpe (Tangente)</div>
                                <div className="flex items-center gap-2"><span className="text-blue-500 text-sm">●</span> Mínima Varianza Global (GMV)</div>
                                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-purple-500 block"></span> Personalizado</div>
                                <div className="flex items-center gap-2"><span className="w-4 h-0.5 bg-slate-800 block"></span> Curva de Pareto (Restringida Long-Only)</div>
                                <div className="flex items-center gap-2"><span className="w-4 h-0.5 bg-rose-500 border-b-2 border-dashed border-rose-500 block"></span> Línea CAL</div>
                            </div>
                        </div>
                    </Card>

                    <Card className="p-0 border border-slate-200 shadow-sm overflow-hidden flex flex-col mt-6">
                        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex flex-wrap justify-between items-center gap-4">
                            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                <BarChart3 className="w-4 h-4 text-slate-500"/>
                                Métricas Clave de los Portafolios Óptimos de Markowitz
                            </h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-[#1e3a8a] text-white text-xs uppercase font-bold text-center">
                                    <tr>
                                        <th className="px-4 py-3 text-left">Portafolio Markowitz</th>
                                        <th className="px-4 py-3">Retorno Anual<br/>E[Rp]</th>
                                        <th className="px-4 py-3">Volatilidad Anual<br/>(σ)</th>
                                        <th className="px-4 py-3">Ratio de<br/>Sharpe</th>
                                        <th className="px-4 py-3">Beta vs<br/>{benchmark}</th>
                                        <th className="px-4 py-3">Ratio de<br/>Treynor</th>
                                        <th className="px-4 py-3">VaR 95%<br/>(1A)</th>
                                        <th className="px-4 py-3">CVaR / ES<br/>95%</th>
                                        <th className="px-4 py-3">Diversificación</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-slate-700 font-mono text-center">
                                    <tr className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 text-left font-bold font-sans flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Máximo Sharpe (Tangente)</td>
                                        <td className="px-4 py-3 text-emerald-600 font-bold">+{(mptResults.maxSharpePort.return * 100).toFixed(2)}%</td>
                                        <td className="px-4 py-3">{(mptResults.maxSharpePort.risk * 100).toFixed(2)}%</td>
                                        <td className="px-4 py-3 font-bold text-slate-800">{mptResults.maxSharpePort.sharpe.toFixed(3)}</td>
                                        <td className="px-4 py-3">{maxSharpeBeta.toFixed(2)}</td>
                                        <td className="px-4 py-3">{(maxSharpeTreynor * 100).toFixed(2)}%</td>
                                        <td className="px-4 py-3 text-rose-600">{(calcVaR(mptResults.maxSharpePort.return, mptResults.maxSharpePort.risk) * 100).toFixed(2)}%</td>
                                        <td className="px-4 py-3 text-rose-600">{(calcCVaR(mptResults.maxSharpePort.return, mptResults.maxSharpePort.risk) * 100).toFixed(2)}%</td>
                                        <td className="px-4 py-3">{(mptResults.maxSharpePort.risk / Math.sqrt(bmkVar)).toFixed(2)}x</td>
                                    </tr>
                                    <tr className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 text-left font-bold font-sans flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Mínima Varianza Global (GMV)</td>
                                        <td className="px-4 py-3 text-blue-600 font-bold">+{(mptResults.minVariancePort.return * 100).toFixed(2)}%</td>
                                        <td className="px-4 py-3">{(mptResults.minVariancePort.risk * 100).toFixed(2)}%</td>
                                        <td className="px-4 py-3 font-bold text-slate-800">{mptResults.minVariancePort.sharpe.toFixed(3)}</td>
                                        <td className="px-4 py-3">{minVarBeta.toFixed(2)}</td>
                                        <td className="px-4 py-3">{(minVarTreynor * 100).toFixed(2)}%</td>
                                        <td className="px-4 py-3 text-rose-600">{(calcVaR(mptResults.minVariancePort.return, mptResults.minVariancePort.risk) * 100).toFixed(2)}%</td>
                                        <td className="px-4 py-3 text-rose-600">{(calcCVaR(mptResults.minVariancePort.return, mptResults.minVariancePort.risk) * 100).toFixed(2)}%</td>
                                        <td className="px-4 py-3">{(mptResults.minVariancePort.risk / Math.sqrt(bmkVar)).toFixed(2)}x</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </>
            )}

            {mptTab === 'pesos' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                    {[
                        { title: "Máximo Sharpe (Tangente)", icon: "★", weights: mptResults.maxSharpePort.weights, border: "border-emerald-200", iconCol: "text-emerald-500" },
                        { title: "Mínima Varianza Global (GMV)", icon: "●", weights: mptResults.minVariancePort.weights, border: "border-blue-200", iconCol: "text-blue-500" }
                    ].map((chart, idx) => (
                        <Card key={idx} className={`p-6 border ${chart.border} flex flex-col`}>
                            <h3 className="font-bold mb-6 flex items-center gap-2"><span className={chart.iconCol}>{chart.icon}</span> {chart.title}</h3>
                            <div className="flex-1 min-h-[220px] relative">
                                <Doughnut 
                                    data={{
                                        labels: analysisAssets.map(a => `${a}: ${(chart.weights[a] * 100).toFixed(2)}%`),
                                        datasets: [{
                                            data: analysisAssets.map(a => chart.weights[a] * 100),
                                            backgroundColor: CHART_COLORS.slice(0, analysisAssets.length),
                                            borderWidth: 2,
                                            borderColor: '#ffffff',
                                            hoverOffset: 4
                                        }]
                                    }} 
                                    options={{
                                        responsive: true,
                                        maintainAspectRatio: false,
                                        plugins: {
                                            legend: { position: 'right', labels: { font: { size: 11, family: 'monospace' }, boxWidth: 12, padding: 15 } },
                                            tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)', titleColor: '#f8fafc', bodyColor: '#f8fafc', padding: 12, cornerRadius: 8, callbacks: { label: (ctx: any) => ` ${ctx.label}` } }
                                        },
                                        cutout: '65%'
                                    }} 
                                />
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {mptTab === 'simulador' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
                    <Card className="p-6 col-span-1 lg:col-span-2 border-purple-200">
                        <h3 className="font-bold mb-6 text-purple-800 flex items-center gap-2">
                            <Calculator className="w-5 h-5"/> Simulador de Portafolio
                        </h3>
                        <div className="space-y-6">
                            {analysisAssets.map(a => {
                                const currentW = customSimWeights[a] !== undefined ? customSimWeights[a] : eqWeight;
                                const normW = simTotalWeight > 0 ? currentW / simTotalWeight : 0;
                                return (
                                    <div key={a}>
                                        <div className="flex justify-between text-sm mb-2">
                                            <span className="font-bold text-slate-700">{a}</span>
                                            <div className="flex gap-4">
                                                <span className="text-slate-400 font-mono">Bruto: {(currentW*100).toFixed(0)}</span>
                                                <span className="font-bold font-mono text-purple-700">Real: {(normW * 100).toFixed(2)}%</span>
                                            </div>
                                        </div>
                                        <input 
                                            type="range" 
                                            min="0" max="100" step="1" 
                                            value={currentW * 100} 
                                            onChange={e => setCustomSimWeights({...customSimWeights, [a]: Number(e.target.value) / 100})}
                                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                                        />
                                    </div>
                                )
                            })}
                        </div>
                        <div className="mt-8 pt-4 border-t border-slate-100 text-xs text-slate-500">
                            <strong>Nota:</strong> Los pesos "brutos" seleccionados en las barras se normalizan automáticamente para que la suma total (Real) sea exactamente 100%.
                        </div>
                    </Card>

                    <Card className="p-6 col-span-1 border-slate-200 bg-slate-50 flex flex-col justify-center">
                        <h3 className="font-bold mb-6 text-slate-800 text-center">Resultados del Simulador</h3>
                        <div className="space-y-6">
                            <div className="text-center bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                                <div className="text-xs font-bold text-slate-400 uppercase mb-1">Rendimiento Esperado (E[Rp])</div>
                                <div className="text-3xl font-black text-emerald-600">{(simRet * 100).toFixed(2)}%</div>
                            </div>
                            <div className="text-center bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                                <div className="text-xs font-bold text-slate-400 uppercase mb-1">Volatilidad (Riesgo σp)</div>
                                <div className="text-3xl font-black text-slate-700">{(simRisk * 100).toFixed(2)}%</div>
                            </div>
                            <div className="text-center bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                                <div className="text-xs font-bold text-slate-400 uppercase mb-1">Ratio de Sharpe</div>
                                <div className="text-3xl font-black text-purple-600">{simSharpe.toFixed(3)}</div>
                            </div>
                            <div className="text-center bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                                <div className="text-xs font-bold text-slate-400 uppercase mb-1">Diversificación (1/∑w²)</div>
                                <div className="text-3xl font-black text-blue-600">
                                    {(1 / Object.values(normalizedSimWeights).reduce((sum, w) => sum + w * w, 0)).toFixed(2)}x
                                </div>
                            </div>
                        </div>
                        <div className="mt-6 text-center text-xs text-slate-500">
                            Revisa el punto morado en el <button onClick={() => setMptTab('frontera')} className="text-blue-600 underline font-bold">Diagrama de Riesgo-Retorno</button> para visualizar tu portafolio frente a la Frontera Eficiente.
                        </div>
                    </Card>
                </div>
            )}

            {mptTab === 'teoria' && (
                <Card className="p-8 mt-6 max-w-4xl mx-auto space-y-6 text-slate-700">
                    <h3 className="text-2xl font-black text-slate-900 mb-6 border-b border-slate-200 pb-4">Teoría Moderna de Portafolios (MPT)</h3>
                    
                    <div className="space-y-4">
                        <p>Desarrollada por <strong>Harry Markowitz</strong> en 1952 (Premio Nobel de Economía), la MPT establece que los inversores racionales buscan maximizar el retorno esperado para un nivel dado de riesgo, o minimizar el riesgo para un retorno esperado dado.</p>
                        
                        <p>El concepto central es la <strong>diversificación</strong>: los activos no deben ser evaluados individualmente, sino por cómo sus precios se mueven en conjunto (covarianza). Combinar activos con baja correlación reduce la volatilidad total del portafolio.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-8">
                        <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                            <h4 className="font-bold text-slate-800 mb-2">Retorno del Portafolio E(Rp)</h4>
                            <p className="text-sm text-slate-600 mb-3">Es simplemente el promedio ponderado de los retornos esperados de los activos individuales.</p>
                            <div className="bg-white p-3 rounded font-mono text-center text-sm border border-slate-100 shadow-sm">
                                E(Rp) = Σ (wi * E(Ri))
                            </div>
                        </div>
                        
                        <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                            <h4 className="font-bold text-slate-800 mb-2">Varianza del Portafolio (σp²)</h4>
                            <p className="text-sm text-slate-600 mb-3">Depende de los pesos, las varianzas individuales y, críticamente, la covarianza entre cada par de activos.</p>
                            <div className="bg-white p-3 rounded font-mono text-center text-sm border border-slate-100 shadow-sm">
                                σp² = Σ Σ (wi * wj * Cov(i,j))
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6 pt-4 border-t border-slate-100">
                        <div>
                            <h4 className="text-lg font-bold text-emerald-700 mb-2 flex items-center gap-2"><span className="text-2xl leading-none">★</span> Portafolio Tangente (Máximo Sharpe)</h4>
                            <p className="text-sm leading-relaxed">Representa la combinación óptima de activos de riesgo. Gráficamente, es el punto donde la Línea de Asignación de Capital (CAL) es tangente a la Frontera Eficiente. Maximiza la compensación por el riesgo asumido (Ratio de Sharpe). Si existe un activo libre de riesgo, todo inversor racional debería combinar este portafolio con el activo libre de riesgo según su aversión al riesgo (Teorema de Separación de Fondos).</p>
                        </div>

                        <div>
                            <h4 className="text-lg font-bold text-blue-700 mb-2 flex items-center gap-2"><span className="text-2xl leading-none">●</span> Portafolio de Mínima Varianza Global (GMV)</h4>
                            <p className="text-sm leading-relaxed">Es el punto más a la izquierda en la nube de portafolios factibles. Representa la combinación que proporciona la menor volatilidad absoluta posible. Se utiliza frecuentemente por inversores extremadamente conservadores o como un estimador robusto cuando los retornos esperados son difíciles de predecir.</p>
                        </div>
                    </div>
                </Card>
            )}
        </div>
    );
  };

  const renderERC = () => {
    if (!ercWeights) return <div className="p-12 text-center text-slate-500 font-medium">Por favor ejecuta los cálculos.</div>;
    const analysisAssets = tickers;
    const n = analysisAssets.length;

    let portReturn = 0;
    let portVar = 0;
    analysisAssets.forEach(a => {
      portReturn += (ercWeights[a] || 0) * (stats[a]?.annualReturn || 0);
    });
    analysisAssets.forEach(a => {
      analysisAssets.forEach(b => {
        portVar += (ercWeights[a] || 0) * (ercWeights[b] || 0) * (covarianceMatrix[a]?.[b] || 0);
      });
    });
    const portRisk = Math.sqrt(Math.max(0, portVar));
    const sharpe = portRisk > 0 ? (portReturn - riskFreeRate) / portRisk : 0;

    // Calculate Marginal Risk Contribution (MRC), Contrib Vol, Contrib %, Meta ERC, Error Cuadrático
    const targetErc = 1 / n;
    let sumMrc = 0;
    const assetAnalytics = analysisAssets.map(a => {
      const w = ercWeights[a] || 0;
      const r = stats[a]?.annualReturn || 0;
      const vol = stats[a]?.annualStdDev || 0;
      const variance = stats[a]?.annualVariance || 0;
      
      // MRC_i = (Sigma * w)_i / portRisk
      let sigma_w_i = 0;
      analysisAssets.forEach(b => {
        sigma_w_i += (covarianceMatrix[a]?.[b] || 0) * (ercWeights[b] || 0);
      });
      const mrc = portRisk > 0 ? sigma_w_i / portRisk : 0;
      sumMrc += mrc;
      
      // Contrib. (Vol) = w_i * MRC_i
      const contribVol = w * mrc;
      // Contrib. (%) = ContribVol / portRisk
      const contribPct = portRisk > 0 ? contribVol / portRisk : 0;
      const squaredError = Math.pow(contribPct - targetErc, 2);

      return {
        ticker: a,
        w,
        r,
        vol,
        variance,
        mrc,
        contribVol,
        contribPct,
        targetErc,
        squaredError
      };
    });

    const totalWeight = assetAnalytics.reduce((s, x) => s + x.w, 0);
    const totalContribVol = assetAnalytics.reduce((s, x) => s + x.contribVol, 0);
    const totalContribPct = assetAnalytics.reduce((s, x) => s + x.contribPct, 0);
    const totalTarget = assetAnalytics.reduce((s, x) => s + x.targetErc, 0);
    const totalSquaredError = assetAnalytics.reduce((s, x) => s + x.squaredError, 0);

    return (
        <div className="p-6 space-y-6">
            <Card className="p-8">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
                    <h3 className="text-2xl font-black text-slate-800 tracking-tight">Portafolio Paridad de Riesgo (Equal Risk Contribution - ERC)</h3>
                    <span className="bg-amber-100 text-amber-900 border border-amber-300 font-bold px-3 py-1 rounded-full text-xs">
                        Algoritmo Exacto Maillard, Roncalli & Teïletche
                    </span>
                </div>
                <p className="text-slate-600 text-sm mb-8 leading-relaxed max-w-4xl">
                    A diferencia del enfoque ingenuo de inversa de la volatilidad, la verdadera <strong>Paridad de Riesgo (Equal Risk Contribution)</strong> resuelve un problema de optimización no lineal considerando la <strong>matriz completa de covarianzas (Σ)</strong> para que cada uno de los {n} activos contribuya exactamente con un <strong>{(targetErc * 100).toFixed(2)}%</strong> al riesgo total del portafolio (TRC = σp / N).
                </p>

                {/* KPI Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8 bg-slate-50 p-6 rounded-xl border border-slate-200 shadow-inner">
                    <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Retorno Esperado (Rp)</div>
                        <div className="text-3xl font-mono font-black text-emerald-600">{(portReturn * 100).toFixed(2)}%</div>
                    </div>
                    <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Varianza Portafolio (σp²)</div>
                        <div className="text-3xl font-mono font-black text-slate-800">{(portVar * 100).toFixed(2)}%</div>
                    </div>
                    <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Volatilidad (σp)</div>
                        <div className="text-3xl font-mono font-black text-slate-700">{(portRisk * 100).toFixed(2)}%</div>
                    </div>
                    <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Ratio de Sharpe</div>
                        <div className="text-3xl font-mono font-black text-blue-600">{sharpe.toFixed(2)}</div>
                    </div>
                </div>

                {/* Full Optimization Table matching Excel */}
                <div className="mb-10">
                    <h4 className="text-base font-bold text-slate-800 mb-3 flex items-center justify-between">
                        <span>1.1. Ponderaciones y Contribuciones de Riesgo del Portafolio ERC</span>
                        <span className="text-xs font-mono text-slate-500 font-normal">Suma de Ponderaciones = 100.00%</span>
                    </h4>
                    <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-sm">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-[#1e3a8a] text-white text-xs uppercase font-bold text-center">
                                <tr>
                                    <th className="px-4 py-3 text-left">Activo</th>
                                    <th className="px-4 py-3">W (Peso)</th>
                                    <th className="px-4 py-3">Ri (Retorno)</th>
                                    <th className="px-4 py-3">Riesgo Marginal</th>
                                    <th className="px-4 py-3">MRC (%)</th>
                                    <th className="px-4 py-3">Contrib. (Vol)</th>
                                    <th className="px-4 py-3">Contrib. (%)</th>
                                    <th className="px-4 py-3">Meta (ERC)</th>
                                    <th className="px-4 py-3">Error Cuadrático</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-slate-700 font-mono text-center text-xs">
                                {assetAnalytics.map((row, i) => {
                                    const mrcPct = sumMrc > 0 ? (row.mrc / sumMrc) * 100 : 0;
                                    return (
                                        <tr key={row.ticker} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-4 py-3 text-left font-bold font-sans flex items-center gap-2">
                                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}></span>
                                                {row.ticker}
                                            </td>
                                            <td className="px-4 py-3 font-bold text-slate-900 bg-blue-50/40">{(row.w * 100).toFixed(2)}%</td>
                                            <td className={cn("px-4 py-3 font-semibold", row.r >= 0 ? "text-emerald-600" : "text-rose-600")}>{(row.r * 100).toFixed(2)}%</td>
                                            <td className="px-4 py-3">{(row.mrc * 100).toFixed(2)}%</td>
                                            <td className="px-4 py-3 text-slate-600">{mrcPct.toFixed(2)}%</td>
                                            <td className="px-4 py-3 font-semibold text-slate-800 bg-amber-50/30">{(row.contribVol * 100).toFixed(2)}%</td>
                                            <td className="px-4 py-3 font-bold text-amber-800 bg-amber-50/60">{(row.contribPct * 100).toFixed(2)}%</td>
                                            <td className="px-4 py-3 text-slate-600">{(row.targetErc * 100).toFixed(2)}%</td>
                                            <td className="px-4 py-3 text-slate-500">{(row.squaredError * 100).toFixed(4)}%</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="bg-slate-100/80 font-mono font-bold text-center text-xs border-t-2 border-slate-300">
                                <tr>
                                    <td className="px-4 py-3 text-left font-sans">TOTALES</td>
                                    <td className="px-4 py-3 font-black text-slate-900 bg-blue-100/50">{(totalWeight * 100).toFixed(2)}%</td>
                                    <td className="px-4 py-3 text-emerald-700">{(portReturn * 100).toFixed(2)}%</td>
                                    <td className="px-4 py-3">-</td>
                                    <td className="px-4 py-3">{(sumMrc > 0 ? 100 : 0).toFixed(2)}%</td>
                                    <td className="px-4 py-3 text-slate-900 bg-amber-100/50">{(totalContribVol * 100).toFixed(2)}%</td>
                                    <td className="px-4 py-3 text-amber-900 bg-amber-100/80">{(totalContribPct * 100).toFixed(2)}%</td>
                                    <td className="px-4 py-3">{(totalTarget * 100).toFixed(2)}%</td>
                                    <td className="px-4 py-3 text-emerald-700">{(totalSquaredError * 100).toFixed(4)}%</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>

                {/* Doughnut Charts & Visual Allocation */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
                    <Card className="p-6 border border-slate-200 bg-white shadow-sm flex flex-col">
                        <h4 className="font-bold text-slate-800 mb-4 flex items-center justify-between">
                            <span className="flex items-center gap-2">
                                <span className="text-amber-500 text-lg">⚖</span> Ponderación de Capital ERC (Pesos $W_i$)
                            </span>
                            <span className="text-xs font-mono text-slate-400">Total: 100.00%</span>
                        </h4>
                        <div className="h-[250px] relative">
                            <Doughnut 
                                data={{
                                    labels: assetAnalytics.map(a => `${a.ticker}: ${(a.w * 100).toFixed(2)}%`),
                                    datasets: [{
                                        data: assetAnalytics.map(a => a.w * 100),
                                        backgroundColor: CHART_COLORS.slice(0, assetAnalytics.length),
                                        borderWidth: 2,
                                        borderColor: '#ffffff',
                                        hoverOffset: 4
                                    }]
                                }} 
                                options={{
                                    responsive: true,
                                    maintainAspectRatio: false,
                                    plugins: {
                                        legend: { position: 'right', labels: { font: { size: 11, family: 'monospace' }, boxWidth: 12, padding: 12 } },
                                        tooltip: { 
                                            backgroundColor: 'rgba(15, 23, 42, 0.9)', 
                                            titleColor: '#f8fafc', 
                                            bodyColor: '#f8fafc', 
                                            padding: 12, 
                                            cornerRadius: 8, 
                                            callbacks: { label: (ctx: any) => ` ${ctx.label}` } 
                                        }
                                    },
                                    cutout: '65%'
                                }} 
                            />
                        </div>
                    </Card>

                    <Card className="p-6 border border-slate-200 bg-white shadow-sm flex flex-col">
                        <h4 className="font-bold text-slate-800 mb-4 flex items-center justify-between">
                            <span className="flex items-center gap-2">
                                <span className="text-amber-600 text-lg">🛡️</span> Contribución al Riesgo Total ($TRC_i = 1/N$)
                            </span>
                            <span className="text-xs font-mono text-slate-400">Equitativo: {(targetErc * 100).toFixed(2)}% c/u</span>
                        </h4>
                        <div className="h-[250px] relative">
                            <Doughnut 
                                data={{
                                    labels: assetAnalytics.map(a => `${a.ticker}: ${(a.contribPct * 100).toFixed(2)}%`),
                                    datasets: [{
                                        data: assetAnalytics.map(a => a.contribPct * 100),
                                        backgroundColor: CHART_COLORS.slice(0, assetAnalytics.length),
                                        borderWidth: 2,
                                        borderColor: '#ffffff',
                                        hoverOffset: 4
                                    }]
                                }} 
                                options={{
                                    responsive: true,
                                    maintainAspectRatio: false,
                                    plugins: {
                                        legend: { position: 'right', labels: { font: { size: 11, family: 'monospace' }, boxWidth: 12, padding: 12 } },
                                        tooltip: { 
                                            backgroundColor: 'rgba(15, 23, 42, 0.9)', 
                                            titleColor: '#f8fafc', 
                                            bodyColor: '#f8fafc', 
                                            padding: 12, 
                                            cornerRadius: 8, 
                                            callbacks: { label: (ctx: any) => ` Contribución al Riesgo: ${Number(ctx.raw).toFixed(2)}%` } 
                                        }
                                    },
                                    cutout: '65%'
                                }} 
                            />
                        </div>
                    </Card>
                </div>

                {/* Doughnut and Weight Cards */}
                <h4 className="text-base font-bold text-slate-800 mb-6 border-b border-slate-200 pb-2">Distribución de Ponderaciones Asignadas</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    {assetAnalytics.map((item, i) => (
                        <div key={item.ticker} className="bg-white border border-slate-200 rounded-xl p-4 relative overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                            <div className="absolute top-0 left-0 w-1.5 h-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}></div>
                            <div className="flex flex-col mb-2">
                                <span className="font-black text-slate-800 text-base">{item.ticker}</span>
                                <span className="font-mono text-2xl font-black mt-1" style={{ color: CHART_COLORS[i % CHART_COLORS.length] }}>{(item.w * 100).toFixed(2)}%</span>
                            </div>
                            <div className="text-[11px] font-semibold text-slate-500 bg-slate-50 inline-block px-2 py-1 rounded border border-slate-100">
                                Vol: {(item.vol * 100).toFixed(2)}%
                            </div>
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );
  };

  const renderComparativa = () => {
    if (!mptResults || !ercWeights) return <div className="p-12 text-center text-slate-500 font-medium">Por favor procesa los datos y calcula las carteras óptimas primero.</div>;
    const analysisAssets = tickers.filter(a => a !== benchmark);

    const bmkVar = covarianceMatrix[benchmark]?.[benchmark] || 1;
    const days = processedData.length;
    const years = days / 252;
    
    // Helper to calculate daily series
    const calcSeries = (weights: Record<string, number>, isBenchmark: boolean = false) => {
        let cum = 1;
        let maxCum = 1;
        const series: any[] = [];
        let totalRet = 0;
        let posDays = 0;
        let bestDay = -Infinity;
        let worstDay = Infinity;
        let sumSqrRet = 0;
        let sumDownsideSqr = 0;
        const dailyRets: number[] = [];

        processedData.forEach(d => {
            let dr = 0;
            if (isBenchmark) {
                dr = d[`${benchmark}_daily`] || 0;
            } else {
                analysisAssets.forEach(a => {
                    dr += (weights[a] || 0) * (d[`${a}_daily`] || 0);
                });
            }
            cum = cum * (1 + dr);
            if (cum > maxCum) maxCum = cum;
            const dd = maxCum > 0 ? (cum / maxCum) - 1 : 0;
            
            if (dr > 0) posDays++;
            if (dr > bestDay) bestDay = dr;
            if (dr < worstDay) worstDay = dr;
            
            totalRet += dr; // Naive sum for mean
            dailyRets.push(dr);
            series.push({ date: d.date, ret: dr, cum: (cum - 1), dd: dd });
        });

        const meanDaily = totalRet / days;
        dailyRets.forEach(dr => {
            sumSqrRet += Math.pow(dr - meanDaily, 2);
            if (dr < 0) sumDownsideSqr += Math.pow(dr, 2);
        });
        
        const dailyVol = Math.sqrt(sumSqrRet / (days - 1));
        const annVol = dailyVol * Math.sqrt(252);
        
        const dailyDownsideVol = Math.sqrt(sumDownsideSqr / (days - 1));
        const annDownsideVol = dailyDownsideVol * Math.sqrt(252);

        const mdd = Math.min(...series.map(s => s.dd));
        const cagr = Math.pow(cum, 1 / (years || 1)) - 1;
        const totalAcum = cum - 1;

        // VaR and CVaR using historical simulation
        const sortedRets = [...dailyRets].sort((a, b) => a - b);
        const p05Idx = Math.floor(days * 0.05);
        const dailyVaR95 = sortedRets[p05Idx] || 0;
        const annVaR95 = dailyVaR95 * Math.sqrt(252); // Approx
        
        const tailRets = sortedRets.slice(0, p05Idx);
        const dailyCVaR95 = tailRets.length ? tailRets.reduce((a, b) => a + b, 0) / tailRets.length : 0;
        const annCVaR95 = dailyCVaR95 * Math.sqrt(252); // Approx

        return { 
            series, cagr, annVol, annDownsideVol, mdd, totalAcum, 
            posDaysRate: posDays / days, bestDay, worstDay, dailyRets, annVaR95, annCVaR95
        };
    };

    const eqWeight = 1 / analysisAssets.length;
    const eqWeightsObj: Record<string, number> = {};
    analysisAssets.forEach(a => eqWeightsObj[a] = eqWeight);

    const msRes = calcSeries(mptResults.maxSharpePort.weights);
    const mvRes = calcSeries(mptResults.minVariancePort.weights);
    const ercRes = calcSeries(ercWeights);
    const eqRes = calcSeries(eqWeightsObj);
    const bmkRes = calcSeries({}, true);
    
    // Relative metrics
    const calcRelative = (res: any) => {
        let covSum = 0; let bmkVarSum = 0; let teSumSqr = 0;
        const bmkMean = bmkRes.dailyRets.reduce((a: number, b: number) => a + b, 0) / days;
        const resMean = res.dailyRets.reduce((a: number, b: number) => a + b, 0) / days;
        
        for (let i = 0; i < days; i++) {
            const r = res.dailyRets[i];
            const b = bmkRes.dailyRets[i];
            covSum += (r - resMean) * (b - bmkMean);
            bmkVarSum += Math.pow(b - bmkMean, 2);
            teSumSqr += Math.pow(r - b, 2);
        }
        const beta = bmkVarSum > 0 ? covSum / bmkVarSum : 0;
        const alpha = res.cagr - (riskFreeRate + beta * (bmkRes.cagr - riskFreeRate));
        const dailyTE = Math.sqrt(teSumSqr / (days - 1));
        const annTE = dailyTE * Math.sqrt(252);
        const ir = annTE > 0 ? (res.cagr - bmkRes.cagr) / annTE : 0;
        
        const sharpe = res.annVol > 0 ? (res.cagr - riskFreeRate) / res.annVol : 0;
        const sortino = res.annDownsideVol > 0 ? (res.cagr - riskFreeRate) / res.annDownsideVol : 0;
        const calmar = Math.abs(res.mdd) > 0 ? res.cagr / Math.abs(res.mdd) : 0;

        return { beta, alpha, annTE, ir, sharpe, sortino, calmar };
    };

    const msRel = calcRelative(msRes);
    const mvRel = calcRelative(mvRes);
    const ercRel = calcRelative(ercRes);
    const eqRel = calcRelative(eqRes);
    const bmkRel = calcRelative(bmkRes);

    const formatDateRange = () => {
        if (!processedData.length) return '';
        const start = processedData[0].date;
        const end = processedData[processedData.length - 1].date;
        return `${start} a ${end} • ${days} días hábiles / ${years.toFixed(1)} años`;
    };

    const calcExpectedRet = (weights: Record<string, number>) => {
        let er = 0;
        analysisAssets.forEach(a => {
            er += (weights[a] || 0) * (stats[a]?.annualReturn || 0);
        });
        return er;
    };

    const msExpRet = mptResults.maxSharpePort.return;
    const mvExpRet = mptResults.minVariancePort.return;
    const ercExpRet = calcExpectedRet(ercWeights);
    const eqExpRet = calcExpectedRet(eqWeightsObj);
    const bmkExpRet = stats[benchmark]?.annualReturn ?? bmkRes.cagr;

    const SummaryCard = ({ title, badge, badgeCol, ret, expRet, cagr, vol, sharpe, mdd, color }: any) => (
        <Card className={`p-4 border ${color.border} shadow-sm bg-white rounded-xl hover:shadow-md transition-shadow`}>
            <div className="flex justify-between items-center mb-3">
                <h4 className={`text-sm font-bold flex items-center gap-2 ${color.text}`}>
                    <span className={`w-2.5 h-2.5 rounded-full ${color.bg}`}></span> {title}
                </h4>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${badgeCol}`}>{badge}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <div className="text-[10px] text-slate-400 font-bold mb-0.5">Retorno Total</div>
                    <div className={`text-lg font-black font-mono ${ret >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{(ret * 100).toFixed(1)}%</div>
                </div>
                <div>
                    <div className="text-[10px] text-slate-400 font-bold mb-0.5">Retorno Esperado Anual</div>
                    <div className={`text-lg font-black font-mono ${expRet >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{(expRet * 100).toFixed(2)}%</div>
                </div>
                <div>
                    <div className="text-[10px] text-slate-400 font-bold mb-0.5">Retorno Anual (CAGR)</div>
                    <div className="text-sm font-bold text-slate-700 font-mono">{(cagr * 100).toFixed(2)}%</div>
                </div>
                <div>
                    <div className="text-[10px] text-slate-400 font-bold mb-0.5">Sharpe Realizado</div>
                    <div className="text-sm font-bold text-slate-700 font-mono">{sharpe.toFixed(2)}</div>
                </div>
                <div>
                    <div className="text-[10px] text-slate-400 font-bold mb-0.5">Volatilidad Real (σ)</div>
                    <div className="text-sm font-bold text-slate-600 font-mono">{(vol * 100).toFixed(1)}%</div>
                </div>
                <div>
                    <div className="text-[10px] text-slate-400 font-bold mb-0.5">Max Drawdown</div>
                    <div className="text-sm font-bold text-rose-500 font-mono">{(mdd * 100).toFixed(1)}%</div>
                </div>
            </div>
        </Card>
    );

    const chartData = {
        labels: processedData.map(d => d.date),
        datasets: []
    };

    const addDataset = (label: string, res: any, color: string, field: string, dash: number[] = []) => {
        chartData.datasets.push({
            label, 
            data: res.series.map((s: any) => s[field] * 100), 
            borderColor: color, 
            backgroundColor: color + '20', 
            borderWidth: 2, 
            borderDash: dash, 
            pointRadius: 0, 
            pointHoverRadius: 4, 
            tension: 0.1, 
            fill: compChartTab === 'drawdown'
        } as any);
    };

    const cField = compChartTab === 'drawdown' ? 'dd' : 'cum';
    
    if (compFilters.maxSharpe) addDataset('Máximo Sharpe', msRes, '#10b981', cField);
    if (compFilters.minVar) addDataset('Mínima Varianza', mvRes, '#3b82f6', cField);
    if (compFilters.erc) addDataset('Paridad Riesgo (ERC)', ercRes, '#f59e0b', cField);
    if (compFilters.spy) addDataset(`Benchmark (${benchmark})`, bmkRes, '#ef4444', cField, [5,5]);
    if (compFilters.eq) addDataset('Equiponderado (1/N)', eqRes, '#64748b', cField);

    const chartOptions = {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index' as const, intersect: false },
        plugins: { legend: { display: false } },
        scales: {
            x: { grid: { display: false } },
            y: { grid: { color: '#e2e8f0', borderDash: [4, 4] }, ticks: { callback: (v: any) => v.toFixed(0) + '%' } }
        }
    };

    const Td = ({ children, className = "", highlight = false }: any) => (
        <td className={`px-3 py-2 text-center font-mono text-sm ${highlight ? 'font-bold' : ''} ${className}`}>{children}</td>
    );

    return (
        <div className="p-6 space-y-6 bg-white min-h-full">
            <Card className="p-6 bg-[#0f172a] text-white border-0 shadow-lg rounded-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                    <TrendingUp className="w-32 h-32" />
                </div>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-10">
                    <div>
                        <h2 className="text-xl md:text-2xl font-bold flex items-center gap-3">
                            <BarChart3 className="w-6 h-6 text-blue-400" />
                            4. Comparativa Histórica & Backtesting de Estrategias
                        </h2>
                        <p className="text-slate-400 text-sm mt-2 max-w-3xl leading-relaxed">
                            Evaluación empírica y simulación de desempeño histórico durante el horizonte seleccionado ({formatDateRange()}) comparando las carteras óptimas frente al benchmark de mercado.
                        </p>
                    </div>
                    <button className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-colors text-sm whitespace-nowrap shadow-sm">
                        <Download className="w-4 h-4" /> Exportar Excel
                    </button>
                </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <SummaryCard title="Máximo Sharpe (Tangente)" badge="Top Sharpe" badgeCol="bg-emerald-50 text-emerald-600" ret={msRes.totalAcum} expRet={msExpRet} cagr={msRes.cagr} vol={msRes.annVol} sharpe={msRel.sharpe} mdd={msRes.mdd} color={{bg:'bg-emerald-500', text:'text-emerald-700', border:'border-emerald-200'}} />
                <SummaryCard title="Mínima Varianza (GMV)" badge="Menor Vol" badgeCol="bg-blue-50 text-blue-600" ret={mvRes.totalAcum} expRet={mvExpRet} cagr={mvRes.cagr} vol={mvRes.annVol} sharpe={mvRel.sharpe} mdd={mvRes.mdd} color={{bg:'bg-blue-500', text:'text-blue-700', border:'border-blue-200'}} />
                <SummaryCard title="Paridad de Riesgo (ERC)" badge="Risk Parity" badgeCol="bg-amber-50 text-amber-600" ret={ercRes.totalAcum} expRet={ercExpRet} cagr={ercRes.cagr} vol={ercRes.annVol} sharpe={ercRel.sharpe} mdd={ercRes.mdd} color={{bg:'bg-amber-500', text:'text-amber-700', border:'border-amber-200'}} />
                <SummaryCard title={`Benchmark (${benchmark})`} badge="Mercado" badgeCol="bg-rose-50 text-rose-600" ret={bmkRes.totalAcum} expRet={bmkExpRet} cagr={bmkRes.cagr} vol={bmkRes.annVol} sharpe={bmkRel.sharpe} mdd={bmkRes.mdd} color={{bg:'bg-rose-500', text:'text-rose-700', border:'border-rose-200'}} />
            </div>

            <Card className="p-0 border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex flex-wrap justify-between items-center gap-4">
                    <div className="flex items-center gap-2 text-sm font-bold">
                        <button onClick={() => setCompChartTab('crecimiento')} className={`px-3 py-1.5 rounded-md flex items-center gap-2 transition-colors ${compChartTab === 'crecimiento' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:bg-slate-200'}`}><TrendingUp className="w-4 h-4"/> Crecimiento de Capital (Base 100)</button>
                        <button onClick={() => setCompChartTab('drawdown')} className={`px-3 py-1.5 rounded-md flex items-center gap-2 transition-colors ${compChartTab === 'drawdown' ? 'bg-white shadow-sm text-rose-700' : 'text-slate-500 hover:bg-slate-200'}`}><ArrowDownRight className="w-4 h-4"/> Drawdowns de Pico a Valle (%)</button>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold">
                        <span className="text-slate-400 mr-2 uppercase">Filtro:</span>
                        <label className={`flex items-center gap-1.5 px-2 py-1 rounded-full border cursor-pointer transition-colors ${compFilters.maxSharpe ? 'border-emerald-500 text-emerald-700 bg-emerald-50' : 'border-slate-200 text-slate-400'}`}>
                            <input type="checkbox" className="hidden" checked={compFilters.maxSharpe} onChange={() => setCompFilters(prev => ({...prev, maxSharpe: !prev.maxSharpe}))} />
                            <span className={`w-2 h-2 rounded-full ${compFilters.maxSharpe ? 'bg-emerald-500' : 'bg-slate-300'}`}></span> Máx Sharpe
                        </label>
                        <label className={`flex items-center gap-1.5 px-2 py-1 rounded-full border cursor-pointer transition-colors ${compFilters.minVar ? 'border-blue-500 text-blue-700 bg-blue-50' : 'border-slate-200 text-slate-400'}`}>
                            <input type="checkbox" className="hidden" checked={compFilters.minVar} onChange={() => setCompFilters(prev => ({...prev, minVar: !prev.minVar}))} />
                            <span className={`w-2 h-2 rounded-full ${compFilters.minVar ? 'bg-blue-500' : 'bg-slate-300'}`}></span> Mín Varianza
                        </label>
                        <label className={`flex items-center gap-1.5 px-2 py-1 rounded-full border cursor-pointer transition-colors ${compFilters.erc ? 'border-amber-500 text-amber-700 bg-amber-50' : 'border-slate-200 text-slate-400'}`}>
                            <input type="checkbox" className="hidden" checked={compFilters.erc} onChange={() => setCompFilters(prev => ({...prev, erc: !prev.erc}))} />
                            <span className={`w-2 h-2 rounded-full ${compFilters.erc ? 'bg-amber-500' : 'bg-slate-300'}`}></span> ERC
                        </label>
                        <label className={`flex items-center gap-1.5 px-2 py-1 rounded-full border cursor-pointer transition-colors ${compFilters.spy ? 'border-rose-500 text-rose-700 bg-rose-50' : 'border-slate-200 text-slate-400'}`}>
                            <input type="checkbox" className="hidden" checked={compFilters.spy} onChange={() => setCompFilters(prev => ({...prev, spy: !prev.spy}))} />
                            <span className={`w-2 h-2 rounded-full ${compFilters.spy ? 'bg-rose-500' : 'bg-slate-300'}`}></span> SPY
                        </label>
                        <label className={`flex items-center gap-1.5 px-2 py-1 rounded-full border cursor-pointer transition-colors ${compFilters.eq ? 'border-slate-500 text-slate-700 bg-slate-50' : 'border-slate-200 text-slate-400'}`}>
                            <input type="checkbox" className="hidden" checked={compFilters.eq} onChange={() => setCompFilters(prev => ({...prev, eq: !prev.eq}))} />
                            <span className={`w-2 h-2 rounded-full ${compFilters.eq ? 'bg-slate-500' : 'bg-slate-300'}`}></span> 1/N
                        </label>
                    </div>
                </div>
                <div className="p-4 h-[400px]">
                    <Line data={chartData} options={chartOptions as any} />
                </div>
            </Card>

            <Card className="p-0 border border-slate-200 shadow-sm overflow-hidden flex flex-col mt-6">
                <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex flex-wrap justify-between items-center gap-4">
                    <div>
                        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                            <Activity className="w-4 h-4 text-slate-500"/>
                            Matriz Comparativa Cuantitativa de Desempeño y Riesgo Realizado
                        </h3>
                        <p className="text-[10px] text-slate-500 mt-0.5">Evaluación estricta de métricas de retorno acumulado, volatilidad empírica, ratios de eficiencia y medidas de cola</p>
                    </div>
                    <div className="text-xs font-mono text-slate-500 bg-white px-3 py-1 rounded border border-slate-200">
                        Tasa Libre de Riesgo: Rf = {(riskFreeRate * 100).toFixed(1)}%
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-[#1e3a8a] text-white text-[11px] font-bold">
                            <tr>
                                <th className="px-4 py-3 text-left w-64">Métrica / Definición Cuantitativa</th>
                                <th className="px-3 py-3 text-center text-emerald-300">Máximo Sharpe</th>
                                <th className="px-3 py-3 text-center text-blue-300">Mínima Varianza</th>
                                <th className="px-3 py-3 text-center text-amber-300">Paridad Riesgo (ERC)</th>
                                <th className="px-3 py-3 text-center text-rose-300">Benchmark ({benchmark})</th>
                                <th className="px-3 py-3 text-center text-slate-300">Equiponderado (1/N)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                            {/* Retorno */}
                            <tr className="bg-slate-50/50">
                                <td colSpan={6} className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-100">📈 Retorno & Crecimiento Patrimonial</td>
                            </tr>
                            <tr className="hover:bg-slate-50">
                                <td className="px-4 py-2 text-xs"><div className="font-bold">Retorno Esperado Anual (E[Rp])</div><div className="text-[9px] text-slate-400 font-mono">E[Rp] = ∑ wi × E[Ri]</div></td>
                                <Td highlight className="text-emerald-600 font-bold">{(msExpRet * 100).toFixed(2)}%</Td>
                                <Td className="text-blue-600 font-bold">{(mvExpRet * 100).toFixed(2)}%</Td>
                                <Td className="text-amber-600 font-bold">{(ercExpRet * 100).toFixed(2)}%</Td>
                                <Td className="text-rose-600 font-bold">{(bmkExpRet * 100).toFixed(2)}%</Td>
                                <Td className="text-slate-600 font-bold">{(eqExpRet * 100).toFixed(2)}%</Td>
                            </tr>
                            <tr className="hover:bg-slate-50">
                                <td className="px-4 py-2 text-xs"><div className="font-bold">Retorno Acumulado Total</div><div className="text-[9px] text-slate-400 font-mono">Rtotal = (V_T - V_0) / V_0</div></td>
                                <Td highlight className="text-emerald-600">+{(msRes.totalAcum * 100).toFixed(2)}%</Td>
                                <Td className="text-blue-600">+{(mvRes.totalAcum * 100).toFixed(2)}%</Td>
                                <Td className="text-amber-600">+{(ercRes.totalAcum * 100).toFixed(2)}%</Td>
                                <Td className="text-rose-600">+{(bmkRes.totalAcum * 100).toFixed(2)}%</Td>
                                <Td className="text-slate-600">+{(eqRes.totalAcum * 100).toFixed(2)}%</Td>
                            </tr>
                            <tr className="hover:bg-slate-50">
                                <td className="px-4 py-2 text-xs"><div className="font-bold">Retorno Anual Compuesto (CAGR)</div><div className="text-[9px] text-slate-400 font-mono">CAGR = (V_T / V_0)^(1/T) - 1</div></td>
                                <Td highlight className="text-emerald-600">{(msRes.cagr * 100).toFixed(2)}%</Td>
                                <Td className="text-blue-600">{(mvRes.cagr * 100).toFixed(2)}%</Td>
                                <Td className="text-amber-600">{(ercRes.cagr * 100).toFixed(2)}%</Td>
                                <Td className="text-rose-600">{(bmkRes.cagr * 100).toFixed(2)}%</Td>
                                <Td className="text-slate-600">{(eqRes.cagr * 100).toFixed(2)}%</Td>
                            </tr>

                            {/* Riesgo */}
                            <tr className="bg-slate-50/50">
                                <td colSpan={6} className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-100">🛡️ Riesgo, Volatilidad & Caídas (Drawdown)</td>
                            </tr>
                            <tr className="hover:bg-slate-50">
                                <td className="px-4 py-2 text-xs"><div className="font-bold">Volatilidad Anualizada Realizada</div><div className="text-[9px] text-slate-400 font-mono">σa = σd × √252</div></td>
                                <Td>{(msRes.annVol * 100).toFixed(2)}%</Td>
                                <Td highlight className="text-blue-600">{(mvRes.annVol * 100).toFixed(2)}%</Td>
                                <Td>{(ercRes.annVol * 100).toFixed(2)}%</Td>
                                <Td>{(bmkRes.annVol * 100).toFixed(2)}%</Td>
                                <Td>{(eqRes.annVol * 100).toFixed(2)}%</Td>
                            </tr>
                            <tr className="hover:bg-slate-50">
                                <td className="px-4 py-2 text-xs"><div className="font-bold">Máximo Drawdown (MDD)</div><div className="text-[9px] text-slate-400 font-mono">MDD = min( (V_t - Pico_t) / Pico_t )</div></td>
                                <Td className="text-rose-600">{(msRes.mdd * 100).toFixed(2)}%</Td>
                                <Td className="text-rose-600">{(mvRes.mdd * 100).toFixed(2)}%</Td>
                                <Td className="text-rose-600">{(ercRes.mdd * 100).toFixed(2)}%</Td>
                                <Td className="text-rose-600">{(bmkRes.mdd * 100).toFixed(2)}%</Td>
                                <Td className="text-rose-600">{(eqRes.mdd * 100).toFixed(2)}%</Td>
                            </tr>
                            <tr className="hover:bg-slate-50">
                                <td className="px-4 py-2 text-xs"><div className="font-bold">Value at Risk 95% Anual (VaR)</div><div className="text-[9px] text-slate-400 font-mono">VaR95% = Percentil5(Rd) × √252</div></td>
                                <Td className="text-rose-600">{(msRes.annVaR95 * 100).toFixed(2)}%</Td>
                                <Td className="text-rose-600">{(mvRes.annVaR95 * 100).toFixed(2)}%</Td>
                                <Td className="text-rose-600">{(ercRes.annVaR95 * 100).toFixed(2)}%</Td>
                                <Td className="text-rose-600">{(bmkRes.annVaR95 * 100).toFixed(2)}%</Td>
                                <Td className="text-rose-600">{(eqRes.annVaR95 * 100).toFixed(2)}%</Td>
                            </tr>
                            <tr className="hover:bg-slate-50">
                                <td className="px-4 py-2 text-xs"><div className="font-bold">Conditional VaR 95% Anual (CVaR / ES)</div><div className="text-[9px] text-slate-400 font-mono">CVaR95% = E[R | R ≤ -VaR] × √252</div></td>
                                <Td className="text-rose-600">{(msRes.annCVaR95 * 100).toFixed(2)}%</Td>
                                <Td className="text-rose-600">{(mvRes.annCVaR95 * 100).toFixed(2)}%</Td>
                                <Td className="text-rose-600">{(ercRes.annCVaR95 * 100).toFixed(2)}%</Td>
                                <Td className="text-rose-600">{(bmkRes.annCVaR95 * 100).toFixed(2)}%</Td>
                                <Td className="text-rose-600">{(eqRes.annCVaR95 * 100).toFixed(2)}%</Td>
                            </tr>

                            {/* Ratios */}
                            <tr className="bg-slate-50/50">
                                <td colSpan={6} className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-100">⚖️ Ratios Ajustados por Riesgo</td>
                            </tr>
                            <tr className="hover:bg-slate-50">
                                <td className="px-4 py-2 text-xs"><div className="font-bold">Ratio de Sharpe Realizado</div><div className="text-[9px] text-slate-400 font-mono">Sharpe = (CAGR - Rf) / σa</div></td>
                                <Td highlight className="text-emerald-700">{msRel.sharpe.toFixed(3)}</Td>
                                <Td className="text-blue-700">{mvRel.sharpe.toFixed(3)}</Td>
                                <Td className="text-amber-700">{ercRel.sharpe.toFixed(3)}</Td>
                                <Td className="text-rose-700">{bmkRel.sharpe.toFixed(3)}</Td>
                                <Td className="text-slate-700">{eqRel.sharpe.toFixed(3)}</Td>
                            </tr>
                            <tr className="hover:bg-slate-50">
                                <td className="px-4 py-2 text-xs"><div className="font-bold">Ratio de Sortino</div><div className="text-[9px] text-slate-400 font-mono">Sortino = (CAGR - Rf) / σ_downside</div></td>
                                <Td>{msRel.sortino.toFixed(3)}</Td>
                                <Td>{mvRel.sortino.toFixed(3)}</Td>
                                <Td>{ercRel.sortino.toFixed(3)}</Td>
                                <Td>{bmkRel.sortino.toFixed(3)}</Td>
                                <Td>{eqRel.sortino.toFixed(3)}</Td>
                            </tr>
                            <tr className="hover:bg-slate-50">
                                <td className="px-4 py-2 text-xs"><div className="font-bold">Calmar Ratio</div><div className="text-[9px] text-slate-400 font-mono">Calmar = CAGR / |MDD|</div></td>
                                <Td>{msRel.calmar.toFixed(3)}</Td>
                                <Td>{mvRel.calmar.toFixed(3)}</Td>
                                <Td>{ercRel.calmar.toFixed(3)}</Td>
                                <Td>{bmkRel.calmar.toFixed(3)}</Td>
                                <Td>{eqRel.calmar.toFixed(3)}</Td>
                            </tr>

                            {/* Relative */}
                            <tr className="bg-slate-50/50">
                                <td colSpan={6} className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-100">🎯 Métricas Relativas frente al Benchmark ({benchmark})</td>
                            </tr>
                            <tr className="hover:bg-slate-50">
                                <td className="px-4 py-2 text-xs"><div className="font-bold">Beta de Mercado (β)</div><div className="text-[9px] text-slate-400 font-mono">β = Cov(Rp, Rb) / Var(Rb)</div></td>
                                <Td>{msRel.beta.toFixed(2)}</Td>
                                <Td>{mvRel.beta.toFixed(2)}</Td>
                                <Td>{ercRel.beta.toFixed(2)}</Td>
                                <Td>1.00</Td>
                                <Td>{eqRel.beta.toFixed(2)}</Td>
                            </tr>
                            <tr className="hover:bg-slate-50">
                                <td className="px-4 py-2 text-xs"><div className="font-bold">Alfa de Jensen Anualizada (α)</div><div className="text-[9px] text-slate-400 font-mono">α = CAGR_p - [Rf + β(CAGR_b - Rf)]</div></td>
                                <Td className={msRel.alpha >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{(msRel.alpha > 0 ? '+' : '')}{(msRel.alpha * 100).toFixed(2)}%</Td>
                                <Td className={mvRel.alpha >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{(mvRel.alpha > 0 ? '+' : '')}{(mvRel.alpha * 100).toFixed(2)}%</Td>
                                <Td className={ercRel.alpha >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{(ercRel.alpha > 0 ? '+' : '')}{(ercRel.alpha * 100).toFixed(2)}%</Td>
                                <Td className="text-slate-400">-</Td>
                                <Td className={eqRel.alpha >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{(eqRel.alpha > 0 ? '+' : '')}{(eqRel.alpha * 100).toFixed(2)}%</Td>
                            </tr>
                            <tr className="hover:bg-slate-50">
                                <td className="px-4 py-2 text-xs"><div className="font-bold">Tracking Error Anualizado (TE)</div><div className="text-[9px] text-slate-400 font-mono">TE = σ(R_p - R_b) × √252</div></td>
                                <Td>{(msRel.annTE * 100).toFixed(2)}%</Td>
                                <Td>{(mvRel.annTE * 100).toFixed(2)}%</Td>
                                <Td>{(ercRel.annTE * 100).toFixed(2)}%</Td>
                                <Td className="text-slate-400">0.00%</Td>
                                <Td>{(eqRel.annTE * 100).toFixed(2)}%</Td>
                            </tr>
                            <tr className="hover:bg-slate-50">
                                <td className="px-4 py-2 text-xs"><div className="font-bold">Information Ratio (IR)</div><div className="text-[9px] text-slate-400 font-mono">IR = (CAGR_p - CAGR_b) / TE</div></td>
                                <Td>{msRel.ir.toFixed(3)}</Td>
                                <Td>{mvRel.ir.toFixed(3)}</Td>
                                <Td>{ercRel.ir.toFixed(3)}</Td>
                                <Td className="text-slate-400">-</Td>
                                <Td>{eqRel.ir.toFixed(3)}</Td>
                            </tr>

                            {/* Distribution */}
                            <tr className="bg-slate-50/50">
                                <td colSpan={6} className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-100">📅 Distribución Diaria & Días Ganadores</td>
                            </tr>
                            <tr className="hover:bg-slate-50">
                                <td className="px-4 py-2 text-xs font-bold">Tasa de Días Positivos (Win Rate)</td>
                                <Td>{(msRes.posDaysRate * 100).toFixed(1)}%</Td>
                                <Td>{(mvRes.posDaysRate * 100).toFixed(1)}%</Td>
                                <Td>{(ercRes.posDaysRate * 100).toFixed(1)}%</Td>
                                <Td>{(bmkRes.posDaysRate * 100).toFixed(1)}%</Td>
                                <Td>{(eqRes.posDaysRate * 100).toFixed(1)}%</Td>
                            </tr>
                            <tr className="hover:bg-slate-50">
                                <td className="px-4 py-2 text-xs font-bold">Mejor Día / Peor Día</td>
                                <Td className="text-[11px]"><span className="text-emerald-600">+{ (msRes.bestDay * 100).toFixed(1)}%</span> / <span className="text-rose-600">{ (msRes.worstDay * 100).toFixed(1)}%</span></Td>
                                <Td className="text-[11px]"><span className="text-emerald-600">+{ (mvRes.bestDay * 100).toFixed(1)}%</span> / <span className="text-rose-600">{ (mvRes.worstDay * 100).toFixed(1)}%</span></Td>
                                <Td className="text-[11px]"><span className="text-emerald-600">+{ (ercRes.bestDay * 100).toFixed(1)}%</span> / <span className="text-rose-600">{ (ercRes.worstDay * 100).toFixed(1)}%</span></Td>
                                <Td className="text-[11px]"><span className="text-emerald-600">+{ (bmkRes.bestDay * 100).toFixed(1)}%</span> / <span className="text-rose-600">{ (bmkRes.worstDay * 100).toFixed(1)}%</span></Td>
                                <Td className="text-[11px]"><span className="text-emerald-600">+{ (eqRes.bestDay * 100).toFixed(1)}%</span> / <span className="text-rose-600">{ (eqRes.worstDay * 100).toFixed(1)}%</span></Td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="p-5 border border-emerald-200">
                    <h4 className="font-bold text-emerald-800 text-sm mb-2 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Perfil: Máximo Sharpe</h4>
                    <p className="text-xs text-slate-600 leading-relaxed">
                        Maximiza la eficiencia de retorno por cada unidad de volatilidad asumida según la teoría clásica de Markowitz. Generó un Sharpe de <strong>{msRel.sharpe.toFixed(2)}</strong> frente al <strong>{bmkRel.sharpe.toFixed(2)}</strong> del benchmark.
                    </p>
                </Card>
                <Card className="p-5 border border-blue-200">
                    <h4 className="font-bold text-blue-800 text-sm mb-2 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Perfil: Mínima Varianza</h4>
                    <p className="text-xs text-slate-600 leading-relaxed">
                        Prioriza la contención de la volatilidad y la amortiguación de caídas. Redujo la volatilidad anualizada a un <strong>{(mvRes.annVol*100).toFixed(1)}%</strong> y limitó el Maximum Drawdown a <strong>{(mvRes.mdd*100).toFixed(1)}%</strong>.
                    </p>
                </Card>
                <Card className="p-5 border border-amber-200">
                    <h4 className="font-bold text-amber-800 text-sm mb-2 flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Perfil: Paridad de Riesgo (ERC)</h4>
                    <p className="text-xs text-slate-600 leading-relaxed">
                        Garantiza una distribución equitativa de las pérdidas potenciales entre todos los componentes. Logró un equilibrio robusto con una volatilidad de <strong>{(ercRes.annVol*100).toFixed(1)}%</strong> y un retorno compuesto de <strong>{(ercRes.cagr*100).toFixed(1)}%</strong>.
                    </p>
                </Card>
            </div>
        </div>
    );
  };
  return (
    <div className="h-screen w-full bg-slate-50 flex flex-col font-sans overflow-hidden text-slate-900">
      {renderHeader()}
      {renderControlPanel()}
      {renderTabs()}
      <main className="flex-1 overflow-y-auto custom-scrollbar relative">
        {activeTab === 'historicas' && renderHistoricas()}
        {activeTab === 'mpt' && renderMPT()}
        {activeTab === 'erc' && renderERC()}
        {activeTab === 'comparativa' && renderComparativa()}
      </main>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { height: 8px; width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; border: 2px solid transparent; background-clip: padding-box; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; border: 2px solid transparent; background-clip: padding-box; }
      `}</style>
    </div>
  );
}
