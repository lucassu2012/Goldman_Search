"""
Goldman Sachs Style Stock Screener - Screening Engine
======================================================
Filters, ranks, and selects stocks based on investor profile.
"""

import logging
from typing import Optional

from src.config import (
    InvestorProfile,
    RiskTolerance,
    get_screening_params,
    get_stock_universe,
    STOCK_UNIVERSE,
)
from src.data_fetcher import DataFetcher
from src.analyzer import StockAnalyzer, StockAnalysis

logger = logging.getLogger(__name__)


class StockScreener:
    """Core screening engine that combines data fetching, analysis, and filtering."""

    def __init__(self, profile: Optional[InvestorProfile] = None):
        self.profile = profile or InvestorProfile()
        self.params = get_screening_params(self.profile)
        self.fetcher = DataFetcher()
        self.analyzer = StockAnalyzer()
        self.results: list[StockAnalysis] = []
        self.filtered_results: list[StockAnalysis] = []

    def run(self, max_results: int = 15, progress_callback=None) -> list[StockAnalysis]:
        """Execute the full screening pipeline."""
        # Step 1: Determine stock universe based on preferred sectors
        sectors = self.params.get("preferred_sectors", list(STOCK_UNIVERSE.keys()))
        tickers = get_stock_universe(sectors)
        total = len(tickers)

        if progress_callback:
            progress_callback(f"正在扫描 {total} 只股票（覆盖 {len(sectors)} 个行业）...")

        # Step 2: Batch fetch data
        if progress_callback:
            progress_callback("正在从市场获取实时数据...")

        raw_data = self.fetcher.batch_fetch(tickers, max_workers=10)

        if progress_callback:
            progress_callback(f"成功获取 {len(raw_data)}/{total} 只股票数据，正在分析...")

        # Step 3: Analyze each stock
        all_analyses = []
        for i, (ticker, data) in enumerate(raw_data.items()):
            stock_data = data.get("stock_data")
            financials = data.get("financials")
            if stock_data:
                analysis = self.analyzer.analyze(stock_data, financials)
                if analysis:
                    all_analyses.append(analysis)

            if progress_callback and (i + 1) % 20 == 0:
                progress_callback(f"已分析 {i + 1}/{len(raw_data)} 只股票...")

        self.results = all_analyses

        if progress_callback:
            progress_callback(f"完成 {len(all_analyses)} 只股票分析，正在筛选...")

        # Step 4: Apply filters
        self.filtered_results = self._apply_filters(all_analyses)

        if progress_callback:
            progress_callback(f"筛选后剩余 {len(self.filtered_results)} 只股票，正在排序...")

        # Step 5: Rank and select top results
        self.filtered_results.sort(key=lambda x: x.composite_score or 0, reverse=True)

        top_results = self.filtered_results[:max_results]

        if progress_callback:
            progress_callback(f"筛选完成！最终推荐 {len(top_results)} 只股票")

        return top_results

    def _apply_filters(self, analyses: list[StockAnalysis]) -> list[StockAnalysis]:
        """Apply investor profile-based filters."""
        filtered = []

        max_pe = self.params.get("max_pe_ratio", 100)
        min_pe = self.params.get("min_pe_ratio", 0)
        max_de = self.params.get("max_debt_equity", 5.0)
        min_div = self.params.get("min_dividend_yield", 0)
        max_beta = self.params.get("max_beta", 3.0)
        min_mcap = self.params.get("min_market_cap_billions", 0)

        for a in analyses:
            # Market cap filter
            if a.market_cap_billions and a.market_cap_billions < min_mcap:
                continue

            # P/E filter (allow None through for stocks without earnings)
            if a.pe_ratio is not None:
                if a.pe_ratio < min_pe or a.pe_ratio > max_pe:
                    continue
                if a.pe_ratio < 0:
                    continue  # Skip negative earnings

            # Debt/Equity filter
            if a.debt_to_equity is not None and a.debt_to_equity > max_de:
                continue

            # Beta filter
            if a.beta is not None and a.beta > max_beta:
                continue

            # Dividend filter
            if min_div > 0:
                if a.dividend_yield is None or a.dividend_yield < min_div:
                    continue

            # Require dividend if profile specifies
            if self.profile.require_dividend:
                if not a.dividend_yield or a.dividend_yield <= 0:
                    continue

            # Must have positive composite score
            if a.composite_score is not None and a.composite_score < 30:
                continue

            filtered.append(a)

        return filtered

    def get_risk_summary(self) -> dict:
        """Get risk distribution summary of filtered results."""
        if not self.filtered_results:
            return {}

        risk_dist = {"低风险": 0, "中等风险": 0, "中高风险": 0, "高风险": 0}
        for a in self.filtered_results:
            if a.risk_rating:
                risk_dist[a.risk_rating] = risk_dist.get(a.risk_rating, 0) + 1

        return risk_dist

    def get_sector_allocation(self) -> dict:
        """Get sector allocation of filtered results."""
        if not self.filtered_results:
            return {}

        sectors = {}
        for a in self.filtered_results:
            sec = a.sector or "Unknown"
            sectors[sec] = sectors.get(sec, 0) + 1
        return dict(sorted(sectors.items(), key=lambda x: x[1], reverse=True))
