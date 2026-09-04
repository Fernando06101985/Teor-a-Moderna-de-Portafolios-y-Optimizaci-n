export const calculateStats = (data: any[], asset: string, riskFreeRate: number = 0.045) => {
  const returns = [];
  let peak = -Infinity;
  let maxDrawdown = 0;
  let bestDay = -Infinity;
  
  for (let i = 1; i < data.length; i++) {
    const prev = data[i - 1][asset];
    const curr = data[i][asset];
    if (prev !== undefined && curr !== undefined && prev !== null && curr !== null && prev !== 0) {
       const ret = (curr - prev) / prev;
       returns.push(ret);
       if (ret > bestDay) bestDay = ret;
    }
  }

  for (const day of data) {
    const price = day[asset];
    if (price !== undefined && price !== null) {
      if (price > peak) peak = price;
      const drawdown = (peak - price) / peak;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }
  }

  if (returns.length === 0) return { meanReturn: 0, stdDev: 0, annualReturn: 0, annualStdDev: 0, annualVariance: 0, sharpeRatio: 0, maxDrawdown: 0, totalReturn: 0, bestDay: 0, lastPrice: 0 };

  const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / (returns.length - 1);
  const stdDev = Math.sqrt(variance);
  const annualReturn = meanReturn * 252; // (1 + meanReturn) ** 252 - 1 is compound, but standard MPT uses simple arithmetic annualization. Let's stick to simple or compound. Let's use simple for MPT.
  const annualStdDev = stdDev * Math.sqrt(252);
  const annualVariance = variance * 252;
  
  const sharpeRatio = annualStdDev > 0 ? (annualReturn - riskFreeRate) / annualStdDev : 0;
  
  const validData = data.filter(d => d[asset] !== undefined && d[asset] !== null);
  const firstPrice = validData[0]?.[asset];
  const lastPrice = validData[validData.length - 1]?.[asset];
  const totalReturn = firstPrice ? (lastPrice - firstPrice) / firstPrice : 0;

  return {
    meanReturn,
    stdDev,
    annualReturn,
    annualStdDev,
    annualVariance,
    sharpeRatio,
    maxDrawdown,
    totalReturn,
    lastPrice,
    bestDay
  };
};

export const calculateCorrelation = (data: any[], asset1: string, asset2: string) => {
    const returns1 = [];
    const returns2 = [];
    for (let i = 1; i < data.length; i++) {
        const p1_prev = data[i - 1][asset1];
        const p1_curr = data[i][asset1];
        const p2_prev = data[i - 1][asset2];
        const p2_curr = data[i][asset2];
        if (p1_prev && p1_curr && p2_prev && p2_curr) {
            returns1.push((p1_curr - p1_prev) / p1_prev);
            returns2.push((p2_curr - p2_prev) / p2_prev);
        }
    }
    
    if (returns1.length === 0) return { correlation: 0, covariance: 0 };

    const mean1 = returns1.reduce((sum, r) => sum + r, 0) / returns1.length;
    const mean2 = returns2.reduce((sum, r) => sum + r, 0) / returns2.length;
    
    let cov = 0;
    let var1 = 0;
    let var2 = 0;
    
    for (let i = 0; i < returns1.length; i++) {
        cov += (returns1[i] - mean1) * (returns2[i] - mean2);
        var1 += Math.pow(returns1[i] - mean1, 2);
        var2 += Math.pow(returns2[i] - mean2, 2);
    }
    
    const correlation = cov / Math.sqrt(var1 * var2);
    const covariance = cov / (returns1.length - 1);
    const annualCovariance = covariance * 252;
    
    return { correlation, covariance: annualCovariance };
}

function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) maxRow = k;
    }
    [M[i], M[maxRow]] = [M[maxRow], M[i]];
    if (Math.abs(M[i][i]) < 1e-12) continue;
    for (let k = i + 1; k < n; k++) {
      const factor = M[k][i] / M[i][i];
      for (let j = i; j <= n; j++) M[k][j] -= factor * M[i][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = M[i][n];
    for (let j = i + 1; j < n; j++) sum -= M[i][j] * x[j];
    x[i] = Math.abs(M[i][i]) > 1e-12 ? sum / M[i][i] : 0;
  }
  return x;
}

function projectSimplex(v: number[], minW = 0, maxW = 1): number[] {
  const n = v.length;
  let low = Math.min(...v) - 1.0;
  let high = Math.max(...v) + 1.0;

  for (let iter = 0; iter < 60; iter++) {
    const mid = (low + high) / 2.0;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += Math.max(minW, Math.min(maxW, v[i] - mid));
    }
    if (sum > 1.0) {
      low = mid;
    } else {
      high = mid;
    }
  }
  const mid = (low + high) / 2.0;
  return v.map(x => Math.max(minW, Math.min(maxW, x - mid)));
}

