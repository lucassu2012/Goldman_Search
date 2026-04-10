"""
Goldman Sachs Style Stock Screener - Configuration Module
=========================================================
Defines investor profiles, screening universes, and analysis parameters.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class RiskTolerance(Enum):
    LOW = "低"
    MEDIUM_LOW = "中低"
    MEDIUM = "中等"
    MEDIUM_HIGH = "中高"
    HIGH = "高"


class MarketCap(Enum):
    MEGA = "mega"       # > $200B
    LARGE = "large"     # $10B - $200B
    MID = "mid"         # $2B - $10B
    SMALL = "small"     # $300M - $2B


@dataclass
class InvestorProfile:
    """Investor profile for personalized screening."""
    risk_tolerance: RiskTolerance = RiskTolerance.MEDIUM_HIGH
    target_annual_return_min: float = 15.0  # %
    target_annual_return_max: float = 20.0  # %
    investment_horizon_years: int = 3
    preferred_sectors: list = field(default_factory=list)
    excluded_sectors: list = field(default_factory=list)
    min_market_cap: MarketCap = MarketCap.MID
    require_dividend: bool = False
    max_positions: int = 15
    currency: str = "USD"


# Risk tolerance -> screening parameter mapping
RISK_PARAMETER_MAP = {
    RiskTolerance.LOW: {
        "max_pe_ratio": 20,
        "min_pe_ratio": 5,
        "max_debt_equity": 0.5,
        "min_dividend_yield": 2.5,
        "max_beta": 0.8,
        "min_market_cap_billions": 50,
        "preferred_sectors": ["Utilities", "Consumer Staples", "Healthcare"],
        "max_revenue_decline_years": 0,
    },
    RiskTolerance.MEDIUM_LOW: {
        "max_pe_ratio": 25,
        "min_pe_ratio": 5,
        "max_debt_equity": 0.8,
        "min_dividend_yield": 1.5,
        "max_beta": 1.0,
        "min_market_cap_billions": 20,
        "preferred_sectors": ["Healthcare", "Consumer Staples", "Industrials"],
        "max_revenue_decline_years": 1,
    },
    RiskTolerance.MEDIUM: {
        "max_pe_ratio": 30,
        "min_pe_ratio": 3,
        "max_debt_equity": 1.2,
        "min_dividend_yield": 0.5,
        "max_beta": 1.2,
        "min_market_cap_billions": 10,
        "preferred_sectors": ["Technology", "Healthcare", "Industrials", "Consumer Discretionary"],
        "max_revenue_decline_years": 1,
    },
    RiskTolerance.MEDIUM_HIGH: {
        "max_pe_ratio": 40,
        "min_pe_ratio": 2,
        "max_debt_equity": 1.8,
        "min_dividend_yield": 0.0,
        "max_beta": 1.5,
        "min_market_cap_billions": 5,
        "preferred_sectors": [
            "Technology", "Consumer Discretionary", "Communication Services",
            "Healthcare", "Industrials", "Financials"
        ],
        "max_revenue_decline_years": 2,
    },
    RiskTolerance.HIGH: {
        "max_pe_ratio": 80,
        "min_pe_ratio": 0,
        "max_debt_equity": 3.0,
        "min_dividend_yield": 0.0,
        "max_beta": 2.5,
        "min_market_cap_billions": 1,
        "preferred_sectors": [
            "Technology", "Consumer Discretionary", "Communication Services",
            "Energy", "Financials"
        ],
        "max_revenue_decline_years": 3,
    },
}


# Stock universe - curated list of high-quality, liquid stocks across sectors
# Grouped by sector for comprehensive screening
STOCK_UNIVERSE = {
    "Technology": [
        "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "AVGO", "ADBE",
        "CRM", "AMD", "INTC", "ORCL", "CSCO", "TXN", "QCOM", "NOW",
        "AMAT", "MU", "LRCX", "KLAC", "SNPS", "CDNS", "PANW", "CRWD",
    ],
    "Healthcare": [
        "UNH", "JNJ", "LLY", "PFE", "ABBV", "MRK", "TMO", "ABT",
        "DHR", "BMY", "AMGN", "MDT", "ISRG", "SYK", "GILD", "VRTX",
        "REGN", "ZTS", "BDX", "EW",
    ],
    "Financials": [
        "JPM", "V", "MA", "BAC", "WFC", "GS", "MS", "BLK",
        "SCHW", "AXP", "CB", "CME", "ICE", "PGR", "AON", "MMC",
    ],
    "Consumer Discretionary": [
        "TSLA", "HD", "MCD", "NKE", "SBUX", "LOW", "TJX", "BKNG",
        "CMG", "ORLY", "ROST", "DHI", "LEN", "YUM", "MAR", "HLT",
    ],
    "Consumer Staples": [
        "PG", "KO", "PEP", "COST", "WMT", "PM", "MO", "CL",
        "MDLZ", "KHC", "GIS", "SJM", "HSY", "STZ", "KDP",
    ],
    "Communication Services": [
        "GOOG", "DIS", "NFLX", "CMCSA", "T", "VZ", "TMUS", "CHTR",
        "EA", "TTWO", "MTCH",
    ],
    "Industrials": [
        "RTX", "HON", "UNP", "UPS", "CAT", "DE", "GE", "LMT",
        "BA", "MMM", "EMR", "ITW", "PH", "ROK", "ETN", "IR",
    ],
    "Energy": [
        "XOM", "CVX", "COP", "EOG", "SLB", "MPC", "PSX", "VLO",
        "PXD", "OXY", "HAL", "DVN",
    ],
    "Utilities": [
        "NEE", "DUK", "SO", "D", "AEP", "EXC", "SRE", "XEL",
        "ED", "WEC", "ES", "AWK",
    ],
    "Real Estate": [
        "PLD", "AMT", "CCI", "EQIX", "SPG", "PSA", "O", "WELL",
        "DLR", "AVB",
    ],
    "Materials": [
        "LIN", "APD", "SHW", "ECL", "FCX", "NEM", "NUE", "VMC",
        "MLM", "DD",
    ],
}


# Industry average P/E ratios for comparison
INDUSTRY_AVG_PE = {
    "Technology": 28.5,
    "Healthcare": 22.0,
    "Financials": 14.5,
    "Consumer Discretionary": 25.0,
    "Consumer Staples": 22.5,
    "Communication Services": 20.0,
    "Industrials": 21.0,
    "Energy": 12.5,
    "Utilities": 18.0,
    "Real Estate": 35.0,
    "Materials": 16.5,
}


# Moat assessment criteria weights
MOAT_WEIGHTS = {
    "brand_strength": 0.15,
    "switching_costs": 0.15,
    "network_effects": 0.15,
    "cost_advantage": 0.15,
    "intangible_assets": 0.10,
    "market_dominance": 0.15,
    "margin_stability": 0.15,
}


def get_screening_params(profile: InvestorProfile) -> dict:
    """Get screening parameters based on investor profile."""
    base_params = RISK_PARAMETER_MAP[profile.risk_tolerance].copy()

    if profile.preferred_sectors:
        base_params["preferred_sectors"] = profile.preferred_sectors

    if profile.excluded_sectors:
        base_params["preferred_sectors"] = [
            s for s in base_params["preferred_sectors"]
            if s not in profile.excluded_sectors
        ]

    return base_params


def get_stock_universe(sectors: Optional[list] = None) -> list:
    """Get stock tickers for specified sectors or all sectors."""
    if sectors:
        tickers = []
        for sector in sectors:
            tickers.extend(STOCK_UNIVERSE.get(sector, []))
        return tickers
    return [t for tickers in STOCK_UNIVERSE.values() for t in tickers]


def get_sector_for_ticker(ticker: str) -> str:
    """Look up which sector a ticker belongs to."""
    for sector, tickers in STOCK_UNIVERSE.items():
        if ticker in tickers:
            return sector
    return "Unknown"
