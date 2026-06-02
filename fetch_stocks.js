#!/usr/bin/env node
/**
 * GitHub Actions 定时爬取热门美股数据，生成静态 JSON 文件。
 * 用法: node fetch_stocks.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const POPULAR_STOCKS = [
  'ARM', 'MRVL', 'NVDA', 'AAPL', 'MSFT', 'GOOGL',
  'AMZN', 'TSLA', 'META', 'TSM', 'AMD', 'INTC',
  'QCOM', 'AVGO', 'AMAT', 'LRCX', 'SNPS', 'CDNS',
  'WDAY', 'NOW', 'CRM', 'ADBE', 'NFLX', 'UBER',
];

// Yahoo Finance v11 API - 获取综合数据
function fetchYahoo(symbol) {
  return new Promise((resolve, reject) => {
    const url = `https://query2.finance.yahoo.com/v11/finance/quoteSummary/${symbol}?modules=summaryDetail,financialData,defaultKeyStatistics,recommendationTrend,price,summaryProfile`;
    const opts = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    };
    https.get(url, opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.quoteSummary && json.quoteSummary.result && json.quoteSummary.result[0]) {
            resolve(json.quoteSummary.result[0]);
          } else {
            reject(new Error('Invalid response'));
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// 获取历史价格（用于计算涨跌幅）
function fetchHistory(symbol) {
  return new Promise((resolve, reject) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5d`;
    const opts = { headers: { 'User-Agent': 'Mozilla/5.0' } };
    https.get(url, opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const result = json.chart && json.chart.result && json.chart.result[0];
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function fetchStock(symbol) {
  try {
    const [info, hist] = await Promise.all([
      fetchYahoo(symbol).catch(() => null),
      fetchHistory(symbol).catch(() => null),
    ]);

    if (!info || !hist) return null;

    const price = info.price || {};
    const fin = info.financialData || {};
    const stats = info.defaultKeyStatistics || {};
    const summary = info.summaryDetail || {};
    const profile = info.summaryProfile || {};
    const rec = info.recommendationTrend || {};

    // 计算涨跌幅
    const closes = hist.indicators?.quote?.[0]?.close?.filter(c => c !== null) || [];
    const currentPrice = closes[closes.length - 1] || price.regularMarketPrice;
    const prevClose = closes[closes.length - 2] || price.regularMarketPreviousClose || currentPrice;
    const changePercent = prevClose ? ((currentPrice - prevClose) / prevClose) * 100 : 0;

    // 分析师评级分布
    let analystCounts = { strongBuy: 0, buy: 0, hold: 0, sell: 0, strongSell: 0 };
    if (rec.trend) {
      for (const t of rec.trend) {
        if (t.strongBuy) analystCounts.strongBuy += t.strongBuy;
        if (t.buy) analystCounts.buy += t.buy;
        if (t.hold) analystCounts.hold += t.hold;
        if (t.sell) analystCounts.sell += t.sell;
        if (t.strongSell) analystCounts.strongSell += t.strongSell;
      }
    }

    const targetMean = fin.targetMeanPrice || summary.targetMeanPrice;
    const targetHigh = fin.targetHighPrice || summary.targetHighPrice;
    const targetLow = fin.targetLowPrice || summary.targetLowPrice;
    const upside = (targetMean && currentPrice) ? ((targetMean - currentPrice) / currentPrice * 100) : null;

    return {
      symbol,
      name: price.longName || price.shortName || symbol,
      currency: price.currency || 'USD',
      exchange: price.exchangeName || '',
      currentPrice: Math.round(currentPrice * 100) / 100,
      previousClose: Math.round(prevClose * 100) / 100,
      changePercent: Math.round(changePercent * 100) / 100,
      marketCap: price.marketCap || summary.marketCap,
      pe: summary.trailingPE,
      forwardPe: summary.forwardPE,
      peg: summary.pegRatio,
      pb: summary.priceToBook,
      ps: summary.priceToSalesTrailing12Months,
      revenueGrowth: fin.revenueGrowth,
      earningsGrowth: fin.earningsGrowth,
      profitMargin: fin.profitMargins,
      operatingMargin: fin.operatingMargins,
      roe: fin.returnOnEquity,
      debtToEquity: fin.debtToEquity,
      currentRatio: fin.currentRatio,
      freeCashFlow: fin.freeCashflow,
      operatingCashFlow: fin.operatingCashflow,
      week52High: summary.fiftyTwoWeekHigh,
      week52Low: summary.fiftyTwoWeekLow,
      recommendation: price.recommendationKey || '',
      analystCounts,
      targetMean,
      targetHigh,
      targetLow,
      upside: upside ? Math.round(upside * 100) / 100 : null,
      volume: price.regularMarketVolume,
      beta: summary.beta,
      industry: profile.industry || '',
      sector: profile.sector || '',
      fetchTime: new Date().toISOString(),
    };
  } catch (e) {
    console.error(`  ✗ ${symbol}: ${e.message}`);
    return null;
  }
}

async function main() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const now = new Date();
  console.log(`爬取 ${POPULAR_STOCKS.length} 只股票... ${now.toISOString()}\n`);

  let ok = 0;
  for (let i = 0; i < POPULAR_STOCKS.length; i++) {
    const sym = POPULAR_STOCKS[i];
    process.stdout.write(`[${i + 1}/${POPULAR_STOCKS.length}] ${sym}... `);
    const d = await fetchStock(sym);
    if (d) {
      const fpath = path.join(DATA_DIR, `${sym}.json`);
      fs.writeFileSync(fpath, JSON.stringify(d, null, 2));
      console.log(`✓ $${d.currentPrice} (${d.changePercent >= 0 ? '+' : ''}${d.changePercent}%)`);
      ok++;
    } else {
      console.log('✗ 失败');
    }
    // 限流：每次请求间隔 500ms
    if (i < POPULAR_STOCKS.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // 写索引
  const idx = {
    updateTime: new Date().toISOString(),
    stocks: POPULAR_STOCKS,
    successCount: ok,
    dataBaseUrl: 'data/',
  };
  fs.writeFileSync(path.join(DATA_DIR, 'index.json'), JSON.stringify(idx, null, 2));

  console.log(`\n完成！成功 ${ok}/${POPULAR_STOCKS.length} 只`);
}

main().catch(console.error);