function optimizeGMVExact(
  n: number,
  C: number[][],
  minW = 0,
  maxW = 1,
  initialW?: number[]
): number[] {
  let w = initialW && initialW.length === n ? projectSimplex(initialW, minW, maxW) : projectSimplex(new Array(n).fill(1 / n), minW, maxW);

  const getVar = (weights: number[]) => {
    let v = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        v += weights[i] * weights[j] * C[i][j];
      }
    }
    return v;
  };

  const getGrad = (weights: number[]) => {
    const grad = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        grad[i] += 2 * C[i][j] * weights[j];
      }
    }
    return grad;
  };

  let bestW = [...w];
  let bestVar = getVar(w);
  let lr = 1.0;

  for (let iter = 0; iter < 1500; iter++) {
    const grad = getGrad(w);
    let step = lr;
    let accepted = false;

    for (let back = 0; back < 25; back++) {
      const wNext = projectSimplex(
        w.map((wi, i) => wi - step * grad[i]),
        minW,
        maxW
      );
      const varNext = getVar(wNext);
      if (varNext <= bestVar + 1e-12) {
        w = wNext;
        bestW = [...wNext];
        bestVar = varNext;
        accepted = true;
        break;
      }
      step *= 0.5;
    }

    if (!accepted && step < 1e-8) break;
  }

  return bestW;
}

function optimizeMaxSharpeExact(
  n: number,
  returns: number[],
  C: number[][],
  rf: number,
  minW = 0,
  maxW = 1
): number[] {
  const getSharpe = (weights: number[]) => {
    let r = 0;
    let v = 0;
    for (let i = 0; i < n; i++) {
      r += weights[i] * returns[i];
      for (let j = 0; j < n; j++) {
        v += weights[i] * weights[j] * C[i][j];
      }
    }
    const vol = Math.sqrt(Math.max(1e-10, v));
    return (r - rf) / vol;
  };

  const getSharpeGrad = (weights: number[]) => {
    let r = 0;
    let v = 0;
    for (let i = 0; i < n; i++) {
      r += weights[i] * returns[i];
      for (let j = 0; j < n; j++) {
        v += weights[i] * weights[j] * C[i][j];
      }
    }
    const vol = Math.sqrt(Math.max(1e-10, v));
    const grad = new Array(n).fill(0);
    for (let k = 0; k < n; k++) {
      let cov_w_k = 0;
      for (let j = 0; j < n; j++) {
        cov_w_k += C[k][j] * weights[j];
      }
      const d_vol_dwk = cov_w_k / vol;
      grad[k] = (returns[k] * vol - (r - rf) * d_vol_dwk) / (vol * vol);
    }
    return grad;
  };

  const starts: number[][] = [];
  starts.push(projectSimplex(new Array(n).fill(1 / n), minW, maxW));

  for (let i = 0; i < n; i++) {
    const single = new Array(n).fill(minW);
    single[i] = maxW;
    starts.push(projectSimplex(single, minW, maxW));
  }

  let globalBestW = [...starts[0]];
  let globalBestSharpe = getSharpe(globalBestW);

  for (const startW of starts) {
    let w = [...startW];
    let bestW = [...w];
    let bestSharpe = getSharpe(w);

    for (const lr of [0.5, 0.1, 0.02, 0.005]) {
      for (let iter = 0; iter < 500; iter++) {
        const grad = getSharpeGrad(w);
        const wNext = projectSimplex(
          w.map((wi, i) => wi + lr * grad[i]),
          minW,
          maxW
        );
        const shNext = getSharpe(wNext);
        if (shNext > bestSharpe) {
          bestSharpe = shNext;
          bestW = [...wNext];
          w = wNext;
        } else {
          w = wNext;
        }
      }
    }

    if (bestSharpe > globalBestSharpe) {
      globalBestSharpe = bestSharpe;
      globalBestW = [...bestW];
    }
  }

  return globalBestW;
}

