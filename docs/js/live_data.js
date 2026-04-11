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

    const _apiKey = "d7cgfmpr01qv03es99m0d7cgfmpr01qv03es99mg";
    let _lastCallTime = 0;
    let _onProgress = null;
    let _fetchedCount = 0;
    let _totalCount = 0;

    function hasApiKey() { return true; }

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
            const meta = getCacheMeta();
            meta.lastUpdate = Date.now();
            meta.tickers = meta.tickers || {};
            meta.tickers[ticker] = Date.now();
            localStorage.setItem(CACHE_META_KEY, JSON.stringify(meta));
        } catch (e) {
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
        if (!d || d.c === 0) return null;
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
            // Valuation
            pe_ratio: m.peBasicExclExtraTTM || m.peTTM || null,
            forward_pe: m.peBasicExclExtraAnnual || null,
            pb_ratio: m.pbQuarterly || m.pbAnnual || null,
            ps_ratio: m.psTTM || m.psAnnual || null,
            pfcf_ratio: m.pfcfShareTTM || null,
            ev_ebitda: m.enterpriseValueOverEBITDATTM || m.evToEbitdaAnnual || null,
            // Margins
            profit_margin: m.netProfitMarginTTM ? m.netProfitMarginTTM / 100 : null,
            operating_margin: m.operatingMarginTTM ? m.operatingMarginTTM / 100 : null,
            gross_margin: m.grossMarginTTM ? m.grossMarginTTM / 100 : null,
            // Returns
            roe: m.roeTTM ? m.roeTTM / 100 : null,
            roa: m.roaTTM ? m.roaTTM / 100 : null,
            roic: m.roicTTM ? m.roicTTM / 100 : null,
            // Growth
            revenue_growth: m.revenueGrowthTTMYoy ? m.revenueGrowthTTMYoy / 100 : null,
            earnings_growth: m.epsGrowthTTMYoy ? m.epsGrowthTTMYoy / 100 : null,
            revenue_growth_3y: m.revenueGrowth3Y ? m.revenueGrowth3Y / 100 : null,
            revenue_growth_5y: m.revenueGrowth5Y ? m.revenueGrowth5Y / 100 : null,
            eps_growth_3y: m.epsGrowth3Y ? m.epsGrowth3Y / 100 : null,
            eps_growth_5y: m.epsGrowth5Y ? m.epsGrowth5Y / 100 : null,
            // Dividend
            dividend_yield: m.dividendYieldIndicatedAnnual ? m.dividendYieldIndicatedAnnual / 100 : null,
            payout_ratio: m.payoutRatioTTM ? m.payoutRatioTTM / 100 : null,
            dividend_growth_5y: m.dividendGrowthRate5Y ? m.dividendGrowthRate5Y / 100 : null,
            // Financial health
            debt_to_equity: m.totalDebtToEquityQuarterly || m.totalDebtToEquityAnnual || null,
            current_ratio: m.currentRatioQuarterly || m.currentRatioAnnual || null,
            quick_ratio: m.quickRatioQuarterly || m.quickRatioAnnual || null,
            interest_coverage: m.interestCoverageTTM || null,
            // Cash flow
            fcf_margin: m.freeCashFlowMarginTTM ? m.freeCashFlowMarginTTM / 100 : null,
            fcf_per_share: m.freeCashFlowPerShareTTM || null,
            fcf_cagr_5y: m.focfCagr5Y ? m.focfCagr5Y / 100 : null,
            cash_per_share: m.cashPerSharePerShareQuarterly || m.cashPerSharePerShareAnnual || null,
            // Per share
            revenue_per_share: m.revenuePerShareTTM || m.revenuePerShareAnnual || null,
            book_value_per_share: m.bookValuePerShareQuarterly || m.bookValuePerShareAnnual || null,
            eps_ttm: m.epsTTM || m.epsAnnual || null,
            // Volatility & technicals
            beta: m.beta || null,
            "52_week_high": m["52WeekHigh"] || null,
            "52_week_low": m["52WeekLow"] || null,
            "50_day_avg": m["50DayMovingAverage"] || null,
            "200_day_avg": m["200DayMovingAverage"] || null,
            avg_vol_10d: m["10DayAverageTradingVolume"] || null,
            avg_vol_3m: m["3MonthAverageTradingVolume"] || null,
            // Debt growth
            debt_cagr_5y: m.totalDebtCagr5Y ? m.totalDebtCagr5Y / 100 : null,
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

    async function fetchRecommendations(ticker) {
        const url = `${FINNHUB_BASE}/stock/recommendation?symbol=${ticker}&token=${_apiKey}`;
        const resp = await _rateLimitedFetch(url);
        if (!resp.ok) return null;
        const d = await resp.json();
        if (!d || !d.length) return null;
        const latest = d[0];
        return {
            analyst_buy: latest.buy || 0,
            analyst_hold: latest.hold || 0,
            analyst_sell: latest.sell || 0,
            analyst_strong_buy: latest.strongBuy || 0,
            analyst_strong_sell: latest.strongSell || 0,
            analyst_period: latest.period,
        };
    }

    // ─── Composite Fetch ─────────────────────────────────────
    async function fetchStockData(ticker) {
        try {
            const quote = await fetchQuote(ticker);
            if (!quote) return null;

            const [profile, metrics, targets, recs] = await Promise.all([
                fetchProfile(ticker).catch(() => null),
                fetchMetrics(ticker).catch(() => null),
                fetchTargets(ticker).catch(() => null),
                fetchRecommendations(ticker).catch(() => null),
            ]);

            const sample = SAMPLE_STOCKS[ticker] || {};
            const merged = {
                ...sample,
                ticker,
                current_price: quote.current_price,
                day_high: quote.day_high,
                day_low: quote.day_low,
                day_open: quote.day_open,
                previous_close: quote.previous_close,
                change: quote.change,
                change_pct: quote.change_pct,
            };

            if (profile) {
                if (profile.name) merged.name = profile.name;
                if (profile.sector) merged.sector = profile.sector;
                if (profile.industry) merged.industry = profile.industry;
                if (profile.market_cap_billions) merged.market_cap_billions = profile.market_cap_billions;
                if (profile.shares_outstanding) merged.shares_outstanding = profile.shares_outstanding;
            }

            if (metrics) {
                const metricFields = [
                    "pe_ratio", "forward_pe", "pb_ratio", "ps_ratio", "pfcf_ratio", "ev_ebitda",
                    "profit_margin", "operating_margin", "gross_margin",
                    "roe", "roa", "roic",
                    "revenue_growth", "earnings_growth",
                    "revenue_growth_3y", "revenue_growth_5y", "eps_growth_3y", "eps_growth_5y",
                    "dividend_yield", "payout_ratio", "dividend_growth_5y",
                    "debt_to_equity", "current_ratio", "quick_ratio", "interest_coverage",
                    "fcf_margin", "fcf_per_share", "fcf_cagr_5y", "cash_per_share",
                    "revenue_per_share", "book_value_per_share", "eps_ttm",
                    "beta", "52_week_high", "52_week_low", "50_day_avg", "200_day_avg",
                    "avg_vol_10d", "avg_vol_3m", "debt_cagr_5y"
                ];
                metricFields.forEach(f => { if (metrics[f] != null) merged[f] = metrics[f]; });
            }

            if (targets) {
                if (targets.target_high_price) merged.target_high_price = targets.target_high_price;
                if (targets.target_low_price) merged.target_low_price = targets.target_low_price;
                if (targets.target_mean_price) merged.target_mean_price = targets.target_mean_price;
                if (targets.target_median_price) merged.target_median_price = targets.target_median_price;
            }

            if (recs) {
                merged.analyst_buy = recs.analyst_buy;
                merged.analyst_hold = recs.analyst_hold;
                merged.analyst_sell = recs.analyst_sell;
                merged.analyst_strong_buy = recs.analyst_strong_buy;
                merged.analyst_strong_sell = recs.analyst_strong_sell;
                merged.analyst_period = recs.analyst_period;
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
            const cached = getCached(ticker);
            if (cached) {
                results[ticker] = cached;
                _fetchedCount++;
                if (_onProgress) _onProgress(_fetchedCount, _totalCount, ticker, "cached");
                continue;
            }

            const data = await fetchStockData(ticker);
            if (data) {
                results[ticker] = data;
                setCache(ticker, data);
                _fetchedCount++;
                if (_onProgress) _onProgress(_fetchedCount, _totalCount, ticker, "live");
            } else {
                if (SAMPLE_STOCKS[ticker]) {
                    results[ticker] = { ...SAMPLE_STOCKS[ticker], _live: false };
                    _fetchedCount++;
                    if (_onProgress) _onProgress(_fetchedCount, _totalCount, ticker, "sample");
                }
            }
        }

        return results;
    }

    return {
        hasApiKey,
        fetchStockData,
        fetchAllStocks,
        getCached,
        clearAllCache,
        getLastUpdateTime,
        getCacheMeta,
    };
})();
