/**
 * Goldman Sachs Stock Screener - Client-Side Analysis Engine
 * Ports the Python analyzer/screener to pure JavaScript.
 */
const GSAnalyzer = {
    analyze(sd) {
        const a = {
            ticker: sd.ticker, name: sd.name, sector: sd.sector, industry: sd.industry,
            current_price: sd.current_price, market_cap_billions: sd.market_cap_billions,
            beta: sd.beta, roe: sd.roe, profit_margin: sd.profit_margin,
        };
        this._pe(a, sd);
        this._growth(a, sd);
        this._debtEquity(a, sd);
        this._dividend(a, sd);
        this._moat(a, sd);
        this._targets(a, sd);
        this._risk(a, sd);
        this._entry(a, sd);
        this._composite(a);
        return a;
    },

    _pe(a, sd) {
        a.pe_ratio = sd.pe_ratio; a.forward_pe = sd.forward_pe;
        const indPe = GS_CONFIG.INDUSTRY_AVG_PE[a.sector] || 20;
        a.industry_avg_pe = indPe;
        const eff = sd.pe_ratio || sd.forward_pe;
        if (eff && eff > 0 && indPe > 0) {
            const disc = ((indPe - eff) / indPe) * 100;
            a.pe_discount_pct = +disc.toFixed(1);
            a.pe_vs_industry = disc > 20 ? "显著低估" : disc > 5 ? "低估" : disc > -5 ? "合理估值" : disc > -20 ? "高估" : "显著高估";
        } else { a.pe_vs_industry = "N/A"; a.pe_discount_pct = 0; }
    },

    _growth(a, sd) {
        const fin = HISTORICAL_FINANCIALS[sd.ticker];
        if (fin && fin.annual_revenue && fin.annual_revenue.length >= 2) {
            const revs = fin.annual_revenue.filter(r => r != null && r > 0);
            const yrs = fin.years.slice(0, revs.length);
            a.revenue_years = yrs; a.annual_revenues = revs;
            const n = revs.length - 1;
            if (n > 0 && revs[0] > 0) {
                const cagr = (Math.pow(revs[n] / revs[0], 1 / n) - 1) * 100;
                a.revenue_5y_cagr = +cagr.toFixed(1);
                if (revs.length >= 3) {
                    const recent = (revs[revs.length-1]/revs[revs.length-2]-1)*100;
                    const earlier = (revs[1]/revs[0]-1)*100;
                    a.revenue_trend = recent > earlier+5 ? "加速增长" : recent > 0 && Math.abs(recent-earlier)<=5 ? "稳定增长" : recent > 0 ? "增速放缓" : "收入下滑";
                } else { a.revenue_trend = cagr > 0 ? "增长中" : "收入下滑"; }
                return;
            }
        }
        if (sd.revenue_growth != null) {
            const g = sd.revenue_growth * 100;
            a.revenue_5y_cagr = +g.toFixed(1);
            a.revenue_trend = g > 15 ? "高速增长" : g > 5 ? "稳定增长" : g > 0 ? "低速增长" : "收入下滑";
        } else { a.revenue_trend = "数据不足"; }
    },

    _debtEquity(a, sd) {
        let de = sd.debt_to_equity;
        if (de != null) {
            de = de > 10 ? de / 100 : de;
            a.debt_to_equity = +de.toFixed(2);
            if (de < 0.3) { a.de_health = "优秀"; a.de_health_score = 95; }
            else if (de < 0.6) { a.de_health = "健康"; a.de_health_score = 80; }
            else if (de < 1.0) { a.de_health = "适中"; a.de_health_score = 65; }
            else if (de < 1.5) { a.de_health = "偏高"; a.de_health_score = 45; }
            else if (de < 2.5) { a.de_health = "需关注"; a.de_health_score = 25; }
            else { a.de_health = "危险"; a.de_health_score = 10; }
        } else { a.de_health = "数据不足"; a.de_health_score = 50; }
        a.current_ratio = sd.current_ratio;
    },

    _dividend(a, sd) {
        a.dividend_yield = sd.dividend_yield ? +(sd.dividend_yield * 100).toFixed(2) : 0;
        const pr = sd.payout_ratio;
        if (pr != null) {
            a.payout_ratio = +(pr < 5 ? pr * 100 : pr).toFixed(1);
            const p = pr < 1 ? pr * 100 : pr;
            if (p < 0) { a.dividend_sustainability = "不可持续"; a.dividend_sustainability_score = 10; }
            else if (p < 30) { a.dividend_sustainability = "高度可持续"; a.dividend_sustainability_score = 95; }
            else if (p < 50) { a.dividend_sustainability = "可持续"; a.dividend_sustainability_score = 80; }
            else if (p < 70) { a.dividend_sustainability = "尚可"; a.dividend_sustainability_score = 60; }
            else if (p < 90) { a.dividend_sustainability = "有风险"; a.dividend_sustainability_score = 35; }
            else { a.dividend_sustainability = "不可持续"; a.dividend_sustainability_score = 15; }
        } else if (sd.dividend_yield) {
            a.dividend_sustainability = "数据不足"; a.dividend_sustainability_score = 50;
        } else { a.dividend_sustainability = "不派息"; a.dividend_sustainability_score = null; }
    },

    _moat(a, sd) {
        const scores = {};
        const mc = sd.market_cap_billions || 0;
        scores.brand_strength = mc > 500 ? 95 : mc > 100 ? 80 : mc > 50 ? 65 : mc > 10 ? 45 : 25;

        const gm = sd.gross_margin;
        if (gm) { const g = gm < 1 ? gm*100 : gm; scores.switching_costs = g > 70 ? 85 : g > 50 ? 70 : g > 35 ? 50 : 30; }
        else scores.switching_costs = 40;

        scores.network_effects = ({"Technology":80,"Communication Services":75,"Financials":60})[a.sector] || 30;

        const om = sd.operating_margin;
        if (om) { const o = om < 1 ? om*100 : om; scores.cost_advantage = o > 35 ? 90 : o > 20 ? 70 : o > 10 ? 50 : 25; }
        else scores.cost_advantage = 40;

        scores.intangible_assets = ({"Technology":80,"Healthcare":85,"Industrials":55})[a.sector] || 40;
        scores.market_dominance = mc > 200 ? 90 : mc > 50 ? 70 : mc > 20 ? 55 : 35;

        const pm = sd.profit_margin, roe = sd.roe;
        if (pm && roe) {
            const pv = pm < 1 ? pm*100 : pm, rv = roe < 1 ? roe*100 : roe;
            scores.margin_stability = (pv > 20 && rv > 20) ? 90 : (pv > 10 && rv > 15) ? 70 : (pv > 5 && rv > 10) ? 50 : 30;
        } else scores.margin_stability = 40;

        const W = GS_CONFIG.MOAT_WEIGHTS;
        let total = 0; for (const k in W) total += (scores[k] || 0) * W[k];
        a.moat_score = +total.toFixed(1); a.moat_factors = scores;
        a.moat_rating = total >= 75 ? "强" : total >= 50 ? "中等" : "弱";
    },

    _targets(a, sd) {
        const p = sd.current_price;
        const h = sd.target_high_price, l = sd.target_low_price, m = sd.target_mean_price;
        if (h && l && p > 0) {
            a.bull_target = +h.toFixed(2); a.bear_target = +l.toFixed(2);
            a.base_target = m ? +m.toFixed(2) : +((h+l)/2).toFixed(2);
            a.upside_pct = +(((h-p)/p)*100).toFixed(1);
            a.downside_pct = +(((l-p)/p)*100).toFixed(1);
        } else if (p > 0) {
            const g = Math.max(sd.revenue_growth || 0, 0.05);
            const b = sd.beta || 1;
            a.bull_target = +(p * (1 + g + 0.05)).toFixed(2);
            a.bear_target = +(p * Math.max(1 - b * 0.15, 0.7)).toFixed(2);
            a.base_target = +(p * (1 + Math.max(sd.revenue_growth || 0, 0.02))).toFixed(2);
            a.upside_pct = +(((a.bull_target-p)/p)*100).toFixed(1);
            a.downside_pct = +(((a.bear_target-p)/p)*100).toFixed(1);
        }
    },

    _risk(a, sd) {
        let rp = 0; const factors = [];
        const beta = sd.beta || 1;
        if (beta > 1.5) { rp += 2; factors.push(`高Beta值 (${beta.toFixed(2)})，股价波动大`); }
        else if (beta > 1.2) { rp += 1.5; factors.push(`Beta值偏高 (${beta.toFixed(2)})`); }
        else if (beta > 1) rp += 1;
        else if (beta < 0.7) factors.push(`低Beta值 (${beta.toFixed(2)})，防御性强`);

        const pe = sd.pe_ratio || sd.forward_pe;
        if (pe) {
            if (pe > 50) { rp += 2; factors.push(`估值极高 (P/E: ${pe.toFixed(1)})`); }
            else if (pe > 35) { rp += 1.5; factors.push(`估值偏高 (P/E: ${pe.toFixed(1)})`); }
            else if (pe > 25) rp += 1;
            else if (pe < 10 && pe > 0) { rp += 0.5; factors.push("极低P/E可能反映盈利下滑风险"); }
        }

        const de = a.debt_to_equity;
        if (de != null) {
            if (de > 2) { rp += 2; factors.push(`债务水平极高 (D/E: ${de.toFixed(2)})`); }
            else if (de > 1.5) { rp += 1.5; factors.push(`债务水平偏高 (D/E: ${de.toFixed(2)})`); }
            else if (de > 1) rp += 1;
            else if (de < 0.3) factors.push("低负债，财务稳健");
        }

        const rg = sd.revenue_growth;
        if (rg != null) {
            if (rg < -0.05) { rp += 1.5; factors.push("收入同比下降，增长前景存疑"); }
            else if (rg < 0) { rp += 1; factors.push("收入增长放缓"); }
        }

        const h52 = sd["52_week_high"] || 0, p = sd.current_price;
        if (h52 > 0 && p > 0) {
            const pctH = ((h52-p)/h52)*100;
            if (pctH < 5) { rp += 1; factors.push("接近52周高点，追高风险"); }
            else if (pctH > 30) factors.push(`较52周高点回撤${pctH.toFixed(0)}%`);
        }

        const mc = sd.market_cap_billions || 0;
        if (mc < 5) { rp += 1; factors.push("中小市值，流动性风险较高"); }
        else if (mc < 10) rp += 0.5;

        a.risk_score = +Math.max(1, Math.min(10, rp)).toFixed(1);
        a.risk_rating = a.risk_score <= 3 ? "低风险" : a.risk_score <= 5 ? "中等风险" : a.risk_score <= 7 ? "中高风险" : "高风险";
        a.risk_factors = factors.length ? factors : ["总体风险特征均衡"];
    },

    _entry(a, sd) {
        const p = sd.current_price; if (!p) return;
        const supports = [sd["52_week_low"], sd["200_day_avg"], sd["50_day_avg"], a.bear_target].filter(v => v && v > 0);
        let lo, hi;
        if (supports.length) {
            lo = Math.max(Math.min(...supports), p * 0.9); hi = p * 0.98;
            if (lo >= hi) { lo = p * 0.92; hi = p * 0.98; }
        } else { lo = p * 0.92; hi = p * 0.98; }
        a.entry_price_low = +lo.toFixed(2); a.entry_price_high = +hi.toFixed(2);
        const risk = a.risk_score || 5;
        const slPct = risk <= 3 ? 8 : risk <= 5 ? 10 : risk <= 7 ? 12 : 15;
        a.stop_loss_pct = slPct;
        a.stop_loss = +(lo * (1 - slPct / 100)).toFixed(2);
    },

    _composite(a) {
        let s = 50;
        if (a.pe_discount_pct != null) s += Math.min(Math.max(a.pe_discount_pct / 2, -15), 15);
        if (a.revenue_5y_cagr != null) s += Math.min(Math.max(a.revenue_5y_cagr / 2, -10), 15);
        if (a.de_health_score != null) s += Math.min(Math.max((a.de_health_score - 50) / 5, -10), 10);
        if (a.moat_score != null) s += Math.min(Math.max((a.moat_score - 50) / 5, -10), 10);
        if (a.risk_score != null) s += Math.min(Math.max((5 - a.risk_score) * 1.5, -10), 10);
        if (a.upside_pct != null) s += Math.min(Math.max(a.upside_pct / 5, -5), 10);
        if (a.dividend_yield > 1.5 && a.dividend_sustainability_score > 60) s += Math.min(a.dividend_yield, 5);
        if (a.roe) { const r = a.roe < 1 ? a.roe*100 : a.roe; if (r > 20) s += 5; else if (r > 15) s += 3; }
        a.composite_score = +Math.min(Math.max(s, 0), 100).toFixed(1);
        a.recommendation = s >= 75 ? "强烈推荐买入" : s >= 65 ? "推荐买入" : s >= 55 ? "建议关注" : s >= 45 ? "中性/持有" : s >= 35 ? "谨慎观望" : "不推荐";
    },
};

