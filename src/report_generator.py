"""
Goldman Sachs Style Stock Screener - Report Generator
======================================================
Generates professional research-quality stock screening reports
with summary tables, individual stock analyses, and risk disclosures.
"""

import os
import logging
from datetime import datetime
from typing import Optional

from tabulate import tabulate
from colorama import Fore, Style, init as colorama_init

from src.analyzer import StockAnalysis
from src.config import InvestorProfile, RiskTolerance

logger = logging.getLogger(__name__)
colorama_init(autoreset=True)


def _safe(val, fmt=".2f", suffix="", prefix="", na="N/A"):
    """Safely format a value."""
    if val is None:
        return na
    try:
        return f"{prefix}{val:{fmt}}{suffix}"
    except (ValueError, TypeError):
        return str(val)


def _color_score(score, thresholds=(35, 55, 70)):
    """Color a score value based on thresholds."""
    if score is None:
        return "N/A"
    low, mid, high = thresholds
    if score >= high:
        return f"{Fore.GREEN}{score:.1f}{Style.RESET_ALL}"
    elif score >= mid:
        return f"{Fore.YELLOW}{score:.1f}{Style.RESET_ALL}"
    elif score >= low:
        return f"{Fore.LIGHTYELLOW_EX}{score:.1f}{Style.RESET_ALL}"
    else:
        return f"{Fore.RED}{score:.1f}{Style.RESET_ALL}"


def _moat_icon(rating):
    if rating == "强":
        return f"{Fore.GREEN}[强]{Style.RESET_ALL}"
    elif rating == "中等":
        return f"{Fore.YELLOW}[中等]{Style.RESET_ALL}"
    else:
        return f"{Fore.RED}[弱]{Style.RESET_ALL}"