export const runMarkowitz = (
  assets: string[],
  stats: Record<string, ReturnType<typeof calculateStats>>,
  covarianceMatrix: Record<string, Record<string, number>>,
  riskFreeRate: number,
  numPortfolios = 3000,
  minWeight = 0,
  maxWeight = 1
) => {
  const n = assets.length;
  const C = assets.map(a1 => assets.map(a2 => covarianceMatrix[a1][a2]));
  const returns = assets.map(a => stats[a].annualReturn);

  // Exact Analytical GMV: C * z = 1 -> z / sum(z)
  const ones = new Array(n).fill(1);
  const zGmv = solveLinearSystem(C, ones);
  const sumZGmv = zGmv.reduce((a, b) => a + b, 0);
  let exactGmvWeights = zGmv.map(v => (sumZGmv !== 0 ? v / sumZGmv : 1 / n));

  const isGmvValid = sumZGmv > 0 && exactGmvWeights.every(w => w >= minWeight - 1e-5 && w <= maxWeight + 1e-5);
  if (!isGmvValid) {
    exactGmvWeights = optimizeGMVExact(n, C, minWeight, maxWeight, exactGmvWeights.map(w => Math.max(minWeight, Math.min(maxWeight, w))));
  }

  // Exact Tangency / Max Sharpe optimization
  const excessR = returns.map(r => r - riskFreeRate);
  const zSharpe = solveLinearSystem(C, excessR);
  const sumZSharpe = zSharpe.reduce((a, b) => a + b, 0);
  let exactSharpeWeights = zSharpe.map(v => (sumZSharpe !== 0 ? v / sumZSharpe : 1 / n));

  const isSharpeValid = sumZSharpe > 0 && exactSharpeWeights.every(w => w >= minWeight - 1e-5 && w <= maxWeight + 1e-5);
  if (!isSharpeValid) {
    exactSharpeWeights = optimizeMaxSharpeExact(n, returns, C, riskFreeRate, minWeight, maxWeight);
  }

  const calcPortMetrics = (wArr: number[]) => {
    let portRet = 0;
    let portV = 0;
    const wObj: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      wObj[assets[i]] = wArr[i];
      portRet += wArr[i] * returns[i];
      for (let j = 0; j < n; j++) {
        portV += wArr[i] * wArr[j] * C[i][j];
      }
    }
    const portR = Math.sqrt(Math.max(0, portV));
    const sh = portR > 0 ? (portRet - riskFreeRate) / portR : 0;
    return { weights: wObj, return: portRet, risk: portR, sharpe: sh };
  };

  const minRiskPort = calcPortMetrics(exactGmvWeights);
  const maxSharpePort = calcPortMetrics(exactSharpeWeights);

  const portfolios = [];
  portfolios.push(minRiskPort);
  portfolios.push(maxSharpePort);

  // Generate Monte Carlo simulation for visual scatter cloud
  for (let i = 0; i < numPortfolios; i++) {
    let weights = [];
    let valid = false;
    let attempts = 0;

    while (!valid && attempts < 100) {
      attempts++;
      weights = assets.map(() => Math.random());
      const sum = weights.reduce((a, b) => a + b, 0);
      weights = weights.map(w => w / sum);

      let allValid = true;
      for (let w of weights) {
        if (w < minWeight || w > maxWeight) {
          allValid = false;
          break;
        }
      }
      if (allValid) valid = true;
    }

    if (!valid) {
      weights = assets.map(() => 1 / assets.length);
    }

    portfolios.push(calcPortMetrics(weights));
  }

  return { portfolios, minVariancePort: minRiskPort, maxSharpePort };
};

// Exact Equal Risk Contribution (ERC) Cyclical Coordinate Descent Solver (Maillard, Roncalli & Teïletche, 2010)
export const calculateERC = (
  assets: string[],
  stats: Record<string, ReturnType<typeof calculateStats>>,
  covarianceMatrix?: Record<string, Record<string, number>>
) => {
  const n = assets.length;
  if (n === 0) return {};
  if (n === 1) return { [assets[0]]: 1.0 };

  const weights: Record<string, number> = {};

  if (!covarianceMatrix || Object.keys(covarianceMatrix).length === 0) {
    let totalInvVol = 0;
    assets.forEach(a => {
      const vol = stats[a]?.annualStdDev || 0;
      if (vol > 0) totalInvVol += (1 / vol);
    });
    assets.forEach(a => {
      const vol = stats[a]?.annualStdDev || 0;
      weights[a] = vol > 0 && totalInvVol > 0 ? (1 / vol) / totalInvVol : 1 / n;
    });
    return weights;
  }

  // Extract covariance matrix C (n x n)
  const C: number[][] = assets.map(a1 =>
    assets.map(a2 => covarianceMatrix[a1]?.[a2] ?? (a1 === a2 ? Math.pow(stats[a1]?.annualStdDev || 0.1, 2) : 0))
  );

  // Initialize x_i = 1 / sqrt(Sigma_ii)
  const x = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const diag = C[i][i];
    x[i] = diag > 0 ? 1 / Math.sqrt(diag) : 1;
  }

  // Cyclical coordinate descent
  const c = 1.0 / n;
  for (let iter = 0; iter < 100; iter++) {
    let maxDiff = 0;
    for (let i = 0; i < n; i++) {
      const a = C[i][i];
      if (a <= 0) continue;
      let b = 0;
      for (let j = 0; j < n; j++) {
        if (j !== i) {
          b += C[i][j] * x[j];
        }
      }
      const disc = Math.sqrt(b * b + 4 * a * c);
      const xNew = (-b + disc) / (2 * a);
      const diff = Math.abs(xNew - x[i]);
      if (diff > maxDiff) maxDiff = diff;
      x[i] = xNew;
    }
    if (maxDiff < 1e-10) break;
  }

  const sumX = x.reduce((s, val) => s + val, 0);
  for (let i = 0; i < n; i++) {
    weights[assets[i]] = sumX > 0 ? x[i] / sumX : 1 / n;
  }

  return weights;
};

