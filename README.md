# Goldman Sachs Style Stock Screening Tool

A professional-grade equity screening and analysis system that generates comprehensive research reports.

## Features

- **P/E Ratio Analysis** - Trailing/forward P/E with industry average comparison
- **5-Year Revenue Growth** - CAGR calculation and trend analysis (accelerating/stable/decelerating)
- **Debt/Equity Health Check** - D/E ratio scoring with health ratings
- **Dividend Sustainability** - Yield analysis and payout sustainability scoring
- **Competitive Moat Rating** - Multi-factor moat assessment (Weak/Moderate/Strong)
- **12-Month Price Targets** - Bull/bear/base case with upside/downside percentages
- **Risk Rating (1-10)** - Comprehensive risk scoring with specific factor explanations
- **Entry Price & Stop-Loss** - Technical support-based entry zones and risk-adjusted stop-loss levels
- **Professional Reports** - Goldman Sachs style research report format with summary tables
- **Auto-Fallback** - Seamlessly switches to built-in data when network is unavailable

## Quick Start

```bash
pip install -r requirements.txt
python main.py
```

## Usage

```bash
# Default: medium-high risk, 15-20% target return
python main.py

# Custom risk profile
python main.py --risk medium --return-min 10 --return-max 15

# Focus on specific sectors
python main.py --sectors Technology Healthcare Financials

# Show top 20 results and save report
python main.py --top 20 --save

# Quick scan mode
python main.py --quick
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--risk` | Risk tolerance (low/medium-low/medium/medium-high/high) | medium-high |
| `--return-min` | Minimum target annual return % | 15 |
| `--return-max` | Maximum target annual return % | 20 |
| `--sectors` | Focus on specific sectors | All |
| `--top` | Number of top stocks to show | 15 |
| `--horizon` | Investment horizon in years | 3 |
| `--require-dividend` | Only include dividend-paying stocks | No |
| `--save` | Save report to file | No |
| `--quick` | Quick scan with reduced universe | No |
| `--verbose` | Show debug output | No |

## Architecture

```
src/
  config.py           # Investor profiles, stock universe, screening parameters
  data_fetcher.py     # Yahoo Finance API + auto-fallback to sample data
  sample_data.py      # Built-in market data for offline environments
  analyzer.py         # Core analysis engine (P/E, growth, D/E, moat, risk)
  screener.py         # Filtering and ranking engine
  report_generator.py # Professional report formatting
main.py               # CLI entry point
tests/
  test_screener.py    # Unit tests
```

## Running Tests

```bash
python tests/test_screener.py
```
