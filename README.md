# Goldman Sachs Style Stock Screening Tool

A professional-grade equity screening and analysis system with both CLI and Web interfaces.

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
```

### Web Application (Online Version)

```bash
# Start the web server
python app.py

# Open in browser: http://localhost:5000
```

### Command Line Interface

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

## Web Interface Screenshots

The web interface features a professional Goldman Sachs dark theme with:
- Interactive investor profile configuration
- Real-time screening with animated progress
- 8 tabbed analysis views (P/E, Growth, Debt, Dividend, Moat, Targets, Risk, Entry/SL)
- Click any stock row to view detailed individual analysis
- Sector allocation visualization
- Fully responsive design for mobile/tablet

## Deploy to Cloud

### Render (Recommended)

1. Fork this repository
2. Go to [render.com](https://render.com) and create a new Web Service
3. Connect your GitHub repo
4. Render will auto-detect `render.yaml` and deploy

### Heroku

```bash
heroku create your-app-name
git push heroku main
```

### Docker

```bash
docker build -t goldman-screener .
docker run -p 5000:5000 goldman-screener
```

## CLI Options

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
app.py                # Flask web application entry point
main.py               # CLI entry point
src/
  config.py           # Investor profiles, stock universe, screening parameters
  data_fetcher.py     # Yahoo Finance API + auto-fallback to sample data
  sample_data.py      # Built-in market data for offline environments
  analyzer.py         # Core analysis engine (P/E, growth, D/E, moat, risk)
  screener.py         # Filtering and ranking engine
  report_generator.py # Professional report formatting (CLI)
static/
  css/style.css       # Goldman Sachs dark theme
  js/app.js           # Frontend application logic
templates/
  index.html          # Web interface template
tests/
  test_screener.py    # Unit tests
Procfile              # Heroku/Render deployment
render.yaml           # Render auto-deploy config
```

## Running Tests

```bash
python tests/test_screener.py
```

## Disclaimer

This tool is for educational and informational purposes only. It does not constitute investment advice. All data is sourced from public market information. Past performance is not indicative of future results.
