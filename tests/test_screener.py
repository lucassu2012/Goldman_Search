"""Unit tests for the stock screening tool."""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from src.config import InvestorProfile, RiskTolerance, get_screening_params, get_stock_universe, get_sector_for_ticker
from src.sample_data import get_all_sample_stocks, get_sample_financials
from src.analyzer import StockAnalyzer
from src.screener import StockScreener
from src.report_generator import ReportGenerator


def test_config():
    """Test configuration module."""
    profile = InvestorProfile()
    assert profile.risk_tolerance == RiskTolerance.MEDIUM_HIGH
    assert profile.target_annual_return_min == 15.0

    params = get_screening_params(profile)
    assert "max_pe_ratio" in params
    assert params["max_pe_ratio"] == 40

    tickers = get_stock_universe(["Technology"])
    assert "AAPL" in tickers
    assert "JPM" not in tickers

    assert get_sector_for_ticker("AAPL") == "Technology"
    assert get_sector_for_ticker("JPM") == "Financials"
    print("  [PASS] config module")


def test_sample_data():
    """Test sample data provider."""
    stocks = get_all_sample_stocks()
    assert len(stocks) >= 20
    assert "AAPL" in stocks
    assert "NVDA" in stocks
    assert stocks["AAPL"]["current_price"] > 0

    financials = get_sample_financials("AAPL")
    assert financials is not None
    assert len(financials["years"]) == 5
    assert len(financials["annual_revenue"]) == 5
    print("  [PASS] sample data provider")


def test_analyzer():
    """Test stock analysis engine."""
    stocks = get_all_sample_stocks()
    analyzer = StockAnalyzer()

    # Test AAPL analysis
    aapl = stocks["AAPL"]
    fin = get_sample_financials("AAPL")
    result = analyzer.analyze(aapl, fin)

    assert result is not None
    assert result.ticker == "AAPL"
    assert result.pe_ratio is not None
    assert result.moat_rating in ["弱", "中等", "强"]
    assert 1 <= result.risk_score <= 10
    assert result.bull_target > result.current_price
    assert result.bear_target < result.current_price
    assert result.entry_price_low < result.entry_price_high
    assert result.stop_loss < result.entry_price_low
    assert result.composite_score is not None
    assert result.recommendation is not None

    # Test all stocks can be analyzed
    for ticker, data in stocks.items():
        fin = get_sample_financials(ticker)
        r = analyzer.analyze(data, fin)
        assert r is not None, f"Analysis failed for {ticker}"
        assert r.composite_score is not None

    print("  [PASS] analyzer module")


def test_screener():
    """Test screening engine."""
    profile = InvestorProfile(
        risk_tolerance=RiskTolerance.MEDIUM_HIGH,
        target_annual_return_min=15.0,
        target_annual_return_max=20.0,
    )
    screener = StockScreener(profile)
    results = screener.run(max_results=10)

    assert len(results) > 0
    assert len(results) <= 10

    # Results should be sorted by composite score descending
    scores = [r.composite_score for r in results]
    assert scores == sorted(scores, reverse=True)

    # Top result should have highest score
    assert results[0].composite_score >= results[-1].composite_score

    # Check sector allocation
    sectors = screener.get_sector_allocation()
    assert len(sectors) > 0

    print("  [PASS] screener engine")


def test_report_generator():
    """Test report generation."""
    profile = InvestorProfile()
    screener = StockScreener(profile)
    results = screener.run(max_results=5)

    gen = ReportGenerator()
    report = gen.generate_full_report(
        results=results,
        profile=profile,
        sector_allocation=screener.get_sector_allocation(),
    )

    assert "GOLDMAN SACHS" in report
    assert "执行摘要" in report
    assert "市盈率" in report
    assert "收入增长" in report
    assert "债务权益比" in report
    assert "股息" in report
    assert "护城河" in report
    assert "目标价" in report
    assert "风险评级" in report
    assert "入场价格" in report
    assert "免责声明" in report

    # Test save
    filepath = gen.save_to_file(report, "test_report.txt")
    assert os.path.exists(filepath)
    os.remove(filepath)

    print("  [PASS] report generator")


if __name__ == "__main__":
    print("\n  Running Goldman Sachs Stock Screener Tests...")
    print("  " + "=" * 50)
    test_config()
    test_sample_data()
    test_analyzer()
    test_screener()
    test_report_generator()
    print("  " + "=" * 50)
    print("  All tests passed!\n")
