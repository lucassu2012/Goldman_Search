/**
 * Goldman Sachs Stock Screener - GitHub Pages Frontend
 * Supports live data via FinnHub API with auto-refresh.
 */
(function () {
    "use strict";
    let selectedSectors = [];
    let currentResults = [];
    let _autoRefreshTimer = null;
    let _countdownTimer = null;
    let _lastScreenOpts = null;

    const $ = s => document.querySelector(s);
    const $$ = s => document.querySelectorAll(s);
    const fmt = (v, d=2) => v != null ? Number(v).toFixed(d) : "N/A";
    const fmtPct = v => v != null ? (v > 0 ? "+" : "") + Number(v).toFixed(1) + "%" : "N/A";
    const fmtPrice = v => v != null ? "$" + Number(v).toFixed(2) : "N/A";

    function scoreColor(s) {
        if (s >= 70) return "var(--gs-green)";
        if (s >= 55) return "var(--gs-blue)";
        if (s >= 40) return "var(--gs-yellow)";
        return "var(--gs-red)";
    }
    function recClass(r) {
        if (!r) return "rec-hold";
        if (r.includes("强烈")) return "rec-strong";
        if (r.includes("推荐买入")) return "rec-buy";
        if (r.includes("关注")) return "rec-hold";
        if (r.includes("谨慎")) return "rec-caution";
        if (r.includes("不推荐")) return "rec-sell";
        return "rec-hold";
    }
    function moatClass(r) { return r === "强" ? "moat-strong" : r === "中等" ? "moat-moderate" : "moat-weak"; }
    function makeScoreBar(score, max=100) {
        const pct = Math.min(Math.max((score/max)*100,0),100);
        return `<span class="score-bar">${fmt(score,1)} <span class="score-bar-bg"><span class="score-bar-fill" style="width:${pct}%;background:${scoreColor(score)}"></span></span></span>`;
    }
    function dataBadge(stock) {
        if (!stock) return "";
        if (stock._live) return '<span class="live-badge live">LIVE</span>';
        if (stock._cached) return '<span class="live-badge cached">CACHED</span>';
        return '<span class="live-badge sample">SAMPLE</span>';
    }
    function fmtTime(ts) {
        if (!ts) return "";
        const d = new Date(ts);
        return d.toLocaleTimeString("zh-CN", { hour:"2-digit", minute:"2-digit", second:"2-digit" });
    }

    // ─── Data Source Status ──────────────────────────────────
    function updateDataStatus() {
        const dot = $(".status-dot");
        const text = $("#dataStatusText");
        const timeEl = $("#lastUpdateTime");

        if (LiveData.hasApiKey()) {
            dot.className = "status-dot online";
            text.textContent = "实时模式 — FinnHub API 已连接";
        } else {
            dot.className = "status-dot offline";
            text.textContent = "离线模式 — 使用内置样本数据";
        }

        const lastUpdate = LiveData.getLastUpdateTime();
        if (lastUpdate) {
            timeEl.textContent = "最后更新: " + fmtTime(lastUpdate);
        }
    }

    // ─── API Key Management ──────────────────────────────────
    function initApiKey() {
        const input = $("#apiKeyInput");
        const saved = LiveData.getApiKey();
        if (saved) input.value = saved;
        updateDataStatus();
    }

    $("#saveKeyBtn").addEventListener("click", async () => {
        const key = $("#apiKeyInput").value.trim();
        const valEl = $("#keyValidation");

        if (!key) {
            LiveData.setApiKey("");
            valEl.className = "key-validation";
            valEl.textContent = "API Key 已清除，将使用样本数据";
            updateDataStatus();
            return;
        }

        valEl.className = "key-validation checking";
        valEl.textContent = "正在验证 API Key...";
        $(".status-dot").className = "status-dot loading";

        const valid = await LiveData.validateKey(key);
        if (valid) {
            LiveData.setApiKey(key);
            valEl.className = "key-validation valid";
            valEl.textContent = "API Key 验证成功！筛选时将使用实时数据。";
        } else {
            valEl.className = "key-validation invalid";
            valEl.textContent = "API Key 无效或网络错误，请检查后重试。";
        }
        updateDataStatus();
    });

    $("#clearCacheBtn").addEventListener("click", () => {
        LiveData.clearAllCache();
        $("#keyValidation").className = "key-validation";
        $("#keyValidation").textContent = "缓存已清除";
        updateDataStatus();
    });

    // ─── Auto Refresh ────────────────────────────────────────
    let _nextRefreshAt = 0;

    $("#autoRefreshToggle").addEventListener("change", (e) => {
        if (e.target.checked) startAutoRefresh();
        else stopAutoRefresh();
    });

    function startAutoRefresh() {
        stopAutoRefresh();
        if (!_lastScreenOpts) return; // Nothing to refresh yet
        const intervalSec = +$("#refreshInterval").value;
        _nextRefreshAt = Date.now() + intervalSec * 1000;

        _autoRefreshTimer = setInterval(() => {
            if (_lastScreenOpts) doScreen(true);
            _nextRefreshAt = Date.now() + intervalSec * 1000;
        }, intervalSec * 1000);

        _countdownTimer = setInterval(() => {
            const remaining = Math.max(0, Math.ceil((_nextRefreshAt - Date.now()) / 1000));
            $("#refreshCountdown").textContent = `下次刷新: ${remaining}s`;
        }, 1000);
    }

    function stopAutoRefresh() {
        if (_autoRefreshTimer) { clearInterval(_autoRefreshTimer); _autoRefreshTimer = null; }
        if (_countdownTimer) { clearInterval(_countdownTimer); _countdownTimer = null; }
        $("#refreshCountdown").textContent = "";
    }

    // ─── Sector Tags ─────────────────────────────────────────
    $$(".sector-tag").forEach(tag => {
        tag.addEventListener("click", () => {
            tag.classList.toggle("active");
            const s = tag.dataset.sector;
            if (tag.classList.contains("active")) selectedSectors.push(s);
            else selectedSectors = selectedSectors.filter(x => x !== s);
        });
    });

    // ─── Tabs ────────────────────────────────────────────────
    $$(".tab").forEach(tab => {
        tab.addEventListener("click", () => {
            $$(".tab").forEach(t => t.classList.remove("active"));
            $$(".tab-content").forEach(tc => tc.classList.remove("active"));
            tab.classList.add("active");
            document.getElementById(tab.dataset.tab)?.classList.add("active");
        });
    });

    // ─── Market Bar ──────────────────────────────────────────
    (function renderMarketBar() {
        const bar = $("#marketBar");
        if (!bar) return;
        bar.innerHTML = Object.entries(SAMPLE_MARKET_INDICES).map(([name, d]) => {
            const cls = d.change_pct >= 0 ? "positive" : "negative";
            const sign = d.change_pct >= 0 ? "+" : "";
            return `<span class="market-item"><span class="name">${name}</span> <span class="${cls}">${d.price.toLocaleString("en-US",{minimumFractionDigits:2})}</span> <span class="${cls}">(${sign}${d.change_pct.toFixed(2)}%)</span></span>`;
        }).join("");
    })();

    // ─── Form Submit ─────────────────────────────────────────
    $("#screenForm").addEventListener("submit", e => { e.preventDefault(); doScreen(false); });

    async function doScreen(isRefresh) {
        const btn = $("#runBtn"), btnT = btn.querySelector(".btn-text"), btnL = btn.querySelector(".btn-loading");
        btn.disabled = true; btnT.style.display = "none"; btnL.style.display = "inline";
        $("#loadingPanel").style.display = "block";
        if (!isRefresh) $("#resultsSection").style.display = "none";
        const pf = $("#progressFill"); pf.style.width = "10%";

        const opts = {
            risk: $("#risk").value,
            return_min: +$("#returnMin").value,
            return_max: +$("#returnMax").value,
            top: +$("#top").value,
            horizon: +$("#horizon").value,
            require_dividend: $("#requireDividend").value === "true",
            sectors: selectedSectors.length ? selectedSectors : [],
        };
        _lastScreenOpts = opts;

        const useLive = LiveData.hasApiKey();
        const tickers = Object.keys(SAMPLE_STOCKS);

        let liveStocks = {};
        if (useLive) {
            $(".status-dot").className = "status-dot loading";
            $("#loadingText").textContent = "正在获取实时市场数据...";

            try {
                liveStocks = await LiveData.fetchAllStocks(tickers, (done, total, ticker, source) => {
                    const pctVal = 10 + (done / total) * 75;
                    pf.style.width = pctVal + "%";
                    $("#loadingText").textContent = `获取 ${ticker} (${done}/${total}) [${source}]`;
                });
            } catch (e) {
                console.error("Live data fetch error:", e);
            }
            updateDataStatus();
        }

        // Build stock data: prefer live, fallback to sample
        const stockData = {};
        tickers.forEach(t => {
            if (liveStocks[t]) {
                stockData[t] = liveStocks[t];
            } else {
                stockData[t] = { ...SAMPLE_STOCKS[t], _live: false };
            }
        });

        // Run analysis with runScreeningWithData
        pf.style.width = "90%";
        $("#loadingText").textContent = "正在分析并生成报告...";

        // Use modified screening that accepts custom stock data
        const results = runScreeningWithData(stockData, opts);
        currentResults = results;
        pf.style.width = "100%";

        // Build summary
        const sectorAlloc = {};
        results.forEach(r => { sectorAlloc[r.sector] = (sectorAlloc[r.sector]||0)+1; });
        const avgScore = results.length ? +(results.reduce((s,r) => s+(r.composite_score||0),0)/results.length).toFixed(1) : 0;
        const avgRisk = results.length ? +(results.reduce((s,r) => s+(r.risk_score||0),0)/results.length).toFixed(1) : 0;
        const upsides = results.filter(r => r.upside_pct != null);
        const avgUpside = upsides.length ? +(upsides.reduce((s,r) => s+r.upside_pct,0)/upsides.length).toFixed(1) : 0;

        const now = new Date();
        const reportId = `GS-EQ-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(results.length).padStart(3,'0')}`;
        const reportDate = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

        const dataMode = useLive ? "实时数据" : "样本数据";

        setTimeout(() => {
            renderReportMeta(reportId, reportDate, opts, results.length, dataMode);
            renderSummaryCards({ total: results.length, avg_score: avgScore, avg_risk: avgRisk, avg_upside: avgUpside });
            renderTop3(results);
            renderSummaryTable(results);
            renderPETable(results);
            renderGrowthTable(results);
            renderDebtTable(results);
            renderDividendTable(results);
            renderMoatTable(results);
            renderTargetTable(results);
            renderRiskTable(results);
            renderEntryTable(results);
            renderSectorAlloc(sectorAlloc);

            $("#loadingPanel").style.display = "none";
            $("#resultsSection").style.display = "block";
            if (!isRefresh) $("#resultsSection").scrollIntoView({ behavior: "smooth" });
            btn.disabled = false; btnT.style.display = "inline"; btnL.style.display = "none";

            // Start auto-refresh if toggle is on
            if ($("#autoRefreshToggle").checked && !_autoRefreshTimer) startAutoRefresh();
        }, 200);
    }

    // ─── Rendering Functions ─────────────────────────────────
    function renderReportMeta(id, date, opts, count, dataMode) {
        const rl = GS_CONFIG.RISK_LABELS[opts.risk] || opts.risk;
        $("#reportMeta").innerHTML = `
            <span><span class="label">报告编号:</span> <span class="value">${id}</span></span>
            <span><span class="label">日期:</span> <span class="value">${date}</span></span>
            <span><span class="label">风险承受:</span> <span class="value">${rl}</span></span>
            <span><span class="label">目标收益:</span> <span class="value">${opts.return_min}%-${opts.return_max}%</span></span>
            <span><span class="label">数据源:</span> <span class="value" style="color:${dataMode==='实时数据'?'var(--gs-green)':'var(--gs-yellow)'}">${dataMode}</span></span>
            <span><span class="label">筛选结果:</span> <span class="value">${count} 只</span></span>`;
    }

    function renderSummaryCards(s) {
        $("#summaryCards").innerHTML = `
            <div class="summary-card"><div class="card-value count">${s.total}</div><div class="card-label">推荐股票数量</div></div>
            <div class="summary-card"><div class="card-value score">${s.avg_score}</div><div class="card-label">平均综合评分</div></div>
            <div class="summary-card"><div class="card-value risk">${s.avg_risk}/10</div><div class="card-label">平均风险评级</div></div>
            <div class="summary-card"><div class="card-value upside">+${s.avg_upside}%</div><div class="card-label">平均上行空间</div></div>`;
    }

    function renderTop3(results) {
        $("#top3List").innerHTML = results.slice(0,3).map((s,i) => `<div class="top3-item">
            <span class="top3-rank">${i+1}</span><span class="top3-ticker">${s.ticker}${dataBadge(s._source)}</span>
            <span class="top3-name">${s.name}</span>
            <span class="top3-score" style="color:${scoreColor(s.composite_score)}">${fmt(s.composite_score,1)}</span>
            <span class="top3-rec ${recClass(s.recommendation)}">${s.recommendation}</span></div>`).join("");
    }

    function renderSummaryTable(results) {
        const tb = $("#summaryTable tbody");
        tb.innerHTML = results.map((s,i) => `<tr data-idx="${i}">
            <td>${i+1}</td><td style="color:var(--gs-blue);font-weight:700">${s.ticker}${dataBadge(s._source)}</td><td>${s.name}</td>
            <td class="dim">${s.sector||"N/A"}</td><td>${fmtPrice(s.current_price)}</td>
            <td>${makeScoreBar(s.composite_score)}</td>
            <td><span class="${recClass(s.recommendation)}" style="padding:2px 6px;border-radius:3px;font-size:0.78rem">${s.recommendation}</span></td>
            <td>${fmt(s.risk_score,1)}/10</td>
            <td class="${(s.upside_pct||0)>0?"positive":"negative"}">${fmtPct(s.upside_pct)}</td>
            <td><span class="moat-badge ${moatClass(s.moat_rating)}">${s.moat_rating||"N/A"}</span></td></tr>`).join("");
        tb.querySelectorAll("tr").forEach(tr => tr.addEventListener("click", () => showDetail(currentResults[+tr.dataset.idx])));
    }

    function renderPETable(r) { $("#peTable tbody").innerHTML = r.map(s => `<tr><td style="color:var(--gs-blue);font-weight:700">${s.ticker}</td><td>${fmt(s.pe_ratio,1)}</td><td>${fmt(s.forward_pe,1)}</td><td>${fmt(s.industry_avg_pe,1)}</td><td class="${(s.pe_discount_pct||0)>0?"positive":"negative"}">${fmtPct(s.pe_discount_pct)}</td><td>${s.pe_vs_industry||"N/A"}</td></tr>`).join(""); }
    function renderGrowthTable(r) { $("#growthTable tbody").innerHTML = r.map(s => { const rv = s.annual_revenues && s.revenue_years ? s.revenue_years.slice(-3).map((y,i) => { const v = s.annual_revenues.slice(-3)[i]; return v ? y+":"+(v/1e9).toFixed(1)+"B" : ""; }).filter(Boolean).join(" → ") : "N/A"; return `<tr><td style="color:var(--gs-blue);font-weight:700">${s.ticker}</td><td class="${(s.revenue_5y_cagr||0)>=0?"positive":"negative"}">${fmtPct(s.revenue_5y_cagr)}</td><td>${s.revenue_trend||"N/A"}</td><td class="dim">${rv}</td></tr>`; }).join(""); }
    function renderDebtTable(r) { $("#debtTable tbody").innerHTML = r.map(s => `<tr><td style="color:var(--gs-blue);font-weight:700">${s.ticker}</td><td>${s.debt_to_equity!=null?fmt(s.debt_to_equity,2)+"x":"N/A"}</td><td>${s.de_health||"N/A"}</td><td>${s.de_health_score!=null?makeScoreBar(s.de_health_score):"N/A"}</td><td>${fmt(s.current_ratio,2)}</td></tr>`).join(""); }
    function renderDividendTable(r) { $("#dividendTable tbody").innerHTML = r.map(s => `<tr><td style="color:var(--gs-blue);font-weight:700">${s.ticker}</td><td>${s.dividend_yield?fmt(s.dividend_yield,2)+"%":"0.00%"}</td><td>${s.payout_ratio!=null?fmt(s.payout_ratio,1)+"%":"N/A"}</td><td>${s.dividend_sustainability||"N/A"}</td><td>${s.dividend_sustainability_score!=null?makeScoreBar(s.dividend_sustainability_score):"N/A"}</td></tr>`).join(""); }
    function renderMoatTable(r) { $("#moatTable tbody").innerHTML = r.map(s => { const f=s.moat_factors||{}; return `<tr><td style="color:var(--gs-blue);font-weight:700">${s.ticker}</td><td><span class="moat-badge ${moatClass(s.moat_rating)}">${s.moat_rating}</span></td><td>${fmt(s.moat_score,0)}</td><td>${fmt(f.brand_strength,0)}</td><td>${fmt(f.switching_costs,0)}</td><td>${fmt(f.network_effects,0)}</td><td>${fmt(f.cost_advantage,0)}</td><td>${fmt(f.market_dominance,0)}</td></tr>`; }).join(""); }
    function renderTargetTable(r) { $("#targetTable tbody").innerHTML = r.map(s => `<tr><td style="color:var(--gs-blue);font-weight:700">${s.ticker}</td><td>${fmtPrice(s.current_price)}</td><td class="negative">${fmtPrice(s.bear_target)}</td><td>${fmtPrice(s.base_target)}</td><td class="positive">${fmtPrice(s.bull_target)}</td><td class="negative">${fmtPct(s.downside_pct)}</td><td class="positive">${fmtPct(s.upside_pct)}</td></tr>`).join(""); }
    function renderRiskTable(r) { $("#riskTable tbody").innerHTML = r.map(s => `<tr><td style="color:var(--gs-blue);font-weight:700">${s.ticker}</td><td>${fmt(s.risk_score,1)}/10</td><td>${s.risk_rating}</td><td>${fmt(s.beta,2)}</td><td class="dim">${s.risk_factors?s.risk_factors[0]:"N/A"}</td></tr>`).join(""); }
    function renderEntryTable(r) { $("#entryTable tbody").innerHTML = r.map(s => `<tr><td style="color:var(--gs-blue);font-weight:700">${s.ticker}</td><td>${fmtPrice(s.current_price)}</td><td class="positive">${fmtPrice(s.entry_price_low)}</td><td class="positive">${fmtPrice(s.entry_price_high)}</td><td class="negative">${fmtPrice(s.stop_loss)}</td><td class="negative">${s.stop_loss_pct!=null?s.stop_loss_pct+"%":"N/A"}</td></tr>`).join(""); }

    function renderSectorAlloc(sectors) {
        const total = Object.values(sectors).reduce((a,b)=>a+b,0);
        const maxC = Math.max(...Object.values(sectors));
        $("#sectorAllocation").innerHTML = Object.entries(sectors).sort((a,b)=>b[1]-a[1]).map(([s,c]) => {
            const pct = ((c/total)*100).toFixed(1), barW = ((c/maxC)*100).toFixed(0);
            return `<div class="alloc-row"><span class="alloc-label">${s}</span><div class="alloc-bar-bg"><div class="alloc-bar-fill" style="width:${barW}%"></div></div><span class="alloc-pct">${c} (${pct}%)</span></div>`;
        }).join("");
    }

    // ─── Stock Detail ────────────────────────────────────────
    function showDetail(s) {
        if (!s) return;
        const sec = $("#stockDetailSection"); sec.style.display = "block";
        const fHtml = (s.risk_factors||[]).map(f=>`<div style="padding:2px 0;color:var(--gs-text-dim)">- ${f}</div>`).join("");
        const mf = s.moat_factors||{};
        const ml = {brand_strength:"品牌实力",switching_costs:"转换成本",network_effects:"网络效应",cost_advantage:"成本优势",intangible_assets:"无形资产",market_dominance:"市场主导",margin_stability:"利润稳定"};
        const mHtml = Object.entries(mf).map(([k,v])=>`<div class="detail-row"><span class="label">${ml[k]||k}</span><span class="value">${v}/100</span></div>`).join("");
        const pm = s.profit_margin ? (s.profit_margin<1?s.profit_margin*100:s.profit_margin).toFixed(1)+"%" : "N/A";
        const roe = s.roe ? (s.roe<1?s.roe*100:s.roe).toFixed(1)+"%" : "N/A";
        const srcBadge = dataBadge(s._source);
        const updTime = s._source && s._source._fetchedAt ? `<span class="dim" style="font-size:0.78rem;margin-left:1rem">更新于 ${fmtTime(s._source._fetchedAt)}</span>` : "";

        $("#stockDetail").innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
            <div><span style="font-size:1.4rem;font-weight:800;color:var(--gs-blue)">${s.ticker}</span>${srcBadge}
            <span style="margin-left:0.75rem;color:var(--gs-text-dim)">${s.name}</span>
            <span style="margin-left:0.75rem;font-size:0.82rem;color:var(--gs-text-dim)">${s.sector} | ${s.industry}</span>${updTime}</div>
            <button class="detail-close" onclick="document.getElementById('stockDetailSection').style.display='none'">关闭</button>
        </div>
        <div style="margin-bottom:1rem;display:flex;gap:1.5rem;flex-wrap:wrap;align-items:center">
            <span style="font-size:1.8rem;font-weight:700">${fmtPrice(s.current_price)}</span>
            <span style="font-size:1.1rem;color:${scoreColor(s.composite_score)}">综合评分: ${fmt(s.composite_score,1)}/100</span>
            <span class="${recClass(s.recommendation)}" style="padding:4px 12px;border-radius:4px;font-weight:600">${s.recommendation}</span>
        </div>
        <div class="detail-grid">
            <div class="detail-section"><h4>估值分析</h4>
                <div class="detail-row"><span class="label">市值</span><span class="value">$${fmt(s.market_cap_billions,1)}B</span></div>
                <div class="detail-row"><span class="label">市盈率 (P/E)</span><span class="value">${fmt(s.pe_ratio,1)}</span></div>
                <div class="detail-row"><span class="label">远期 P/E</span><span class="value">${fmt(s.forward_pe,1)}</span></div>
                <div class="detail-row"><span class="label">行业均值</span><span class="value">${fmt(s.industry_avg_pe,1)}</span></div>
                <div class="detail-row"><span class="label">估值判断</span><span class="value">${s.pe_vs_industry||"N/A"}</span></div></div>
            <div class="detail-section"><h4>收入增长</h4>
                <div class="detail-row"><span class="label">5年 CAGR</span><span class="value ${(s.revenue_5y_cagr||0)>=0?"positive":"negative"}">${fmtPct(s.revenue_5y_cagr)}</span></div>
                <div class="detail-row"><span class="label">增长趋势</span><span class="value">${s.revenue_trend||"N/A"}</span></div>
                <div class="detail-row"><span class="label">净利润率</span><span class="value">${pm}</span></div>
                <div class="detail-row"><span class="label">ROE</span><span class="value">${roe}</span></div></div>
            <div class="detail-section"><h4>财务健康</h4>
                <div class="detail-row"><span class="label">债务/权益比</span><span class="value">${s.debt_to_equity!=null?s.debt_to_equity+"x":"N/A"}</span></div>
                <div class="detail-row"><span class="label">健康状态</span><span class="value">${s.de_health||"N/A"}</span></div>
                <div class="detail-row"><span class="label">健康分数</span><span class="value">${s.de_health_score!=null?s.de_health_score+"/100":"N/A"}</span></div>
                <div class="detail-row"><span class="label">流动比率</span><span class="value">${fmt(s.current_ratio,2)}</span></div></div>
            <div class="detail-section"><h4>股息分析</h4>
                <div class="detail-row"><span class="label">股息收益率</span><span class="value">${s.dividend_yield?fmt(s.dividend_yield,2)+"%":"0.00%"}</span></div>
                <div class="detail-row"><span class="label">派息比率</span><span class="value">${s.payout_ratio!=null?fmt(s.payout_ratio,1)+"%":"N/A"}</span></div>
                <div class="detail-row"><span class="label">可持续性</span><span class="value">${s.dividend_sustainability||"N/A"}</span></div></div>
            <div class="detail-section"><h4>竞争护城河 - <span class="moat-badge ${moatClass(s.moat_rating)}">${s.moat_rating}</span> (${fmt(s.moat_score,0)}/100)</h4>${mHtml}</div>
            <div class="detail-section"><h4>12个月目标价</h4>
                <div class="detail-row"><span class="label">看涨目标</span><span class="value positive">${fmtPrice(s.bull_target)} (${fmtPct(s.upside_pct)})</span></div>
                <div class="detail-row"><span class="label">基准目标</span><span class="value">${fmtPrice(s.base_target)}</span></div>
                <div class="detail-row"><span class="label">看跌目标</span><span class="value negative">${fmtPrice(s.bear_target)} (${fmtPct(s.downside_pct)})</span></div></div>
            <div class="detail-section"><h4>风险评估 - ${fmt(s.risk_score,1)}/10 (${s.risk_rating})</h4>
                <div class="detail-row"><span class="label">Beta</span><span class="value">${fmt(s.beta,2)}</span></div>
                <div style="margin-top:0.5rem">${fHtml}</div></div>
            <div class="detail-section"><h4>交易建议</h4>
                <div class="detail-row"><span class="label">入场低价</span><span class="value positive">${fmtPrice(s.entry_price_low)}</span></div>
                <div class="detail-row"><span class="label">入场高价</span><span class="value positive">${fmtPrice(s.entry_price_high)}</span></div>
                <div class="detail-row"><span class="label">止损价格</span><span class="value negative">${fmtPrice(s.stop_loss)}</span></div>
                <div class="detail-row"><span class="label">止损幅度</span><span class="value negative">${s.stop_loss_pct!=null?s.stop_loss_pct+"%":"N/A"}</span></div></div>
        </div>`;
        sec.scrollIntoView({ behavior: "smooth" });
    }

    // ─── Init ────────────────────────────────────────────────
    initApiKey();
})();
