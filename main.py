#!/usr/bin/env python3
"""
===============================================================================
  Goldman Sachs Style Stock Screening Tool
  =========================================
  A professional-grade equity screening and analysis system.

  Features:
  - Real-time market data via Yahoo Finance
  - P/E ratio analysis vs industry averages
  - 5-year revenue growth trend analysis
  - Debt/Equity health scoring
  - Dividend sustainability assessment
  - Competitive moat (economic advantage) rating
  - 12-month bull/bear price targets
  - Risk scoring (1-10) with detailed rationale
  - Entry price ranges and stop-loss recommendations
  - Professional research report generation

  Usage:
    python main.py                         # Run with default profile (medium-high risk, 15-20% target)
    python main.py --risk medium           # Override risk tolerance
    python main.py --return-min 10 --return-max 15  # Custom return targets
    python main.py --sectors Technology Healthcare   # Focus on specific sectors
    python main.py --top 20               # Show top 20 results
    python main.py --save                  # Save report to file
    python main.py --quick                 # Quick scan (fewer stocks)
===============================================================================
"""

import sys
import os
import argparse
import logging
import time

# Add project root to path
sys.path.insert(0, os.path.dirname(__file__))

from src.config import InvestorProfile, RiskTolerance
from src.screener import StockScreener
from src.report_generator import ReportGenerator


def setup_logging(verbose: bool = False):
    level = logging.DEBUG if verbose else logging.WARNING
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )


def parse_args():
    parser = argparse.ArgumentParser(
        description="Goldman Sachs Style Stock Screening Tool",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python main.py                              # Default: medium-high risk, 15-20% target
  python main.py --risk high --top 20         # High risk, top 20 results
  python main.py --risk medium --return-min 10 --return-max 15
  python main.py --sectors Technology Healthcare Financials
  python main.py --save --verbose             # Save report and show debug logs
        """,
    )

    parser.add_argument(
        "--risk",
        type=str,
        choices=["low", "medium-low", "medium", "medium-high", "high"],
        default="medium-high",
        help="Risk tolerance level (default: medium-high)",
    )
    parser.add_argument(
        "--return-min",
        type=float,
        default=15.0,
        help="Minimum target annual return %% (default: 15)",
    )
    parser.add_argument(
        "--return-max",
        type=float,
        default=20.0,
        help="Maximum target annual return %% (default: 20)",
    )
    parser.add_argument(
        "--sectors",
        nargs="+",
        default=None,
        help="Focus on specific sectors (e.g., Technology Healthcare)",
    )
    parser.add_argument(
        "--top",
        type=int,
        default=15,
        help="Number of top stocks to show (default: 15)",
    )
    parser.add_argument(
        "--horizon",
        type=int,
        default=3,
        help="Investment horizon in years (default: 3)",
    )
    parser.add_argument(
        "--require-dividend",
        action="store_true",
        help="Only include dividend-paying stocks",
    )
    parser.add_argument(
        "--save",
        action="store_true",
        help="Save report to file",
    )
    parser.add_argument(
        "--quick",
        action="store_true",
        help="Quick scan with reduced stock universe",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Show verbose/debug output",
    )

    return parser.parse_args()


RISK_MAP = {
    "low": RiskTolerance.LOW,
    "medium-low": RiskTolerance.MEDIUM_LOW,
    "medium": RiskTolerance.MEDIUM,
    "medium-high": RiskTolerance.MEDIUM_HIGH,
    "high": RiskTolerance.HIGH,
}


def print_progress(msg: str):
    """Print progress message with timestamp."""
    timestamp = time.strftime("%H:%M:%S")
    print(f"  [{timestamp}] {msg}")


def main():
    args = parse_args()
    setup_logging(args.verbose)

    # Build investor profile
    profile = InvestorProfile(
        risk_tolerance=RISK_MAP[args.risk],
        target_annual_return_min=args.return_min,
        target_annual_return_max=args.return_max,
        investment_horizon_years=args.horizon,
        preferred_sectors=args.sectors or [],
        require_dividend=args.require_dividend,
        max_positions=args.top,
    )

    # Banner
    print()
    print("=" * 70)
    print("   GOLDMAN SACHS 股票筛选工具 / EQUITY SCREENING TOOL")
    print("=" * 70)
    print()
    print(f"   风险承受能力:   {profile.risk_tolerance.value}")
    print(f"   目标年化收益:   {profile.target_annual_return_min:.0f}% - {profile.target_annual_return_max:.0f}%")
    print(f"   投资期限:       {profile.investment_horizon_years} 年")
    print(f"   最大持仓数:     {profile.max_positions}")
    if profile.preferred_sectors:
        print(f"   聚焦行业:       {', '.join(profile.preferred_sectors)}")
    if profile.require_dividend:
        print(f"   要求派息:       是")
    print()
    print("-" * 70)
    print()

    # Run screener
    start_time = time.time()
    screener = StockScreener(profile)

    if args.quick:
        max_results = min(args.top, 10)
    else:
        max_results = args.top

    results = screener.run(max_results=max_results, progress_callback=print_progress)

    elapsed = time.time() - start_time
    print()
    print(f"  分析完成，耗时 {elapsed:.1f} 秒")
    print()

    if not results:
        print("  未找到符合条件的股票。请尝试调整筛选参数。")
        print()
        return

    # Generate report
    report_gen = ReportGenerator()

    # Try to get market data (non-critical)
    market_data = None
    try:
        market_data = screener.fetcher.fetch_market_indices()
    except Exception:
        pass

    sector_alloc = screener.get_sector_allocation()

    report = report_gen.generate_full_report(
        results=results,
        profile=profile,
        sector_allocation=sector_alloc,
        market_data=market_data,
    )

    print(report)

    # Save to file if requested
    if args.save:
        filepath = report_gen.save_to_file(report)
        print(f"\n  报告已保存至: {filepath}")
        print()


if __name__ == "__main__":
    main()
