#!/usr/bin/env python3
"""
Goldman Sachs Style Stock Screening Tool - Web Application
===========================================================
Flask-based web interface for the equity screening system.
"""

import os
import sys
import json
import logging
from datetime import datetime

from flask import Flask, render_template, request, jsonify

sys.path.insert(0, os.path.dirname(__file__))

from src.config import InvestorProfile, RiskTolerance, STOCK_UNIVERSE, INDUSTRY_AVG_PE
from src.screener import StockScreener
from src.analyzer import StockAnalysis

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "gs-screener-2026")

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

RISK_MAP = {
    "low": RiskTolerance.LOW,
    "medium-low": RiskTolerance.MEDIUM_LOW,
    "medium": RiskTolerance.MEDIUM,
    "medium-high": RiskTolerance.MEDIUM_HIGH,
    "high": RiskTolerance.HIGH,
}

RISK_LABELS = {
    "low": "低",
    "medium-low": "中低",
    "medium": "中等",
    "medium-high": "中高",
    "high": "高",
}


def analysis_to_dict(a: StockAnalysis) -> dict:
    """Convert StockAnalysis dataclass to JSON-serializable dict."""
    return {
        "ticker": a.ticker,
        "name": a.name,
        "sector": a.sector,
        "industry": a.industry,
        "current_price": a.current_price,
        "market_cap_billions": round(a.market_cap_billions, 1) if a.market_cap_billions else None,
        "composite_score": a.composite_score,
        "recommendation": a.recommendation,
        # P/E
        "pe_ratio": round(a.pe_ratio, 1) if a.pe_ratio else None,
        "forward_pe": round(a.forward_pe, 1) if a.forward_pe else None,
        "industry_avg_pe": a.industry_avg_pe,
        "pe_vs_industry": a.pe_vs_industry,
        "pe_discount_pct": a.pe_discount_pct,
        # Growth
        "revenue_5y_cagr": a.revenue_5y_cagr,
        "revenue_trend": a.revenue_trend,
        "annual_revenues": a.annual_revenues,
        "revenue_years": a.revenue_years,
        # D/E
        "debt_to_equity": a.debt_to_equity,
        "de_health": a.de_health,
        "de_health_score": a.de_health_score,
        "current_ratio": round(a.current_ratio, 2) if a.current_ratio else None,
        # Dividend
        "dividend_yield": a.dividend_yield,
        "payout_ratio": a.payout_ratio,
        "dividend_sustainability": a.dividend_sustainability,
        "dividend_sustainability_score": a.dividend_sustainability_score,
        # Moat
        "moat_rating": a.moat_rating,
        "moat_score": a.moat_score,
        "moat_factors": a.moat_factors,
        # Targets
        "bull_target": a.bull_target,
        "bear_target": a.bear_target,
        "base_target": a.base_target,
        "upside_pct": a.upside_pct,
        "downside_pct": a.downside_pct,
        # Risk
        "risk_score": a.risk_score,
        "risk_rating": a.risk_rating,
        "risk_factors": a.risk_factors,
        # Entry/SL
        "entry_price_low": a.entry_price_low,
        "entry_price_high": a.entry_price_high,
        "stop_loss": a.stop_loss,
        "stop_loss_pct": a.stop_loss_pct,
        # Extra
        "beta": round(a.beta, 2) if a.beta else None,
        "roe": round(a.roe * 100, 1) if a.roe else None,
        "profit_margin": round(a.profit_margin * 100, 1) if a.profit_margin else None,
    }


@app.route("/")
def index():
    """Render the main page."""
    sectors = list(STOCK_UNIVERSE.keys())
    return render_template("index.html", sectors=sectors)


@app.route("/api/screen", methods=["POST"])
def api_screen():
    """Run the stock screening engine and return JSON results."""
    try:
        data = request.get_json()
        risk = data.get("risk", "medium-high")
        return_min = float(data.get("return_min", 15))
        return_max = float(data.get("return_max", 20))
        top = int(data.get("top", 15))
        sectors = data.get("sectors", [])
        horizon = int(data.get("horizon", 3))
        require_dividend = data.get("require_dividend", False)

        top = min(max(top, 1), 25)

        profile = InvestorProfile(
            risk_tolerance=RISK_MAP.get(risk, RiskTolerance.MEDIUM_HIGH),
            target_annual_return_min=return_min,
            target_annual_return_max=return_max,
            investment_horizon_years=horizon,
            preferred_sectors=sectors if sectors else [],
            require_dividend=require_dividend,
            max_positions=top,
        )

        screener = StockScreener(profile)
        results = screener.run(max_results=top)

        market_data = screener.fetcher.fetch_market_indices()
        sector_alloc = screener.get_sector_allocation()

        results_json = [analysis_to_dict(r) for r in results]

        now = datetime.now()
        return jsonify({
            "success": True,
            "report_id": f"GS-EQ-{now.strftime('%Y%m%d')}-{len(results):03d}",
            "report_date": now.strftime("%Y-%m-%d %H:%M"),
            "profile": {
                "risk": RISK_LABELS.get(risk, risk),
                "return_min": return_min,
                "return_max": return_max,
                "horizon": horizon,
            },
            "market_data": market_data,
            "sector_allocation": sector_alloc,
            "results": results_json,
            "summary": {
                "total": len(results_json),
                "avg_score": round(sum(r["composite_score"] or 0 for r in results_json) / max(len(results_json), 1), 1),
                "avg_risk": round(sum(r["risk_score"] or 0 for r in results_json) / max(len(results_json), 1), 1),
                "avg_upside": round(sum(r["upside_pct"] or 0 for r in results_json if r["upside_pct"]) / max(sum(1 for r in results_json if r.get("upside_pct")), 1), 1),
            },
        })

    except Exception as e:
        logger.error(f"Screening error: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/sectors")
def api_sectors():
    """Return available sectors."""
    return jsonify({"sectors": list(STOCK_UNIVERSE.keys())})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug)