class ReportGenerator:
    """Generates formatted stock screening reports."""

    SEPARATOR = "=" * 90
    THIN_SEP = "-" * 90
    SECTION_WIDTH = 90

    def __init__(self):
        self._lines = []

    def _add(self, text: str = ""):
        self._lines.append(text)

    def _add_header(self, title: str, level: int = 1):
        if level == 1:
            self._add(self.SEPARATOR)
            padding = (self.SECTION_WIDTH - len(title) - 4) // 2
            self._add(f"{'=' * padding}  {title}  {'=' * padding}")
            self._add(self.SEPARATOR)
        elif level == 2:
            self._add(self.THIN_SEP)
            self._add(f"  {title}")
            self._add(self.THIN_SEP)
        else:
            self._add(f"\n  >> {title}")

    def generate_full_report(
        self,
        results: list[StockAnalysis],
        profile: InvestorProfile,
        sector_allocation: dict = None,
        market_data: dict = None,
    ) -> str:
        """Generate the complete screening report."""
        self._lines = []

        self._generate_cover(profile, len(results), market_data)
        self._generate_executive_summary(results, profile)
        self._generate_summary_table(results)
        self._generate_pe_comparison_table(results)
        self._generate_growth_table(results)
        self._generate_financial_health_table(results)
        self._generate_dividend_table(results)
        self._generate_moat_table(results)
        self._generate_price_targets_table(results)
        self._generate_risk_table(results)
        self._generate_entry_stoploss_table(results)

        for i, stock in enumerate(results, 1):
            self._generate_individual_report(stock, i, len(results))

        if sector_allocation:
            self._generate_sector_allocation(sector_allocation)

        self._generate_disclaimer()

        return "\n".join(self._lines)

    def _generate_cover(self, profile: InvestorProfile, count: int, market_data: dict = None):
        """Report cover page."""
        now = datetime.now()
        self._add()
        self._add(self.SEPARATOR)
        self._add(f"{'=' * 25}  GOLDMAN SACHS 股票研究  {'=' * 25}")
        self._add(self.SEPARATOR)
        self._add()
        self._add("                    股 票 筛 选 研 究 报 告")
        self._add("                    EQUITY SCREENING REPORT")
        self._add()
        self._add(f"  报告日期:   {now.strftime('%Y年%m月%d日 %H:%M')}")
        self._add(f"  报告编号:   GS-EQ-{now.strftime('%Y%m%d')}-{count:03d}")
        self._add(f"  分析师:     高级股票研究团队")
        self._add(f"  机密等级:   仅供内部使用 / CONFIDENTIAL")
        self._add()
        self._add(f"  投资者概况:")
        self._add(f"    风险承受能力:     {profile.risk_tolerance.value}")
        self._add(f"    预期年化收益率:   {profile.target_annual_return_min:.0f}% - {profile.target_annual_return_max:.0f}%")
        self._add(f"    投资期限:         {profile.investment_horizon_years} 年")
        self._add(f"    筛选结果:         {count} 只推荐股票")
        self._add()

        if market_data:
            self._add("  市场概况:")
            for name, data in market_data.items():
                price = data.get("price", 0)
                change = data.get("change_pct", 0)
                direction = "+" if change >= 0 else ""
                self._add(f"    {name:<12} {price:>12,.2f}  ({direction}{change:.2f}%)")
            self._add()

        self._add(self.SEPARATOR)

    def _generate_executive_summary(self, results: list[StockAnalysis], profile: InvestorProfile):
        """Executive summary section."""
        self._add()
        self._add_header("执行摘要 / EXECUTIVE SUMMARY", 2)
        self._add()

        if not results:
            self._add("  未找到符合筛选条件的股票。建议放宽筛选参数。")
            return

        top3 = results[:3]
        avg_score = sum(r.composite_score or 0 for r in results) / len(results)
        avg_risk = sum(r.risk_score or 5 for r in results) / len(results)
        avg_upside = sum(r.upside_pct or 0 for r in results if r.upside_pct) / max(1, sum(1 for r in results if r.upside_pct))

        self._add(f"  基于您的投资概况（风险承受: {profile.risk_tolerance.value}，")
        self._add(f"  目标年化收益: {profile.target_annual_return_min:.0f}%-{profile.target_annual_return_max:.0f}%），")
        self._add(f"  我们从全市场精选出以下 {len(results)} 只股票：")
        self._add()
        self._add(f"  核心指标:")
        self._add(f"    平均综合评分:     {avg_score:.1f}/100")
        self._add(f"    平均风险评级:     {avg_risk:.1f}/10")
        self._add(f"    平均上行空间:     {avg_upside:+.1f}%")
        self._add()
        self._add(f"  TOP 3 推荐:")
        for i, s in enumerate(top3, 1):
            self._add(f"    {i}. {s.ticker:<6} ({s.name}) - 综合评分: {s.composite_score:.1f} | {s.recommendation}")
        self._add()

    def _generate_summary_table(self, results: list[StockAnalysis]):
        """Master summary table."""
        self._add_header("综合汇总表 / SCREENING SUMMARY", 2)
        self._add()

        headers = [
            "排名", "代码", "公司名称", "行业", "现价($)",
            "综合分", "推荐", "风险", "上行%", "护城河"
        ]
        rows = []
        for i, s in enumerate(results, 1):
            rows.append([
                i,
                s.ticker,
                (s.name[:14] + "..") if len(s.name) > 16 else s.name,
                (s.sector[:8] + "..") if s.sector and len(s.sector) > 10 else (s.sector or "N/A"),
                _safe(s.current_price, ".2f", prefix="$"),
                _safe(s.composite_score, ".1f"),
                s.recommendation or "N/A",
                _safe(s.risk_score, ".1f", suffix="/10"),
                _safe(s.upside_pct, "+.1f", suffix="%") if s.upside_pct else "N/A",
                s.moat_rating or "N/A",
            ])

        self._add(tabulate(rows, headers=headers, tablefmt="simple", stralign="left", numalign="right"))
        self._add()

    def _generate_pe_comparison_table(self, results: list[StockAnalysis]):
        """P/E ratio analysis table."""
        self._add_header("市盈率(P/E)分析 / VALUATION ANALYSIS", 2)
        self._add()

        headers = ["代码", "当前P/E", "远期P/E", "行业均值", "溢价/折价", "估值判断"]
        rows = []
        for s in results:
            rows.append([
                s.ticker,
                _safe(s.pe_ratio, ".1f"),
                _safe(s.forward_pe, ".1f"),
                _safe(s.industry_avg_pe, ".1f"),
                _safe(s.pe_discount_pct, "+.1f", suffix="%") if s.pe_discount_pct else "N/A",
                s.pe_vs_industry or "N/A",
            ])

        self._add(tabulate(rows, headers=headers, tablefmt="simple", stralign="left", numalign="right"))
        self._add()

    def _generate_growth_table(self, results: list[StockAnalysis]):
        """5-year revenue growth table."""
        self._add_header("收入增长趋势(5年) / REVENUE GROWTH TRENDS", 2)
        self._add()

        headers = ["代码", "5年CAGR", "增长趋势", "近年收入(十亿$)"]
        rows = []
        for s in results:
            rev_str = "N/A"
            if s.annual_revenues and s.revenue_years:
                # Show last 3 years of revenue
                rev_pairs = list(zip(s.revenue_years[-3:], s.annual_revenues[-3:]))
                parts = []
                for y, r in rev_pairs:
                    if r is not None:
                        parts.append(f"{y}:{r/1e9:.1f}B")
                rev_str = " | ".join(parts) if parts else "N/A"

            rows.append([
                s.ticker,
                _safe(s.revenue_5y_cagr, "+.1f", suffix="%") if s.revenue_5y_cagr is not None else "N/A",
                s.revenue_trend or "N/A",
                rev_str,
            ])

        self._add(tabulate(rows, headers=headers, tablefmt="simple", stralign="left", numalign="right"))
        self._add()

    def _generate_financial_health_table(self, results: list[StockAnalysis]):
        """Debt/equity health table."""
        self._add_header("债务权益比健康检查 / DEBT-EQUITY HEALTH CHECK", 2)
        self._add()

        headers = ["代码", "债务/权益比", "健康状态", "健康分数", "流动比率"]
        rows = []
        for s in results:
            rows.append([
                s.ticker,
                _safe(s.debt_to_equity, ".2f", suffix="x"),
                s.de_health or "N/A",
                _safe(s.de_health_score, ".0f", suffix="/100"),
                _safe(s.current_ratio, ".2f"),
            ])

        self._add(tabulate(rows, headers=headers, tablefmt="simple", stralign="left", numalign="right"))
        self._add()

    def _generate_dividend_table(self, results: list[StockAnalysis]):
        """Dividend yield and sustainability table."""
        self._add_header("股息收益率与可持续性 / DIVIDEND ANALYSIS", 2)
        self._add()

        headers = ["代码", "股息率", "派息比率", "可持续性", "可持续分数"]
        rows = []
        for s in results:
            rows.append([
                s.ticker,
                _safe(s.dividend_yield, ".2f", suffix="%") if s.dividend_yield else "0.00%",
                _safe(s.payout_ratio, ".1f", suffix="%") if s.payout_ratio else "N/A",
                s.dividend_sustainability or "N/A",
                _safe(s.dividend_sustainability_score, ".0f", suffix="/100") if s.dividend_sustainability_score else "N/A",
            ])

        self._add(tabulate(rows, headers=headers, tablefmt="simple", stralign="left", numalign="right"))
        self._add()

    def _generate_moat_table(self, results: list[StockAnalysis]):
        """Competitive moat rating table."""
        self._add_header("竞争优势护城河评级 / COMPETITIVE MOAT RATING", 2)
        self._add()

        headers = ["代码", "护城河", "综合分", "品牌", "转换成本", "网络效应", "成本优势", "市场主导"]
        rows = []
        for s in results:
            f = s.moat_factors or {}
            rows.append([
                s.ticker,
                s.moat_rating or "N/A",
                _safe(s.moat_score, ".0f"),
                _safe(f.get("brand_strength"), ".0f"),
                _safe(f.get("switching_costs"), ".0f"),
                _safe(f.get("network_effects"), ".0f"),
                _safe(f.get("cost_advantage"), ".0f"),
                _safe(f.get("market_dominance"), ".0f"),
            ])

        self._add(tabulate(rows, headers=headers, tablefmt="simple", stralign="left", numalign="right"))
        self._add()
        self._add("  评级标准: 强 (>=75分) | 中等 (50-74分) | 弱 (<50分)")
        self._add()

    def _generate_price_targets_table(self, results: list[StockAnalysis]):
        """12-month price targets table."""
        self._add_header("12个月目标价 / 12-MONTH PRICE TARGETS", 2)
        self._add()

        headers = ["代码", "现价($)", "看跌目标", "基准目标", "看涨目标", "下行风险", "上行空间"]
        rows = []
        for s in results:
            rows.append([
                s.ticker,
                _safe(s.current_price, ".2f"),
                _safe(s.bear_target, ".2f"),
                _safe(s.base_target, ".2f"),
                _safe(s.bull_target, ".2f"),
                _safe(s.downside_pct, ".1f", suffix="%"),
                _safe(s.upside_pct, "+.1f", suffix="%") if s.upside_pct and s.upside_pct > 0 else _safe(s.upside_pct, ".1f", suffix="%"),
            ])

        self._add(tabulate(rows, headers=headers, tablefmt="simple", stralign="left", numalign="right"))
        self._add()

    def _generate_risk_table(self, results: list[StockAnalysis]):
        """Risk rating table."""
        self._add_header("风险评级 / RISK ASSESSMENT", 2)
        self._add()

        headers = ["代码", "风险评分", "风险等级", "Beta", "主要风险因素"]
        rows = []
        for s in results:
            main_factor = s.risk_factors[0] if s.risk_factors else "N/A"
            if len(main_factor) > 40:
                main_factor = main_factor[:37] + "..."
            rows.append([
                s.ticker,
                _safe(s.risk_score, ".1f", suffix="/10"),
                s.risk_rating or "N/A",
                _safe(s.beta, ".2f"),
                main_factor,
            ])

        self._add(tabulate(rows, headers=headers, tablefmt="simple", stralign="left", numalign="right"))
        self._add()
        self._add("  风险等级: 低风险(1-3) | 中等风险(3-5) | 中高风险(5-7) | 高风险(7-10)")
        self._add()

    def _generate_entry_stoploss_table(self, results: list[StockAnalysis]):
        """Entry price and stop-loss table."""
        self._add_header("入场价格与止损建议 / ENTRY & STOP-LOSS LEVELS", 2)
        self._add()

        headers = ["代码", "现价($)", "入场低价", "入场高价", "止损价", "止损幅度"]
        rows = []
        for s in results:
            rows.append([
                s.ticker,
                _safe(s.current_price, ".2f"),
                _safe(s.entry_price_low, ".2f"),
                _safe(s.entry_price_high, ".2f"),
                _safe(s.stop_loss, ".2f"),
                _safe(s.stop_loss_pct, ".0f", suffix="%"),
            ])

        self._add(tabulate(rows, headers=headers, tablefmt="simple", stralign="left", numalign="right"))
        self._add()

    def _generate_individual_report(self, stock: StockAnalysis, rank: int, total: int):
        """Generate detailed individual stock report."""
        self._add()
        self._add(self.SEPARATOR)
        self._add(f"  [{rank}/{total}] {stock.ticker} - {stock.name}")
        self._add(f"  行业: {stock.sector} | {stock.industry}")
        self._add(self.SEPARATOR)
        self._add()

        # Core metrics
        self._add(f"  综合评分: {_safe(stock.composite_score, '.1f')}/100    推荐: {stock.recommendation}")
        self._add()

        # Valuation
        self._add("  [估值分析]")
        self._add(f"    当前价格:     ${stock.current_price:.2f}")
        self._add(f"    市值:         ${stock.market_cap_billions:.1f}B" if stock.market_cap_billions else "    市值: N/A")
        self._add(f"    市盈率(P/E):  {_safe(stock.pe_ratio, '.1f')}  (行业均值: {_safe(stock.industry_avg_pe, '.1f')})")
        self._add(f"    远期P/E:      {_safe(stock.forward_pe, '.1f')}")
        self._add(f"    估值判断:     {stock.pe_vs_industry}")
        self._add()

        # Growth
        self._add("  [收入增长 - 5年趋势]")
        self._add(f"    5年CAGR:      {_safe(stock.revenue_5y_cagr, '+.1f', suffix='%') if stock.revenue_5y_cagr is not None else 'N/A'}")
        self._add(f"    增长趋势:     {stock.revenue_trend}")
        if stock.annual_revenues and stock.revenue_years:
            self._add("    年度收入:")
            for y, r in zip(stock.revenue_years, stock.annual_revenues):
                if r is not None:
                    self._add(f"      {y}: ${r/1e9:.2f}B")
        self._add()

        # Financial health
        self._add("  [财务健康]")
        self._add(f"    债务/权益比:  {_safe(stock.debt_to_equity, '.2f', suffix='x')}")
        self._add(f"    健康状态:     {stock.de_health}  (评分: {_safe(stock.de_health_score, '.0f')}/100)")
        self._add(f"    流动比率:     {_safe(stock.current_ratio, '.2f')}")
        self._add(f"    净利润率:     {_safe(stock.profit_margin * 100 if stock.profit_margin else None, '.1f', suffix='%')}")
        self._add(f"    ROE:          {_safe(stock.roe * 100 if stock.roe else None, '.1f', suffix='%')}")
        self._add()

        # Dividend
        self._add("  [股息分析]")
        self._add(f"    股息收益率:   {_safe(stock.dividend_yield, '.2f', suffix='%') if stock.dividend_yield else '0.00% (不派息)'}")
        self._add(f"    派息比率:     {_safe(stock.payout_ratio, '.1f', suffix='%') if stock.payout_ratio else 'N/A'}")
        self._add(f"    可持续性:     {stock.dividend_sustainability}")
        self._add()

        # Moat
        self._add("  [竞争护城河]")
        self._add(f"    护城河评级:   {stock.moat_rating}  (评分: {_safe(stock.moat_score, '.0f')}/100)")
        if stock.moat_factors:
            for k, v in stock.moat_factors.items():
                label_map = {
                    "brand_strength": "品牌实力",
                    "switching_costs": "转换成本",
                    "network_effects": "网络效应",
                    "cost_advantage": "成本优势",
                    "intangible_assets": "无形资产",
                    "market_dominance": "市场主导",
                    "margin_stability": "利润稳定",
                }
                self._add(f"      {label_map.get(k, k)}: {v}/100")
        self._add()

        # Price targets
        self._add("  [12个月目标价]")
        self._add(f"    看涨目标:     ${stock.bull_target:.2f}  ({_safe(stock.upside_pct, '+.1f', suffix='%')})" if stock.bull_target else "    看涨目标: N/A")
        self._add(f"    基准目标:     ${stock.base_target:.2f}" if stock.base_target else "    基准目标: N/A")
        self._add(f"    看跌目标:     ${stock.bear_target:.2f}  ({_safe(stock.downside_pct, '.1f', suffix='%')})" if stock.bear_target else "    看跌目标: N/A")
        self._add()

        # Risk
        self._add("  [风险评估]")
        self._add(f"    风险评分:     {_safe(stock.risk_score, '.1f')}/10  ({stock.risk_rating})")
        self._add(f"    Beta:         {_safe(stock.beta, '.2f')}")
        self._add(f"    风险因素:")
        for factor in stock.risk_factors:
            self._add(f"      - {factor}")
        self._add()

        # Entry/Stop-loss
        self._add("  [交易建议]")
        self._add(f"    入场价格区间: ${stock.entry_price_low:.2f} - ${stock.entry_price_high:.2f}" if stock.entry_price_low else "    入场价格: N/A")
        self._add(f"    止损价格:     ${stock.stop_loss:.2f}  (跌幅 {stock.stop_loss_pct:.0f}%)" if stock.stop_loss else "    止损价格: N/A")
        self._add()

    def _generate_sector_allocation(self, sectors: dict):
        """Sector allocation breakdown."""
        self._add_header("行业配置 / SECTOR ALLOCATION", 2)
        self._add()

        total = sum(sectors.values())
        headers = ["行业", "股票数量", "占比"]
        rows = []
        for sector, count in sectors.items():
            pct = count / total * 100
            bar = "#" * int(pct / 2)
            rows.append([sector, count, f"{pct:.1f}%  {bar}"])

        self._add(tabulate(rows, headers=headers, tablefmt="simple", stralign="left"))
        self._add()

    def _generate_disclaimer(self):
        """Legal disclaimer."""
        self._add()
        self._add(self.SEPARATOR)
        self._add("  免责声明 / DISCLAIMER")
        self._add(self.SEPARATOR)
        self._add()
        self._add("  本报告仅供参考，不构成任何投资建议。所有数据来源于公开市场信息，")
        self._add("  分析结果基于量化模型，可能存在偏差。投资者应根据自身情况做出独立")
        self._add("  判断，并承担相应投资风险。过往表现不代表未来收益。")
        self._add()
        self._add("  This report is for informational purposes only and does not constitute")
        self._add("  investment advice. All data is sourced from public market information.")
        self._add("  Past performance is not indicative of future results.")
        self._add()
        self._add(f"  报告生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')}")
        self._add(self.SEPARATOR)
        self._add()

    def save_to_file(self, report: str, filename: str = None) -> str:
        """Save report to a text file."""
        if not filename:
            filename = f"screening_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"

        output_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "reports")
        os.makedirs(output_dir, exist_ok=True)
        filepath = os.path.join(output_dir, filename)

        # Strip ANSI color codes for file output
        import re
        clean_report = re.sub(r'\x1b\[[0-9;]*m', '', report)

        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(clean_report)

        return filepath
