"""
Goldman Sachs Style Stock Screener - Data Fetcher Module
========================================================
Fetches real-time and historical stock data via yfinance.
Automatically falls back to built-in sample data when network is unavailable.
"""

import time
import logging
from typing import Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

logger = logging.getLogger(__name__)

# Try importing yfinance; mark unavailable if missing
try:
    import yfinance as yf
    _YF_AVAILABLE = True
except ImportError:
    _YF_AVAILABLE = False
    logger.warning("yfinance not installed, using sample data only")

from src.sample_data import get_all_sample_stocks, get_sample_financials, SAMPLE_MARKET_INDICES


class DataFetcher:
    """Fetches and caches stock market data. Auto-fallback to sample data on network failure."""

    def __init__(self, cache_ttl_seconds: int = 300):
        self._cache = {}
        self._cache_ttl = cache_ttl_seconds
        self._cache_timestamps = {}
        self._network_failed = False  # Track network status
        self._sample_stocks = None    # Lazy-loaded sample data

    def _is_cache_valid(self, key: str) -> bool:
        if key not in self._cache_timestamps:
            return False
        return (time.time() - self._cache_timestamps[key]) < self._cache_ttl

    def _set_cache(self, key: str, value):
        self._cache[key] = value
        self._cache_timestamps[key] = time.time()

    def _get_sample_stocks(self) -> dict:
        """Lazy-load sample stock data."""
        if self._sample_stocks is None:
            self._sample_stocks = get_all_sample_stocks()
        return self._sample_stocks

    def _try_yfinance(self, ticker: str) -> Optional[dict]:
        """Attempt to fetch data from Yahoo Finance."""
        if not _YF_AVAILABLE or self._network_failed:
            return None
        try:
            stock = yf.Ticker(ticker)
            info = stock.info
            if not info or (info.get("regularMarketPrice") is None
                           and info.get("currentPrice") is None
                           and info.get("previousClose") is None):
                return None

            return {
                "ticker": ticker,
                "name": info.get("shortName", info.get("longName", ticker)),
                "sector": info.get("sector", "Unknown"),
                "industry": info.get("industry", "Unknown"),
                "current_price": info.get("currentPrice") or info.get("regularMarketPrice") or info.get("previousClose", 0),
                "market_cap": info.get("marketCap", 0),
                "market_cap_billions": (info.get("marketCap", 0) or 0) / 1e9,
                "pe_ratio": info.get("trailingPE"), "forward_pe": info.get("forwardPE"),
                "peg_ratio": info.get("pegRatio"), "price_to_book": info.get("priceToBook"),
                "price_to_sales": info.get("priceToSalesTrailing12Months"),
                "ev_to_ebitda": info.get("enterpriseToEbitda"),
                "profit_margin": info.get("profitMargins"), "operating_margin": info.get("operatingMargins"),
                "gross_margin": info.get("grossMargins"), "roe": info.get("returnOnEquity"),
                "roa": info.get("returnOnAssets"),
                "revenue_growth": info.get("revenueGrowth"), "earnings_growth": info.get("earningsGrowth"),
                "revenue_per_share": info.get("revenuePerShare"),
                "dividend_yield": info.get("dividendYield"), "dividend_rate": info.get("dividendRate"),
                "payout_ratio": info.get("payoutRatio"), "ex_dividend_date": info.get("exDividendDate"),
                "five_year_avg_dividend_yield": info.get("fiveYearAvgDividendYield"),
                "total_debt": info.get("totalDebt"), "total_cash": info.get("totalCash"),
                "debt_to_equity": info.get("debtToEquity"), "current_ratio": info.get("currentRatio"),
                "quick_ratio": info.get("quickRatio"),
                "beta": info.get("beta"),
                "52_week_high": info.get("fiftyTwoWeekHigh"), "52_week_low": info.get("fiftyTwoWeekLow"),
                "50_day_avg": info.get("fiftyDayAverage"), "200_day_avg": info.get("twoHundredDayAverage"),
                "target_high_price": info.get("targetHighPrice"), "target_low_price": info.get("targetLowPrice"),
                "target_mean_price": info.get("targetMeanPrice"), "target_median_price": info.get("targetMedianPrice"),
                "recommendation_key": info.get("recommendationKey"),
                "number_of_analyst_opinions": info.get("numberOfAnalystOpinions"),
                "shares_outstanding": info.get("sharesOutstanding"), "float_shares": info.get("floatShares"),
                "held_percent_insiders": info.get("heldPercentInsiders"),
                "held_percent_institutions": info.get("heldPercentInstitutions"),
                "short_ratio": info.get("shortRatio"),
                "free_cashflow": info.get("freeCashflow"), "operating_cashflow": info.get("operatingCashflow"),
                "trailing_eps": info.get("trailingEps"), "forward_eps": info.get("forwardEps"),
            }
        except Exception as e:
            err_str = str(e).lower()
            if any(kw in err_str for kw in ["403", "timeout", "connect", "curl", "network", "proxy"]):
                logger.info(f"Network unavailable ('{e}'). Switching to sample data mode.")
                self._network_failed = True
            else:
                logger.error(f"Error fetching data for {ticker}: {e}")
            return None

    def fetch_stock_data(self, ticker: str) -> Optional[dict]:
        """Fetch stock data: try live API first, fallback to sample data."""
        cache_key = f"stock_{ticker}"
        if self._is_cache_valid(cache_key):
            return self._cache[cache_key]

        # Try live data first
        data = self._try_yfinance(ticker)
        if data:
            self._set_cache(cache_key, data)
            return data

        # Fallback to sample data
        sample = self._get_sample_stocks().get(ticker)
        if sample:
            self._set_cache(cache_key, sample)
            return sample

        return None

    def fetch_historical_financials(self, ticker: str) -> Optional[dict]:
        """Fetch 5-year historical financials: try live API, fallback to sample."""
        cache_key = f"financials_{ticker}"
        if self._is_cache_valid(cache_key):
            return self._cache[cache_key]

        # Try live data first (only if network works)
        if _YF_AVAILABLE and not self._network_failed:
            try:
                stock = yf.Ticker(ticker)
                income_stmt = stock.income_stmt
                balance_sheet = stock.balance_sheet
                result = {
                    "ticker": ticker, "annual_revenue": [], "annual_net_income": [],
                    "annual_total_debt": [], "annual_total_equity": [], "years": [],
                }
                if income_stmt is not None and not income_stmt.empty:
                    for col in income_stmt.columns[:5]:
                        year = col.year if hasattr(col, 'year') else str(col)[:4]
                        result["years"].append(str(year))
                        result["annual_revenue"].append(
                            income_stmt.loc["Total Revenue", col] if "Total Revenue" in income_stmt.index else None
                        )
                        result["annual_net_income"].append(
                            income_stmt.loc["Net Income", col] if "Net Income" in income_stmt.index else None
                        )
                if balance_sheet is not None and not balance_sheet.empty:
                    for col in balance_sheet.columns[:5]:
                        total_debt = None
                        for k in ["Total Debt", "Long Term Debt", "Total Non Current Liabilities Net Minority Interest"]:
                            if k in balance_sheet.index:
                                total_debt = balance_sheet.loc[k, col]; break
                        total_equity = None
                        for k in ["Total Equity Gross Minority Interest", "Stockholders Equity", "Common Stock Equity"]:
                            if k in balance_sheet.index:
                                total_equity = balance_sheet.loc[k, col]; break
                        result["annual_total_debt"].append(total_debt)
                        result["annual_total_equity"].append(total_equity)
                if result["years"]:
                    self._set_cache(cache_key, result)
                    return result
            except Exception:
                self._network_failed = True

        # Fallback to sample financials
        sample = get_sample_financials(ticker)
        if sample:
            self._set_cache(cache_key, sample)
            return sample
        return None

    def batch_fetch(self, tickers: list, max_workers: int = 8) -> dict:
        """Fetch data for multiple tickers. Auto-fallback on network failure."""
        results = {}

        # Quick check: test network with first ticker
        if _YF_AVAILABLE and not self._network_failed and tickers:
            test_data = self._try_yfinance(tickers[0])
            if test_data:
                results[tickers[0]] = {
                    "stock_data": test_data,
                    "financials": self.fetch_historical_financials(tickers[0]),
                }
            # If first fetch failed, _network_failed is now True

        if self._network_failed or not _YF_AVAILABLE:
            # Use sample data directly (fast, no network needed)
            logger.info("Using offline sample data mode")
            sample_stocks = self._get_sample_stocks()
            for t in tickers:
                if t in sample_stocks:
                    results[t] = {
                        "stock_data": sample_stocks[t],
                        "financials": get_sample_financials(t),
                    }
            return results

        # Network works - fetch remaining tickers concurrently
        remaining = [t for t in tickers if t not in results]

        def _fetch_one(ticker):
            sd = self.fetch_stock_data(ticker)
            fin = self.fetch_historical_financials(ticker)
            return ticker, sd, fin

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {executor.submit(_fetch_one, t): t for t in remaining}
            for future in as_completed(futures):
                ticker = futures[future]
                try:
                    t, stock_data, financials = future.result()
                    if stock_data:
                        results[t] = {"stock_data": stock_data, "financials": financials}
                except Exception as e:
                    logger.error(f"Batch fetch error for {ticker}: {e}")

        return results

    def fetch_market_indices(self) -> dict:
        """Fetch market indices. Fallback to sample data if network unavailable."""
        if self._network_failed or not _YF_AVAILABLE:
            return SAMPLE_MARKET_INDICES

        indices = {"^GSPC": "S&P 500", "^DJI": "Dow Jones", "^IXIC": "NASDAQ", "^VIX": "VIX"}
        result = {}
        for symbol, name in indices.items():
            try:
                idx = yf.Ticker(symbol)
                info = idx.info
                result[name] = {
                    "price": info.get("regularMarketPrice") or info.get("previousClose", 0),
                    "change_pct": info.get("regularMarketChangePercent", 0),
                }
            except Exception:
                self._network_failed = True
                return SAMPLE_MARKET_INDICES
        return result if result else SAMPLE_MARKET_INDICES