function runScreening(opts) {
    return runScreeningWithData(SAMPLE_STOCKS, opts);
}

function runScreeningWithData(stockData, opts) {
    const params = GS_CONFIG.RISK_PARAMS[opts.risk] || GS_CONFIG.RISK_PARAMS["medium-high"];
    const stocks = Object.values(stockData);

    // Filter by sector if specified
    let universe = opts.sectors && opts.sectors.length
        ? stocks.filter(s => opts.sectors.includes(s.sector))
        : stocks;

    // Analyze and attach source metadata
    let results = universe.map(sd => {
        const a = GSAnalyzer.analyze(sd);
        if (a) {
            a._source = sd; // Attach source data for live/cached/sample badge
        }
        return a;
    }).filter(Boolean);

    // Apply filters
    results = results.filter(a => {
        if (a.market_cap_billions && a.market_cap_billions < params.min_mcap) return false;
        if (a.pe_ratio != null) { if (a.pe_ratio < params.min_pe || a.pe_ratio > params.max_pe || a.pe_ratio < 0) return false; }
        if (a.debt_to_equity != null && a.debt_to_equity > params.max_de) return false;
        if (a.beta != null && a.beta > params.max_beta) return false;
        if (params.min_div > 0 && (!a.dividend_yield || a.dividend_yield < params.min_div)) return false;
        if (opts.require_dividend && (!a.dividend_yield || a.dividend_yield <= 0)) return false;
        if (a.composite_score != null && a.composite_score < 30) return false;
        return true;
    });

    results.sort((a, b) => (b.composite_score || 0) - (a.composite_score || 0));
    return results.slice(0, opts.top || 15);
}
