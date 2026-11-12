/*
 * Painel do Meta Ads na página Tráfego pago (dados automáticos do conector do Facebook).
 * A rotina na nuvem lê a conta de anúncios da Lopes todo dia útil e grava metas_mensais/metaads-AAAA-MM:
 *   { mes, ate, conta, totais, campanhas:[...], diario:[...], atualizadoEm }
 * Mostra: números do mês (gasto, alcance, leads, custo por lead, custo por clique, ROAS), o gasto semana a semana
 * e as campanhas (ativas ou todas com gasto no mês).
 * Leads = cadastros (formulário/site) + conversas iniciadas no WhatsApp/Direct.
 * Uso: MetaAds.painel(elemento)
 */
(function(){
  const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  const pad = n => String(n).padStart(2, "0");
  const brl = v => (+v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const brl0 = v => (+v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const int = v => Math.round(+v || 0).toLocaleString("pt-BR");
  const fd = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : "";
  const fdt = s => { const d = new Date(s); return isNaN(d) ? "" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " às " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); };
  const div = (a, b) => b ? a / b : NaN;
  const leadsDe = x => (+x.leads || 0) + (+x.conversas || 0);
  const ROAS_MAX = 100;   // acima disso o valor de compra do pixel está fora do normal
  const roasTxt = x => { const r = div(+x.valorCompras || 0, +x.gasto || 0); if (!isFinite(r) || !r) return "—"; if (r > ROAS_MAX) return "fora do normal"; return r.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "x"; };
  const IND = { "actions:onsite_conversion.messaging_conversation_started_7d": "conversas no WhatsApp", "actions:omni_landing_page_view": "visitas à página",
    "actions:offsite_conversion.fb_pixel_purchase": "compras no site", "reach": "pessoas alcançadas", "actions:link_click": "cliques no link", "lead": "leads",
    "actions:post_engagement": "engajamentos", "video_thruplay_watched_actions": "visualizações de vídeo", "estimated_ad_recallers": "lembrança do anúncio" };
  const OBJ = { OUTCOME_TRAFFIC: "Tráfego", OUTCOME_SALES: "Vendas", OUTCOME_ENGAGEMENT: "Engajamento", OUTCOME_AWARENESS: "Reconhecimento", OUTCOME_LEADS: "Cadastros", OUTCOME_APP_PROMOTION: "App" };
  const ST = { ACTIVE: ["Ativa", "ok"], PAUSED: ["Pausada", "mu"], CAMPAIGN_PAUSED: ["Pausada", "mu"], IN_PROCESS: ["Programada", "in"], WITH_ISSUES: ["Com problema", "bad"], ARCHIVED: ["Arquivada", "mu"], DELETED: ["Excluída", "mu"] };
  function el(tag, attrs, ...kids){
    const e = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === "class") e.className = v; else if (k === "style") e.setAttribute("style", v); else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v); }
    kids.flat().forEach(c => { if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return e;
  }
  // semanas de segunda a domingo dentro do mês
  function semanas(mes, diario){
    const [y, m] = mes.split("-").map(Number), fim = new Date(y, m, 0).getDate(), out = [];
    let d = 1;
    while (d <= fim) {
      const dow = (new Date(y, m - 1, d).getDay() + 6) % 7, ate = Math.min(fim, d + (6 - dow));
      const a = `${mes}-${pad(d)}`, b = `${mes}-${pad(ate)}`;
      const L = diario.filter(x => x.data >= a && x.data <= b);
      out.push({ a, b, gasto: L.reduce((s, x) => s + (+x.gasto || 0), 0), leads: L.reduce((s, x) => s + leadsDe(x), 0), cliques: L.reduce((s, x) => s + (+x.cliquesLink || 0), 0), dias: L.length });
      d = ate + 1;
    }
    return out;
  }

  function painel(host){
    estilo();
    let docs = [], mesSel = "", so = "ativas";
    try { so = localStorage.getItem("ma-so") || "ativas"; } catch (_) {}
    const hojeMes = (() => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; })();
    function draw(){
      host.textContent = "";
      const meses = docs.map(d => d.mes).sort().reverse();
      if (!mesSel || !meses.includes(mesSel)) mesSel = meses.includes(hojeMes) ? hojeMes : meses[0] || "";
      const D = docs.find(d => d.mes === mesSel);
      const card = el("section", { class: "ma cx-card", "aria-label": "Meta Ads" });
      const sel = el("select", { "aria-label": "Mês", onchange: e => { mesSel = e.target.value; draw(); } }, ...meses.map(m => el("option", { value: m }, `${MESES[+m.slice(5) - 1]} ${m.slice(0, 4)}`)));
      sel.value = mesSel;
      card.append(el("div", { class: "ma-hd" },
        el("div", null, el("h2", null, "Meta Ads · resultados das campanhas"),
          el("p", { class: "cx-hint" }, D ? `Atualizado sozinho todo dia útil pelo conector do Meta${D.atualizadoEm ? " · última atualização " + fdt(D.atualizadoEm) : ""}${D.ate ? " · dados até " + fd(D.ate) : ""}${D.conta && D.conta.nome ? " · conta " + D.conta.nome : ""}.` : "")),
        meses.length > 1 ? sel : null));
      if (!D) { card.append(el("p", { class: "ma-vazio" }, "Os números do Meta Ads ainda não chegaram. A rotina automática grava os dados todo dia útil de manhã.")); host.append(card); return; }

      const T = D.totais || {}, L = leadsDe(T);
      const kpi = (rot, val, sub, cls) => el("div", { class: "ma-k " + (cls || "") }, el("small", null, rot), el("b", { "data-caber": "" }, val), sub ? el("span", null, sub) : null);
      card.append(el("div", { class: "ma-kpis" },
        kpi("Gasto no mês", brl(T.gasto), `${int(T.impressoes)} impressões`, "dest"),
        kpi("Alcance", int(T.alcance), "contas da Meta alcançadas"),
        kpi("Leads", L ? int(L) : "—", `${int(T.conversas)} conversas · ${int(T.leads)} cadastros`),
        kpi("Custo por lead", L ? brl(T.gasto / L) : "—", "gasto ÷ leads"),
        kpi("Custo por clique", T.cliquesLink ? brl(T.gasto / T.cliquesLink) : "—", `${int(T.cliquesLink)} cliques no link`),
        kpi("ROAS", roasTxt(T), T.valorCompras ? `${brl0(T.valorCompras)} em compras atribuídas` : "sem compras atribuídas", roasTxt(T) === "fora do normal" ? "warn" : "")));

      // gasto semana a semana
      const W = semanas(D.mes, D.diario || []), max = Math.max(1, ...W.map(w => w.gasto));
      const sem = el("div", { class: "ma-sem" }, el("h3", null, "Gasto semana a semana"));
      W.forEach(w => {
        const fut = w.a > (D.ate || "");
        sem.append(el("div", { class: "ma-w" + (fut ? " fut" : "") },
          el("span", { class: "ma-wl" }, `${fd(w.a)} a ${fd(w.b)}`),
          el("span", { class: "ma-wb", title: brl(w.gasto) }, el("i", { style: `width:${w.gasto / max * 100}%` })),
          el("b", null, fut ? "—" : brl(w.gasto)),
          el("small", null, fut ? "semana ainda não começou" : `${int(w.cliques)} cliques · ${int(w.leads)} leads${w.gasto && w.leads ? " · " + brl(w.gasto / w.leads) + "/lead" : ""}`)));
      });
      card.append(sem);

      // campanhas
      const C = (D.campanhas || []).filter(c => so === "todas" ? (+c.gasto > 0 || c.status === "ACTIVE") : c.status === "ACTIVE").sort((a, b) => (b.status === "ACTIVE") - (a.status === "ACTIVE") || (+b.gasto || 0) - (+a.gasto || 0));
      const seg = el("div", { class: "seg", role: "group", "aria-label": "Quais campanhas" }, ...[["ativas", "Ativas agora"], ["todas", "Todas com gasto no mês"]].map(([k, n]) =>
        el("button", { type: "button", "aria-pressed": String(so === k), onclick: () => { so = k; try { localStorage.setItem("ma-so", k); } catch (_) {} draw(); } }, n)));
      const tb = el("tbody");
      C.forEach(c => { const s = ST[c.status] || [c.status || "—", "mu"], ld = leadsDe(c);
        tb.append(el("tr", null,
          el("td", { class: "ma-n" }, el("b", null, c.nome), el("div", null, el("span", { class: "ma-st " + s[1] }, s[0]), " ", [OBJ[c.objetivo] || "", c.inicio ? `${fd(c.inicio)}${c.fim ? " a " + fd(c.fim) : ""}` : ""].filter(Boolean).join(" · "))),
          el("td", { class: "r" }, brl(c.gasto)),
          el("td", { class: "r" }, int(c.alcance)),
          el("td", { class: "r" }, ld ? int(ld) : "—"),
          el("td", { class: "r" }, ld ? brl(c.gasto / ld) : "—"),
          el("td", { class: "r" }, c.cliquesLink ? brl(c.gasto / c.cliquesLink) : "—"),
          el("td", { class: "r", title: roasTxt(c) === "fora do normal" ? "O valor de compra informado pelo pixel está fora do normal; confira o pixel do site." : null }, roasTxt(c)),
          el("td", { class: "r" }, c.resultados ? int(c.resultados) : "—", c.indicador ? el("div", { class: "ma-sub" }, (IND[c.indicador] || c.indicador) + (c.custoResultado ? " · " + brl(c.custoResultado) + " cada" : "")) : null)));
      });
      const tab = C.length ? el("div", { class: "ma-tw" }, el("table", { class: "ma-t" },
        el("thead", null, el("tr", null, ...["Campanha", "Gasto no mês", "Alcance", "Leads", "Custo por lead", "Custo por clique", "ROAS", "Resultado principal"].map((h, i) => el("th", { class: i ? "r" : "" }, h)))), tb))
        : el("p", { class: "cx-hint" }, so === "ativas" ? "Nenhuma campanha ativa agora." : "Nenhuma campanha com gasto neste mês.");
      card.append(el("div", { class: "ma-camps" }, el("div", { class: "ma-ch" }, el("h3", null, so === "ativas" ? `Campanhas ativas (${C.length})` : `Campanhas do mês (${C.length})`), seg), tab,
        el("p", { class: "cx-hint" }, "Leads = cadastros + conversas iniciadas no WhatsApp/Direct. Custo por clique usa os cliques no link. ROAS = valor das compras atribuídas pelo pixel ÷ gasto. Alcance do mês é da conta inteira (sem contar a mesma pessoa duas vezes).")));
      host.append(card);
    }
    Store.collection("metas_mensais").onSnapshot(sn => {
      docs = sn.docs.filter(d => d.exists && /^metaads-\d{4}-\d{2}$/.test(d.id)).map(d => Object.assign({ id: d.id }, d.data())).filter(d => d.mes);
      draw();
    }, () => { host.textContent = ""; });
    draw();
  }

  function estilo(){
    if (document.getElementById("ma-css")) return;
    const s = document.createElement("style"); s.id = "ma-css";
    s.textContent = `
.ma{margin-bottom:18px;gap:16px}
.ma-hd{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start}
.ma-hd h2{font-size:18px;margin:0}
.ma-hd p{margin:4px 0 0}
.ma-hd select{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:7px 10px;color:var(--fg);font-weight:600}
.ma-vazio{color:var(--muted);margin:0}
.ma-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}
.ma-k{background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:2px;min-width:0}
.ma-k small{font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.ma-k b{font-size:24px;font-weight:800;line-height:1.15;white-space:nowrap}
.ma-k span{font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ma-k.dest{background:var(--navy);border-color:var(--navy);color:#fff}
.ma-k.dest small,.ma-k.dest span{color:rgba(255,255,255,.75)}
.ma-k.warn b{font-size:16px;color:var(--warn)}
.ma h3{font-size:15px;margin:0 0 8px}
.ma-sem{display:flex;flex-direction:column;gap:6px}
.ma-w{display:grid;grid-template-columns:120px minmax(0,1fr) 110px minmax(0,1.2fr);gap:12px;align-items:center;font-size:13.5px}
.ma-wl{color:var(--muted);font-weight:600;white-space:nowrap}
.ma-wb{height:14px;border-radius:7px;background:var(--surface-2);overflow:hidden}
.ma-wb i{display:block;height:100%;border-radius:7px;background:linear-gradient(90deg,#1877F2,#4F9BFF)}
.ma-w b{text-align:right;white-space:nowrap}
.ma-w small{color:var(--muted);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ma-w.fut{opacity:.5}
.ma-ch{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px}
.ma-ch h3{margin:0}
.ma-tw{overflow-x:auto}
.ma-t{width:100%;border-collapse:collapse;font-size:13.5px;min-width:900px}
.ma-t th{text-align:left;font-family:var(--mono);font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);font-weight:500;padding:8px 10px;border-bottom:1px solid var(--line);white-space:nowrap}
.ma-t td{padding:9px 10px;border-bottom:1px solid var(--line);vertical-align:top}
.ma-t .r{text-align:right;white-space:nowrap}
.ma-n b{display:block;font-weight:700}
.ma-n div{font-size:12px;color:var(--muted);margin-top:2px}
.ma-sub{font-size:11.5px;color:var(--muted);margin-top:2px;white-space:normal;max-width:180px;margin-left:auto}
.ma-st{display:inline-block;font-size:11px;font-weight:800;border-radius:4px;padding:0 6px}
.ma-st.ok{background:var(--ok-bg);color:var(--ok)}
.ma-st.mu{background:var(--surface-2);color:var(--muted)}
.ma-st.in{background:var(--info-bg);color:var(--info)}
.ma-st.bad{background:var(--bad-bg);color:var(--bad)}
@media (max-width:1200px){.ma-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:700px){.ma-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.ma-w{grid-template-columns:96px minmax(0,1fr) 90px}.ma-w small{grid-column:1/-1}}
`;
    document.head.append(s);
  }
  window.MetaAds = { painel };
})();
