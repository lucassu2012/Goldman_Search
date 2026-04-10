"""
Goldman Sachs Style Stock Screener - Analyzer Module
=====================================================
Core analytical engine: P/E comparison, revenue growth, D/E health,
dividend sustainability, moat rating, price targets, and risk scoring.
"""

import logging
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

from src.config import INDUSTRY_AVG_PE, MOAT_WEIGHTS, get_sector_for_ticker

logger = logging.getLogger(__name__)


@dataclass
class StockAnalysis:
    """Complete analysis result for a single stock."""
    ticker: str
    name: str
    sector: str
    industry: str
    current_price: float

    # P/E Analysis
    pe_ratio: Optional[float] = None
    forward_pe: Optional[float] = None
    industry_avg_pe: Optional[float] = None
    pe_vs_industry: Optional[str] = None  # "undervalued" / "fair" / "overvalued"
    pe_discount_pct: Optional[float] = None

    # Revenue Growth (5-year)
    revenue_5y_cagr: Optional[float] = None
    revenue_trend: Optional[str] = None  # "accelerating" / "stable" / "decelerating" / "declining"
    annual_revenues: list = field(default_factory=list)
    revenue_years: list = field(default_factory=list)

    # Debt/Equity Health
    debt_to_equity: Optional[float] = None
    de_health: Optional[str] = None  # "excellent" / "healthy" / "moderate" / "concerning" / "dangerous"
    de_health_score: Optional[float] = None  # 0-100
    current_ratio: Optional[float] = None

    # Dividend
    dividend_yield: Optional[float] = None
    payout_ratio: Optional[float] = None
    dividend_sustainability: Optional[str] = None  # "highly sustainable" / "sustainable" / "at risk" / "unsustainable"
    dividend_sustainability_score: Optional[float] = None  # 0-100

    # Moat
    moat_rating: Optional[str] = None  # "弱" / "中等" / "强"
    moat_score: Optional[float] = None  # 0-100
    moat_factors: dict = field(default_factory=dict)

    # Price Targets (12-month)
    bull_target: Optional[float] = None
    bear_target: Optional[float] = None
    base_target: Optional[float] = None
    upside_pct: Optional[float] = None
    downside_pct: Optional[float] = None

    # Risk Rating
    risk_score: Optional[float] = None  # 1-10
    risk_rating: Optional[str] = None
    risk_factors: list = field(default_factory=list)

    # Entry/Stop-loss
    entry_price_low: Optional[float] = None
    entry_price_high: Optional[float] = None
    stop_loss: Optional[float] = None
    stop_loss_pct: Optional[float] = None

    # Composite score for ranking
    composite_score: Optional[float] = None

    # Additional
    market_cap_billions: Optional[float] = None
    beta: Optional[float] = None
    roe: Optional[float] = None
    profit_margin: Optional[float] = None
    recommendation: Optional[str] = None


