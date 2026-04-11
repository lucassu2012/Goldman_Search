/**
 * Goldman Sachs Stock Screener - Client-Side Analysis Engine
 * Enhanced with OpenBB-inspired analysis modules:
 * Technical, Valuation, Quality, Cash Flow, Analyst Consensus
 */
const GSAnalyzer = {
    analyze(sd) {
        const a = {
            ticker: sd.ticker, name: sd.name, sector: sd.sector, industry: sd.industry,
            current_price: sd.current_price, market_cap_billions: sd.market_cap_billions,
            beta: sd.beta, roe: sd.roe, roa: sd.roa, roic: sd.roic,
            profit_margin: sd.profit_margin, operating_margin: sd.operating_margin,
            gross_margin: sd.gross_margin,
        };
        this._pe(a, sd);
        this._growth(a, sd);
        this._debtEquity(a, sd);
        this._dividend(a, sd);
        this._moat(a, sd);
        this._targets(a, sd);
        this._risk(a, sd);
        this._entry(a, sd);
        // New OpenBB-inspired modules
        this._technical(a, sd);
        this._valuation(a, sd);
        this._quality(a, sd);
        this._cashflow(a, sd);
        this._analyst(a, sd);
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
        // Use FinnHub multi-year growth rates when available
        a.revenue_growth_3y = sd.revenue_growth_3y != null ? +(sd.revenue_growth_3y * 100).toFixed(1) : null;
        a.revenue_growth_5y_api = sd.revenue_growth_5y != null ? +(sd.revenue_growth_5y * 100).toFixed(1) : null;
        a.eps_growth_3y = sd.eps_growth_3y != null ? +(sd.eps_growth_3y * 100).toFixed(1) : null;
        a.eps_growth_5y = sd.eps_growth_5y != null ? +(sd.eps_growth_5y * 100).toFixed(1) : null;

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
        // Fallback to API growth
        if (a.revenue_growth_5y_api != null) {
            a.revenue_5y_cagr = a.revenue_growth_5y_api;
            a.revenue_trend = a.revenue_5y_cagr > 15 ? "高速增长" : a.revenue_5y_cagr > 5 ? "稳定增长" : a.revenue_5y_cagr > 0 ? "低速增长" : "收入下滑";
        } else if (sd.revenue_growth != null) {
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
        a.quick_ratio = sd.quick_ratio;
        a.interest_coverage = sd.interest_coverage;
    },

    _dividend(a, sd) {
        a.dividend_yield = sd.dividend_yield ? +(sd.dividend_yield * 100).toFixed(2) : 0;
        a.dividend_growth_5y = sd.dividend_growth_5y != null ? +(sd.dividend_growth_5y * 100).toFixed(1) : null;
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

    // ═══════════════════════════════════════════════════════════
    // OpenBB-Inspired Advanced Analysis Modules
    // ═══════════════════════════════════════════════════════════

    /**
     * Technical Analysis: MA signals, price position, momentum
     */
    _technical(a, sd) {
        const p = sd.current_price;
        const ma50 = sd["50_day_avg"];
        const ma200 = sd["200_day_avg"];
        const h52 = sd["52_week_high"];
        const l52 = sd["52_week_low"];

        a.ma50 = ma50; a.ma200 = ma200;
        const signals = [];
        let score = 50;

        // MA Cross signals
        if (ma50 && ma200) {
            if (ma50 > ma200) {
                a.ma_cross = "金叉 (Golden Cross)";
                score += 10;
                signals.push("50日均线在200日上方，中期趋势看涨");
            } else {
                a.ma_cross = "死叉 (Death Cross)";
                score -= 10;
                signals.push("50日均线在200日下方，中期趋势看跌");
            }
        } else { a.ma_cross = "N/A"; }

        // Price vs MAs
        if (p && ma50) {
            const pctAbove50 = ((p - ma50) / ma50) * 100;
            a.price_vs_ma50 = +pctAbove50.toFixed(1);
            if (pctAbove50 > 5) { score += 5; signals.push("股价高于50日均线，短期动能强"); }
            else if (pctAbove50 < -5) { score -= 5; signals.push("股价低于50日均线，短期承压"); }
        }
        if (p && ma200) {
            const pctAbove200 = ((p - ma200) / ma200) * 100;
            a.price_vs_ma200 = +pctAbove200.toFixed(1);
            if (pctAbove200 > 10) { score += 5; }
            else if (pctAbove200 < -10) { score -= 5; }
        }

        // 52-week position (0-100%, higher = closer to 52w high)
        if (h52 && l52 && h52 > l52 && p) {
            const pos = ((p - l52) / (h52 - l52)) * 100;
            a.price_position_52w = +pos.toFixed(1);
            if (pos > 90) { signals.push("接近52周高点 (追高风险)"); score -= 3; }
            else if (pos > 70) { signals.push("处于52周高位区间"); score += 3; }
            else if (pos < 20) { signals.push("处于52周低位区间 (可能超卖)"); score += 5; }
            else if (pos < 40) { signals.push("处于52周中低区间"); }
        }

        // Volatility: 52w range spread
        if (h52 && l52 && l52 > 0) {
            a.volatility_52w = +((h52 - l52) / l52 * 100).toFixed(1);
        }

        // Volume trend
        if (sd.avg_vol_10d && sd.avg_vol_3m && sd.avg_vol_3m > 0) {
            const volRatio = sd.avg_vol_10d / sd.avg_vol_3m;
            a.volume_ratio = +volRatio.toFixed(2);
            if (volRatio > 1.5) { signals.push("近期成交量放大，关注度提升"); score += 2; }
            else if (volRatio < 0.6) { signals.push("近期成交量萎缩"); score -= 2; }
        }

        a.technical_score = +Math.max(0, Math.min(100, score)).toFixed(1);
        a.technical_signal = score >= 65 ? "看涨" : score >= 55 ? "偏多" : score >= 45 ? "中性" : score >= 35 ? "偏空" : "看跌";
        a.technical_signals = signals.length ? signals : ["技术面信号均衡"];
    },

    /**
     * Advanced Valuation: P/B, P/S, PEG, EV/EBITDA, Fair Value
     */
    _valuation(a, sd) {
        a.pb_ratio = sd.pb_ratio || null;
        a.ps_ratio = sd.ps_ratio || null;
        a.pfcf_ratio = sd.pfcf_ratio || null;
        a.ev_ebitda = sd.ev_ebitda || null;
        a.eps_ttm = sd.eps_ttm || null;

        // PEG ratio: P/E / EPS growth rate
        const pe = sd.pe_ratio || sd.forward_pe;
        const eg = sd.earnings_growth || sd.eps_growth_5y;
        if (pe && pe > 0 && eg && eg > 0) {
            a.peg_ratio = +(pe / (eg * 100)).toFixed(2);
        } else { a.peg_ratio = null; }

        // Valuation scoring
        let score = 50;
        const indAvg = GS_CONFIG.INDUSTRY_AVG_PE[a.sector] || 20;

        // P/E component
        if (pe && pe > 0) {
            if (pe < indAvg * 0.7) score += 10;
            else if (pe < indAvg) score += 5;
            else if (pe > indAvg * 1.5) score -= 10;
            else if (pe > indAvg * 1.2) score -= 5;
        }
        // P/B - below 3 is generally reasonable
        if (a.pb_ratio != null) {
            if (a.pb_ratio < 1) score += 8;
            else if (a.pb_ratio < 3) score += 4;
            else if (a.pb_ratio > 10) score -= 8;
            else if (a.pb_ratio > 5) score -= 4;
        }
        // PEG - below 1 is attractive
        if (a.peg_ratio != null) {
            if (a.peg_ratio < 0.5) score += 10;
            else if (a.peg_ratio < 1) score += 6;
            else if (a.peg_ratio < 1.5) score += 2;
            else if (a.peg_ratio > 3) score -= 8;
            else if (a.peg_ratio > 2) score -= 4;
        }
        // EV/EBITDA - sector-dependent, <12 generally good
        if (a.ev_ebitda != null && a.ev_ebitda > 0) {
            if (a.ev_ebitda < 8) score += 8;
            else if (a.ev_ebitda < 15) score += 3;
            else if (a.ev_ebitda > 30) score -= 8;
            else if (a.ev_ebitda > 20) score -= 4;
        }

        a.valuation_score = +Math.max(0, Math.min(100, score)).toFixed(1);
        a.valuation_rating = score >= 70 ? "低估" : score >= 55 ? "合理偏低" : score >= 45 ? "合理" : score >= 35 ? "偏高" : "高估";

        // Fair value estimation (earnings-based + growth-adjusted)
        if (sd.eps_ttm && sd.eps_ttm > 0 && pe && pe > 0) {
            const growthAdj = eg ? Math.min(Math.max(eg * 100, 0), 30) : 5;
            const fairPE = Math.min(indAvg * (1 + growthAdj / 100), indAvg * 1.5);
            a.fair_value = +(sd.eps_ttm * fairPE).toFixed(2);
            if (sd.current_price > 0) {
                a.fair_value_gap = +(((a.fair_value - sd.current_price) / sd.current_price) * 100).toFixed(1);
            }
        }
    },

    /**
     * Quality Score: Profitability, financial strength, growth consistency
     */
    _quality(a, sd) {
        let score = 0;
        let count = 0;
        const details = {};

        // Profitability (max 35 pts)
        let profitScore = 0;
        const roe = sd.roe ? (sd.roe < 1 ? sd.roe * 100 : sd.roe) : null;
        if (roe != null) {
            profitScore += roe > 25 ? 12 : roe > 15 ? 9 : roe > 10 ? 6 : roe > 0 ? 3 : 0;
            count++;
        }
        const roa = sd.roa ? (sd.roa < 1 ? sd.roa * 100 : sd.roa) : null;
        if (roa != null) {
            profitScore += roa > 15 ? 8 : roa > 8 ? 6 : roa > 4 ? 4 : roa > 0 ? 2 : 0;
            count++;
        }
        const gm = sd.gross_margin ? (sd.gross_margin < 1 ? sd.gross_margin * 100 : sd.gross_margin) : null;
        if (gm != null) {
            profitScore += gm > 60 ? 8 : gm > 40 ? 6 : gm > 25 ? 4 : gm > 10 ? 2 : 0;
            count++;
        }
        const npm = sd.profit_margin ? (sd.profit_margin < 1 ? sd.profit_margin * 100 : sd.profit_margin) : null;
        if (npm != null) {
            profitScore += npm > 25 ? 7 : npm > 15 ? 5 : npm > 8 ? 3 : npm > 0 ? 1 : 0;
            count++;
        }
        details.profitability = Math.min(profitScore, 35);
        score += details.profitability;

        // Financial Strength (max 30 pts)
        let finScore = 0;
        const de = sd.debt_to_equity;
        if (de != null) {
            const d = de > 10 ? de / 100 : de;
            finScore += d < 0.3 ? 10 : d < 0.7 ? 7 : d < 1.2 ? 4 : d < 2 ? 2 : 0;
            count++;
        }
        const cr = sd.current_ratio;
        if (cr != null) {
            finScore += cr > 2 ? 8 : cr > 1.5 ? 6 : cr > 1 ? 4 : cr > 0.7 ? 2 : 0;
            count++;
        }
        const ic = sd.interest_coverage;
        if (ic != null) {
            finScore += ic > 10 ? 7 : ic > 5 ? 5 : ic > 2 ? 3 : ic > 1 ? 1 : 0;
            count++;
        }
        const roic = sd.roic ? (sd.roic < 1 ? sd.roic * 100 : sd.roic) : null;
        if (roic != null) {
            finScore += roic > 20 ? 5 : roic > 12 ? 4 : roic > 8 ? 2 : 1;
            count++;
        }
        details.financial_strength = Math.min(finScore, 30);
        score += details.financial_strength;

        // Growth Consistency (max 35 pts)
        let growthScore = 0;
        const rg = sd.revenue_growth != null ? sd.revenue_growth * 100 : null;
        if (rg != null) {
            growthScore += rg > 20 ? 10 : rg > 10 ? 7 : rg > 5 ? 5 : rg > 0 ? 3 : 0;
            count++;
        }
        const epsg = sd.earnings_growth != null ? sd.earnings_growth * 100 : null;
        if (epsg != null) {
            growthScore += epsg > 25 ? 10 : epsg > 15 ? 7 : epsg > 5 ? 5 : epsg > 0 ? 3 : 0;
            count++;
        }
        const rg5y = sd.revenue_growth_5y != null ? sd.revenue_growth_5y * 100 : null;
        if (rg5y != null) {
            growthScore += rg5y > 15 ? 8 : rg5y > 8 ? 6 : rg5y > 3 ? 4 : rg5y > 0 ? 2 : 0;
            count++;
        }
        const fcfg = sd.fcf_cagr_5y != null ? sd.fcf_cagr_5y * 100 : null;
        if (fcfg != null) {
            growthScore += fcfg > 15 ? 7 : fcfg > 8 ? 5 : fcfg > 0 ? 3 : 0;
            count++;
        }
        details.growth_consistency = Math.min(growthScore, 35);
        score += details.growth_consistency;

        a.quality_score = +Math.min(score, 100).toFixed(1);
        a.quality_details = details;
        a.quality_rating = score >= 75 ? "优秀" : score >= 55 ? "良好" : score >= 35 ? "一般" : "较差";
    },

    /**
     * Cash Flow Analysis: FCF yield, margins, growth
     */
    _cashflow(a, sd) {
        a.fcf_margin = sd.fcf_margin != null ? +(sd.fcf_margin * 100).toFixed(1) : null;
        a.fcf_per_share = sd.fcf_per_share || null;
        a.fcf_cagr_5y = sd.fcf_cagr_5y != null ? +(sd.fcf_cagr_5y * 100).toFixed(1) : null;
        a.cash_per_share = sd.cash_per_share || null;

        // FCF yield = FCF per share / price * 100
        if (sd.fcf_per_share && sd.current_price > 0) {
            a.fcf_yield = +((sd.fcf_per_share / sd.current_price) * 100).toFixed(2);
        } else if (sd.pfcf_ratio && sd.pfcf_ratio > 0) {
            a.fcf_yield = +(1 / sd.pfcf_ratio * 100).toFixed(2);
        } else {
            a.fcf_yield = null;
        }

        // Cash flow health score
        let score = 50;
        if (a.fcf_yield != null) {
            if (a.fcf_yield > 8) score += 15;
            else if (a.fcf_yield > 5) score += 10;
            else if (a.fcf_yield > 3) score += 5;
            else if (a.fcf_yield < 0) score -= 15;
        }
        if (a.fcf_margin != null) {
            if (a.fcf_margin > 25) score += 12;
            else if (a.fcf_margin > 15) score += 8;
            else if (a.fcf_margin > 5) score += 3;
            else if (a.fcf_margin < 0) score -= 10;
        }
        if (a.fcf_cagr_5y != null) {
            if (a.fcf_cagr_5y > 15) score += 10;
            else if (a.fcf_cagr_5y > 5) score += 5;
            else if (a.fcf_cagr_5y < -5) score -= 10;
        }
        if (a.cash_per_share && sd.current_price > 0) {
            const cashPct = (a.cash_per_share / sd.current_price) * 100;
            if (cashPct > 20) score += 5;
            else if (cashPct > 10) score += 3;
        }

        a.cashflow_score = +Math.max(0, Math.min(100, score)).toFixed(1);
        a.cashflow_rating = score >= 70 ? "强劲" : score >= 55 ? "健康" : score >= 40 ? "一般" : "疲弱";
    },

    /**
     * Analyst Consensus from FinnHub recommendation trends
     */
    _analyst(a, sd) {
        const buy = (sd.analyst_strong_buy || 0) + (sd.analyst_buy || 0);
        const hold = sd.analyst_hold || 0;
        const sell = (sd.analyst_sell || 0) + (sd.analyst_strong_sell || 0);
        const total = buy + hold + sell;

        if (total > 0) {
            a.analyst_total = total;
            a.analyst_buy = buy;
            a.analyst_hold = hold;
            a.analyst_sell = sell;
            a.analyst_strong_buy = sd.analyst_strong_buy || 0;
            a.analyst_strong_sell = sd.analyst_strong_sell || 0;
            a.analyst_buy_pct = +((buy / total) * 100).toFixed(0);
            a.analyst_hold_pct = +((hold / total) * 100).toFixed(0);
            a.analyst_sell_pct = +((sell / total) * 100).toFixed(0);

            // Consensus score (0-100)
            const weightedScore = ((sd.analyst_strong_buy || 0) * 100 + (sd.analyst_buy || 0) * 75 +
                hold * 50 + (sd.analyst_sell || 0) * 25 + (sd.analyst_strong_sell || 0) * 0) / total;
            a.analyst_score = +weightedScore.toFixed(1);
            a.analyst_consensus = weightedScore >= 75 ? "强烈买入" : weightedScore >= 60 ? "买入" :
                weightedScore >= 45 ? "持有" : weightedScore >= 30 ? "减持" : "卖出";
            a.analyst_period = sd.analyst_period || null;
        } else {
            a.analyst_total = 0;
            a.analyst_consensus = "无数据";
            a.analyst_score = null;
        }
    },

    /**
     * Enhanced Composite Score incorporating all modules
     */
    _composite(a) {
        let s = 50;
        // Original factors
        if (a.pe_discount_pct != null) s += Math.min(Math.max(a.pe_discount_pct / 2, -15), 15);
        if (a.revenue_5y_cagr != null) s += Math.min(Math.max(a.revenue_5y_cagr / 2, -10), 15);
        if (a.de_health_score != null) s += Math.min(Math.max((a.de_health_score - 50) / 5, -10), 10);
        if (a.moat_score != null) s += Math.min(Math.max((a.moat_score - 50) / 5, -10), 10);
        if (a.risk_score != null) s += Math.min(Math.max((5 - a.risk_score) * 1.5, -10), 10);
        if (a.upside_pct != null) s += Math.min(Math.max(a.upside_pct / 5, -5), 10);
        if (a.dividend_yield > 1.5 && a.dividend_sustainability_score > 60) s += Math.min(a.dividend_yield, 5);
        if (a.roe) { const r = a.roe < 1 ? a.roe*100 : a.roe; if (r > 20) s += 5; else if (r > 15) s += 3; }

        // New factors from advanced modules
        if (a.technical_score != null) s += Math.min(Math.max((a.technical_score - 50) / 6, -6), 6);
        if (a.valuation_score != null) s += Math.min(Math.max((a.valuation_score - 50) / 6, -6), 6);
        if (a.quality_score != null) s += Math.min(Math.max((a.quality_score - 50) / 6, -6), 6);
        if (a.cashflow_score != null) s += Math.min(Math.max((a.cashflow_score - 50) / 6, -6), 6);
        if (a.analyst_score != null) s += Math.min(Math.max((a.analyst_score - 50) / 8, -5), 5);

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

    let universe = opts.sectors && opts.sectors.length
        ? stocks.filter(s => opts.sectors.includes(s.sector))
        : stocks;

    let results = universe.map(sd => {
        const a = GSAnalyzer.analyze(sd);
        if (a) { a._source = sd; }
        return a;
    }).filter(Boolean);

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
