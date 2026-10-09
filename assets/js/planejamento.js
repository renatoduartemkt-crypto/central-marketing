/*
 * Planejamento anual de marketing 2027 — cronograma, plano de trade e cotas, eventos e orçamento por centro de custo.
 * Regra: a equipe lança (fica "proposto") e o administrador aprova. Itens aprovados só aceitam da equipe
 * os campos de acompanhamento (situação da tarefa, etapa da negociação, observações) — validado também no servidor.
 * Coleções: plan_config (doc "2027"), plan_fases, plan_cotas, plan_eventos, plan_orcamento.
 */
(function(){
  const ANO = 2027;
  const $ = id => document.getElementById(id);
  const MESES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  const MESES_L = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  const pad = n => String(n).padStart(2, "0");
  const brl = v => (+v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const brl0 = v => (+v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const num = v => (+v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = v => isFinite(v) ? (+v).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%" : "—";
  const fd = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "—";
  const lerR = s => Central.lerDinheiro(s);

  const FASES = [
    { n: 1, nome: "Plano de Trade 2027" }, { n: 2, nome: "Planejamento Financeiro" }, { n: 3, nome: "Calendário de Eventos e Brindes" },
    { n: 4, nome: "Venda das Cotas" }, { n: 5, nome: "Produção e Ativação" }];
  const SIT = [{ k: "pendente", n: "Não iniciado" }, { k: "andamento", n: "Em andamento" }, { k: "feito", n: "Fechado" }];
  const ETAPAS = [{ k: "prospeccao", n: "Prospecção" }, { k: "negociacao", n: "Em negociação" }, { k: "fechado", n: "Fechado" }, { k: "perdido", n: "Perdido" }];
  const COTAS = [{ k: "diamante", n: "Diamante" }, { k: "ouro", n: "Ouro" }, { k: "prata", n: "Prata" }];
  const STATUS = { proposto: "Aguardando aprovação", aprovado: "Aprovado", recusado: "Recusado" };
  // centros de custo do grupo Comercial/Marketing; "id" liga ao centro usado em Metas e custos
  const CENTROS = [
    { c: "200020", n: "Material de venda / propaganda", id: "propaganda" },
    { c: "200021", n: "Material terceirizado", id: "terceirizado", cats: [["catalogo", "Catálogo de produtos"], ["producao", "Produção de conteúdo terceirizada"], ["plotagem", "Plotagens"], ["merchandising", "Material de merchandising"], ["agencia", "Agência de tráfego pago (fee)"]] },
    { c: "200022", n: "Eventos (vem da aba Eventos)", id: "eventos", derivado: true },
    { c: "200023", n: "Brindes", id: "brindes" },
    { c: "200024", n: "Softwares", id: "softwares" },
    { c: "200018", n: "Feiras / eventos / palestras", id: "" },
    { c: "200310", n: "Folha de marketing (200310–200316)", id: "" }];
  const centroN = c => (CENTROS.find(x => x.c === c) || { n: c }).n;
  const catN = (c, k) => { const ce = CENTROS.find(x => x.c === c); const f = ce && ce.cats && ce.cats.find(x => x[0] === k); return f ? f[1] : (k || ""); };
  // premissas padrão (substituídas pelo documento plan_config/2027 quando existir)
  const CFG0 = {
    cotas: { diamante: { preco: 9500, vagas: 6 }, ouro: { preco: 5000, vagas: 16 }, prata: { preco: 3500, vagas: 3 } },
    meses: 12, prazoVenda: "2026-11-30",
    regra: [{ min: 90, txt: "Calendário aprovado como está" }, { min: 70, txt: "Cortar eventos sem meta de receita" }, { min: 0, txt: "Feirão Cuiabá condicionado a patrocínio específico" }],
    baseline: { nome: "Esboço v1 (congelado em 23/09/2026)", eventos: 18, bruto: 1322000, patrocinio: 932500, liquido: 389500 },
    base2026: { "200020": [161500, 110747.16], "200021": [239900, 148871.36], "200022": [865000, 925050.02], "200023": [78000, 69630.52], "200024": [30137.35, 4899.3], "200018": [0, 0], "200310": [0, 87334.39] },
    total2026: [1374537.35, 1346532.75], ativos: [] };

  function el(tag, attrs, ...kids){
    const e = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") e.className = v; else if (k === "style") e.setAttribute("style", v);
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else if (k === "value") e.value = v;
      else if (v != null && v !== false) e.setAttribute(k, v === true ? "" : v);
    }
    kids.flat().forEach(c => { if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return e;
  }
  let tt; const toast = m => { const t = $("toast"); t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 2800); };
  const pill = st => el("span", { class: "pl-pill st-" + (st || "proposto") }, STATUS[st] || STATUS.proposto);

  const D = { cfg: null, fases: [], cotas: [], eventos: [], orc: [] };
  const C = {}; let me = null, admin = false, tab = "geral", verPropostos = false, fOrcCentro = "", fEvMes = "";
  try { tab = sessionStorage.getItem("pl-tab") || "geral"; } catch (_) {}
  const cfg = () => { const c = Object.assign({}, CFG0, D.cfg || {}); c.cotas = Object.assign({}, CFG0.cotas, (D.cfg || {}).cotas || {}); return c; };
  const ok = x => x.status === "aprovado";
  const vivo = x => x.status !== "recusado";
  const valEv = x => ({ custo: +x.custo || 0, pat: +x.patrocinio || 0 });
  const mesEv = x => +(String(x.data || "").slice(5, 7)) || +x.mes || 0;

  /* ---------- contas ---------- */
  function orcPorCentroMes(so){
    const m = {}; CENTROS.forEach(c => m[c.c] = Array(13).fill(0));
    D.orc.filter(so).forEach(x => { const r = m[x.centro] || (m[x.centro] = Array(13).fill(0)); r[+x.mes || 0] += +x.valor || 0; });
    D.eventos.filter(so).forEach(x => { m["200022"][mesEv(x)] += valEv(x).custo; });
    return m;
  }
  const soma = a => a.reduce((s, v) => s + v, 0);
  function eventosTot(so){ const L = D.eventos.filter(so); const b = L.reduce((s, x) => s + valEv(x).custo, 0), p = L.reduce((s, x) => s + valEv(x).pat, 0); return { n: L.length, bruto: b, pat: p, liq: b - p }; }
  function cotasTot(){
    const c = cfg(); const r = { fechado: 0, negociacao: 0, potencial: 0, porCota: {} };
    COTAS.forEach(q => {
      const L = D.cotas.filter(x => x.cota === q.k && vivo(x) && x.etapa !== "perdido");
      const prop = L.filter(x => x.propria && x.etapa === "fechado").length, fech = L.filter(x => !x.propria && x.etapa === "fechado"), neg = L.filter(x => !x.propria && x.etapa === "negociacao");
      const vagas = +(c.cotas[q.k] || {}).vagas || 0, preco = +(c.cotas[q.k] || {}).preco || 0;
      const pagantes = Math.max(0, vagas - prop);
      const anual = x => (+x.valorMensal || preco) * (+x.meses || c.meses);
      r.porCota[q.k] = { vagas, preco, prop, fech: fech.length, neg: neg.length, receita: fech.reduce((s, x) => s + anual(x), 0), potencial: pagantes * preco * c.meses };
      r.fechado += r.porCota[q.k].receita; r.potencial += r.porCota[q.k].potencial; r.negociacao += neg.reduce((s, x) => s + anual(x), 0);
    });
    r.pct = r.potencial ? r.fechado / r.potencial * 100 : 0;
    r.regra = cfg().regra.find(f => r.pct >= f.min) || cfg().regra[cfg().regra.length - 1];
    return r;
  }
  const pendentes = () => [].concat(
    D.fases.filter(x => x.status === "proposto").map(x => ({ col: "plan_fases", x, tipo: "Cronograma", txt: x.titulo, val: null })),
    D.cotas.filter(x => x.status === "proposto").map(x => ({ col: "plan_cotas", x, tipo: "Cota", txt: `${x.empresa} · ${(COTAS.find(q => q.k === x.cota) || {}).n || ""}`, val: (+x.valorMensal || 0) * (+x.meses || 12) })),
    D.eventos.filter(x => x.status === "proposto").map(x => ({ col: "plan_eventos", x, tipo: "Evento", txt: `${x.nome} · ${x.cidade || ""} · ${fd(x.data)}`, val: +x.custo || 0 })),
    D.orc.filter(x => x.status === "proposto").map(x => ({ col: "plan_orcamento", x, tipo: "Orçamento", txt: `${x.centro} · ${MESES[(+x.mes || 1) - 1]} · ${x.descricao}`, val: +x.valor || 0 })));

  /* ---------- telas ---------- */
  function render(){
    if (document.activeElement && $("plBody").contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { render.pend = true; return; }
    render.pend = false;
    const p = pendentes().length; $("plPend").textContent = p ? p : "";
    [...$("plTabs").children].forEach(b => b.setAttribute("aria-selected", String(b.dataset.t === tab)));
    const ct = cotasTot(); $("plRegra").textContent = `Venda das cotas até ${fd(cfg().prazoVenda)}: ${pct(ct.pct)} vendido → ${ct.regra.txt}.`;
    const B = $("plBody"); B.textContent = "";
    ({ geral, cronograma, trade, eventos, orcamento, aprovar }[tab] || geral)(B);
  }
  $("plBody").addEventListener("focusout", () => setTimeout(() => { if (render.pend) render(); }, 0));
  $("plTabs").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; tab = b.dataset.t; try { sessionStorage.setItem("pl-tab", tab); } catch (_) {} render(); });

  const card = (titulo, extra, ...kids) => el("div", { class: "pl-card" }, el("div", { class: "pl-head" }, el("h2", null, titulo), extra || null), ...kids);
  const kpi = (t, v, s, cls) => el("div", { class: "pl-kpi " + (cls || "") }, el("small", null, t), el("b", null, v), s ? el("span", null, s) : null);
  const btnNovo = (txt, fn) => el("button", { class: "pl-btn pri", type: "button", onclick: fn }, txt);

  function geral(B){
    const c = cfg(), mA = orcPorCentroMes(ok), mP = orcPorCentroMes(x => x.status === "proposto");
    const totA = soma(Object.values(mA).map(soma)), totP = soma(Object.values(mP).map(soma));
    const ev = eventosTot(ok), ct = cotasTot();
    const feitos = D.fases.filter(x => vivo(x) && x.situacao === "feito").length, tot = D.fases.filter(vivo).length;
    const dif = ev.liq - c.baseline.liquido;
    B.append(el("div", { class: "pl-kpis" },
      kpi("Orçamento 2027 aprovado", brl0(totA), `${totP ? brl0(totP) + " aguardando aprovação · " : ""}2026: ${brl0(c.total2026[0])} planejado`),
      kpi("Eventos · custo líquido", brl0(ev.liq), `bruto ${brl0(ev.bruto)} − patrocínio ${brl0(ev.pat)} · ${dif >= 0 ? "+" : "−"}${brl0(Math.abs(dif))} vs. esboço v1`, dif > 0 ? "warn" : "ok"),
      kpi("Cotas vendidas", pct(ct.pct), `${brl0(ct.fechado)} de ${brl0(ct.potencial)} · ${brl0(ct.negociacao)} em negociação`, ct.pct >= 90 ? "ok" : ct.pct >= 70 ? "warn" : "bad"),
      kpi("Cronograma", `${feitos} de ${tot}`, "itens fechados nas 5 fases")));
    // regra de decisão
    B.append(card("Venda das cotas × regra de decisão", el("span", { class: "pl-who" }, `prazo ${fd(c.prazoVenda)}`),
      el("div", { class: "pl-bar", title: `${pct(ct.pct)} vendido` }, el("i", { style: `width:${Math.min(100, ct.pct)}%;background:var(${ct.pct >= 90 ? "--ok" : ct.pct >= 70 ? "--warn" : "--bad"})` }), el("span", { class: "mk", style: "left:70%" }), el("span", { class: "mk", style: "left:90%" })),
      el("p", { class: "hint", style: "margin:0" }, c.regra.map(f => `${f.min ? "≥ " + f.min + "%" : "abaixo de 70%"}: ${f.txt}`).join(" · "))));
    // por centro
    const tb = el("tbody");
    CENTROS.forEach(ce => { const b = c.base2026[ce.c] || [0, 0], a = soma(mA[ce.c] || []), p = soma(mP[ce.c] || []); const v = b[0] ? (a - b[0]) / b[0] * 100 : NaN;
      tb.append(el("tr", null, el("td", null, el("b", null, ce.c), " ", ce.n), el("td", { class: "r m" }, brl0(b[0])), el("td", { class: "r m" }, brl0(b[1])), el("td", { class: "r m" }, brl0(a)), el("td", { class: "r m mut" }, p ? brl0(p) : "—"), el("td", { class: "r m " + (v > 0 ? "neg" : v < 0 ? "pos" : "") }, isFinite(v) ? (v > 0 ? "+" : "") + pct(v) : (a ? "novo" : "—")))); });
    B.append(card("Orçamento por centro de custo · 2027 × 2026", null,
      el("div", { class: "pl-tw" }, el("table", { class: "pl-t" }, el("thead", null, el("tr", null, el("th", null, "Centro de custo"), el("th", { class: "r" }, "Planejado 2026"), el("th", { class: "r" }, "Realizado 2026 (jan–set)"), el("th", { class: "r" }, "2027 aprovado"), el("th", { class: "r" }, "2027 aguardando"), el("th", { class: "r" }, "vs. planejado 2026"))), tb,
        el("tfoot", null, el("tr", null, el("td", null, "Total"), el("td", { class: "r m" }, brl0(c.total2026[0])), el("td", { class: "r m" }, brl0(c.total2026[1])), el("td", { class: "r m" }, brl0(totA)), el("td", { class: "r m" }, totP ? brl0(totP) : "—"), el("td")))))));
  }

  function cronograma(B){
    FASES.forEach(f => {
      const L = D.fases.filter(x => +x.fase === f.n && vivo(x)).sort((a, b) => (+a.ordem || 0) - (+b.ordem || 0));
      const feitos = L.filter(x => x.situacao === "feito").length, and = L.filter(x => x.situacao === "andamento").length;
      const sit = L.length && feitos === L.length ? "feito" : feitos || and ? "andamento" : "pendente";
      const d = el("details", { class: "pl-fase" }, el("summary", null, el("span", { class: "num" }, pad(f.n)), el("span", { class: "tt" }, f.nome), el("span", { class: "pg" }, `${feitos}/${L.length}`), el("span", { class: "pl-pill sit-" + sit }, (SIT.find(s => s.k === sit) || {}).n)));
      const body = el("div", { class: "body" }); let sec = null;
      L.forEach(x => {
        if ((x.secao || "") !== sec) { sec = x.secao || ""; if (sec) body.append(el("div", { class: "pl-sec" }, sec)); }
        const s = el("select", { "aria-label": "Situação de " + x.titulo, onchange: e => salvar("plan_fases", x, { situacao: e.target.value }) }, ...SIT.map(o => el("option", { value: o.k }, o.n))); s.value = x.situacao || "pendente";
        body.append(el("div", { class: "pl-item" }, s,
          el("div", { class: "tx" }, el("b", null, x.titulo), x.detalhe ? el("span", null, x.detalhe) : null, x.obs ? el("span", { style: "display:block;font-style:italic" }, "Obs.: " + x.obs) : null),
          x.prazo ? el("span", { class: "pl-prazo" }, x.prazo) : null, x.status !== "aprovado" ? pill(x.status) : null,
          el("button", { class: "pl-btn", type: "button", onclick: () => form("plan_fases", x) }, "Abrir")));
      });
      if (!L.length) body.append(el("p", { class: "hint" }, "Nenhum item nesta fase."));
      body.append(el("div", { style: "margin-top:10px" }, el("button", { class: "pl-btn", type: "button", onclick: () => form("plan_fases", null, { fase: f.n }) }, "+ Item nesta fase")));
      d.append(body); d.open = !!C["f" + f.n]; d.addEventListener("toggle", () => C["f" + f.n] = d.open);
      B.append(d);
    });
  }

  function trade(B){
    const c = cfg(), ct = cotasTot();
    const cards = el("div", { class: "pl-cotas" }, ...COTAS.map(q => { const t = ct.porCota[q.k];
      const sq = []; for (let i = 0; i < t.vagas; i++) sq.push(el("i", { class: i < t.prop ? "p" : i < t.prop + t.fech ? "f" : i < t.prop + t.fech + t.neg ? "n" : "" }));
      return el("div", { class: "pl-cota " + q.k }, el("h3", null, q.n, el("span", { class: "pl-who" }, `${brl0(t.preco)}/mês`)),
        el("b", { class: "v" }, brl0(t.receita)), el("span", { class: "pl-who" }, `fechado de ${brl0(t.potencial)} possíveis (${t.vagas - t.prop} cotas pagantes × ${c.meses} meses)`),
        el("div", { class: "pl-vagas", title: `${t.vagas} vagas` }, ...sq),
        el("span", { class: "pl-who" }, `${t.prop} marca(s) própria(s) · ${t.fech} fechada(s) · ${t.neg} em negociação · ${Math.max(0, t.vagas - t.prop - t.fech - t.neg)} livre(s)`)); }));
    B.append(card("Cotas do plano de trade", admin ? el("button", { class: "pl-btn", type: "button", onclick: formPremissas }, "Premissas (preços, vagas, regra)") : null, cards,
      el("div", { class: "pl-legend" }, el("span", null, el("i", { style: "background:var(--navy)" }), "Marca própria (Opta, Lupus, Durabem)"), el("span", null, el("i", { style: "background:var(--ok)" }), "Fechada"), el("span", null, el("i", { style: "background:var(--info);opacity:.55" }), "Em negociação"), el("span", null, el("i", { style: "background:var(--surface-2);border:1px solid var(--line)" }), "Livre"))));
    // empresas
    const L = D.cotas.filter(vivo).sort((a, b) => COTAS.findIndex(q => q.k === a.cota) - COTAS.findIndex(q => q.k === b.cota) || String(a.empresa).localeCompare(b.empresa));
    const tb = el("tbody");
    L.forEach(x => { const s = el("select", { "aria-label": "Etapa de " + x.empresa, onchange: e => salvar("plan_cotas", x, { etapa: e.target.value }) }, ...ETAPAS.map(o => el("option", { value: o.k }, o.n))); s.value = x.etapa || "prospeccao";
      const anual = x.propria ? 0 : (+x.valorMensal || (c.cotas[x.cota] || {}).preco || 0) * (+x.meses || c.meses);
      tb.append(el("tr", null, el("td", null, el("b", null, x.empresa), x.propria ? el("div", { class: "pl-who" }, "Marca própria · investimento garantido pela Lopes") : x.base2026 ? el("div", { class: "pl-who" }, "Em 2026: " + x.base2026) : null),
        el("td", null, (COTAS.find(q => q.k === x.cota) || {}).n || "—"), el("td", null, s),
        el("td", { class: "r m" }, x.propria ? "—" : brl(+x.valorMensal || (c.cotas[x.cota] || {}).preco)), el("td", { class: "r m" }, x.propria ? "—" : brl0(anual)),
        el("td", null, x.contato || "", x.obs ? el("div", { class: "pl-who" }, x.obs) : null), el("td", null, x.status !== "aprovado" ? pill(x.status) : null),
        el("td", null, el("button", { class: "pl-btn", type: "button", onclick: () => form("plan_cotas", x) }, "Abrir")))); });
    B.append(card("Venda das cotas por empresa", btnNovo("+ Empresa", () => form("plan_cotas", null)),
      L.length ? el("div", { class: "pl-tw" }, el("table", { class: "pl-t", style: "min-width:900px" }, el("thead", null, el("tr", null, ...["Empresa", "Cota", "Etapa", "Valor mensal", "Valor no ano", "Contato / obs.", "", ""].map((h, i) => el("th", { class: i === 3 || i === 4 ? "r" : "" }, h)))), tb,
        el("tfoot", null, el("tr", null, el("td", { colspan: "4" }, "Total fechado"), el("td", { class: "r m" }, brl0(ct.fechado)), el("td", { colspan: "3", class: "pl-who" }, `+ ${brl0(ct.negociacao)} em negociação`))))) : el("div", { class: "pl-empty" }, "Nenhuma empresa cadastrada.")));
    if ((c.ativos || []).length) B.append(card("Ativos do plano (o que a cota entrega)", null, el("div", { class: "pl-ativos" }, ...c.ativos.map(a => el("div", null, el("b", null, a.nome), el("span", null, a.detalhe || ""))))));
  }

  function eventos(B){
    const c = cfg(), A = eventosTot(ok), T = eventosTot(vivo), bl = c.baseline;
    const delta = (v, b) => `${v - b >= 0 ? "+" : "−"}${brl0(Math.abs(v - b))}`;
    B.append(el("div", { class: "pl-kpis" },
      kpi("Eventos aprovados", String(A.n), `${T.n - A.n} aguardando aprovação · esboço v1: ${bl.eventos}`),
      kpi("Custo bruto", brl0(A.bruto), `${delta(A.bruto, bl.bruto)} vs. v1 (${brl0(bl.bruto)})`),
      kpi("Patrocínio previsto", brl0(A.pat), `${delta(A.pat, bl.patrocinio)} vs. v1 (${brl0(bl.patrocinio)})`),
      kpi("Custo líquido", brl0(A.liq), `${delta(A.liq, bl.liquido)} vs. v1 (${brl0(bl.liquido)})`, A.liq > bl.liquido ? "warn" : "ok")));
    const sel = el("select", { "aria-label": "Mês", onchange: e => { fEvMes = e.target.value; render(); } }, el("option", { value: "" }, "Todos os meses"), ...MESES_L.map((m, i) => el("option", { value: String(i + 1) }, m))); sel.value = fEvMes;
    const L = D.eventos.filter(vivo).filter(x => !fEvMes || mesEv(x) === +fEvMes).sort((a, b) => String(a.data).localeCompare(String(b.data)));
    const tb = el("tbody"); let tb_ = 0, tp = 0;
    L.forEach(x => { const v = valEv(x); tb_ += v.custo; tp += v.pat;
      tb.append(el("tr", { class: "click", onclick: () => form("plan_eventos", x) }, el("td", { class: "m" }, fd(x.data)), el("td", null, el("b", null, x.nome), el("div", { class: "pl-who" }, x.tipo || "")),
        el("td", null, [x.cidade, (x.ufs || []).join("/")].filter(Boolean).join(" · ")), el("td", { class: "r m" }, brl0(v.custo)), el("td", { class: "r m" }, brl0(v.pat)), el("td", { class: "r m" }, brl0(v.custo - v.pat)),
        el("td", { class: "r m mut" }, x.custo2026 ? brl0(x.custo2026) : "—"), el("td", null, pill(x.status)))); });
    B.append(card("Calendário de eventos 2027", el("div", { class: "pl-filters" }, sel, btnNovo("+ Evento", () => form("plan_eventos", null))),
      L.length ? el("div", { class: "pl-tw" }, el("table", { class: "pl-t", style: "min-width:900px" }, el("thead", null, el("tr", null, ...["Data", "Evento", "Cidade / UF", "Custo bruto", "Patrocínio", "Líquido", "Custo 2026", "Situação"].map((h, i) => el("th", { class: i >= 3 && i <= 6 ? "r" : "" }, h)))), tb,
        el("tfoot", null, el("tr", null, el("td", { colspan: "3" }, `${L.length} evento(s) listados`), el("td", { class: "r m" }, brl0(tb_)), el("td", { class: "r m" }, brl0(tp)), el("td", { class: "r m" }, brl0(tb_ - tp)), el("td", { colspan: "2" }))))) : el("div", { class: "pl-empty" }, "Nenhum evento neste filtro."),
      el("p", { class: "hint", style: "margin:0" }, "O custo bruto dos eventos aprovados alimenta automaticamente o centro de custo 200022 na aba Orçamento.")));
  }

  function orcamento(B){
    const so = verPropostos ? vivo : ok, M = orcPorCentroMes(so);
    const head = el("tr", null, el("th", null, "Centro de custo"), ...MESES.map(m => el("th", { class: "r" }, m)), el("th", { class: "r" }, "Ano"), el("th", { class: "r" }, "Plan. 2026"));
    const tb = el("tbody"); const tot = Array(13).fill(0);
    CENTROS.forEach(ce => { const r = M[ce.c] || Array(13).fill(0); r.forEach((v, i) => tot[i] += v);
      tb.append(el("tr", { class: ce.derivado ? "der" : "" }, el("td", null, el("b", null, ce.c), " ", ce.n), ...MESES.map((_, i) => el("td", { class: "r m" }, r[i + 1] ? num(r[i + 1]) : "")), el("td", { class: "r m" }, el("b", null, brl0(soma(r)))), el("td", { class: "r m mut" }, brl0((cfg().base2026[ce.c] || [0])[0])))); });
    const sw = el("label", { class: "pl-who", style: "display:flex;gap:6px;align-items:center" }, el("input", { type: "checkbox", checked: verPropostos ? true : null, onchange: e => { verPropostos = e.target.checked; render(); } }), "Incluir itens aguardando aprovação");
    B.append(card(`Orçamento ${ANO} por centro de custo e mês`, el("div", { class: "pl-acts" }, sw, admin ? el("button", { class: "pl-btn", type: "button", onclick: aplicarMetas }, "Enviar o aprovado para Metas e custos") : null),
      el("div", { class: "pl-tw" }, el("table", { class: "pl-t pl-mx" }, el("thead", null, head), tb,
        el("tfoot", null, el("tr", null, el("td", null, "Total"), ...MESES.map((_, i) => el("td", { class: "r m" }, tot[i + 1] ? num(tot[i + 1]) : "")), el("td", { class: "r m" }, brl0(soma(tot))), el("td", { class: "r m" }, brl0(cfg().total2026[0]))))))));
    // lançamentos
    const sel = el("select", { "aria-label": "Centro de custo", onchange: e => { fOrcCentro = e.target.value; render(); } }, el("option", { value: "" }, "Todos os centros"), ...CENTROS.filter(c => !c.derivado).map(c => el("option", { value: c.c }, `${c.c} · ${c.n}`))); sel.value = fOrcCentro;
    const L = D.orc.filter(vivo).filter(x => !fOrcCentro || x.centro === fOrcCentro).sort((a, b) => (+a.mes - +b.mes) || String(a.centro).localeCompare(b.centro));
    const tl = el("tbody");
    L.forEach(x => tl.append(el("tr", { class: "click", onclick: () => form("plan_orcamento", x) }, el("td", null, MESES_L[(+x.mes || 1) - 1]), el("td", null, el("b", null, x.centro), el("div", { class: "pl-who" }, centroN(x.centro))),
      el("td", null, catN(x.centro, x.categoria)), el("td", null, x.descricao || ""), el("td", { class: "r m" }, brl(x.valor)), el("td", null, pill(x.status)))));
    B.append(card("Lançamentos do orçamento", el("div", { class: "pl-filters" }, sel, btnNovo("+ Lançamento", () => form("plan_orcamento", null, { centro: fOrcCentro || "200021" }))),
      L.length ? el("div", { class: "pl-tw" }, el("table", { class: "pl-t", style: "min-width:820px" }, el("thead", null, el("tr", null, ...["Mês", "Centro", "Categoria", "Descrição", "Valor", "Situação"].map((h, i) => el("th", { class: i === 4 ? "r" : "" }, h)))), tl,
        el("tfoot", null, el("tr", null, el("td", { colspan: "4" }, `${L.length} lançamento(s)`), el("td", { class: "r m" }, brl(L.reduce((s, x) => s + (+x.valor || 0), 0))), el("td"))))) : el("div", { class: "pl-empty" }, "Nenhum lançamento neste filtro."),
      el("p", { class: "hint", style: "margin:0" }, "Custos que se repetem (ex.: fee da agência) podem ser lançados de uma vez para vários meses.")));
  }

  function aprovar(B){
    const P = pendentes();
    if (!P.length) { B.append(card("Aguardando aprovação", null, el("div", { class: "pl-empty" }, "Nada aguardando aprovação."))); return; }
    const tb = el("tbody");
    P.forEach(p => tb.append(el("tr", null, el("td", null, p.tipo), el("td", null, el("b", null, p.txt), el("div", { class: "pl-who" }, quem(p.x.criadoPor))), el("td", { class: "r m" }, p.val != null ? brl(p.val) : "—"),
      el("td", null, admin ? el("div", { class: "pl-acts" }, el("button", { class: "pl-btn ok", type: "button", onclick: () => decidir([p], "aprovado") }, "Aprovar"), el("button", { class: "pl-btn bad", type: "button", onclick: () => decidir([p], "recusado") }, "Recusar"), el("button", { class: "pl-btn", type: "button", onclick: () => form(p.col, p.x) }, "Abrir"))
        : el("span", { class: "pl-who" }, "aguardando o gerente")))));
    B.append(card("Aguardando aprovação", admin ? el("button", { class: "pl-btn ok", type: "button", onclick: () => decidir(P, "aprovado") }, `Aprovar todos (${P.length})`) : null,
      el("div", { class: "pl-tw" }, el("table", { class: "pl-t", style: "min-width:720px" }, el("thead", null, el("tr", null, el("th", null, "Tipo"), el("th", null, "Item"), el("th", { class: "r" }, "Valor"), el("th", null, ""))), tb))));
  }
  const quem = e => { if (!e) return ""; const u = (D.usuarios || []).find(x => x.email === e); return "Lançado por " + (u && u.nome || e); };

  /* ---------- gravação ---------- */
  async function salvar(col, x, patch){
    try { await C[col].doc(x.id).update(patch); }
    catch (e) { toast((e && e.message) || "Não foi possível salvar."); render(); }
  }
  async function decidir(L, st){
    let n = 0; for (const p of L) { try { await C[p.col].doc(p.x.id).update({ status: st }); n++; } catch (e) { toast((e && e.message) || "Não foi possível."); } }
    toast(`${n} item(ns) ${st === "aprovado" ? "aprovado(s)" : "recusado(s)"}`);
  }
  async function aplicarMetas(){
    const M = orcPorCentroMes(ok); const ids = CENTROS.filter(c => c.id);
    const total = soma(ids.map(c => soma(M[c.c])));
    if (!confirm(`Enviar o orçamento aprovado (${brl(total)}) como "projetado" de cada mês de ${ANO} em Metas e custos? Os valores projetados de ${ANO} que estiverem lá serão substituídos.`)) return;
    const col = Store.collection("metas_mensais"); let n = 0;
    try {
      for (let m = 1; m <= 12; m++) {
        const projetado = Object.assign({}, ((D.mm || {})[`custos-${ANO}-${pad(m)}`] || {}).projetado || {}); ids.forEach(c => projetado[c.id] = Math.round((M[c.c][m] || 0) * 100) / 100);
        const itens = D.orc.filter(ok).filter(x => +x.mes === m && (CENTROS.find(c => c.c === x.centro) || {}).id).map(x => ({ centro: CENTROS.find(c => c.c === x.centro).id, conta: x.centro, item: x.descricao || catN(x.centro, x.categoria), valor: +x.valor || 0 }))
          .concat(D.eventos.filter(ok).filter(x => mesEv(x) === m).map(x => ({ centro: "eventos", conta: "200022", item: `${x.nome} · ${x.cidade || ""}`, valor: +x.custo || 0 })));
        await col.doc(`custos-${ANO}-${pad(m)}`).update({ tipo: "custos", mes: `${ANO}-${pad(m)}`, projetado, itens, fonte: `Planejamento ${ANO} (aprovado)` }); n++;
      }
      toast(`Projetado de ${n} meses enviado para Metas e custos`);
    } catch (e) { toast((e && e.message) || "Não foi possível enviar."); }
  }

  /* ---------- formulários ---------- */
  const LIVRES = { plan_fases: ["situacao", "obs"], plan_cotas: ["etapa", "obs", "contato"], plan_eventos: ["obs"], plan_orcamento: [] };
  const SPEC = {
    plan_fases: { t: "Item do cronograma", f: [
      ["fase", "Fase", "select", FASES.map(f => [f.n, `${pad(f.n)} · ${f.nome}`])], ["situacao", "Situação", "select", SIT.map(s => [s.k, s.n])],
      ["titulo", "Item", "text", null, "w2"], ["detalhe", "Detalhe", "textarea", null, "w2"], ["secao", "Grupo dentro da fase (opcional)", "text"], ["prazo", "Prazo (ex.: 30/11/26, Nov/26)", "text"],
      ["ordem", "Ordem", "number"], ["obs", "Observação", "textarea", null, "w2"]] },
    plan_cotas: { t: "Empresa / cota", f: [
      ["empresa", "Empresa (indústria)", "text", null, "w2"], ["cota", "Cota", "select", COTAS.map(q => [q.k, q.n])], ["etapa", "Etapa", "select", ETAPAS.map(e => [e.k, e.n])],
      ["valorMensal", "Valor mensal (R$) — vazio = preço da cota", "money"], ["meses", "Meses", "number"], ["propria", "Marca própria (não entra na receita)", "check"],
      ["base2026", "Situação em 2026 (ex.: Diamante)", "text"], ["contato", "Contato", "text", null, "w2"], ["obs", "Observação", "textarea", null, "w2"]] },
    plan_eventos: { t: "Evento", f: [
      ["nome", "Evento", "text", null, "w2"], ["data", "Data", "date"], ["tipo", "Tipo", "text"], ["cidade", "Cidade", "text"], ["ufsTxt", "UF(s) (ex.: MS ou RO/AC)", "text"],
      ["custo", "Custo bruto (R$)", "money"], ["patrocinio", "Patrocínio previsto (R$)", "money"], ["custo2026", "Custo em 2026 (R$)", "money"], ["publico", "Público estimado", "number"],
      ["dri", "Responsável", "text"], ["metaReceita", "Meta de receita (R$)", "money"], ["obs", "Observação", "textarea", null, "w2"]] },
    plan_orcamento: { t: "Lançamento do orçamento", f: [
      ["centro", "Centro de custo", "select", CENTROS.filter(c => !c.derivado).map(c => [c.c, `${c.c} · ${c.n}`])], ["categoria", "Categoria", "text"],
      ["descricao", "Descrição", "text", null, "w2"], ["valor", "Valor (R$)", "money"], ["mes", "Mês", "select", MESES_L.map((m, i) => [i + 1, m])]] } };

  function form(col, x, preset){
    const sp = SPEC[col], novo = !x, F = $("plForm"); F.textContent = "";
    const travado = !novo && !admin && x.status === "aprovado";
    const pode = k => !travado || LIVRES[col].includes(k);
    const v = Object.assign({}, preset || {}, x || {}); if (col === "plan_eventos") v.ufsTxt = (v.ufs || []).join("/");
    if (novo && col === "plan_fases") { v.situacao = "pendente"; v.ordem = (D.fases.filter(y => +y.fase === +v.fase).reduce((m, y) => Math.max(m, +y.ordem || 0), 0) + 1); }
    if (novo && col === "plan_cotas") { v.etapa = "prospeccao"; v.meses = cfg().meses; v.cota = "ouro"; }
    if (novo && col === "plan_orcamento") v.mes = 1;
    const bd = el("div", { class: "bd" }), ins = {};
    if (travado) bd.append(el("p", { class: "pl-lock" }, LIVRES[col].length ? `🔒 Item aprovado. Você pode atualizar ${LIVRES[col].map(k => (sp.f.find(f => f[0] === k) || [k, k])[1].toLowerCase()).join(" e ")}; o restante só o gerente altera.` : "🔒 Item aprovado. Só o gerente altera."));
    else if (!novo && x.status === "proposto" && !admin) bd.append(el("p", { class: "pl-lock" }, "Aguardando aprovação do gerente."));
    sp.f.forEach(([k, lab, tipo, opts, cls]) => {
      let i;
      if (tipo === "select") { i = el("select", null, ...opts.map(([a, b]) => el("option", { value: String(a) }, b))); i.value = String(v[k] != null ? v[k] : opts[0][0]); }
      else if (tipo === "textarea") i = el("textarea", { maxlength: "1000" }, v[k] || "");
      else if (tipo === "check") { i = el("input", { type: "checkbox", style: "width:auto" }); i.checked = !!v[k]; }
      else if (tipo === "money") i = el("input", { type: "text", class: "money", inputmode: "decimal", placeholder: "0,00", value: v[k] ? num(v[k]) : "" });
      else i = el("input", { type: tipo === "number" ? "text" : tipo, inputmode: tipo === "number" ? "numeric" : null, value: v[k] != null ? String(v[k]) : "" });
      if (!pode(k)) { i.readOnly = true; if (i.tagName === "SELECT" || i.type === "checkbox") i.disabled = true; }
      ins[k] = i;
      bd.append(el("label", { class: cls || (tipo === "check" ? "w2" : "") }, lab, i));
    });
    if (col === "plan_orcamento" && novo) { // repetir em vários meses
      const box = el("div", { class: "pl-meses" }, ...MESES_L.map((m, i) => el("label", null, el("input", { type: "checkbox", value: String(i + 1) }), m)));
      bd.append(el("div", { class: "w2" }, el("label", null, "Repetir o mesmo valor também nos meses (opcional)"), box)); ins._meses = box;
      const cat = ins.categoria; const dl = el("datalist", { id: "plCats" }); cat.setAttribute("list", "plCats");
      const fillCats = () => { dl.textContent = ""; const ce = CENTROS.find(c => c.c === ins.centro.value); (ce && ce.cats || []).forEach(([k, n]) => dl.append(el("option", { value: n }))); };
      ins.centro.addEventListener("change", fillCats); fillCats(); bd.append(dl);
    }
    const err = el("p", { class: "pl-err", hidden: true }); bd.append(err);
    const ler = () => { const o = {};
      sp.f.forEach(([k, , tipo]) => { const i = ins[k]; if (!pode(k)) return;
        o[k] = tipo === "money" ? lerR(i.value) : tipo === "number" ? (i.value.trim() === "" ? null : Math.round(lerR(i.value))) : tipo === "check" ? i.checked : i.value.trim(); });
      if (col === "plan_fases" && o.fase != null) o.fase = +o.fase;
      if (col === "plan_orcamento" && o.mes != null) { o.mes = +o.mes; const ce = CENTROS.find(c => c.c === o.centro); const f = ce && ce.cats && ce.cats.find(c => c[1] === o.categoria); if (f) o.categoria = f[0]; }
      if (col === "plan_eventos" && "ufsTxt" in o) { o.ufs = o.ufsTxt.split(/[\/,\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean); delete o.ufsTxt; if (o.data) o.mes = +o.data.slice(5, 7); }
      return o; };
    const obrig = { plan_fases: ["titulo"], plan_cotas: ["empresa"], plan_eventos: ["nome", "data"], plan_orcamento: ["descricao", "valor"] }[col];
    const salvarF = async ev => { ev.preventDefault(); const o = ler();
      const falta = obrig.filter(k => pode(k) && !o[k]); if (falta.length) { err.hidden = false; err.textContent = "Preencha: " + falta.map(k => sp.f.find(f => f[0] === k)[1]).join(", ") + "."; return; }
      const btn = F.querySelector("button[type=submit]"); btn.disabled = true;
      try {
        if (novo) {
          const meses = ins._meses ? [...ins._meses.querySelectorAll("input:checked")].map(i => +i.value).filter(m => m !== o.mes) : [];
          const serie = meses.length ? "s" + Date.now().toString(36) : null;
          const base = Object.assign({ status: admin ? "aprovado" : "proposto", criadoPor: me && me.email }, o, serie ? { serie } : {});
          await C[col].add(base);
          for (const m of meses) await C[col].add(Object.assign({}, base, { mes: m }));
          toast(admin ? "Salvo e aprovado" : `Enviado para aprovação${meses.length ? ` (${meses.length + 1} meses)` : ""}`);
        } else { await C[col].doc(x.id).update(o); toast("Salvo"); }
        fechar();
      } catch (e) { err.hidden = false; err.textContent = (e && e.message) || "Não foi possível salvar."; btn.disabled = false; }
    };
    const pe = el("div", { class: "pl-acts" });
    if (!novo && (admin || x.status !== "aprovado")) pe.append(el("button", { class: "pl-btn bad", type: "button", onclick: async () => { if (!confirm("Excluir este item?")) return; try { await C[col].doc(x.id).delete(); toast("Excluído"); fechar(); } catch (e) { err.hidden = false; err.textContent = (e && e.message) || "Não foi possível excluir."; } } }, "Excluir"));
    if (!novo && admin && x.status !== "aprovado") pe.append(el("button", { class: "pl-btn ok", type: "button", onclick: async () => { await decidir([{ col, x }], "aprovado"); fechar(); } }, "Aprovar"));
    F.append(el("header", null, el("h2", null, (novo ? "Novo: " : "") + sp.t), el("button", { class: "x", type: "button", "aria-label": "Fechar", onclick: fechar }, "×")), bd,
      el("footer", null, pe, el("div", { class: "pl-acts" }, el("button", { class: "pl-btn", type: "button", onclick: fechar }, "Cancelar"), el("button", { class: "pl-btn pri", type: "submit", disabled: travado && !LIVRES[col].length ? true : null }, novo && !admin ? "Enviar para aprovação" : "Salvar"))));
    F.onsubmit = salvarF; $("plOv").hidden = false; setTimeout(() => { const f = F.querySelector("input:not([readonly]),select:not([disabled]),textarea:not([readonly])"); if (f) f.focus(); }, 40);
  }
  function fechar(){ $("plOv").hidden = true; $("plForm").textContent = ""; render(); }
  $("plOv").addEventListener("click", e => { if (e.target === $("plOv")) fechar(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("plOv").hidden) fechar(); });

  function formPremissas(){
    const c = cfg(), F = $("plForm"); F.textContent = ""; const ins = {};
    const bd = el("div", { class: "bd" });
    COTAS.forEach(q => { ins[q.k + "p"] = el("input", { type: "text", class: "money", inputmode: "decimal", value: num(c.cotas[q.k].preco) }); ins[q.k + "v"] = el("input", { type: "text", inputmode: "numeric", value: String(c.cotas[q.k].vagas) });
      bd.append(el("label", null, `${q.n}: preço mensal (R$)`, ins[q.k + "p"]), el("label", null, `${q.n}: vagas (com marcas próprias)`, ins[q.k + "v"])); });
    ins.meses = el("input", { type: "text", inputmode: "numeric", value: String(c.meses) }); ins.prazo = el("input", { type: "date", value: c.prazoVenda });
    bd.append(el("label", null, "Meses de cota no ano", ins.meses), el("label", null, "Prazo da venda das cotas", ins.prazo));
    F.append(el("header", null, el("h2", null, "Premissas do plano de trade"), el("button", { class: "x", type: "button", onclick: fechar }, "×")), bd,
      el("footer", null, el("span"), el("div", { class: "pl-acts" }, el("button", { class: "pl-btn", type: "button", onclick: fechar }, "Cancelar"), el("button", { class: "pl-btn pri", type: "submit" }, "Salvar"))));
    F.onsubmit = async ev => { ev.preventDefault(); const cotas = {}; COTAS.forEach(q => cotas[q.k] = { preco: lerR(ins[q.k + "p"].value), vagas: Math.round(lerR(ins[q.k + "v"].value)) });
      try { await C.plan_config.doc(String(ANO)).update({ cotas, meses: Math.round(lerR(ins.meses.value)) || 12, prazoVenda: ins.prazo.value }); toast("Premissas salvas"); fechar(); } catch (e) { toast((e && e.message) || "Não foi possível salvar."); } };
    $("plOv").hidden = false;
  }

  Central.boot("planejamento", user => {
    me = user; admin = Auth.isAdmin();
    ["plan_config", "plan_fases", "plan_cotas", "plan_eventos", "plan_orcamento"].forEach(n => C[n] = Store.collection(n));
    const map = { plan_fases: "fases", plan_cotas: "cotas", plan_eventos: "eventos", plan_orcamento: "orc" };
    Object.entries(map).forEach(([n, k]) => C[n].onSnapshot(sn => { D[k] = sn.docs.filter(d => d.exists).map(d => Object.assign({ id: d.id }, d.data())); render(); }));
    C.plan_config.onSnapshot(sn => { const d = sn.docs.find(x => x.id === String(ANO)); D.cfg = d ? d.data() : null; render(); });
    Store.collection("usuarios").onSnapshot(sn => { D.usuarios = sn.docs.map(d => d.data()); });
    if (admin) Store.collection("metas_mensais").onSnapshot(sn => { D.mm = {}; sn.docs.filter(d => d.exists).forEach(d => D.mm[d.id] = d.data()); });
    render();
  });
})();