class StockAnalyzer:
    """Performs comprehensive stock analysis."""

    def analyze(self, stock_data: dict, financials: Optional[dict] = None) -> Optional[StockAnalysis]:
        """Run full analysis pipeline on a stock."""
        try:
            sd = stock_data
            analysis = StockAnalysis(
                ticker=sd["ticker"],
                name=sd["name"],
                sector=sd.get("sector", get_sector_for_ticker(sd["ticker"])),
                industry=sd.get("industry", "Unknown"),
                current_price=sd["current_price"],
                market_cap_billions=sd.get("market_cap_billions"),
                beta=sd.get("beta"),
                roe=sd.get("roe"),
                profit_margin=sd.get("profit_margin"),
            )

            self._analyze_pe(analysis, sd)
            self._analyze_revenue_growth(analysis, sd, financials)
            self._analyze_debt_equity(analysis, sd, financials)
            self._analyze_dividend(analysis, sd)
            self._analyze_moat(analysis, sd, financials)
            self._analyze_price_targets(analysis, sd)
            self._analyze_risk(analysis, sd)
            self._calculate_entry_stop_loss(analysis, sd)
            self._calculate_composite_score(analysis)

            return analysis

        except Exception as e:
            logger.error(f"Analysis error for {stock_data.get('ticker', '?')}: {e}")
            return None

    def _analyze_pe(self, analysis: StockAnalysis, sd: dict):
        """P/E ratio analysis vs industry average."""
        pe = sd.get("pe_ratio")
        forward_pe = sd.get("forward_pe")

        analysis.pe_ratio = pe
        analysis.forward_pe = forward_pe

        sector = analysis.sector
        industry_pe = INDUSTRY_AVG_PE.get(sector, 20.0)
        analysis.industry_avg_pe = industry_pe

        effective_pe = pe or forward_pe
        if effective_pe and effective_pe > 0 and industry_pe > 0:
            discount = ((industry_pe - effective_pe) / industry_pe) * 100
            analysis.pe_discount_pct = round(discount, 1)

            if discount > 20:
                analysis.pe_vs_industry = "显著低估"
            elif discount > 5:
                analysis.pe_vs_industry = "低估"
            elif discount > -5:
                analysis.pe_vs_industry = "合理估值"
            elif discount > -20:
                analysis.pe_vs_industry = "高估"
            else:
                analysis.pe_vs_industry = "显著高估"
        else:
            analysis.pe_vs_industry = "N/A"
            analysis.pe_discount_pct = 0

    def _analyze_revenue_growth(self, analysis: StockAnalysis, sd: dict, financials: Optional[dict]):
        """5-year revenue growth trend analysis."""
        if financials and financials.get("annual_revenue"):
            revenues = financials["annual_revenue"]
            years = financials.get("years", [])

            # Filter out None values
            valid_data = [(y, r) for y, r in zip(years, revenues) if r is not None and r > 0]

            if len(valid_data) >= 2:
                valid_data.sort(key=lambda x: x[0])  # Sort by year ascending
                analysis.revenue_years = [d[0] for d in valid_data]
                analysis.annual_revenues = [d[1] for d in valid_data]

                # Calculate CAGR
                first_rev = valid_data[0][1]
                last_rev = valid_data[-1][1]
                n_years = len(valid_data) - 1

                if first_rev > 0 and last_rev > 0 and n_years > 0:
                    cagr = ((last_rev / first_rev) ** (1 / n_years) - 1) * 100
                    analysis.revenue_5y_cagr = round(cagr, 1)

                    # Determine trend by comparing recent vs earlier growth
                    if len(valid_data) >= 3:
                        recent_growth = (valid_data[-1][1] / valid_data[-2][1] - 1) * 100
                        earlier_growth = (valid_data[1][1] / valid_data[0][1] - 1) * 100

                        if recent_growth > earlier_growth + 5:
                            analysis.revenue_trend = "加速增长"
                        elif recent_growth > 0 and abs(recent_growth - earlier_growth) <= 5:
                            analysis.revenue_trend = "稳定增长"
                        elif recent_growth > 0:
                            analysis.revenue_trend = "增速放缓"
                        else:
                            analysis.revenue_trend = "收入下滑"
                    elif cagr > 0:
                        analysis.revenue_trend = "增长中"
                    else:
                        analysis.revenue_trend = "收入下滑"
                    return

        # Fallback to TTM growth rate
        if sd.get("revenue_growth") is not None:
            growth_pct = sd["revenue_growth"] * 100
            analysis.revenue_5y_cagr = round(growth_pct, 1)
            if growth_pct > 15:
                analysis.revenue_trend = "高速增长"
            elif growth_pct > 5:
                analysis.revenue_trend = "稳定增长"
            elif growth_pct > 0:
                analysis.revenue_trend = "低速增长"
            else:
                analysis.revenue_trend = "收入下滑"
        else:
            analysis.revenue_trend = "数据不足"

    def _analyze_debt_equity(self, analysis: StockAnalysis, sd: dict, financials: Optional[dict]):
        """Debt-to-equity ratio health check."""
        de_ratio = sd.get("debt_to_equity")
        if de_ratio is not None:
            # yfinance returns D/E as percentage (e.g., 150 means 1.5x)
            de_ratio_normalized = de_ratio / 100.0 if de_ratio > 10 else de_ratio
            analysis.debt_to_equity = round(de_ratio_normalized, 2)

            if de_ratio_normalized < 0.3:
                analysis.de_health = "优秀"
                analysis.de_health_score = 95
            elif de_ratio_normalized < 0.6:
                analysis.de_health = "健康"
                analysis.de_health_score = 80
            elif de_ratio_normalized < 1.0:
                analysis.de_health = "适中"
                analysis.de_health_score = 65
            elif de_ratio_normalized < 1.5:
                analysis.de_health = "偏高"
                analysis.de_health_score = 45
            elif de_ratio_normalized < 2.5:
                analysis.de_health = "需关注"
                analysis.de_health_score = 25
            else:
                analysis.de_health = "危险"
                analysis.de_health_score = 10
        else:
            analysis.de_health = "数据不足"
            analysis.de_health_score = 50

        analysis.current_ratio = sd.get("current_ratio")

    def _analyze_dividend(self, analysis: StockAnalysis, sd: dict):
        """Dividend yield and payout sustainability scoring."""
        div_yield = sd.get("dividend_yield")
        payout_ratio = sd.get("payout_ratio")

        if div_yield is not None:
            analysis.dividend_yield = round(div_yield * 100, 2)
        else:
            analysis.dividend_yield = 0.0

        if payout_ratio is not None:
            analysis.payout_ratio = round(payout_ratio * 100, 1) if payout_ratio < 5 else round(payout_ratio, 1)

        # Sustainability scoring
        if payout_ratio is not None and div_yield is not None:
            pr = payout_ratio if payout_ratio > 1 else payout_ratio * 100
            if pr < 0:
                analysis.dividend_sustainability = "不可持续 (负盈利)"
                analysis.dividend_sustainability_score = 10
            elif pr < 30:
                analysis.dividend_sustainability = "高度可持续"
                analysis.dividend_sustainability_score = 95
            elif pr < 50:
                analysis.dividend_sustainability = "可持续"
                analysis.dividend_sustainability_score = 80
            elif pr < 70:
                analysis.dividend_sustainability = "尚可"
                analysis.dividend_sustainability_score = 60
            elif pr < 90:
                analysis.dividend_sustainability = "有风险"
                analysis.dividend_sustainability_score = 35
            else:
                analysis.dividend_sustainability = "不可持续"
                analysis.dividend_sustainability_score = 15
        elif div_yield is not None and div_yield > 0:
            analysis.dividend_sustainability = "数据不足以评估"
            analysis.dividend_sustainability_score = 50
        else:
            analysis.dividend_sustainability = "不派息"
            analysis.dividend_sustainability_score = None

    def _analyze_moat(self, analysis: StockAnalysis, sd: dict, financials: Optional[dict]):
        """Competitive advantage moat rating."""
        scores = {}

        # Brand strength: based on market cap rank and sector
        mcap = sd.get("market_cap_billions", 0) or 0
        if mcap > 500:
            scores["brand_strength"] = 95
        elif mcap > 100:
            scores["brand_strength"] = 80
        elif mcap > 50:
            scores["brand_strength"] = 65
        elif mcap > 10:
            scores["brand_strength"] = 45
        else:
            scores["brand_strength"] = 25

        # Switching costs: proxied by sector + gross margin
        gm = sd.get("gross_margin")
        if gm:
            gm_pct = gm * 100 if gm < 1 else gm
            if gm_pct > 70:
                scores["switching_costs"] = 85
            elif gm_pct > 50:
                scores["switching_costs"] = 70
            elif gm_pct > 35:
                scores["switching_costs"] = 50
            else:
                scores["switching_costs"] = 30
        else:
            scores["switching_costs"] = 40

        # Network effects: higher for tech/communications/financials
        network_sectors = {"Technology": 80, "Communication Services": 75, "Financials": 60}
        scores["network_effects"] = network_sectors.get(analysis.sector, 30)

        # Cost advantage: operating margin vs peers
        om = sd.get("operating_margin")
        if om:
            om_pct = om * 100 if om < 1 else om
            if om_pct > 35:
                scores["cost_advantage"] = 90
            elif om_pct > 20:
                scores["cost_advantage"] = 70
            elif om_pct > 10:
                scores["cost_advantage"] = 50
            else:
                scores["cost_advantage"] = 25
        else:
            scores["cost_advantage"] = 40

        # Intangible assets (patents, IP): proxy via R&D intensity (sector-based)
        ip_sectors = {"Technology": 80, "Healthcare": 85, "Industrials": 55}
        scores["intangible_assets"] = ip_sectors.get(analysis.sector, 40)

        # Market dominance: market cap percentile within universe
        if mcap > 200:
            scores["market_dominance"] = 90
        elif mcap > 50:
            scores["market_dominance"] = 70
        elif mcap > 20:
            scores["market_dominance"] = 55
        else:
            scores["market_dominance"] = 35

        # Margin stability: consistency of profit margins
        pm = sd.get("profit_margin")
        roe = sd.get("roe")
        if pm and roe:
            pm_val = pm * 100 if pm < 1 else pm
            roe_val = roe * 100 if roe < 1 else roe
            if pm_val > 20 and roe_val > 20:
                scores["margin_stability"] = 90
            elif pm_val > 10 and roe_val > 15:
                scores["margin_stability"] = 70
            elif pm_val > 5 and roe_val > 10:
                scores["margin_stability"] = 50
            else:
                scores["margin_stability"] = 30
        else:
            scores["margin_stability"] = 40

        # Calculate weighted moat score
        total_score = sum(
            scores.get(k, 0) * w for k, w in MOAT_WEIGHTS.items()
        )
        analysis.moat_score = round(total_score, 1)
        analysis.moat_factors = scores

        if total_score >= 75:
            analysis.moat_rating = "强"
        elif total_score >= 50:
            analysis.moat_rating = "中等"
        else:
            analysis.moat_rating = "弱"

    def _analyze_price_targets(self, analysis: StockAnalysis, sd: dict):
        """12-month bull/bear price targets."""
        price = sd.get("current_price", 0)
        target_high = sd.get("target_high_price")
        target_low = sd.get("target_low_price")
        target_mean = sd.get("target_mean_price") or sd.get("target_median_price")

        if target_high and target_low and price > 0:
            analysis.bull_target = round(target_high, 2)
            analysis.bear_target = round(target_low, 2)
            analysis.base_target = round(target_mean, 2) if target_mean else round((target_high + target_low) / 2, 2)
            analysis.upside_pct = round(((target_high - price) / price) * 100, 1)
            analysis.downside_pct = round(((target_low - price) / price) * 100, 1)
        elif price > 0:
            # Estimate based on growth and valuation
            growth = sd.get("revenue_growth", 0) or 0
            pe = sd.get("pe_ratio") or sd.get("forward_pe") or 20
            beta = sd.get("beta", 1.0) or 1.0

            # Bull case: growth premium
            bull_mult = 1 + max(growth, 0.05) + 0.05
            analysis.bull_target = round(price * bull_mult, 2)

            # Bear case: discount for risk
            bear_mult = 1 - (beta * 0.15)
            analysis.bear_target = round(price * max(bear_mult, 0.7), 2)

            # Base case
            analysis.base_target = round(price * (1 + max(growth, 0.02)), 2)
            analysis.upside_pct = round(((analysis.bull_target - price) / price) * 100, 1)
            analysis.downside_pct = round(((analysis.bear_target - price) / price) * 100, 1)

    def _analyze_risk(self, analysis: StockAnalysis, sd: dict):
        """Risk rating (1-10) with specific factors."""
        risk_points = 0
        factors = []

        # Beta risk (0-2 points)
        beta = sd.get("beta", 1.0) or 1.0
        if beta > 1.5:
            risk_points += 2
            factors.append(f"高Beta值 ({beta:.2f})，股价波动大")
        elif beta > 1.2:
            risk_points += 1.5
            factors.append(f"Beta值偏高 ({beta:.2f})")
        elif beta > 1.0:
            risk_points += 1
        elif beta < 0.7:
            factors.append(f"低Beta值 ({beta:.2f})，防御性强")

        # Valuation risk (0-2 points)
        pe = sd.get("pe_ratio") or sd.get("forward_pe")
        if pe:
            if pe > 50:
                risk_points += 2
                factors.append(f"估值极高 (P/E: {pe:.1f})")
            elif pe > 35:
                risk_points += 1.5
                factors.append(f"估值偏高 (P/E: {pe:.1f})")
            elif pe > 25:
                risk_points += 1
            elif pe < 10 and pe > 0:
                risk_points += 0.5
                factors.append("极低P/E可能反映盈利下滑风险")

        # Debt risk (0-2 points)
        de = analysis.debt_to_equity
        if de is not None:
            if de > 2.0:
                risk_points += 2
                factors.append(f"债务水平极高 (D/E: {de:.2f})")
            elif de > 1.5:
                risk_points += 1.5
                factors.append(f"债务水平偏高 (D/E: {de:.2f})")
            elif de > 1.0:
                risk_points += 1
            elif de < 0.3:
                factors.append("低负债，财务稳健")

        # Growth risk (0-1.5 points)
        rev_growth = sd.get("revenue_growth")
        if rev_growth is not None:
            if rev_growth < -0.05:
                risk_points += 1.5
                factors.append("收入同比下降，增长前景存疑")
            elif rev_growth < 0:
                risk_points += 1
                factors.append("收入增长放缓")
            elif rev_growth > 0.3:
                factors.append(f"高增长 ({rev_growth*100:.1f}%)，但需关注可持续性")

        # Price momentum risk (0-1.5 points)
        high_52 = sd.get("52_week_high", 0) or 0
        low_52 = sd.get("52_week_low", 0) or 0
        price = sd.get("current_price", 0)
        if high_52 > 0 and price > 0:
            pct_from_high = ((high_52 - price) / high_52) * 100
            if pct_from_high < 5:
                risk_points += 1
                factors.append("接近52周高点，追高风险")
            elif pct_from_high > 30:
                risk_points += 0.5
                factors.append(f"较52周高点回撤{pct_from_high:.0f}%，可能存在价值机会")

        if high_52 > 0 and low_52 > 0:
            volatility_range = ((high_52 - low_52) / low_52) * 100
            if volatility_range > 80:
                risk_points += 1
                factors.append(f"52周价格波动幅度大 ({volatility_range:.0f}%)")

        # Market cap risk (0-1 point)
        mcap = sd.get("market_cap_billions", 0) or 0
        if mcap < 5:
            risk_points += 1
            factors.append("中小市值股票，流动性风险较高")
        elif mcap < 10:
            risk_points += 0.5

        # Normalize to 1-10
        raw_score = min(risk_points, 10)
        analysis.risk_score = round(max(1, min(10, raw_score)), 1)

        if analysis.risk_score <= 3:
            analysis.risk_rating = "低风险"
        elif analysis.risk_score <= 5:
            analysis.risk_rating = "中等风险"
        elif analysis.risk_score <= 7:
            analysis.risk_rating = "中高风险"
        else:
            analysis.risk_rating = "高风险"

        if not factors:
            factors.append("总体风险特征均衡")
        analysis.risk_factors = factors

    def _calculate_entry_stop_loss(self, analysis: StockAnalysis, sd: dict):
        """Calculate entry price range and stop-loss recommendation."""
        price = sd.get("current_price", 0)
        if price <= 0:
            return

        low_52 = sd.get("52_week_low", 0) or 0
        high_52 = sd.get("52_week_high", 0) or 0
        avg_50 = sd.get("50_day_avg", 0) or 0
        avg_200 = sd.get("200_day_avg", 0) or 0
        bear_target = analysis.bear_target or (price * 0.85)

        # Entry range: between a support level and current price
        support_levels = [v for v in [low_52, avg_200, avg_50, bear_target] if v and v > 0]
        if support_levels:
            # Entry low: near strong support
            entry_low = max(min(support_levels), price * 0.90)
            # Entry high: slight discount to current
            entry_high = price * 0.98
            # Make sure low < high
            if entry_low >= entry_high:
                entry_low = price * 0.92
                entry_high = price * 0.98
        else:
            entry_low = price * 0.92
            entry_high = price * 0.98

        analysis.entry_price_low = round(entry_low, 2)
        analysis.entry_price_high = round(entry_high, 2)

        # Stop-loss: 8-15% below entry depending on risk
        risk = analysis.risk_score or 5
        if risk <= 3:
            sl_pct = 8
        elif risk <= 5:
            sl_pct = 10
        elif risk <= 7:
            sl_pct = 12
        else:
            sl_pct = 15

        analysis.stop_loss_pct = sl_pct
        analysis.stop_loss = round(entry_low * (1 - sl_pct / 100), 2)

    def _calculate_composite_score(self, analysis: StockAnalysis):
        """Calculate composite ranking score (0-100) for screening."""
        score = 50.0  # Base

        # Valuation component (max +/- 15)
        if analysis.pe_discount_pct is not None:
            val_score = min(max(analysis.pe_discount_pct / 2, -15), 15)
            score += val_score

        # Growth component (max +/- 15)
        if analysis.revenue_5y_cagr is not None:
            growth_score = min(analysis.revenue_5y_cagr / 2, 15)
            score += max(growth_score, -10)

        # Financial health (max +/- 10)
        if analysis.de_health_score is not None:
            health_contribution = (analysis.de_health_score - 50) / 5
            score += min(max(health_contribution, -10), 10)

        # Moat (max +/- 10)
        if analysis.moat_score is not None:
            moat_contribution = (analysis.moat_score - 50) / 5
            score += min(max(moat_contribution, -10), 10)

        # Risk adjustment (inverse: lower risk = higher score)
        if analysis.risk_score is not None:
            risk_adjustment = (5 - analysis.risk_score) * 1.5
            score += min(max(risk_adjustment, -10), 10)

        # Upside potential (max +10)
        if analysis.upside_pct is not None:
            upside_contribution = min(analysis.upside_pct / 5, 10)
            score += max(upside_contribution, -5)

        # Dividend bonus
        if analysis.dividend_yield and analysis.dividend_yield > 1.5:
            if analysis.dividend_sustainability_score and analysis.dividend_sustainability_score > 60:
                score += min(analysis.dividend_yield, 5)

        # ROE bonus
        roe = analysis.roe
        if roe:
            roe_pct = roe * 100 if roe < 1 else roe
            if roe_pct > 20:
                score += 5
            elif roe_pct > 15:
                score += 3

        analysis.composite_score = round(min(max(score, 0), 100), 1)
        analysis.recommendation = self._get_recommendation(analysis)

    def _get_recommendation(self, analysis: StockAnalysis) -> str:
        """Generate recommendation based on composite score."""
        score = analysis.composite_score or 0
        if score >= 75:
            return "强烈推荐买入"
        elif score >= 65:
            return "推荐买入"
        elif score >= 55:
            return "建议关注"
        elif score >= 45:
            return "中性/持有"
        elif score >= 35:
            return "谨慎观望"
        else:
            return "不推荐"
