/**
 * Goldman Sachs Stock Screener - Live Data Fetcher
 * Fetches real-time stock data from FinnHub API.
 * Falls back to embedded sample data when API is unavailable.
 */
const LiveData = (function () {
    "use strict";

    const FINNHUB_BASE = "https://finnhub.io/api/v1";
    const CACHE_KEY_PREFIX = "gs_stock_";
    const CACHE_META_KEY = "gs_cache_meta";
    const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
    const RATE_LIMIT_MS = 1100; // ~55 calls/min (finnhub free = 60/min)

    let _apiKey = localStorage.getItem("gs_finnhub_key") || "";
    let _queue = [];
    let _processing = false;
    let _lastCallTime = 0;
    let _onProgress = null;
    let _fetchedCount = 0;
    let _totalCount = 0;

    // ─── API Key Management ──────────────────────────────────
    function setApiKey(key) {
        _apiKey = (key || "").trim();
        if (_apiKey) localStorage.setItem("gs_finnhub_key", _apiKey);
        else localStorage.removeItem("gs_finnhub_key");
    }

    function getApiKey() { return _apiKey; }
    function hasApiKey() { return _apiKey.length > 0; }

    // ─── Cache Management ────────────────────────────────────
    function getCached(ticker) {
        try {
            const raw = localStorage.getItem(CACHE_KEY_PREFIX + ticker);
            if (!raw) return null;
            const entry = JSON.parse(raw);
            if (Date.now() - entry.timestamp > CACHE_TTL_MS) return null;
            return entry.data;
        } catch { return null; }
    }

    function setCache(ticker, data) {
        try {
            localStorage.setItem(CACHE_KEY_PREFIX + ticker, JSON.stringify({
                data, timestamp: Date.now()
            }));
            // Update meta
            const meta = getCacheMeta();
            meta.lastUpdate = Date.now();
            meta.tickers = meta.tickers || {};
            meta.tickers[ticker] = Date.now();
            localStorage.setItem(CACHE_META_KEY, JSON.stringify(meta));
        } catch (e) {
            // localStorage full — clear old entries
            clearOldCache();
        }
    }

    function getCacheMeta() {
        try {
            return JSON.parse(localStorage.getItem(CACHE_META_KEY)) || {};
        } catch { return {}; }
    }

    function clearOldCache() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(CACHE_KEY_PREFIX)) keys.push(k);
        }
        // Remove oldest half
        keys.sort();
        keys.slice(0, Math.ceil(keys.length / 2)).forEach(k => localStorage.removeItem(k));
    }

    function clearAllCache() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(CACHE_KEY_PREFIX)) keys.push(k);
        }
        keys.forEach(k => localStorage.removeItem(k));
        localStorage.removeItem(CACHE_META_KEY);
    }

    function getLastUpdateTime() {
        const meta = getCacheMeta();
        return meta.lastUpdate || null;
    }

    // ─── FinnHub API Calls ───────────────────────────────────
    async function _rateLimitedFetch(url) {
        const now = Date.now();
        const wait = Math.max(0, RATE_LIMIT_MS - (now - _lastCallTime));
        if (wait > 0) await new Promise(r => setTimeout(r, wait));
        _lastCallTime = Date.now();

        const resp = await fetch(url);
        if (resp.status === 429) {
            // Rate limited — wait and retry once
            await new Promise(r => setTimeout(r, 3000));
            return fetch(url);
        }
        return resp;
    }

    async function fetchQuote(ticker) {
        const url = `${FINNHUB_BASE}/quote?symbol=${ticker}&token=${_apiKey}`;
        const resp = await _rateLimitedFetch(url);
        if (!resp.ok) return null;
        const d = await resp.json();
        if (!d || d.c === 0) return null; // No data
        return {
            current_price: d.c,
            day_high: d.h,
            day_low: d.l,
            day_open: d.o,
            previous_close: d.pc,
            change: d.d,
            change_pct: d.dp,
        };
    }

    async function fetchProfile(ticker) {
        const url = `${FINNHUB_BASE}/stock/profile2?symbol=${ticker}&token=${_apiKey}`;
        const resp = await _rateLimitedFetch(url);
        if (!resp.ok) return null;
        const d = await resp.json();
        if (!d || !d.name) return null;
        return {
            name: d.name,
            sector: d.finnhubIndustry || "Unknown",
            industry: d.finnhubIndustry || "Unknown",
            market_cap_billions: d.marketCapitalization ? d.marketCapitalization / 1000 : null,
            shares_outstanding: d.shareOutstanding ? d.shareOutstanding * 1e6 : null,
        };
    }

    async function fetchMetrics(ticker) {
        const url = `${FINNHUB_BASE}/stock/metric?symbol=${ticker}&metric=all&token=${_apiKey}`;
        const resp = await _rateLimitedFetch(url);
        if (!resp.ok) return null;
        const d = await resp.json();
        if (!d || !d.metric) return null;
        const m = d.metric;
        return {
            pe_ratio: m.peBasicExclExtraTTM || m.peTTM || null,
            forward_pe: m.peBasicExclExtraAnnual || null,
            profit_margin: m.netProfitMarginTTM ? m.netProfitMarginTTM / 100 : null,
            operating_margin: m.operatingMarginTTM ? m.operatingMarginTTM / 100 : null,
            gross_margin: m.grossMarginTTM ? m.grossMarginTTM / 100 : null,
            roe: m.roeTTM ? m.roeTTM / 100 : null,
            roa: m.roaTTM ? m.roaTTM / 100 : null,
            revenue_growth: m.revenueGrowthTTMYoy ? m.revenueGrowthTTMYoy / 100 : null,
            earnings_growth: m.epsGrowthTTMYoy ? m.epsGrowthTTMYoy / 100 : null,
            dividend_yield: m.dividendYieldIndicatedAnnual ? m.dividendYieldIndicatedAnnual / 100 : null,
            payout_ratio: m.payoutRatioTTM ? m.payoutRatioTTM / 100 : null,
            debt_to_equity: m.totalDebtToEquityQuarterly || m.totalDebtToEquityAnnual || null,
            current_ratio: m.currentRatioQuarterly || m.currentRatioAnnual || null,
            beta: m.beta || null,
            "52_week_high": m["52WeekHigh"] || null,
            "52_week_low": m["52WeekLow"] || null,
            "50_day_avg": m["50DayMovingAverage"] || null,
            "200_day_avg": m["200DayMovingAverage"] || null,
        };
    }

    async function fetchTargets(ticker) {
        const url = `${FINNHUB_BASE}/stock/price-target?symbol=${ticker}&token=${_apiKey}`;
        const resp = await _rateLimitedFetch(url);
        if (!resp.ok) return null;
        const d = await resp.json();
        if (!d || !d.targetHigh) return null;
        return {
            target_high_price: d.targetHigh,
            target_low_price: d.targetLow,
            target_mean_price: d.targetMean,
            target_median_price: d.targetMedian,
        };
    }

    // ─── Composite Fetch ─────────────────────────────────────
    async function fetchStockData(ticker) {
        try {
            // Fetch all data sources in sequence (rate-limited)
            const quote = await fetchQuote(ticker);
            if (!quote) return null;

            const [profile, metrics, targets] = await Promise.all([
                fetchProfile(ticker).catch(() => null),
                fetchMetrics(ticker).catch(() => null),
                fetchTargets(ticker).catch(() => null),
            ]);

            // Merge with sample data as base (for any missing fields)
            const sample = SAMPLE_STOCKS[ticker] || {};
            const merged = {
                ...sample,
                ticker,
                current_price: quote.current_price,
                change_pct: quote.change_pct,
            };

            if (profile) {
                if (profile.name) merged.name = profile.name;
                if (profile.sector) merged.sector = profile.sector;
                if (profile.industry) merged.industry = profile.industry;
                if (profile.market_cap_billions) merged.market_cap_billions = profile.market_cap_billions;
            }

            if (metrics) {
                const metricFields = [
                    "pe_ratio", "forward_pe", "profit_margin", "operating_margin",
                    "gross_margin", "roe", "roa", "revenue_growth", "earnings_growth",
                    "dividend_yield", "payout_ratio", "debt_to_equity", "current_ratio",
                    "beta", "52_week_high", "52_week_low", "50_day_avg", "200_day_avg"
                ];
                metricFields.forEach(f => { if (metrics[f] != null) merged[f] = metrics[f]; });
            }

            if (targets) {
                if (targets.target_high_price) merged.target_high_price = targets.target_high_price;
                if (targets.target_low_price) merged.target_low_price = targets.target_low_price;
                if (targets.target_mean_price) merged.target_mean_price = targets.target_mean_price;
            }

            merged._live = true;
            merged._fetchedAt = Date.now();
            return merged;

        } catch (e) {
            console.warn(`Live fetch failed for ${ticker}:`, e);
            return null;
        }
    }

    // ─── Batch Fetch with Progress ───────────────────────────
    async function fetchAllStocks(tickers, onProgress) {
        _onProgress = onProgress;
        _fetchedCount = 0;
        _totalCount = tickers.length;
        const results = {};

        for (const ticker of tickers) {
            // Check cache first
            const cached = getCached(ticker);
            if (cached) {
                results[ticker] = cached;
                _fetchedCount++;
                if (_onProgress) _onProgress(_fetchedCount, _totalCount, ticker, "cached");
                continue;
            }

            // Fetch live
            const data = await fetchStockData(ticker);
            if (data) {
                results[ticker] = data;
                setCache(ticker, data);
                _fetchedCount++;
                if (_onProgress) _onProgress(_fetchedCount, _totalCount, ticker, "live");
            } else {
                // Fallback to sample
                if (SAMPLE_STOCKS[ticker]) {
                    results[ticker] = { ...SAMPLE_STOCKS[ticker], _live: false };
                    _fetchedCount++;
                    if (_onProgress) _onProgress(_fetchedCount, _totalCount, ticker, "sample");
                }
            }
        }

        return results;
    }

    // ─── Validate API Key ────────────────────────────────────
    async function validateKey(key) {
        try {
            const resp = await fetch(`${FINNHUB_BASE}/quote?symbol=AAPL&token=${key}`);
            if (!resp.ok) return false;
            const d = await resp.json();
            return d && d.c > 0;
        } catch { return false; }
    }

    // ─── Public API ──────────────────────────────────────────
    return {
        setApiKey,
        getApiKey,
        hasApiKey,
        validateKey,
        fetchStockData,
        fetchAllStocks,
        getCached,
        clearAllCache,
        getLastUpdateTime,
        getCacheMeta,
    };
})();
