/*
 * Planejamento anual de marketing 2027 — visão geral, cronograma, plano de trade e cotas, eventos, brindes e financeiro.
 * Regras:
 *  - Cronograma, cotas e lançamentos do financeiro: a equipe lança (fica "aguardando aprovação") e o administrador aprova.
 *  - Eventos e brindes ainda estão em planejamento: cada item tem uma situação (menu suspenso). A equipe cadastra e
 *    move entre ideia / negociação / cotação; só o administrador confirma. Confirmado fica travado para a equipe.
 *  - Tudo é validado também no servidor (Apps Script).
 * Coleções: plan_config (doc "2027"), plan_fases, plan_cotas, plan_eventos, plan_acoes, plan_brindes, plan_orcamento.
 */
(function(){
  const ANO = 2027;
  const $ = id => document.getElementById(id);
  const MESES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  const MESES_L = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const pad = n => String(n).padStart(2, "0");
  const brl = v => (+v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const brl0 = v => (+v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const curto = v => { v = +v || 0; if (!v) return "—"; if (Math.abs(v) >= 1e6) return "R$ " + (v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " mi"; if (Math.abs(v) >= 1e3) return "R$ " + Math.round(v / 1e3).toLocaleString("pt-BR") + " mil"; return "R$ " + Math.round(v); };
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
  // situação de eventos e brindes (menu suspenso). "Firmes" = confirmados pelo gerente: entram no orçamento confirmado.
  const SITUACOES = {
    plan_eventos: [["ideia", "Ideia"], ["negociacao", "Negociando patrocínio"], ["confirmado", "Confirmado"], ["realizado", "Realizado"], ["cancelado", "Cancelado"]],
    plan_acoes: [["ideia", "Ideia"], ["planejando", "Em planejamento"], ["aprovado", "Aprovada"], ["executada", "Executada"], ["cancelado", "Cancelada"]],
    plan_brindes: [["ideia", "Ideia"], ["cotando", "Cotando"], ["aprovado", "Aprovado"], ["comprado", "Comprado"], ["entregue", "Entregue"], ["cancelado", "Cancelado"]] };
  const FIRMES = { plan_eventos: ["confirmado", "realizado"], plan_acoes: ["aprovado", "executada"], plan_brindes: ["aprovado", "comprado", "entregue"] };
  // ações promocionais (campanhas comerciais para o cliente)
  const CANAIS = [["tabloide", "Tabloide de ofertas"], ["post", "Post Instagram"], ["reels", "Stories / Reels"], ["sorteio", "Sorteio de prêmios"], ["radio", "Spot de rádio"], ["email", "E-mail marketing"],
    ["whatsapp", "WhatsApp"], ["trafego", "Tráfego pago"], ["site", "Site / e-commerce"], ["pdv", "Material de PDV"], ["carrosom", "Carro de som"], ["externa", "Outdoor / mídia externa"], ["outros", "Outros"]];
  const canalN = k => (CANAIS.find(c => c[0] === k) || [k, k])[1];
  const TIPOS_AC = [["data", "Data comemorativa / aniversário"], ["comercial", "Ação comercial / queima de estoque"], ["sazonal", "Campanha sazonal"], ["lancamento", "Lançamento de produto"], ["industria", "Ação com indústria parceira"], ["outro", "Outra"]];
  const tipoAcN = k => (TIPOS_AC.find(c => c[0] === k) || [k, k || ""])[1];
  const sitN = (col, k) => (SITUACOES[col].find(s => s[0] === k) || [k, k])[1];
  const etapa = x => x.etapa || "ideia";
  const firme = col => x => FIRMES[col].includes(etapa(x));
  const ativo = x => etapa(x) !== "cancelado";
  const FIN = ["Kit de evento", "Relacionamento Curva A", "Apoio à visita do RCA", "Data comemorativa", "Endomarketing", "Campanha de incentivo", "Outro"];
  const CONTAS_BR = [["200023", "200023 Marketing Brindes"], ["evento", "Já incluso no custo do evento (200022)"], ["outra", "Outra conta"]];
  const totBr = x => (+x.quantidade || 0) * (+x.custoUnit || 0) + (+x.adicionais || 0);
  const liqBr = x => Math.max(0, totBr(x) - (+x.verba || 0));
  const em23 = x => (x.conta || "200023") === "200023";
  const mesBr = x => +x.mesPagamento || 0;
  // centros de custo do grupo Comercial/Marketing; "id" liga ao centro usado em Metas e custos
  const CENTROS = [
    { c: "200020", n: "Material de venda / propaganda", id: "propaganda" },
    { c: "200021", n: "Material terceirizado", id: "terceirizado" },
    { c: "200022", n: "Eventos", id: "eventos", derivado: "eventos" },
    { c: "200023", n: "Brindes", id: "brindes", derivado: "brindes" },
    { c: "200024", n: "Softwares", id: "softwares" },
    { c: "200018", n: "Feiras / eventos / palestras", id: "" },
    { c: "200310", n: "Folha de marketing (200310–200316)", id: "" }];
  const centroN = c => (CENTROS.find(x => x.c === c) || { n: c }).n;
  // categorias de lançamento de cada centro de custo (o 200021 segue o planejamento que já existia)
  const CATS = {
    "200020": [["impressos", "Impressos (folders, tabloides, encartes)"], ["pdv", "Material de PDV e displays"], ["midia", "Mídia e propaganda"], ["outros", "Outros"]],
    "200021": [["catalogo", "Catálogo de produtos"], ["producao", "Produção de conteúdo terceirizada"], ["plotagem", "Plotagens"], ["merchandising", "Material de merchandising"], ["agencia", "Agência de tráfego pago (fee)"], ["outros", "Outros"]],
    "200022": [["estrutura", "Estrutura e locação"], ["alimentacao", "Alimentação e bebidas"], ["viagem", "Viagens e hospedagem"], ["fornecedores", "Fornecedores e produção"], ["outros", "Outros custos de eventos"]],
    "200023": [["avulsos", "Brindes avulsos"], ["outros", "Outros"]],
    "200024": [["assinaturas", "Assinaturas e licenças"], ["ferramentas", "Ferramentas e plataformas"], ["outros", "Outros"]],
    "200018": [["inscricoes", "Inscrições e cotas de feiras"], ["estande", "Estande e montagem"], ["viagem", "Viagens"], ["outros", "Outros"]],
    "200310": [["salarios", "Salários"], ["encargos", "Encargos"], ["beneficios", "Benefícios"], ["outros", "Outros"]] };
  const catN = (c, k) => { const f = (CATS[c] || []).find(x => x[0] === k); return f ? f[1] : (k || ""); };
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
      else if (k.startsWith("on")) { if (v) e.addEventListener(k.slice(2), v); } else if (k === "value") e.value = v;
      else if (v != null && v !== false) e.setAttribute(k, v === true ? "" : v);
    }
    kids.flat().forEach(c => { if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return e;
  }
  let tt; const toast = m => { const t = $("toast"); t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 2800); };
  const pill = st => el("span", { class: "pl-pill st-" + (st || "proposto") }, STATUS[st] || STATUS.proposto);

  const D = { cfg: null, fases: [], cotas: [], eventos: [], acoes: [], brindes: [], orc: [] };
  const C = {}; let me = null, admin = false, tab = "geral";
  const F = { acMes: null, acSit: "", acCanal: "", acVer: "mes", gCal: "tudo", evMes: null, evSit: "", evUf: "", evVer: "mes", brMes: null, brSit: "", brFin: "", brConta: "", brVer: "mes", fiMes: null, fiModo: "previsto", fiCentro: "", fiAba: "painel", fiCat: "", fiSit: "", lfMes: null, lfCen: "", lfCat: "" };
  try { tab = sessionStorage.getItem("pl-tab") || "geral"; } catch (_) {}
  const cfg = () => { const c = Object.assign({}, CFG0, D.cfg || {}); c.cotas = Object.assign({}, CFG0.cotas, (D.cfg || {}).cotas || {}); return c; };
  const ok = x => x.status === "aprovado";
  const vivo = x => x.status !== "recusado";
  const mesEv = x => +(String(x.data || "").slice(5, 7)) || +x.mes || 0;
  const liqEv = x => Math.max(0, (+x.custo || 0) - (+x.patrocinio || 0));
  const mesAc = x => +(String(x.inicio || "").slice(5, 7)) || +x.mes || 0;
  const cenAc = x => x.centro || "200020";
  const soma = a => a.reduce((s, v) => s + (+v || 0), 0);

  /* ---------- contas ---------- */
  // modo "previsto" = tudo que não foi recusado/cancelado; "confirmado" = aprovado pelo gerente
  function orcPorCentroMes(modo){
    const conf = modo === "confirmado";
    const m = {}; CENTROS.forEach(c => m[c.c] = Array(13).fill(0));
    D.orc.filter(conf ? ok : vivo).forEach(x => { const r = m[x.centro] || (m[x.centro] = Array(13).fill(0)); r[+x.mes || 0] += +x.valor || 0; });
    D.eventos.filter(conf ? firme("plan_eventos") : ativo).forEach(x => { m["200022"][mesEv(x)] += +x.custo || 0; });
    D.acoes.filter(conf ? firme("plan_acoes") : ativo).forEach(x => { const r = m[cenAc(x)] || (m[cenAc(x)] = Array(13).fill(0)); r[mesAc(x)] += +x.custo || 0; });
    D.brindes.filter(conf ? firme("plan_brindes") : ativo).filter(em23).forEach(x => { m["200023"][mesBr(x)] += totBr(x); });
    return m;
  }
  const porMes = M => { const r = Array(12).fill(0); Object.values(M).forEach(a => a.forEach((v, i) => { if (i) r[i - 1] += v; })); return r; };
  function eventosTot(f){ const L = D.eventos.filter(f); const b = soma(L.map(x => x.custo)), p = soma(L.map(x => x.patrocinio)); return { n: L.length, series: new Set(L.map(x => String(x.nome || "").trim().toLowerCase())).size, bruto: b, pat: p, liq: soma(L.map(liqEv)), meta: soma(L.map(x => x.metaReceita)) }; }
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
    D.orc.filter(x => x.status === "proposto").map(x => ({ col: "plan_orcamento", x, tipo: "Financeiro", txt: `${x.centro} · ${MESES[(+x.mes || 1) - 1]} · ${x.descricao}`, val: +x.valor || 0 })));

  /* ---------- telas ---------- */
  const VIEWS = { geral, cronograma, trade, eventos, acoes, brindes, financeiro, aprovar };
  function render(){
    if (document.activeElement && $("plBody").contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { render.pend = true; return; }
    render.pend = false;
    if (!VIEWS[tab]) tab = "geral";
    const p = pendentes().length; $("plPend").textContent = p ? p : "";
    [...$("plTabs").children].forEach(b => b.setAttribute("aria-selected", String(b.dataset.t === tab)));
    const ct = cotasTot(); $("plRegra").textContent = `Venda das cotas até ${fd(cfg().prazoVenda)}: ${pct(ct.pct)} vendido → ${ct.regra.txt}.`;
    const B = $("plBody"); B.textContent = "";
    VIEWS[tab](B);
  }
  $("plBody").addEventListener("focusout", () => setTimeout(() => { if (render.pend) render(); }, 0));
  const irPara = t => { tab = t; try { sessionStorage.setItem("pl-tab", tab); } catch (_) {} render(); window.scrollTo({ top: 0, behavior: "smooth" }); };
  $("plTabs").addEventListener("click", e => { const b = e.target.closest("button"); if (b) irPara(b.dataset.t); });
  const nomeAba = () => { const b = [...$("plTabs").children].find(x => x.dataset.t === tab); return b ? b.firstChild.textContent.trim() : ""; };
  if (window.Exportar) Exportar.menu($("plExp"), { alvo: () => $("plBody"), titulo: () => `Planejamento ${ANO}`, secao: nomeAba,
    sub: () => tab === "financeiro" ? ({ painel: "Painel", lanc: "Lançamentos", resumo: "Resumo mensal", cat: "Por categoria" }[F.fiAba] || "") : tab === "eventos" ? ({ mes: "Por mês", evento: "Por evento", cal: "Calendário anual" }[F.evVer] || "") : "",
    arquivo: () => `planejamento-${ANO}-${nomeAba()}` });

  const card = (titulo, extra, ...kids) => el("div", { class: "pl-card" }, el("div", { class: "pl-head" }, el("h2", null, titulo), extra || null), ...kids);
  const btnNovo = (txt, fn) => el("button", { class: "pl-btn pri", type: "button", onclick: fn }, txt);

  /* Painel no estilo do calendário de eventos: faixa azul com a régua de meses (clique filtra o mês) */
  function regua({ marca, titulo, lede, vals, conf, cont, unid, sel, onSel, acoes, legenda }){
    const max = Math.max(...vals, 1);
    const r = el("div", { class: "pl-ruler", role: "group", "aria-label": titulo });
    vals.forEach((v, i) => {
      const h = v > 0 ? Math.max(4, Math.round(v / max * 90)) : 2, hc = conf && conf[i] > 0 ? Math.max(3, Math.round(Math.min(conf[i], v) / max * 90)) : 0;
      r.append(el("button", { type: "button", class: "m" + (i % 3 === 0 && i ? " q" : ""), "aria-pressed": String(sel === i + 1),
        "aria-label": `${cap(MESES_L[i])}: ${brl0(v)}${conf ? `, ${brl0(conf[i])} confirmado` : ""}`, onclick: onSel ? () => onSel(sel === i + 1 ? null : i + 1) : null },
        el("span", { class: "bar" + (v > 0 ? " has" : ""), style: `height:${h}px` }, hc ? el("i", { style: `height:${hc}px` }) : null),
        el("span", { class: "ml" }, cap(MESES[i])), el("span", { class: "mv" }, curto(v)), cont ? el("span", { class: "mc" }, `${cont[i]} ${(unid || ["item", "itens"])[cont[i] === 1 ? 0 : 1]}`) : null));
    });
    return el("header", { class: "pl-hero" }, el("p", { class: "brand" }, marca || "Distribuidora Lopes · planejamento de marketing"), el("h2", null, titulo), lede ? el("p", { class: "lede" }, lede) : null,
      acoes ? el("div", { class: "acts" }, acoes) : null,
      el("div", { class: "pl-ruler-wrap" }, r, el("div", { class: "pl-q", "aria-hidden": "true" }, ...["1º tri", "2º tri", "3º tri", "4º tri"].map(q => el("span", null, q)))),
      legenda ? el("div", { class: "pl-hleg" }, el("span", null, el("i", { class: "a" }), "Previsto"), el("span", null, el("i", { class: "b" }), "Confirmado")) : null,
      sel ? el("button", { type: "button", class: "pl-hclear", onclick: () => onSel(null) }, `Mostrando só ${MESES_L[sel - 1]} · ver o ano todo`) : null);
  }
  const totais = itens => el("section", { class: "pl-tot" }, ...itens.filter(Boolean).map(([v, k, cls]) => el("div", { class: "t " + (cls || "") }, el("b", null, v), el("span", null, k))));
  const seg = (opts, val, on) => el("div", { class: "pl-seg", role: "group" }, ...opts.map(([k, n]) => el("button", { type: "button", "aria-pressed": String(val === k), onclick: () => on(k) }, n)));
  const filtro = (rot, opts, val, on) => { const s = el("select", { "aria-label": rot, onchange: e => on(e.target.value) }, el("option", { value: "" }, rot + ": todos"), ...opts.map(([k, n]) => el("option", { value: k }, n))); s.value = val; return s; };
  // menu suspenso da situação (eventos e brindes). A equipe não confirma; item confirmado fica travado para ela.
  function sitSelect(col, x){
    const trav = !admin && FIRMES[col].includes(etapa(x));
    const s = el("select", { class: "pl-sit ep-" + etapa(x), "aria-label": "Situação", disabled: trav ? true : null, title: trav ? "Confirmado pelo gerente" : "Situação do item",
      onclick: e => e.stopPropagation(), onkeydown: e => e.stopPropagation(), onchange: e => salvar(col, x, { etapa: e.target.value }) },
      ...SITUACOES[col].map(([k, n]) => el("option", { value: k, disabled: !admin && !trav && FIRMES[col].includes(k) ? true : null }, n + (!admin && !trav && FIRMES[col].includes(k) ? " (gerente)" : ""))));
    s.value = etapa(x); return s;
  }

  /* ---------- visão geral ---------- */
  function geral(B){
    const c = cfg(), MP = orcPorCentroMes("previsto"), MC = orcPorCentroMes("confirmado");
    const vp = porMes(MP), vc = porMes(MC), totP = soma(vp), totC = soma(vc);
    const ev = eventosTot(ativo), ct = cotasTot();
    const brP = soma(D.brindes.filter(ativo).filter(em23).map(totBr));
    const feitos = D.fases.filter(x => vivo(x) && x.situacao === "feito").length, tot = D.fases.filter(vivo).length;
    B.append(regua({ titulo: `Planejamento de marketing ${ANO}`, lede: "Todo o planejamento num só lugar: quanto cada mês vai custar somando todos os centros de custo (financeiro, eventos e brindes). A parte laranja já está confirmada pelo gerente. Clique num mês para abrir o financeiro dele.",
      vals: vp, conf: vc, legenda: true, sel: null, onSel: m => { F.fiMes = m; irPara("financeiro"); } }));
    B.append(totais([[curto(totP), `orçamento previsto ${ANO}`, "net"], [curto(totC), "já confirmado"], [curto(c.total2026[0]), `planejado ${ANO - 1}`],
      [totP && c.total2026[0] ? (totP >= c.total2026[0] ? "+" : "") + pct((totP - c.total2026[0]) / c.total2026[0] * 100) : "—", `previsto vs. ${ANO - 1}`], [pct(ct.pct), "cotas vendidas"], [`${feitos}/${tot}`, "itens do cronograma fechados"]]));
    const contaSit = (col, L) => SITUACOES[col].map(([k, n]) => [n, L.filter(x => etapa(x) === k).length]).filter(a => a[1]).map(a => `${a[1]} ${a[0].toLowerCase()}`).join(" · ") || "nada cadastrado";
    const frente = (t, v, s, alvo, barra) => el("button", { type: "button", class: "pl-frente", onclick: () => irPara(alvo) }, el("small", null, t), el("b", null, v), barra || null, el("span", null, s), el("em", null, "Abrir →"));
    const bar = (p, cor) => el("div", { class: "pl-bar" }, el("i", { style: `width:${Math.max(0, Math.min(100, p))}%;background:var(${cor || "--ok"})` }));
    const b23 = c.base2026["200023"][0];
    B.append(el("div", { class: "pl-frentes" },
      frente("Cronograma", `${tot ? Math.round(feitos / tot * 100) : 0}%`, `${feitos} de ${tot} itens fechados nas 5 fases`, "cronograma", bar(tot ? feitos / tot * 100 : 0)),
      frente("Plano de trade e cotas", pct(ct.pct), `${brl0(ct.fechado)} de ${brl0(ct.potencial)} · ${brl0(ct.negociacao)} em negociação`, "trade", bar(ct.pct, ct.pct >= 90 ? "--ok" : ct.pct >= 70 ? "--warn" : "--bad")),
      frente("Eventos", brl0(ev.liq) + " líquido", contaSit("plan_eventos", D.eventos), "eventos", bar(ev.bruto ? ev.pat / ev.bruto * 100 : 0, "--info")),
      frente("Ações promocionais", brl0(soma(D.acoes.filter(ativo).map(x => x.custo))), `${D.acoes.filter(ativo).length} ação(ões) · ${contaSit("plan_acoes", D.acoes)}`, "acoes", bar(D.acoes.length ? D.acoes.filter(firme("plan_acoes")).length / D.acoes.filter(ativo).length * 100 : 0, "--accent")),
      frente("Brindes", brl0(brP), `${contaSit("plan_brindes", D.brindes)} · ${pct(b23 ? brP / b23 * 100 : 0)} do planejado ${ANO - 1}`, "brindes", bar(b23 ? brP / b23 * 100 : 0, brP > b23 ? "--warn" : "--ok")),
      frente("Financeiro", brl0(totP), `${brl0(totC)} confirmado · ${brl0(totP - totC)} ainda em planejamento`, "financeiro", bar(totP ? totC / totP * 100 : 0))));
    // calendário geral: ações promocionais e eventos juntos
    const itG = (F.gCal !== "eventos" ? D.acoes.filter(ativo).map(itemAc) : []).concat(F.gCal !== "acoes" ? D.eventos.filter(ativo).map(itemEv) : []);
    B.append(card(`Calendário geral ${ANO} · ações promocionais e eventos`, seg([["tudo", "Tudo"], ["acoes", "Só ações"], ["eventos", "Só eventos"]], F.gCal, v => { F.gCal = v; render(); }),
      calendario(itG, { unid: ["item", "itens"], legenda: el("div", { class: "pl-calleg" }, el("span", null, el("em", { class: "tg k-ac" }, "Ação"), "ação promocional"), el("span", null, el("em", { class: "tg k-ev" }, "Evento"), "evento"),
        el("span", { class: "sb" }, "a cor da faixa mostra a situação: cinza ideia · amarelo em negociação/planejamento · azul confirmado/aprovado · verde realizado · cancelados não aparecem"), ) })));
    B.append(card("Venda das cotas × regra de decisão", el("span", { class: "pl-who" }, `prazo ${fd(c.prazoVenda)}`),
      el("div", { class: "pl-bar", title: `${pct(ct.pct)} vendido` }, el("i", { style: `width:${Math.min(100, ct.pct)}%;background:var(${ct.pct >= 90 ? "--ok" : ct.pct >= 70 ? "--warn" : "--bad"})` }), el("span", { class: "mk", style: "left:70%" }), el("span", { class: "mk", style: "left:90%" })),
      el("p", { class: "hint", style: "margin:0" }, c.regra.map(f => `${f.min ? "≥ " + f.min + "%" : "abaixo de 70%"}: ${f.txt}`).join(" · "))));
    B.append(tabelaCentros(MP, MC));
  }
  function tabelaCentros(MP, MC){
    const c = cfg(), tb = el("tbody"); let tp = 0, tc = 0;
    CENTROS.forEach(ce => { const b = c.base2026[ce.c] || [0, 0], p = soma(MP[ce.c] || []), cf = soma(MC[ce.c] || []); tp += p; tc += cf; const v = b[0] ? (p - b[0]) / b[0] * 100 : NaN;
      tb.append(el("tr", { class: "click", onclick: () => { F.fiCentro = ce.c; F.fiCat = ""; F.fiAba = "cat"; irPara("financeiro"); } },
        el("td", null, el("b", null, ce.c), " ", ce.n), el("td", { class: "r m" }, brl0(b[0])), el("td", { class: "r m" }, brl0(b[1])), el("td", { class: "r m" }, el("b", null, brl0(p))), el("td", { class: "r m" }, cf ? brl0(cf) : "—"),
        el("td", { class: "r m " + (!p ? "mut" : v > 0 ? "neg" : v < 0 ? "pos" : "") }, !p && b[0] ? "a planejar" : isFinite(v) ? (v > 0 ? "+" : "") + pct(v) : (p ? "novo" : "—")))); });
    return card(`Orçamento por centro de custo · ${ANO} × ${ANO - 1}`, el("span", { class: "pl-who" }, "clique numa linha para abrir"),
      el("div", { class: "pl-tw" }, el("table", { class: "pl-t" }, el("thead", null, el("tr", null, el("th", null, "Centro de custo"), el("th", { class: "r" }, `Planejado ${ANO - 1}`), el("th", { class: "r" }, `Realizado ${ANO - 1} (jan–set)`), el("th", { class: "r" }, `${ANO} previsto`), el("th", { class: "r" }, `${ANO} confirmado`), el("th", { class: "r" }, `vs. planejado ${ANO - 1}`))), tb,
        el("tfoot", null, el("tr", null, el("td", null, "Total"), el("td", { class: "r m" }, brl0(c.total2026[0])), el("td", { class: "r m" }, brl0(c.total2026[1])), el("td", { class: "r m" }, brl0(tp)), el("td", { class: "r m" }, brl0(tc)), el("td"))))));
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
      el("div", { class: "pl-legend" }, el("span", null, el("i", { style: "background:var(--navy)" }), "Marca própria (Lupus, Durabem)"), el("span", null, el("i", { style: "background:var(--ok)" }), "Fechada"), el("span", null, el("i", { style: "background:var(--info);opacity:.55" }), "Em negociação"), el("span", null, el("i", { style: "background:var(--surface-2);border:1px solid var(--line)" }), "Livre"))));
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

  /* ---------- eventos ---------- */
  function eventos(B){
    const c = cfg(), bl = c.baseline, col = "plan_eventos";
    const vals = Array(12).fill(0), conf = Array(12).fill(0), cont = Array(12).fill(0);
    D.eventos.filter(ativo).forEach(x => { const m = mesEv(x); if (m) { vals[m - 1] += liqEv(x); cont[m - 1]++; if (firme(col)(x)) conf[m - 1] += liqEv(x); } });
    B.append(regua({ titulo: `Calendário de eventos ${ANO}`, lede: "Custo líquido (custo bruto − patrocínio) de cada mês. Clique num mês para ver só os eventos dele. Os eventos ainda estão em planejamento: mude a situação no menu de cada linha; só o gerente confirma.",
      vals, conf, cont, legenda: true, sel: F.evMes, onSel: m => { F.evMes = m; render(); }, acoes: [btnNovo("+ Cadastrar evento", () => form(col, null))] }));
    const T = eventosTot(ativo), K = eventosTot(firme(col)), d = (v, b) => `${v - b >= 0 ? "+" : "−"}${curto(Math.abs(v - b))}`;
    B.append(totais([[`${T.series} / ${T.n}`, "eventos / ocorrências"], [curto(T.bruto), "custo bruto"], [curto(T.pat), `patrocínio (${T.bruto ? Math.round(T.pat / T.bruto * 100) : 0}% de cobertura)`],
      [curto(T.liq), "custo líquido", "net"], [curto(K.liq), `confirmado (${K.n} ocorrência${K.n === 1 ? "" : "s"})`], [curto(T.meta), "meta de receita somada"]]));
    B.append(el("p", { class: "pl-ref" }, `${bl.nome}: ${bl.eventos} ocorrências, bruto ${curto(bl.bruto)}, patrocínio ${curto(bl.patrocinio)}, líquido ${curto(bl.liquido)}. Hoje o líquido está ${d(T.liq, bl.liquido)} em relação ao esboço. Cancelados não entram nos totais.`));
    const ufs = [...new Set(D.eventos.flatMap(x => x.ufs || []))].sort();
    const temF = F.evMes || F.evSit || F.evUf;
    B.append(el("div", { class: "pl-filters" }, el("span", { class: "pl-who" }, "Ver"), seg([["mes", "Por mês"], ["evento", "Por evento"], ["cal", "Calendário anual"]], F.evVer, v => { F.evVer = v; render(); }),
      filtro("Situação", SITUACOES[col], F.evSit, v => { F.evSit = v; render(); }), filtro("Estado", ufs.map(u => [u, u]), F.evUf, v => { F.evUf = v; render(); }),
      temF ? el("button", { type: "button", class: "pl-link", onclick: () => { F.evMes = null; F.evSit = F.evUf = ""; render(); } }, "Limpar filtros") : null));
    const L = D.eventos.filter(x => (!F.evMes || mesEv(x) === F.evMes) && (!F.evSit || etapa(x) === F.evSit) && (!F.evUf || (x.ufs || []).includes(F.evUf)))
      .sort((a, b) => String(a.data).localeCompare(String(b.data)) || String(a.nome).localeCompare(b.nome));
    if (!L.length) { B.append(el("div", { class: "pl-empty" }, D.eventos.length ? "Nenhum evento com esses filtros." : "Nenhum evento cadastrado ainda.")); return; }
    const linha = x => el("li", { class: "pl-row" + (etapa(x) === "cancelado" ? " cancel" : ""), tabindex: "0", onclick: () => form(col, x), onkeydown: e => { if (e.key === "Enter") form(col, x); } },
      el("div", null, el("div", { class: "nm" }, x.nome), el("div", { class: "sb" }, [x.tipo, x.data ? fd(x.data).slice(0, 5) : ""].filter(Boolean).join(", "))),
      el("div", { class: "c2" }, el("div", null, [(x.ufs || []).join(", "), x.cidade].filter(Boolean).join(" | ") || "Praça a definir"), el("div", { class: "sb" }, x.publico ? `${x.publico} pessoas` : "")),
      el("div", { class: "c3" }, el("div", null, x.dri || "Sem responsável"), el("div", { class: "sb" }, "responsável")),
      el("div", { class: "mo" }, el("div", null, brl0(liqEv(x))), el("div", { class: "sb" }, `bruto ${brl0(x.custo)}`)), sitSelect(col, x));
    if (F.evVer === "cal") { B.append(calAnual(L)); return; }
    if (F.evVer === "evento") {
      const G = new Map(); L.forEach(x => { const k = String(x.nome || "").trim().toLowerCase(); if (!G.has(k)) G.set(k, []); G.get(k).push(x); });
      const ul = el("ul", { class: "pl-rows" });
      [...G.values()].sort((a, b) => mesEv(a[0]) - mesEv(b[0])).forEach(g => { const at = g.filter(ativo), ms = new Set(at.map(mesEv));
        const st = SITUACOES[col].map(([k, n]) => [n, g.filter(x => etapa(x) === k).length]).filter(a => a[1]).map(a => `${a[1]} ${a[0].toLowerCase()}`).join(", ");
        const det = el("details", { class: "pl-grp" }, el("summary", null,
          el("div", null, el("div", { class: "nm" }, g[0].nome), el("div", { class: "sb" }, `${g[0].tipo || ""}${g[0].tipo ? ", " : ""}${g.length} ocorrência${g.length === 1 ? "" : "s"}`),
            el("div", { class: "pl-strip" }, ...MESES.map((m, i) => el("span", { class: ms.has(i + 1) ? "on" : "", title: m })))),
          el("div", { class: "c2" }, el("div", null, [...new Set(g.flatMap(x => x.ufs || []))].join(", ") || "—"), el("div", { class: "sb" }, [...new Set(g.map(x => x.cidade).filter(Boolean))].slice(0, 3).join(", "))),
          el("div", { class: "mo" }, el("div", null, brl0(soma(at.map(liqEv)))), el("div", { class: "sb" }, `bruto ${brl0(soma(at.map(x => x.custo)))}`)),
          el("div", { class: "sb st" }, st)), el("ul", { class: "pl-rows in" }, ...g.map(linha)));
        ul.append(el("li", null, det)); });
      B.append(ul); return;
    }
    const by = {}; L.forEach(x => (by[mesEv(x)] = by[mesEv(x)] || []).push(x));
    Object.keys(by).map(Number).sort((a, b) => a - b).forEach(m => { const evs = by[m];
      B.append(el("section", { class: "pl-month" }, el("h3", null, m ? cap(MESES_L[m - 1]) : "Sem mês", el("small", null, `${evs.length} ocorrência${evs.length === 1 ? "" : "s"}, ${brl0(soma(evs.filter(ativo).map(liqEv)))} líquido`)),
        el("ul", { class: "pl-rows" }, ...evs.map(linha)))); });
  }

  /* calendário anual: 12 cartões de mês com o nome de cada item (eventos, ações). Bom para exportar e usar em apresentação */
  const COR_EV = { ideia: "--muted", negociacao: "--warn", confirmado: "--info", realizado: "--ok", cancelado: "--bad" };
  const COR_AC = { ideia: "--muted", planejando: "--warn", aprovado: "--info", executada: "--ok", cancelado: "--bad" };
  const itemEv = x => ({ m: mesEv(x), dia: x.data ? String(x.data).slice(8, 10) : "", nome: x.nome, sub: [(x.ufs || []).join(", "), x.cidade].filter(Boolean).join(" · ") || sitN("plan_eventos", etapa(x)),
    cor: COR_EV[etapa(x)] || "--muted", cancel: etapa(x) === "cancelado", tag: "Evento", k: "ev", ord: String(x.data || ""), tit: `${x.nome} · ${sitN("plan_eventos", etapa(x))}`, abrir: () => form("plan_eventos", x) });
  const itemAc = x => ({ m: mesAc(x), dia: x.inicio ? String(x.inicio).slice(8, 10) : "", nome: x.nome, sub: (x.canais || []).map(canalN).join(", ") || tipoAcN(x.tipo) || sitN("plan_acoes", etapa(x)),
    cor: COR_AC[etapa(x)] || "--muted", cancel: etapa(x) === "cancelado", tag: "Ação", k: "ac", ord: String(x.inicio || "00"), tit: `${x.nome} · ${sitN("plan_acoes", etapa(x))}`, abrir: () => form("plan_acoes", x) });
  function calendario(itens, { legenda, sel, unid } = {}){
    const by = {}; itens.forEach(x => (by[x.m] = by[x.m] || []).push(x));
    const g = el("div", { class: "pl-cal" });
    MESES_L.forEach((nm, i) => { const L = (by[i + 1] || []).slice().sort((a, b) => (a.ord || "").localeCompare(b.ord || "") || a.nome.localeCompare(b.nome)); const n = L.filter(x => !x.cancel).length;
      g.append(el("section", { class: "pl-cm" + (sel === i + 1 ? " sel" : "") },
        el("h4", null, cap(nm), el("small", null, L.length ? `${n} ${(unid || ["item", "itens"])[n === 1 ? 0 : 1]}` : "")),
        ...(L.length ? L.map(x => el("button", { type: "button", class: "pl-ce k-" + x.k + (x.cancel ? " cancel" : ""), style: `--c:var(${x.cor})`, title: x.tit, onclick: x.abrir },
          el("span", { class: "d" }, x.dia || "—"),
          el("span", { class: "n" }, x.tag ? el("em", { class: "tg" }, x.tag) : null, x.nome, el("span", { class: "u" }, x.sub)))) : [el("p", { class: "vazio" }, "—")])));
    });
    const sem = by[0] || [];
    return el("div", { class: "pl-calw" }, legenda || null, g, sem.length ? el("p", { class: "pl-who" }, `${sem.length} item(ns) sem mês não aparecem no calendário.`) : null);
  }
  const legSit = (col, cores) => el("div", { class: "pl-calleg" }, ...SITUACOES[col].map(([k, n]) => el("span", null, el("i", { style: `background:var(${cores[k]})` }), n)));
  function calAnual(L){
    return calendario(L.map(itemEv).map(x => Object.assign(x, { tag: null })), { legenda: legSit("plan_eventos", COR_EV), sel: F.evMes, unid: ["evento", "eventos"] });
  }

  /* ---------- ações promocionais (campanhas comerciais para o cliente, mês a mês) ---------- */
  function acoes(B){
    const col = "plan_acoes";
    const vals = Array(12).fill(0), conf = Array(12).fill(0), cont = Array(12).fill(0);
    D.acoes.filter(ativo).forEach(x => { const m = mesAc(x); if (m) { vals[m - 1] += +x.custo || 0; cont[m - 1]++; if (firme(col)(x)) conf[m - 1] += +x.custo || 0; } });
    B.append(regua({ titulo: `Ações promocionais ${ANO}`, lede: "Campanhas comerciais para o cliente, mês a mês: aniversário, queima de estoque, datas sazonais, ações com indústrias. Barras = custo previsto de cada mês. Tudo aqui ainda é planejamento: o custo só vira verba oficial depois que o gerente aprova e envia para Metas e custos.",
      vals, conf, cont, unid: ["ação", "ações"], legenda: true, sel: F.acMes, onSel: m => { F.acMes = m; render(); }, acoes: [btnNovo("+ Cadastrar ação", () => form(col, null))] }));
    const L0 = D.acoes.filter(ativo), K = D.acoes.filter(firme(col));
    const cus = soma(L0.map(x => x.custo)), vb = soma(L0.map(x => x.verba)), mv = soma(L0.map(x => x.metaVendas));
    const meses = new Set(L0.map(mesAc).filter(Boolean)).size;
    B.append(totais([[String(L0.length), "ações planejadas"], [`${meses}/12`, "meses com ação"], [curto(cus), "custo previsto", "net"], [curto(vb), "verba de indústrias/parceiros"],
      [curto(soma(K.map(x => x.custo))), `aprovado (${K.length} ${K.length === 1 ? "ação" : "ações"})`], [curto(mv), "meta de vendas somada"]]));
    const temF = F.acMes || F.acSit || F.acCanal;
    B.append(el("div", { class: "pl-filters" }, el("span", { class: "pl-who" }, "Ver"), seg([["mes", "Por mês"], ["cal", "Calendário anual"]], F.acVer, v => { F.acVer = v; render(); }),
      filtro("Situação", SITUACOES[col], F.acSit, v => { F.acSit = v; render(); }), filtro("Canal", CANAIS, F.acCanal, v => { F.acCanal = v; render(); }),
      temF ? el("button", { type: "button", class: "pl-link", onclick: () => { F.acMes = null; F.acSit = F.acCanal = ""; render(); } }, "Limpar filtros") : null));
    const L = D.acoes.filter(x => (!F.acMes || mesAc(x) === F.acMes) && (!F.acSit || etapa(x) === F.acSit) && (!F.acCanal || (x.canais || []).includes(F.acCanal)))
      .sort((a, b) => mesAc(a) - mesAc(b) || String(a.inicio || "").localeCompare(String(b.inicio || "")) || String(a.nome).localeCompare(b.nome));
    if (F.acVer === "cal") { B.append(calendario(L.map(itemAc).map(x => Object.assign(x, { tag: null })), { legenda: legSit(col, COR_AC), sel: F.acMes, unid: ["ação", "ações"] })); return; }
    if (!L.length) { B.append(el("div", { class: "pl-empty" }, D.acoes.length ? "Nenhuma ação com esses filtros." : "Nenhuma ação cadastrada ainda. Ex.: Janeiro · Aniversário da Lopes (tabloide, post no Instagram, sorteio, spot de rádio); Fevereiro · Zera Estoque.")); return; }
    const per = x => x.inicio ? (x.fim && x.fim !== x.inicio ? `${fd(x.inicio).slice(0, 5)} a ${fd(x.fim).slice(0, 5)}` : fd(x.inicio).slice(0, 5)) : "data a definir";
    const linha = x => el("li", { class: "pl-row pl-acrow" + (etapa(x) === "cancelado" ? " cancel" : ""), tabindex: "0", onclick: () => form(col, x), onkeydown: e => { if (e.key === "Enter") form(col, x); } },
      el("div", null, el("div", { class: "nm" }, x.nome), el("div", { class: "sb" }, [tipoAcN(x.tipo), per(x)].filter(Boolean).join(" · ")),
        (x.canais || []).length ? el("div", { class: "pl-chips" }, ...(x.canais || []).map(k => el("span", null, canalN(k)))) : null),
      el("div", { class: "c3" }, el("div", null, x.dri || "Sem responsável"), el("div", { class: "sb" }, x.publico || "responsável")),
      el("div", { class: "mo" }, el("div", null, brl0(+x.custo || 0)), el("div", { class: "sb" }, x.metaVendas ? `meta ${curto(x.metaVendas)}` : `centro ${cenAc(x)}`)), sitSelect(col, x));
    const by = {}; L.forEach(x => (by[mesAc(x)] = by[mesAc(x)] || []).push(x));
    Object.keys(by).map(Number).sort((a, b) => a - b).forEach(m => { const it = by[m];
      B.append(el("section", { class: "pl-month" }, el("h3", null, m ? cap(MESES_L[m - 1]) : "Sem mês", el("small", null, `${it.length} ação${it.length === 1 ? "" : "ões"}, ${brl0(soma(it.filter(ativo).map(x => x.custo)))} previsto`)),
        el("ul", { class: "pl-rows" }, ...it.map(linha)))); });
  }

  /* ---------- brindes (como no calendário de eventos: cada item tem uma ou mais compras) ---------- */
  const ICPS = [["001", "001 Dono"], ["002", "002 Gerente/Comprador"], ["003", "003 Vendedor de loja"], ["004", "004 Especificador"], ["interno", "Time interno"]];
  const icpN = k => (ICPS.find(i => i[0] === k) || [k, k])[1];
  const bid = x => x.itemId || x.id;
  const gruposBr = L => { const m = new Map(); L.forEach(x => { const k = bid(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }); m.forEach(a => a.sort((p, q) => mesBr(p) - mesBr(q) || (+p.ordem || 0) - (+q.ordem || 0))); return m; };
  const seriesEv = () => { const m = new Map(); D.eventos.forEach(e => { const k = String(e.nome || "").trim(); if (!k) return; if (!m.has(k)) m.set(k, []); m.get(k).push(e); }); return m; };
  const lbl = (t, i, cls, extra) => el("label", { class: cls || "" }, t, i, extra || null);

  function brindes(B){
    const c = cfg(), col = "plan_brindes";
    const vals = Array(12).fill(0), conf = Array(12).fill(0), cont = Array(12).fill(0);
    D.brindes.filter(ativo).filter(em23).forEach(x => { const m = mesBr(x); if (m) { vals[m - 1] += totBr(x); cont[m - 1]++; if (firme(col)(x)) conf[m - 1] += totBr(x); } });
    B.append(regua({ titulo: `Brindes ${ANO}`, lede: "Lance cada brinde que pretende comprar, com quantidade, custo e o mês em que será pago. A régua mostra quanto a conta 200023 precisa em cada mês; a parte laranja já foi aprovada pelo gerente.",
      vals, conf, cont, unid: ["compra", "compras"], legenda: true, sel: F.brMes, onSel: m => { F.brMes = m; render(); }, acoes: [btnNovo("Lançar brinde", () => formBrinde(null))] }));
    const A = D.brindes.filter(ativo), A23 = A.filter(em23), bruto = soma(A23.map(totBr)), verba = soma(A23.map(x => x.verba)), dez = soma(A23.filter(x => mesBr(x) === 12).map(totBr));
    const fora = soma(A.filter(x => !em23(x)).map(totBr)), K = soma(A23.filter(firme(col)).map(totBr)), base = c.base2026["200023"] || [0, 0];
    B.append(totais([[`${gruposBr(A).size} / ${A.length}`, "itens / compras"], [curto(bruto), "a orçar na 200023"], [curto(verba), "verba de indústria"], [curto(Math.max(0, bruto - verba)), "líquido 200023", "net"],
      [curto(K), "já aprovado"], [bruto ? Math.round(dez / bruto * 100) + "%" : "—", "pago em dezembro"], [curto(fora), "fora da 200023"]]));
    B.append(el("p", { class: "pl-ref" }, el("b", null, `Referência ${ANO - 1}: ${brl0(base[0])} planejados`), ` na conta 200023 (${brl0(base[1])} realizados até setembro), com 70% concentrados em dezembro. A régua considera o mês de pagamento, não o de uso. Brindes já incluídos no custo de um evento aparecem na lista, mas não somam na 200023.`));
    const temF = F.brMes || F.brSit || F.brFin || F.brConta;
    B.append(el("div", { class: "pl-filters" }, el("span", { class: "pl-who" }, "Ver"), seg([["mes", "Por mês de pagamento"], ["item", "Por item"]], F.brVer, v => { F.brVer = v; render(); }),
      filtro("Finalidade", FIN.map(f => [f, f]), F.brFin, v => { F.brFin = v; render(); }), filtro("Situação", SITUACOES[col], F.brSit, v => { F.brSit = v; render(); }), filtro("Conta", CONTAS_BR, F.brConta, v => { F.brConta = v; render(); }),
      temF ? el("button", { type: "button", class: "pl-link", onclick: () => { F.brMes = null; F.brSit = F.brFin = F.brConta = ""; render(); } }, "Limpar filtros") : null));
    if (!D.brindes.length) { B.append(el("div", { class: "pl-empty" }, "Nenhum brinde lançado ainda. Um bom começo são os kits dos eventos do calendário: vincule o evento e use \"Puxar do evento\".", el("br"), el("br"), btnNovo("Lançar o primeiro brinde", () => formBrinde(null)))); return; }
    const L = D.brindes.filter(x => (!F.brMes || mesBr(x) === F.brMes) && (!F.brSit || etapa(x) === F.brSit) && (!F.brFin || x.finalidade === F.brFin) && (!F.brConta || (x.conta || "200023") === F.brConta))
      .sort((a, b) => mesBr(a) - mesBr(b) || String(a.descricao).localeCompare(b.descricao));
    if (!L.length) { B.append(el("div", { class: "pl-empty" }, "Nenhuma compra com esses filtros.")); return; }
    const todos = gruposBr(D.brindes);
    const contaN = x => (CONTAS_BR.find(k => k[0] === (x.conta || "200023")) || ["", "Outra conta"])[1];
    const linha = x => { const g = todos.get(bid(x)) || [x], n = g.length, pos = g.indexOf(x) + 1;
      return el("li", { class: "pl-row" + (etapa(x) === "cancelado" ? " cancel" : ""), tabindex: "0", onclick: () => formBrinde(x), onkeydown: e => { if (e.key === "Enter") formBrinde(x); } },
        el("div", null, el("div", { class: "nm" }, x.descricao), el("div", { class: "sb" }, [x.finalidade, x.evento].filter(Boolean).join(", ")),
          el("div", { class: "pl-chips" }, n > 1 ? el("span", { class: "pl-chip serie" }, `${pos} de ${n}`) : null, x.mesUso ? el("span", { class: "pl-chip" }, `uso em ${MESES[x.mesUso - 1]}`) : null, ...(x.icps || []).map(i => el("span", { class: "pl-chip" }, icpN(i))))),
        el("div", { class: "c2" }, el("div", null, `${x.quantidade != null ? (+x.quantidade).toLocaleString("pt-BR") : "—"} × ${brl(x.custoUnit)}`), el("div", { class: "sb" }, x.fornecedor || "Fornecedor a definir")),
        el("div", { class: "c3" }, el("div", null, contaN(x)), em23(x) ? null : el("div", { class: "pl-out" }, "não soma na 200023")),
        el("div", { class: "mo" }, el("div", null, brl(totBr(x))), el("div", { class: "sb" }, x.verba ? "líquido " + brl(liqBr(x)) : "")), sitSelect(col, x)); };
    if (F.brVer === "item") {
      const gs = [...gruposBr(L).values()], byF = {};
      gs.forEach(g => { const f = g[0].finalidade || "Outro"; (byF[f] = byF[f] || []).push(g); });
      FIN.concat(Object.keys(byF).filter(f => !FIN.includes(f))).filter(f => byF[f]).forEach(f => { const G = byF[f];
        B.append(el("section", { class: "pl-month" }, el("h3", null, f, el("small", null, `${G.length} ite${G.length === 1 ? "m" : "ns"}, ${brl(soma(G.flat().filter(ativo).filter(em23).map(totBr)))} na 200023`)),
          el("ul", { class: "pl-rows" }, ...G.map(g => { const at = g.filter(ativo), ms = new Set(at.map(mesBr)), r = g[0];
            return el("li", null, el("details", { class: "pl-grp" }, el("summary", null,
              el("div", null, el("div", { class: "nm" }, r.descricao), el("div", { class: "sb" }, `${g.length} compra${g.length === 1 ? "" : "s"}${r.evento ? ", " + r.evento : ""}`),
                el("div", { class: "pl-strip", "aria-label": "Meses de pagamento" }, ...MESES.map((m, i) => el("span", { class: ms.has(i + 1) ? "on" : "", title: m })))),
              el("div", { class: "c2" }, el("div", null, `${soma(at.map(x => x.quantidade)).toLocaleString("pt-BR")} unidades`), el("div", { class: "sb" }, r.fornecedor || "Fornecedor a definir")),
              el("div", { class: "c3" }, el("div", null, r.dri || "Sem responsável"), el("div", { class: "sb" }, "responsável")),
              el("div", { class: "mo" }, el("div", null, brl(soma(at.map(totBr)))), el("div", { class: "sb" }, em23(r) ? "200023" : "fora da 200023"))), el("ul", { class: "pl-rows in" }, ...g.map(linha)))); }))));
      });
      return;
    }
    const by = {}; L.forEach(x => (by[mesBr(x)] = by[mesBr(x)] || []).push(x));
    Object.keys(by).map(Number).sort((a, b) => a - b).forEach(m => { const rs = by[m];
      B.append(el("section", { class: "pl-month" }, el("h3", null, m ? cap(MESES_L[m - 1]) : "Sem mês de pagamento", el("small", null, `${rs.length} compra${rs.length === 1 ? "" : "s"}, ${brl(soma(rs.filter(ativo).filter(em23).map(totBr)))} na 200023`)),
        el("ul", { class: "pl-rows" }, ...rs.map(linha)))); });
  }

  /* formulário do brinde: dados do item + uma linha por compra */
  function formBrinde(x){
    const col = "plan_brindes", Fm = $("plForm"); Fm.textContent = ""; Fm.className = "pl-panel wide";
    const g = x ? (gruposBr(D.brindes).get(bid(x)) || [x]) : [];
    const temFirme = g.some(firme(col)), travItem = !admin && temFirme;
    const v = x ? g[0] : { finalidade: F.brFin || FIN[0], conta: F.brConta || "200023" };
    const bd = el("div", { class: "bd" });
    const inp = (k, a) => { const i = el("input", Object.assign({ type: "text", value: v[k] != null ? String(v[k]) : "" }, a || {})); if (travItem) i.readOnly = true; return i; };
    const sel = (k, opts) => { const s = el("select", null, ...opts.map(([a, b]) => el("option", { value: String(a) }, b))); s.value = v[k] != null ? String(v[k]) : String(opts[0][0]); if (travItem) s.disabled = true; return s; };
    const evs = [...seriesEv().entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, L]) => [k, `${k} (${L.length} ${L.length === 1 ? "edição" : "edições"})`]);
    if (v.evento && !evs.some(e => e[0] === v.evento)) evs.push([v.evento, v.evento + " (não está no calendário)"]);
    const I = { descricao: inp("descricao", { maxlength: "140", placeholder: "Ex.: Kit Feirão (ecobag, squeeze e caneta)" }), finalidade: sel("finalidade", FIN.map(f => [f, f])), conta: sel("conta", CONTAS_BR),
      evento: sel("evento", [["", "Nenhum"]].concat(evs)), fornecedor: inp("fornecedor", { maxlength: "120" }), prazo: inp("prazo", { inputmode: "numeric", placeholder: "Ex.: 30" }),
      dri: inp("dri", { maxlength: "80", placeholder: "Um nome só" }), obs: el("textarea", { maxlength: "1500" }, v.obs || "") };
    const icps = el("div", { class: "pl-checks" }, ...ICPS.map(([k, n]) => { const cb = el("input", { type: "checkbox", value: k }); cb.checked = (v.icps || []).includes(k); if (travItem) cb.disabled = true; return el("label", null, cb, n); }));
    const evHint = el("span", { class: "pl-evh" });
    const upHint = () => { const s = seriesEv().get(I.evento.value); if (!s) { evHint.textContent = ""; return; } const at = s.filter(ativo), pub = soma(at.map(e => e.publico));
      evHint.textContent = `${at.length} ${at.length === 1 ? "edição ativa" : "edições ativas"} em ${[...new Set(at.map(e => MESES[mesEv(e) - 1]))].join(", ")}. Público total informado: ${pub ? pub.toLocaleString("pt-BR") : "não informado"}.`; };
    I.evento.addEventListener("change", upHint); upHint();
    const lista = el("div", { class: "pl-compras w2" }), prev = el("p", { class: "pl-prev w2" }), err = el("p", { class: "pl-err", hidden: true });
    const mOpts = [["", "Escolha"]].concat(mesesOpt);
    const vv = i => i.value.trim() === "" ? null : lerR(i.value);
    const offset = () => Math.ceil((Math.round(lerR(I.prazo.value)) || 0) / 30);
    const ler = n => { const R = n._R; return { mesPagamento: +R.mp.value || null, mesUso: +R.mu.value || null, quantidade: R.qtd.value.trim() === "" ? null : Math.round(lerR(R.qtd.value)), custoUnit: vv(R.unit), adicionais: vv(R.add), verba: vv(R.verba), etapa: R.st.value }; };
    const rows = () => [...lista.children].map(ler);
    const renum = () => [...lista.children].forEach((n, i) => n.querySelector(".num").textContent = "Compra " + (i + 1));
    function upd(){
      [...lista.children].forEach(n => { n._R.tot.textContent = ""; n._R.tot.append("Total ", el("strong", null, brl(totBr(ler(n))))); });
      const rs = rows().filter(ativo), t = soma(rs.map(totBr)), vb = soma(rs.map(r => r.verba)), q = soma(rs.map(r => r.quantidade));
      prev.textContent = `${rs.length} ${rs.length === 1 ? "compra ativa" : "compras ativas"}, ${q.toLocaleString("pt-BR")} unidades. Total ${brl(t)}${vb ? `, verba de indústria ${brl(vb)}, líquido ${brl(Math.max(0, t - vb))}` : ""}.${I.conta.value === "200023" ? "" : " Este item não soma na conta 200023."}`;
    }
    function addRow(o, doc){
      o = o || {};
      const trav = !admin && doc && firme(col)(doc);
      const s = (opts, val) => { const e = el("select", null, ...opts.map(([a, b]) => el("option", { value: String(a) }, b))); e.value = val != null ? String(val) : ""; if (trav) e.disabled = true; return e; };
      const mo = val => { const e = el("input", { type: "text", class: "money", inputmode: "decimal", placeholder: "0,00", value: val != null && val !== "" ? num(val) : "" }); if (trav) e.readOnly = true; return e; };
      const et = o.etapa || "ideia";
      const R = { mp: s(mOpts, o.mesPagamento), mu: s(mOpts, o.mesUso), qtd: el("input", { type: "text", inputmode: "numeric", value: o.quantidade != null ? String(o.quantidade) : "" }),
        unit: mo(o.custoUnit), add: mo(o.adicionais), verba: mo(o.verba), tot: el("span", { class: "pl-ctot" }),
        st: el("select", null, ...SITUACOES[col].map(([k, n]) => el("option", { value: k, disabled: !admin && FIRMES[col].includes(k) && k !== et ? true : null }, n + (!admin && FIRMES[col].includes(k) ? " (gerente)" : "")))) };
      R.st.value = et; if (trav) { R.qtd.readOnly = true; R.st.disabled = true; }
      const n = el("div", { class: "pl-compra" + (trav ? " trav" : "") },
        el("div", { class: "hd" }, el("b", { class: "num" }), trav ? el("span", { class: "pl-who" }, "🔒 aprovada pelo gerente")
          : el("button", { type: "button", class: "pl-link", onclick: () => { if (lista.children.length <= 1) { toast("O brinde precisa de pelo menos uma compra."); return; } n.remove(); renum(); upd(); } }, "Remover")),
        el("div", { class: "g" }, lbl("Mês de pagamento", R.mp), lbl("Mês de uso", R.mu), lbl("Quantidade", R.qtd), lbl("Custo unitário (R$)", R.unit),
          lbl("Adicionais (R$)", R.add, null, el("small", null, "frete, arte, gravação")), lbl("Verba de indústria (R$)", R.verba), lbl("Situação", R.st), R.tot));
      R.mu.addEventListener("change", () => { if (!R.mp.value && R.mu.value) R.mp.value = String(Math.max(1, +R.mu.value - offset())); });
      n._R = R; n._doc = doc || null; lista.append(n); renum(); return n;
    }
    const limpaVazias = () => [...lista.children].filter(n => !n._doc && !n._R.mp.value && !n._R.qtd.value.trim()).forEach(n => { if (lista.children.length > 1) n.remove(); });
    const last = () => { const r = rows(); return r[r.length - 1] || {}; };
    const tools = el("div", { class: "pl-tools w2" },
      el("button", { type: "button", class: "pl-btn", onclick: () => { const l = last(); addRow({ ...l, mesPagamento: l.mesPagamento ? Math.min(12, l.mesPagamento + 1) : null, mesUso: l.mesUso ? Math.min(12, l.mesUso + 1) : null, etapa: "ideia" }); upd(); } }, "+ Nova compra"),
      el("button", { type: "button", class: "pl-btn", onclick: () => {
        const s = seriesEv().get(I.evento.value); if (!s) { toast("Escolha primeiro o evento vinculado."); I.evento.focus(); return; }
        const l = last(), off = offset(), at = s.filter(ativo), usados = new Set(rows().map(r => r.mesUso + "|" + r.quantidade));
        limpaVazias(); if (lista.children.length === 1 && !lista.children[0]._doc && !lista.children[0]._R.mp.value && !lista.children[0]._R.qtd.value.trim()) lista.children[0].remove();
        let k = 0; at.forEach(e => { const m = mesEv(e), key = m + "|" + (e.publico != null ? e.publico : null); if (usados.has(key)) return;
          addRow({ mesUso: m, mesPagamento: Math.max(1, m - off), quantidade: e.publico != null ? e.publico : null, custoUnit: l.custoUnit != null ? l.custoUnit : null, etapa: "ideia" }); k++; });
        if (!lista.children.length) addRow({}); renum(); upd();
        const sem = at.filter(e => !e.publico).length;
        toast(k ? `${k} ${k === 1 ? "compra criada" : "compras criadas"}${sem ? `, ${sem} sem público informado` : ""}` : "As edições do evento já estão lançadas");
        if (off && at.some(e => mesEv(e) - off < 1)) setTimeout(() => toast("Alguma edição precisaria ser paga ainda em 2026. Ajuste o mês de pagamento dela."), 2900);
      } }, "Puxar do evento"),
      el("button", { type: "button", class: "pl-btn", onclick: () => { const l = last(), have = new Set(rows().map(r => r.mesPagamento).filter(Boolean)); let k = 0;
        for (let m = 1; m <= 12; m++) if (!have.has(m)) { addRow({ ...l, mesPagamento: m, mesUso: m, etapa: "ideia" }); k++; }
        limpaVazias(); renum(); upd(); toast(k ? `${k} ${k === 1 ? "mês adicionado" : "meses adicionados"}` : "Já há compra em todos os meses"); } }, "Repetir todo mês"),
      el("button", { type: "button", class: "pl-btn", onclick: () => { const ns = [...lista.children]; if (ns.length < 2) return; const u = ns[0]._R.unit.value; ns.slice(1).forEach(n => { if (!n._R.unit.readOnly) n._R.unit.value = u; }); upd(); toast("Custo unitário copiado"); } }, "Copiar custo unitário da 1ª para todas"));
    if (travItem) bd.append(el("p", { class: "pl-lock" }, "🔒 Este brinde tem compra aprovada pelo gerente: os dados do item e as compras aprovadas ficam travados. Você ainda pode lançar novas compras e alterar as que estão em ideia ou cotação."));
    else if (!admin) bd.append(el("p", { class: "pl-lock" }, "Você pode lançar e editar o brinde; só o gerente aprova a compra."));
    bd.append(el("h3", { class: "pl-leg" }, "Item"), el("p", { class: "pl-hint2" }, "Estes campos valem para todas as compras do item."),
      lbl("Descrição do brinde *", I.descricao, "w2"), lbl("Finalidade", I.finalidade), lbl("Conta contábil", I.conta), lbl("Evento vinculado", I.evento, "w2", evHint),
      lbl("Fornecedor", I.fornecedor), lbl("Prazo de produção (dias)", I.prazo), lbl("Responsável (DRI)", I.dri), el("div", { class: "w2 pl-fl" }, el("span", null, "Para quem"), icps),
      el("h3", { class: "pl-leg" }, "Compras"), el("p", { class: "pl-hint2" }, "Uma linha para cada compra. O mês de pagamento é o que entra no orçamento. Com um evento vinculado, \"Puxar do evento\" cria uma compra por edição, com a quantidade igual ao público e o pagamento antecipado pelo prazo de produção."),
      lista, tools, prev, el("h3", { class: "pl-leg" }, "Observações"), lbl("", I.obs, "w2"), err);
    if (g.length) g.forEach(d => addRow(d, d)); else addRow({ mesPagamento: F.brMes || null });
    bd.addEventListener("input", upd); bd.addEventListener("change", upd); upd();
    const showErr = t => { err.hidden = false; err.textContent = t; err.scrollIntoView({ block: "center" }); };
    const save = el("button", { class: "pl-btn pri", type: "submit" }, x ? "Salvar alterações" : "Salvar brinde");
    const pe = el("div", { class: "pl-acts" });
    if (x && (admin || !temFirme)) pe.append(el("button", { class: "pl-btn bad", type: "button", onclick: async () => {
      if (!confirm(g.length > 1 ? `Excluir as ${g.length} compras deste brinde?` : "Excluir este brinde?")) return;
      try { for (const d of g) await C[col].doc(d.id).delete(); toast(g.length > 1 ? `${g.length} compras excluídas` : "Brinde excluído"); fechar(); } catch (e) { showErr((e && e.message) || "Não foi possível excluir."); } } }, g.length > 1 ? `Excluir as ${g.length} compras` : "Excluir brinde"));
    Fm.append(el("header", null, el("h2", null, x ? "Editar brinde" : "Lançar brinde"), el("button", { class: "x", type: "button", "aria-label": "Fechar", onclick: fechar }, "×")), bd,
      el("footer", null, pe, el("div", { class: "pl-acts" }, el("button", { class: "pl-btn", type: "button", onclick: fechar }, "Cancelar"), save)));
    Fm.onsubmit = async ev => {
      ev.preventDefault(); err.hidden = true;
      const desc = I.descricao.value.trim(); if (!desc) { showErr("Descreva o brinde para salvar."); return; }
      const ns = [...lista.children], semMes = ns.findIndex(n => !ler(n).mesPagamento);
      if (semMes >= 0) { showErr(`Escolha o mês de pagamento da compra ${semMes + 1}.`); return; }
      const sh = { descricao: desc, finalidade: I.finalidade.value, conta: I.conta.value, evento: I.evento.value, fornecedor: I.fornecedor.value.trim(), dri: I.dri.value.trim(),
        prazo: I.prazo.value.trim() === "" ? null : Math.round(lerR(I.prazo.value)), icps: [...icps.querySelectorAll("input:checked")].map(cb => cb.value), obs: I.obs.value.trim() };
      const itemId = x ? bid(x) : "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const keep = new Set(ns.map(n => n._doc && n._doc.id).filter(Boolean));
      save.disabled = true;
      try {
        for (let j = 0; j < ns.length; j++) {
          const n = ns[j], d = n._doc, doc = Object.assign({}, sh, ler(n), { itemId, ordem: j + 1 });
          if (d) {
            if (!admin && firme(col)(d)) { if ((d.obs || "") !== sh.obs) await C[col].doc(d.id).update({ obs: sh.obs }); continue; }
            if (Object.keys(doc).some(k => JSON.stringify(doc[k] == null ? null : doc[k]) !== JSON.stringify(d[k] == null ? null : d[k]))) await C[col].doc(d.id).update(doc);
          } else {
            doc.status = FIRMES[col].includes(doc.etapa) ? "aprovado" : doc.etapa === "cancelado" ? "recusado" : "proposto"; doc.criadoPor = me && me.email;
            await C[col].add(doc);
          }
        }
        for (const d of g) if (!keep.has(d.id)) await C[col].doc(d.id).delete();
        toast(ns.length > 1 ? `${ns.length} compras salvas` : (x ? "Alterações salvas" : "Brinde salvo")); fechar();
      } catch (e) { showErr((e && e.message) || "Não foi possível salvar tudo. Confira e tente de novo."); save.disabled = false; }
    };
    $("plOv").hidden = false; setTimeout(() => { if (!travItem) I.descricao.focus(); }, 40);
  }

  /* ---------- financeiro: painel + lançamentos de todos os centros de custo ---------- */
  const catCls = (c, k) => "ch" + Math.max(0, (CATS[c] || []).findIndex(x => x[0] === k)) % 6;
  // todos os custos de um centro (lançamentos + eventos + brindes), com categoria, para os quadros "por categoria" e "resumo"
  function custosDe(centro, modo){
    const conf = modo === "confirmado", out = [];
    D.orc.filter(conf ? ok : vivo).filter(x => x.centro === centro).forEach(x => out.push({ cat: catN(centro, x.categoria) || "Sem categoria", mes: +x.mes || 0, valor: +x.valor || 0, origem: "lanc" }));
    if (centro === "200022") D.eventos.filter(conf ? firme("plan_eventos") : ativo).forEach(x => out.push({ cat: "Evento · " + (x.tipo || "sem tipo"), mes: mesEv(x), valor: +x.custo || 0, origem: "evento" }));
    D.acoes.filter(conf ? firme("plan_acoes") : ativo).filter(x => cenAc(x) === centro).forEach(x => out.push({ cat: "Ação promocional · " + (tipoAcN(x.tipo) || "sem tipo"), mes: mesAc(x), valor: +x.custo || 0, origem: "acao" }));
    if (centro === "200023") D.brindes.filter(conf ? firme("plan_brindes") : ativo).filter(em23).forEach(x => out.push({ cat: "Brinde · " + (x.finalidade || "Outro"), mes: mesBr(x), valor: totBr(x), origem: "brinde" }));
    return out;
  }
  function financeiro(B){
    const abas = [["painel", "Painel financeiro"], ["lanc", "Lançamentos"], ["resumo", "Resumo mensal"], ["cat", "Por categoria"]];
    B.append(el("div", { class: "pl-subtabs", role: "tablist", "aria-label": "Planejamento financeiro" }, ...abas.map(([k, n]) => el("button", { type: "button", role: "tab", "aria-selected": String(F.fiAba === k), onclick: () => { F.fiAba = k; render(); } }, n))));
    ({ painel: finPainel, lanc: finLanc, resumo: finResumo, cat: finCat }[F.fiAba] || finPainel)(B);
  }
  const centroSel = () => filtro("Centro de custo", CENTROS.map(x => [x.c, `${x.c} · ${x.n}`]), F.fiCentro, v => { F.fiCentro = v; F.fiCat = ""; render(); });
  const modoSeg = () => seg([["previsto", "Previsto"], ["confirmado", "Só confirmado"]], F.fiModo, v => { F.fiModo = v; render(); });

  function finPainel(B){
    const c = cfg(), MP = orcPorCentroMes("previsto"), MC = orcPorCentroMes("confirmado"), vp = porMes(MP), vc = porMes(MC);
    const M = F.fiModo === "confirmado" ? MC : MP;
    B.append(regua({ titulo: `Painel do planejamento financeiro ${ANO}`, lede: "Recebe todos os custos de todos os centros de custo, mês a mês: os lançamentos do financeiro, o custo bruto dos eventos (200022) e as compras de brindes (200023). Só custos: patrocínios e cotas não entram aqui. A parte laranja já está confirmada.",
      vals: vp, conf: vc, legenda: true, sel: F.fiMes, onSel: m => { F.fiMes = m; render(); },
      acoes: [btnNovo("+ Lançamento", () => { F.fiAba = "lanc"; render(); }),
        admin ? el("button", { class: "pl-btn ghost", type: "button", onclick: aplicarMetas }, "Enviar o confirmado para Metas e custos") : null] }));
    const totP = soma(vp), totC = soma(vc), mm = F.fiMes;
    B.append(totais([[curto(mm ? vp[mm - 1] : totP), mm ? `custos previstos em ${MESES_L[mm - 1]}` : `custos previstos ${ANO}`, "net"], [curto(mm ? vc[mm - 1] : totC), "confirmado"], [curto(mm ? vp[mm - 1] - vc[mm - 1] : totP - totC), "ainda em planejamento"],
      [curto(c.total2026[0]), `planejado ${ANO - 1}`], [curto(c.total2026[1]), `realizado ${ANO - 1} (jan–set)`], [totP && c.total2026[0] ? (totP >= c.total2026[0] ? "+" : "") + pct((totP - c.total2026[0]) / c.total2026[0] * 100) : "—", `previsto vs. ${ANO - 1}`]]));
    // de onde vêm os custos
    const fm = x => !mm || x === mm;
    const orig = [["Lançamentos do financeiro", D.orc.filter(vivo).filter(x => fm(+x.mes)), D.orc.filter(ok).filter(x => fm(+x.mes)), x => +x.valor || 0, "lanc"],
      ["Eventos · custo bruto (200022)", D.eventos.filter(ativo).filter(x => fm(mesEv(x))), D.eventos.filter(firme("plan_eventos")).filter(x => fm(mesEv(x))), x => +x.custo || 0, "eventos"],
      ["Ações promocionais (centro de cada ação)", D.acoes.filter(ativo).filter(x => fm(mesAc(x))), D.acoes.filter(firme("plan_acoes")).filter(x => fm(mesAc(x))), x => +x.custo || 0, "acoes"],
      ["Brindes na conta 200023", D.brindes.filter(ativo).filter(em23).filter(x => fm(mesBr(x))), D.brindes.filter(firme("plan_brindes")).filter(em23).filter(x => fm(mesBr(x))), totBr, "brindes"]];
    const tO = soma(orig.map(o => soma(o[1].map(o[3]))));
    B.append(card("De onde vêm os custos", el("span", { class: "pl-who" }, mm ? MESES_L[mm - 1] : `ano ${ANO}`),
      el("div", { class: "pl-tw" }, el("table", { class: "pl-t" }, el("thead", null, el("tr", null, el("th", null, "Origem"), el("th", { class: "r" }, "Registros"), el("th", { class: "r" }, "Previsto"), el("th", { class: "r" }, "Confirmado"), el("th", { class: "r" }, "% do total"), el("th", null, ""))),
        el("tbody", null, ...orig.map(([n, P, K, f, alvo]) => { const p = soma(P.map(f)); return el("tr", { class: "click", onclick: () => { if (alvo === "lanc") { F.fiAba = "lanc"; render(); } else irPara(alvo); } },
          el("td", null, el("b", null, n)), el("td", { class: "r m" }, String(P.length)), el("td", { class: "r m" }, brl0(p)), el("td", { class: "r m" }, brl0(soma(K.map(f)))), el("td", { class: "r m" }, tO ? pct(p / tO * 100) : "—"),
          el("td", { style: "width:22%" }, el("div", { class: "pl-bar" }, el("i", { style: `width:${tO ? p / tO * 100 : 0}%;background:var(--accent)` })))); })),
        el("tfoot", null, el("tr", null, el("td", null, "Total"), el("td"), el("td", { class: "r m" }, brl0(tO)), el("td", { class: "r m" }, brl0(soma(orig.map(o => soma(o[2].map(o[3])))))), el("td"), el("td")))))));
    // painel por custos: um cartão por centro de custo
    const maxC = Math.max(1, ...CENTROS.map(ce => Math.max(...(MP[ce.c] || [0]).slice(1))));
    B.append(card("Painel por centro de custo", el("span", { class: "pl-who" }, mm ? `valores de ${MESES_L[mm - 1]}` : `ano ${ANO} · clique num cartão para ver as categorias`),
      el("div", { class: "pl-centros" }, ...CENTROS.map(ce => {
        const p = mm ? (MP[ce.c] || [])[mm] || 0 : soma(MP[ce.c] || []), cf = mm ? (MC[ce.c] || [])[mm] || 0 : soma(MC[ce.c] || []), b = c.base2026[ce.c] || [0, 0];
        const ref = mm ? b[0] / 12 : b[0], v = ref ? (p - ref) / ref * 100 : NaN, uso = ref ? Math.min(100, p / ref * 100) : (p ? 100 : 0), acima = ref && p > ref;
        return el("button", { type: "button", class: "pl-cc" + (F.fiCentro === ce.c ? " on" : ""), onclick: () => { F.fiCentro = ce.c; F.fiCat = ""; F.fiAba = "cat"; render(); } },
          el("div", { class: "hd" }, el("b", null, ce.c), el("span", null, ce.n)),
          el("strong", null, brl0(p)), el("span", { class: "sb" }, `${brl0(cf)} confirmado${ce.derivado ? ` · inclui a aba ${cap(ce.derivado)}` : ""}`),
          el("div", { class: "pl-bar" }, el("i", { style: `width:${uso}%;background:var(${acima ? "--bad" : "--ok"})` })),
          el("span", { class: "sb" + (acima ? " neg" : "") }, ref ? `${mm ? "média mensal" : "planejado"} ${ANO - 1}: ${brl0(ref)} · ${p ? (v > 0 ? "+" : "") + pct(v) : "a planejar"}` : (p ? `novo em ${ANO}` : `sem orçamento em ${ANO - 1}`)),
          el("div", { class: "pl-spark", "aria-hidden": "true" }, ...MESES.map((_, i) => { const xv = (MP[ce.c] || [])[i + 1] || 0; return el("span", { class: mm === i + 1 ? "sel" : "", style: `height:${xv ? Math.max(3, Math.round(xv / maxC * 34)) : 1}px`, title: `${MESES[i]}: ${brl0(xv)}` }); })));
      }))));
    // matriz centro × mês
    const head = el("tr", null, el("th", null, "Centro de custo"), ...MESES.map((m, i) => el("th", { class: "r" + (mm === i + 1 ? " sel" : "") }, m)), el("th", { class: "r" }, "Ano"), el("th", { class: "r" }, `Plan. ${ANO - 1}`));
    const tb = el("tbody"); const tot = Array(13).fill(0);
    CENTROS.forEach(ce => { const r = M[ce.c] || Array(13).fill(0); r.forEach((v, i) => tot[i] += v);
      tb.append(el("tr", null, el("td", null, el("b", null, ce.c), el("span", null, ce.n)), ...MESES.map((_, i) => el("td", { class: "r m" + (mm === i + 1 ? " sel" : "") }, r[i + 1] ? num(r[i + 1]) : "")), el("td", { class: "r m" }, el("b", null, brl0(soma(r)))), el("td", { class: "r m mut" }, brl0((c.base2026[ce.c] || [0])[0])))); });
    B.append(card("Centro de custo × mês", modoSeg(),
      el("div", { class: "pl-tw" }, el("table", { class: "pl-t pl-mx" }, el("thead", null, head), tb,
        el("tfoot", null, el("tr", null, el("td", null, "Total"), ...MESES.map((_, i) => el("td", { class: "r m" + (mm === i + 1 ? " sel" : "") }, tot[i + 1] ? num(tot[i + 1]) : "")), el("td", { class: "r m" }, brl0(soma(tot))), el("td", { class: "r m" }, brl0(c.total2026[0]))))))));
  }

  function finLanc(B){
    const col = "plan_orcamento";
    // formulário rápido (como no planejamento do 200021), valendo para qualquer centro de custo
    const fMes = el("select", null, ...mesesOpt.map(([a, b]) => el("option", { value: String(a) }, b))); fMes.value = String(F.lfMes || F.fiMes || 1);
    const fCen = el("select", null, ...CENTROS.map(x => el("option", { value: x.c }, `${x.c} · ${x.n}`))); fCen.value = F.lfCen || F.fiCentro || "200021";
    const fCat = el("select");
    const fillC = () => { fCat.textContent = ""; (CATS[fCen.value] || [["outros", "Outros"]]).forEach(([k, n]) => fCat.append(el("option", { value: k }, n))); if (F.lfCat && (CATS[fCen.value] || []).some(x => x[0] === F.lfCat)) fCat.value = F.lfCat; };
    fCen.addEventListener("change", () => { F.lfCen = fCen.value; F.lfCat = ""; fillC(); }); fillC();
    fMes.addEventListener("change", () => F.lfMes = +fMes.value); fCat.addEventListener("change", () => F.lfCat = fCat.value);
    const fDesc = el("input", { type: "text", maxlength: "160", placeholder: "Ex.: Impressão catálogo 2027/2028" });
    const fVal = el("input", { type: "text", class: "money", inputmode: "decimal", placeholder: "0,00" });
    const btn = el("button", { class: "pl-btn pri", type: "button" }, "Adicionar");
    const add = async () => {
      const desc = fDesc.value.trim(), valor = lerR(fVal.value);
      if (!desc || !valor) { toast("Preencha a descrição e o valor."); (desc ? fVal : fDesc).focus(); return; }
      F.lfMes = +fMes.value; F.lfCen = fCen.value; F.lfCat = fCat.value; btn.disabled = true;
      try { await C[col].add({ centro: fCen.value, categoria: fCat.value, descricao: desc, valor, mes: +fMes.value, status: "proposto", criadoPor: me && me.email });
        toast("Lançamento salvo como previsto (aguarda aprovação)"); }
      catch (e) { toast((e && e.message) || "Não foi possível salvar."); }
      btn.disabled = false; fDesc.value = ""; fVal.value = "";
      if (document.activeElement) document.activeElement.blur(); render(); const nd = document.querySelector(".pl-lform input[maxlength='160']"); if (nd) nd.focus();
    };
    btn.addEventListener("click", add);
    fVal.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); add(); } });
    B.append(card("Novo lançamento", el("span", { class: "pl-who" }, admin ? "o que você lança já entra aprovado" : "fica aguardando a aprovação do gerente"),
      el("div", { class: "pl-lform" }, lbl("Mês", fMes, "s"), lbl("Centro de custo", fCen, "l"), lbl("Categoria", fCat, "l"), lbl("Descrição", fDesc, "xl"), lbl("Valor (R$)", fVal, "m"), el("div", { class: "b" }, btn)),
      el("p", { class: "hint", style: "margin:0" }, "Os eventos do calendário (200022) e as compras de brindes (200023) já entram sozinhos no painel; aqui você lança os demais custos de qualquer centro, inclusive custos extras de eventos e brindes. Use ↻ para repetir um lançamento em outros meses.")));
    // filtros e tabela
    const cats = F.fiCentro ? (CATS[F.fiCentro] || []) : [];
    B.append(el("div", { class: "pl-filters" }, filtro("Mês", mesesOpt.map(([a, b]) => [String(a), b]), F.fiMes ? String(F.fiMes) : "", v => { F.fiMes = +v || null; render(); }), centroSel(),
      cats.length ? filtro("Categoria", cats, F.fiCat, v => { F.fiCat = v; render(); }) : null,
      filtro("Situação", [["aprovado", "Aprovado"], ["proposto", "Aguardando aprovação"], ["recusado", "Recusado"]], F.fiSit, v => { F.fiSit = v; render(); }),
      (F.fiMes || F.fiCentro || F.fiCat || F.fiSit) ? el("button", { type: "button", class: "pl-link", onclick: () => { F.fiMes = null; F.fiCentro = F.fiCat = F.fiSit = ""; render(); } }, "Limpar filtros") : null));
    const L = D.orc.filter(x => (!F.fiMes || +x.mes === F.fiMes) && (!F.fiCentro || x.centro === F.fiCentro) && (!F.fiCat || x.categoria === F.fiCat) && (F.fiSit ? x.status === F.fiSit : vivo(x)))
      .sort((a, b) => (+a.mes - +b.mes) || String(a.centro).localeCompare(b.centro) || String(a.descricao).localeCompare(b.descricao));
    if (!L.length) { B.append(el("div", { class: "pl-empty" }, D.orc.length ? "Nenhum lançamento neste filtro." : "Nenhum lançamento ainda. Use o formulário acima para adicionar.")); return; }
    const ac = (t, cls, fn, title) => el("button", { type: "button", class: "pl-ic " + cls, title, "aria-label": title, onclick: e => { e.stopPropagation(); fn(); } }, t);
    const tb = el("tbody");
    L.forEach(x => { const pode = admin || x.status !== "aprovado";
      tb.append(el("tr", null, el("td", null, cap(MESES_L[(+x.mes || 1) - 1])), el("td", null, el("b", null, x.centro), el("div", { class: "pl-who" }, centroN(x.centro))),
        el("td", null, el("span", { class: "pl-cat " + catCls(x.centro, x.categoria) }, catN(x.centro, x.categoria) || "—")), el("td", null, x.descricao || "", x.serie ? el("div", { class: "pl-who" }, "repetido") : null),
        el("td", { class: "r m" }, brl(x.valor)), el("td", null, pill(x.status)),
        el("td", null, el("div", { class: "pl-acts nw" }, ac("↻", "rep", () => repetir(x), "Repetir para outros meses"), ac("✎", "", () => form(col, x), pode ? "Editar" : "Ver"),
          admin && x.status === "proposto" ? ac("✓", "ok", () => decidir([{ col, x }], "aprovado"), "Aprovar") : null,
          pode ? ac("×", "bad", async () => { if (!confirm("Remover este lançamento?")) return; try { await C[col].doc(x.id).delete(); toast("Lançamento removido"); } catch (e) { toast((e && e.message) || "Não foi possível remover."); } }, "Apagar") : null)))); });
    const desc = [F.fiMes ? MESES_L[F.fiMes - 1] : "", F.fiCentro ? F.fiCentro : "", F.fiCat ? catN(F.fiCentro, F.fiCat) : ""].filter(Boolean).join(" — ");
    B.append(el("div", { class: "pl-tw pl-lt" }, el("table", { class: "pl-t", style: "min-width:860px" },
      el("thead", null, el("tr", null, ...["Mês", "Centro", "Categoria", "Descrição", "Valor", "Situação", "Ações"].map((h, i) => el("th", { class: i === 4 ? "r" : "" }, h)))), tb,
      el("tfoot", null, el("tr", null, el("td", { colspan: "4" }, `Total ${ANO}${desc ? " — " + desc : ""} (${L.length} lançamento${L.length === 1 ? "" : "s"})`), el("td", { class: "r m" }, brl(soma(L.map(x => x.valor)))), el("td", { colspan: "2" }))))));
  }
  // repetir um lançamento em outros meses (meses que já têm o mesmo lançamento ficam marcados ✓)
  function repetir(x){
    const ov = el("div", { class: "pl-mov" }); ov.addEventListener("click", e => { if (e.target === ov) ov.remove(); });
    const exist = new Set(D.orc.filter(y => vivo(y) && y.centro === x.centro && y.categoria === x.categoria && y.descricao === x.descricao).map(y => +y.mes));
    const sel = new Set();
    const grid = el("div", { class: "pl-mgrid" }, ...MESES_L.map((m, i) => { const k = i + 1, has = exist.has(k);
      const b = el("button", { type: "button", class: "pl-mopt" + (has ? " dis" : ""), disabled: has ? true : null, onclick: () => { if (sel.has(k)) { sel.delete(k); b.classList.remove("on"); } else { sel.add(k); b.classList.add("on"); } } }, cap(m).slice(0, 3) + (has ? " ✓" : ""));
      b.dataset.m = String(k); return b; }));
    const marca = f => grid.querySelectorAll(".pl-mopt:not(.dis)").forEach(b => { const k = +b.dataset.m, on = f(k); if (on) sel.add(k); else sel.delete(k); b.classList.toggle("on", on); });
    const okB = el("button", { class: "pl-btn pri", type: "button" }, "Criar cópias");
    okB.addEventListener("click", async () => {
      if (!sel.size) { toast("Selecione ao menos um mês."); return; }
      okB.disabled = true; let n = 0;
      try { const ms = [...sel].sort((a, b) => a - b); for (const m of ms) { okB.textContent = `Criando ${n + 1} de ${ms.length}…`; await C.plan_orcamento.add({ centro: x.centro, categoria: x.categoria, descricao: x.descricao, valor: +x.valor || 0, mes: m, status: "proposto", criadoPor: me && me.email, serie: x.serie || x.id }); n++; }
        toast(`${n} cópia${n === 1 ? "" : "s"} criada${n === 1 ? "" : "s"}`); ov.remove(); }
      catch (e) { toast((e && e.message) || "Não foi possível criar as cópias."); okB.disabled = false; okB.textContent = "Criar cópias"; }
    });
    ov.append(el("div", { class: "pl-modal", role: "dialog", "aria-modal": "true", "aria-label": "Repetir lançamento" },
      el("h3", null, "Repetir lançamento"), el("p", { class: "hint" }, "Selecione os meses para criar cópias deste lançamento:"),
      el("div", { class: "pl-minfo" }, el("b", null, x.descricao), el("br"), `${x.centro} · ${catN(x.centro, x.categoria)} · ${brl(x.valor)} · ${ANO}`),
      el("div", { class: "pl-acts" }, el("button", { class: "pl-btn", type: "button", onclick: () => marca(() => true) }, "Todos"), el("button", { class: "pl-btn", type: "button", onclick: () => marca(k => k > +x.mes) }, "Restantes do ano"), el("button", { class: "pl-btn", type: "button", onclick: () => marca(() => false) }, "Limpar")),
      grid, el("div", { class: "pl-acts end" }, el("button", { class: "pl-btn", type: "button", onclick: () => ov.remove() }, "Cancelar"), okB)));
    document.body.append(ov); const f = grid.querySelector(".pl-mopt:not(.dis)"); if (f) f.focus();
  }

  function finResumo(B){
    const c = cfg(), ids = F.fiCentro ? [F.fiCentro] : CENTROS.map(x => x.c), M = orcPorCentroMes(F.fiModo);
    const por = Array(13).fill(0); ids.forEach(k => (M[k] || []).forEach((v, i) => por[i] += v));
    const tot = soma(por), itens = ids.reduce((s, k) => s + custosDe(k, F.fiModo).length, 0);
    const plan = F.fiCentro ? (c.base2026[F.fiCentro] || [0, 0])[0] : c.total2026[0], real = F.fiCentro ? (c.base2026[F.fiCentro] || [0, 0])[1] : c.total2026[1];
    const p = plan ? Math.round(tot / plan * 100) : 0, cor = p > 100 ? "--bad" : p > 80 ? "--warn" : "--ok";
    B.append(el("div", { class: "pl-filters" }, centroSel(), modoSeg()));
    B.append(el("div", { class: "pl-sum" },
      el("div", null, el("b", null, brl(tot)), el("span", null, `${F.fiModo === "confirmado" ? "Confirmado" : "Previsto"} ${ANO}${F.fiCentro ? " · " + F.fiCentro : " · todos os centros"}`)),
      el("div", null, el("b", null, String(itens)), el("span", null, "Lançamentos (inclui eventos e compras de brindes)")),
      el("div", null, el("b", null, plan ? brl(plan) : "—"), el("span", null, plan ? `Planejado ${ANO - 1}` : `Planejado ${ANO - 1} (sem valor)`),
        plan ? el("div", { class: "pl-bar" }, el("i", { style: `width:${Math.min(p, 100)}%;background:var(${cor})` })) : null, plan ? el("span", null, `${p}% do planejado de ${ANO - 1}`) : null),
      el("div", null, el("b", null, real ? brl(real) : "—"), el("span", null, `Realizado ${ANO - 1} (jan–set)`))));
    const tb = el("tbody"), med = plan / 12;
    for (let m = 1; m <= 12; m++) { const v = por[m], pp = tot ? v / tot * 100 : 0;
      tb.append(el("tr", { class: "click", onclick: () => { F.fiMes = m; F.fiAba = "lanc"; render(); } }, el("td", null, cap(MESES_L[m - 1])), el("td", { class: "r m" }, v ? brl(v) : "—"), el("td", { class: "r m" }, v ? pct(pp) : "—"),
        el("td", { class: "r m " + (med && v > med ? "neg" : "") }, med ? (v ? (v >= med ? "+" : "") + pct((v - med) / med * 100) : "—") : "—"),
        el("td", { style: "width:32%" }, el("div", { class: "pl-bar" }, el("i", { style: `width:${pp}%;background:var(--accent)` }))))); }
    B.append(card("Resumo mensal", el("span", { class: "pl-who" }, "clique num mês para ver os lançamentos dele"),
      el("div", { class: "pl-tw" }, el("table", { class: "pl-t", style: "min-width:620px" }, el("thead", null, el("tr", null, el("th", null, "Mês"), el("th", { class: "r" }, "Valor"), el("th", { class: "r" }, "% do ano"), el("th", { class: "r" }, `vs. média mensal ${ANO - 1}`), el("th", null, "Distribuição"))), tb,
        el("tfoot", null, el("tr", null, el("td", null, "Total"), el("td", { class: "r m" }, brl(tot)), el("td", { class: "r m" }, tot ? "100%" : "—"), el("td", { class: "r m" }, med ? brl(med) + "/mês" : ""), el("td")))))));
  }

  function finCat(B){
    const ids = F.fiCentro ? [F.fiCentro] : CENTROS.map(x => x.c);
    B.append(el("div", { class: "pl-filters" }, centroSel(), modoSeg()));
    const blocos = ids.map(k => { const L = custosDe(k, F.fiModo), by = {};
      L.forEach(r => { const b = by[r.cat] || (by[r.cat] = { n: 0, t: 0, origem: r.origem }); b.n++; b.t += r.valor; });
      return { k, L, tot: soma(L.map(r => r.valor)), cats: Object.entries(by).sort((a, b) => b[1].t - a[1].t) }; });
    const geral = soma(blocos.map(b => b.tot));
    const tb = el("tbody");
    blocos.forEach(b => {
      if (ids.length > 1) tb.append(el("tr", { class: "grp" }, el("td", null, el("b", null, b.k), " ", centroN(b.k)), el("td", { class: "r m" }, String(b.L.length || "—")), el("td", { class: "r m" }, el("b", null, b.tot ? brl(b.tot) : "—")), el("td", { class: "r m" }, geral && b.tot ? pct(b.tot / geral * 100) : "—"), el("td")));
      const base = ids.length > 1 ? geral : b.tot;
      (b.cats.length ? b.cats : (ids.length > 1 ? [] : [["Sem lançamentos", { n: 0, t: 0 }]])).forEach(([n, d]) => { const pp = base ? d.t / base * 100 : 0;
        tb.append(el("tr", { class: "sub" }, el("td", null, el("span", { class: "pl-cat " + (d.origem === "evento" ? "ch1" : d.origem === "brinde" ? "ch3" : catCls(b.k, ((CATS[b.k] || []).find(x => x[1] === n) || [""])[0])) }, n)),
          el("td", { class: "r m" }, d.n ? String(d.n) : "—"), el("td", { class: "r m" }, d.t ? brl(d.t) : "—"), el("td", { class: "r m" }, d.t ? pct(pp) : "—"),
          el("td", { style: "width:28%" }, el("div", { class: "pl-bar" }, el("i", { style: `width:${pp}%;background:var(--accent)` }))))); });
    });
    B.append(card(`Por categoria${F.fiCentro ? " · " + F.fiCentro + " " + centroN(F.fiCentro) : " · todos os centros de custo"}`, el("span", { class: "pl-who" }, F.fiModo === "confirmado" ? "só confirmado" : "previsto"),
      el("div", { class: "pl-tw" }, el("table", { class: "pl-t pl-ct", style: "min-width:640px" }, el("thead", null, el("tr", null, el("th", null, ids.length > 1 ? "Centro / categoria" : "Categoria"), el("th", { class: "r" }, "Lançamentos"), el("th", { class: "r" }, "Total"), el("th", { class: "r" }, ids.length > 1 ? "% do total" : "% do centro"), el("th", null, "Distribuição"))), tb,
        el("tfoot", null, el("tr", null, el("td", null, "Total"), el("td", { class: "r m" }, String(blocos.reduce((s, b) => s + b.L.length, 0))), el("td", { class: "r m" }, brl(geral)), el("td", { class: "r m" }, geral ? "100%" : "—"), el("td"))))),
      el("p", { class: "hint", style: "margin:0" }, "No 200022 os eventos aparecem pelo tipo e no 200023 os brindes pela finalidade; os demais vêm dos lançamentos do financeiro.")));
  }

  function aprovar(B){
    const P = pendentes();
    if (!P.length) B.append(card("Aguardando aprovação", null, el("div", { class: "pl-empty" }, "Nada aguardando aprovação.")));
    else {
      const tb = el("tbody");
      P.forEach(p => tb.append(el("tr", null, el("td", null, p.tipo), el("td", null, el("b", null, p.txt), el("div", { class: "pl-who" }, quem(p.x.criadoPor))), el("td", { class: "r m" }, p.val != null ? brl(p.val) : "—"),
        el("td", null, admin ? el("div", { class: "pl-acts" }, el("button", { class: "pl-btn ok", type: "button", onclick: () => decidir([p], "aprovado") }, "Aprovar"), el("button", { class: "pl-btn bad", type: "button", onclick: () => decidir([p], "recusado") }, "Recusar"), el("button", { class: "pl-btn", type: "button", onclick: () => form(p.col, p.x) }, "Abrir"))
          : el("span", { class: "pl-who" }, "aguardando o gerente")))));
      B.append(card("Aguardando aprovação", admin ? el("button", { class: "pl-btn ok", type: "button", onclick: () => decidir(P, "aprovado") }, `Aprovar todos (${P.length})`) : null,
        el("div", { class: "pl-tw" }, el("table", { class: "pl-t", style: "min-width:720px" }, el("thead", null, el("tr", null, el("th", null, "Tipo"), el("th", null, "Item"), el("th", { class: "r" }, "Valor"), el("th", null, ""))), tb))));
    }
    // eventos e brindes ainda não confirmados (não contam no aviso de pendências: estão em planejamento)
    const E = D.eventos.filter(x => ativo(x) && !firme("plan_eventos")(x)).sort((a, b) => String(a.data).localeCompare(String(b.data))).map(x => ({ col: "plan_eventos", x, tipo: "Evento", txt: `${x.nome} · ${x.cidade || ""} · ${fd(x.data)}`, val: liqEv(x) }))
      .concat(D.acoes.filter(x => ativo(x) && !firme("plan_acoes")(x)).sort((a, b) => mesAc(a) - mesAc(b)).map(x => ({ col: "plan_acoes", x, tipo: "Ação promocional", txt: `${x.nome} · ${mesAc(x) ? MESES_L[mesAc(x) - 1] : "sem mês"}`, val: +x.custo || 0 })))
      .concat(D.brindes.filter(x => ativo(x) && !firme("plan_brindes")(x)).map(x => ({ col: "plan_brindes", x, tipo: "Brinde", txt: `${x.descricao} · pagamento em ${x.mesPagamento ? MESES_L[x.mesPagamento - 1] : "?"}`, val: totBr(x) })));
    const tb2 = el("tbody");
    E.forEach(p => tb2.append(el("tr", null, el("td", null, p.tipo), el("td", null, el("b", null, p.txt), el("div", { class: "pl-who" }, quem(p.x.criadoPor))), el("td", { class: "r m" }, brl0(p.val)), el("td", null, sitSelect(p.col, p.x)),
      el("td", null, admin ? el("button", { class: "pl-btn ok", type: "button", onclick: () => salvar(p.col, p.x, { etapa: FIRMES[p.col][0] }) }, p.col === "plan_eventos" ? "Confirmar" : "Aprovar") : null))));
    B.append(card("Eventos, ações e brindes ainda em planejamento", el("span", { class: "pl-who" }, admin ? "confirme quando o item estiver fechado" : "só o gerente confirma"),
      E.length ? el("div", { class: "pl-tw" }, el("table", { class: "pl-t", style: "min-width:760px" }, el("thead", null, el("tr", null, el("th", null, "Tipo"), el("th", null, "Item"), el("th", { class: "r" }, "Valor"), el("th", null, "Situação"), el("th", null, ""))), tb2))
        : el("div", { class: "pl-empty" }, "Todos os eventos, ações e brindes estão confirmados.")));
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
    const M = orcPorCentroMes("confirmado"); const ids = CENTROS.filter(c => c.id);
    const total = soma(ids.map(c => soma(M[c.c])));
    if (!confirm(`Enviar o orçamento confirmado (${brl(total)}) como "projetado" de cada mês de ${ANO} em Metas e custos? Os valores projetados de ${ANO} desses centros serão substituídos.`)) return;
    const col = Store.collection("metas_mensais"); let n = 0;
    try {
      for (let m = 1; m <= 12; m++) {
        const projetado = Object.assign({}, ((D.mm || {})[`custos-${ANO}-${pad(m)}`] || {}).projetado || {}); ids.forEach(c => projetado[c.id] = Math.round((M[c.c][m] || 0) * 100) / 100);
        const itens = D.orc.filter(ok).filter(x => +x.mes === m && (CENTROS.find(c => c.c === x.centro) || {}).id).map(x => ({ centro: CENTROS.find(c => c.c === x.centro).id, conta: x.centro, item: x.descricao || catN(x.centro, x.categoria), valor: +x.valor || 0 }))
          .concat(D.eventos.filter(firme("plan_eventos")).filter(x => mesEv(x) === m).map(x => ({ centro: "eventos", conta: "200022", item: `${x.nome} · ${x.cidade || ""}`, valor: +x.custo || 0 })))
          .concat(D.acoes.filter(firme("plan_acoes")).filter(x => mesAc(x) === m && (CENTROS.find(c => c.c === cenAc(x)) || {}).id).map(x => ({ centro: CENTROS.find(c => c.c === cenAc(x)).id, conta: cenAc(x), item: `Ação: ${x.nome}`, valor: +x.custo || 0 })))
          .concat(D.brindes.filter(firme("plan_brindes")).filter(em23).filter(x => mesBr(x) === m).map(x => ({ centro: "brindes", conta: "200023", item: x.descricao, valor: totBr(x) })));
        await col.doc(`custos-${ANO}-${pad(m)}`).update({ tipo: "custos", mes: `${ANO}-${pad(m)}`, projetado, itens, fonte: `Planejamento ${ANO} (confirmado)` }); n++;
      }
      toast(`Projetado de ${n} meses enviado para Metas e custos`);
    } catch (e) { toast((e && e.message) || "Não foi possível enviar."); }
  }

  /* ---------- formulários ---------- */
  const LIVRES = { plan_fases: ["situacao", "obs"], plan_cotas: ["etapa", "obs", "contato"], plan_eventos: ["obs"], plan_acoes: ["obs"], plan_brindes: ["obs"], plan_orcamento: [] };
  const travadoP = (col, x) => FIRMES[col] ? FIRMES[col].includes(etapa(x)) : x.status === "aprovado";
  const mesesOpt = MESES_L.map((m, i) => [i + 1, cap(m)]);
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
      ["nome", "Evento", "text", null, "w2"], ["etapa", "Situação", "select", SITUACOES.plan_eventos], ["data", "Data", "date"], ["tipo", "Tipo", "text"], ["cidade", "Cidade", "text"], ["ufsTxt", "UF(s) (ex.: MS ou RO/AC)", "text"],
      ["publico", "Público estimado", "number"], ["custo", "Custo bruto (R$)", "money"], ["patrocinio", "Patrocínio previsto (R$)", "money"], ["custo2026", "Custo em 2026 (R$)", "money"],
      ["metaReceita", "Meta de receita (R$)", "money"], ["dri", "Responsável", "text"], ["patrocinadores", "Indústrias patrocinadoras", "text", null, "w2"], ["obs", "Observação", "textarea", null, "w2"]] },
    plan_acoes: { t: "Ação promocional", f: [
      ["nome", "Ação (ex.: Aniversário da Lopes, Zera Estoque)", "text", null, "w2"], ["etapa", "Situação", "select", SITUACOES.plan_acoes], ["tipo", "Tipo de ação", "select", TIPOS_AC],
      ["mes", "Mês", "select", mesesOpt], ["dri", "Responsável", "text"], ["inicio", "Início (opcional)", "date"], ["fim", "Fim (opcional)", "date"],
      ["canais", "Canais e peças", "multi", CANAIS, "w2"], ["objetivo", "Objetivo / mecânica (ofertas, prêmios, regras)", "textarea", null, "w2"],
      ["publico", "Público e praças (ex.: revendas MS e MT)", "text", null, "w2"], ["centro", "Centro de custo", "select", CENTROS.map(c => [c.c, `${c.c} · ${c.n}`])],
      ["custo", "Custo previsto (R$)", "money"], ["verba", "Verba de indústria / parceiros (R$)", "money"], ["metaVendas", "Meta de vendas (R$)", "money"],
      ["obs", "Observação", "textarea", null, "w2"]] },
    plan_brindes: { t: "Brinde", f: [
      ["descricao", "Descrição do brinde", "text", null, "w2"], ["etapa", "Situação", "select", SITUACOES.plan_brindes], ["finalidade", "Finalidade", "select", FIN.map(f => [f, f])],
      ["conta", "Conta contábil", "select", CONTAS_BR], ["evento", "Evento vinculado (opcional)", "text"], ["mesPagamento", "Mês de pagamento", "select", mesesOpt], ["mesUso", "Mês de uso", "select", [["", "—"]].concat(mesesOpt)],
      ["quantidade", "Quantidade", "number"], ["custoUnit", "Custo unitário (R$)", "money"], ["adicionais", "Adicionais (frete, arte, gravação) (R$)", "money"], ["verba", "Verba de indústria (R$)", "money"],
      ["fornecedor", "Fornecedor", "text"], ["dri", "Responsável", "text"], ["obs", "Observação", "textarea", null, "w2"]] },
    plan_orcamento: { t: "Lançamento do financeiro", f: [
      ["centro", "Centro de custo", "select", CENTROS.map(c => [c.c, `${c.c} · ${c.n}`])], ["categoria", "Categoria", "text"],
      ["descricao", "Descrição", "text", null, "w2"], ["valor", "Valor (R$)", "money"], ["mes", "Mês", "select", mesesOpt]] } };
  const REPETE = { plan_orcamento: "mes", plan_brindes: "mesPagamento", plan_acoes: "mes" };

  function form(col, x, preset){
    if (col === "plan_brindes") return formBrinde(x);
    const sp = SPEC[col], novo = !x, Fm = $("plForm"); Fm.textContent = ""; Fm.className = "pl-panel";
    const travado = !novo && !admin && travadoP(col, x);
    const pode = k => !travado || LIVRES[col].includes(k);
    const v = Object.assign({}, preset || {}, x || {}); if (col === "plan_eventos") v.ufsTxt = (v.ufs || []).join("/");
    if (novo && col === "plan_fases") { v.situacao = "pendente"; v.ordem = (D.fases.filter(y => +y.fase === +v.fase).reduce((m, y) => Math.max(m, +y.ordem || 0), 0) + 1); }
    if (novo && col === "plan_cotas") { v.etapa = "prospeccao"; v.meses = cfg().meses; v.cota = "ouro"; }
    if (novo && col === "plan_orcamento" && !v.mes) v.mes = 1;
    if (novo && col === "plan_eventos" && F.evMes) v.data = `${ANO}-${pad(F.evMes)}-01`;
    if (novo && col === "plan_acoes") { v.mes = F.acMes || 1; v.centro = "200020"; v.tipo = v.tipo || "comercial"; v.canais = v.canais || []; }
    if (novo && col === "plan_brindes") { v.mesPagamento = F.brMes || 1; v.conta = "200023"; v.finalidade = FIN[0]; }
    if (FIRMES[col]) v.etapa = etapa(v);
    const bd = el("div", { class: "bd" }), ins = {};
    if (travado) bd.append(el("p", { class: "pl-lock" }, LIVRES[col].length ? `🔒 Item ${FIRMES[col] ? "confirmado" : "aprovado"}. Você pode atualizar ${LIVRES[col].map(k => (sp.f.find(f => f[0] === k) || [k, k])[1].toLowerCase()).join(" e ")}; o restante só o gerente altera.` : "🔒 Item aprovado. Só o gerente altera."));
    else if (!novo && !admin && FIRMES[col]) bd.append(el("p", { class: "pl-lock" }, "Em planejamento: você pode editar e mudar a situação até o gerente confirmar."));
    else if (!novo && x.status === "proposto" && !admin) bd.append(el("p", { class: "pl-lock" }, "Aguardando aprovação do gerente."));
    sp.f.forEach(([k, lab, tipo, opts, cls]) => {
      let i;
      if (tipo === "select") {
        const soGer = a => k === "etapa" && FIRMES[col] && !admin && FIRMES[col].includes(a);
        i = el("select", null, ...opts.map(([a, b]) => el("option", { value: String(a), disabled: soGer(a) && a !== v.etapa ? true : null }, b + (soGer(a) ? " (gerente)" : ""))));
        i.value = String(v[k] != null ? v[k] : opts[0][0]);
      }
      else if (tipo === "textarea") i = el("textarea", { maxlength: "1000" }, v[k] || "");
      else if (tipo === "check") { i = el("input", { type: "checkbox", style: "width:auto" }); i.checked = !!v[k]; }
      else if (tipo === "multi") { i = el("div", { class: "pl-meses pl-multi" }, ...opts.map(([a, b]) => el("label", null, el("input", { type: "checkbox", value: a, checked: (v[k] || []).includes(a) ? true : null }), b))); }
      else if (tipo === "money") i = el("input", { type: "text", class: "money", inputmode: "decimal", placeholder: "0,00", value: v[k] ? num(v[k]) : "" });
      else i = el("input", { type: tipo === "number" ? "text" : tipo, inputmode: tipo === "number" ? "numeric" : null, value: v[k] != null ? String(v[k]) : "" });
      if (!pode(k)) { i.readOnly = true; if (i.tagName === "SELECT" || i.type === "checkbox") i.disabled = true; if (tipo === "multi") i.querySelectorAll("input").forEach(c => c.disabled = true); }
      ins[k] = i;
      bd.append(tipo === "multi" ? el("div", { class: cls || "w2" }, el("label", null, lab), i) : el("label", { class: cls || (tipo === "check" ? "w2" : "") }, lab, i));
    });
    if (REPETE[col] && novo) { // repetir em vários meses
      const box = el("div", { class: "pl-meses" }, ...MESES_L.map((m, i) => el("label", null, el("input", { type: "checkbox", value: String(i + 1) }), m)));
      bd.append(el("div", { class: "w2" }, el("label", null, col === "plan_brindes" ? "Repetir a mesma compra também nos meses de pagamento (opcional)" : col === "plan_acoes" ? "Repetir a mesma ação também nos meses (opcional, sem as datas de início e fim)" : "Repetir o mesmo valor também nos meses (opcional)"), box)); ins._meses = box;
    }
    if (col === "plan_orcamento") {
      const cat = ins.categoria; const dl = el("datalist", { id: "plCats" }); cat.setAttribute("list", "plCats");
      const fillCats = () => { dl.textContent = ""; (CATS[ins.centro.value] || []).forEach(([k, n]) => dl.append(el("option", { value: n }))); };
      ins.centro.addEventListener("change", fillCats); fillCats(); bd.append(dl);
      if (!novo) ins.categoria.value = catN(v.centro, v.categoria);
    }
    if (col === "plan_brindes") {
      const dl = el("datalist", { id: "plEvs" }, ...[...new Set(D.eventos.filter(ativo).map(e => e.nome))].sort().map(n => el("option", { value: n }))); ins.evento.setAttribute("list", "plEvs"); bd.append(dl);
      const prev = el("p", { class: "pl-prev w2" }); bd.append(prev);
      const calc = () => { const q = Math.round(lerR(ins.quantidade.value)), u = lerR(ins.custoUnit.value), a = lerR(ins.adicionais.value), vb = lerR(ins.verba.value), t = q * u + a;
        const n = 1 + (ins._meses ? [...ins._meses.querySelectorAll("input:checked")].filter(i => i.value !== ins.mesPagamento.value).length : 0);
        prev.textContent = `Total da compra: ${brl(t)}${vb ? ` · líquido ${brl(Math.max(0, t - vb))}` : ""}${n > 1 ? ` · ${n} compras = ${brl(t * n)}` : ""}${ins.conta.value !== "200023" ? " · não soma na 200023" : ""}`; };
      bd.addEventListener("input", calc); bd.addEventListener("change", calc); calc();
    }
    if (col === "plan_acoes") {
      const prev = el("p", { class: "pl-prev w2" }); bd.append(prev);
      const calc = () => { const c = lerR(ins.custo.value), vb = lerR(ins.verba.value), mv = lerR(ins.metaVendas.value);
        prev.textContent = `Custo líquido: ${brl(Math.max(0, c - vb))}${c && mv ? ` · custo = ${pct(c / mv * 100)} da meta de vendas` : ""} · o custo previsto entra no Painel financeiro do planejamento (centro ${ins.centro.value}).`; };
      bd.addEventListener("input", calc); bd.addEventListener("change", calc); calc();
    }
    if (col === "plan_eventos") {
      const prev = el("p", { class: "pl-prev w2" }); bd.append(prev);
      const calc = () => { const c = lerR(ins.custo.value), p = lerR(ins.patrocinio.value), c26 = lerR(ins.custo2026.value);
        prev.textContent = `Custo líquido: ${brl(Math.max(0, c - p))}${c ? ` · cobertura de ${Math.round(p / c * 100)}%` : ""}${c26 && c ? ` · ${c >= c26 ? "+" : ""}${Math.round((c - c26) / c26 * 100)}% em relação a 2026` : ""}`; };
      bd.addEventListener("input", calc); calc();
    }
    const err = el("p", { class: "pl-err", hidden: true }); bd.append(err);
    const ler = () => { const o = {};
      sp.f.forEach(([k, , tipo]) => { const i = ins[k]; if (!pode(k)) return;
        o[k] = tipo === "multi" ? [...i.querySelectorAll("input:checked")].map(c => c.value) : tipo === "money" ? lerR(i.value) : tipo === "number" ? (i.value.trim() === "" ? null : Math.round(lerR(i.value))) : tipo === "check" ? i.checked : i.value.trim(); });
      if (col === "plan_fases" && o.fase != null) o.fase = +o.fase;
      if (col === "plan_orcamento" && o.mes != null) { o.mes = +o.mes; const f = (CATS[o.centro] || []).find(c => c[1] === o.categoria); if (f) o.categoria = f[0]; }
      if (col === "plan_brindes") { if (o.mesPagamento != null) o.mesPagamento = +o.mesPagamento; if ("mesUso" in o) o.mesUso = o.mesUso ? +o.mesUso : null; }
      if (col === "plan_acoes") { if (o.mes != null) o.mes = +o.mes; if (o.inicio) o.mes = +o.inicio.slice(5, 7); }
      if (col === "plan_eventos" && "ufsTxt" in o) { o.ufs = o.ufsTxt.split(/[\/,\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean); delete o.ufsTxt; if (o.data) o.mes = +o.data.slice(5, 7); }
      return o; };
    const obrig = { plan_fases: ["titulo"], plan_cotas: ["empresa"], plan_eventos: ["nome", "data"], plan_acoes: ["nome", "mes"], plan_brindes: ["descricao", "mesPagamento"], plan_orcamento: ["descricao", "valor"] }[col];
    const salvarF = async ev => { ev.preventDefault(); const o = ler();
      const falta = obrig.filter(k => pode(k) && !o[k]); if (falta.length) { err.hidden = false; err.textContent = "Preencha: " + falta.map(k => sp.f.find(f => f[0] === k)[1]).join(", ") + "."; return; }
      const btn = Fm.querySelector("button[type=submit]"); btn.disabled = true;
      try {
        if (novo) {
          const rk = REPETE[col];
          const meses = rk && ins._meses ? [...ins._meses.querySelectorAll("input:checked")].map(i => +i.value).filter(m => m !== o[rk]) : [];
          const serie = meses.length ? "s" + Date.now().toString(36) : null;
          const st = FIRMES[col] ? (FIRMES[col].includes(o.etapa) ? "aprovado" : o.etapa === "cancelado" ? "recusado" : "proposto") : (admin && col !== "plan_orcamento" ? "aprovado" : "proposto");
          const base = Object.assign({ status: st, criadoPor: me && me.email }, o, serie ? { serie } : {});
          await C[col].add(base);
          for (const m of meses) await C[col].add(Object.assign({}, base, { [rk]: m }, col === "plan_acoes" ? { inicio: "", fim: "" } : {}));
          toast(col === "plan_orcamento" ? `Salvo como previsto (aguarda aprovação)${meses.length ? ` · ${meses.length + 1} meses` : ""}` : FIRMES[col] ? `Salvo${meses.length ? ` (${meses.length + 1} meses)` : ""}` : admin ? "Salvo e aprovado" : `Enviado para aprovação${meses.length ? ` (${meses.length + 1} meses)` : ""}`);
        } else { await C[col].doc(x.id).update(o); toast("Salvo"); }
        fechar();
      } catch (e) { err.hidden = false; err.textContent = (e && e.message) || "Não foi possível salvar."; btn.disabled = false; }
    };
    const pe = el("div", { class: "pl-acts" });
    if (!novo && (admin || !travadoP(col, x))) pe.append(el("button", { class: "pl-btn bad", type: "button", onclick: async () => { if (!confirm("Excluir este item?")) return; try { await C[col].doc(x.id).delete(); toast("Excluído"); fechar(); } catch (e) { err.hidden = false; err.textContent = (e && e.message) || "Não foi possível excluir."; } } }, "Excluir"));
    if (!novo && admin && !FIRMES[col] && x.status !== "aprovado") pe.append(el("button", { class: "pl-btn ok", type: "button", onclick: async () => { await decidir([{ col, x }], "aprovado"); fechar(); } }, "Aprovar"));
    Fm.append(el("header", null, el("h2", null, (novo ? "Novo: " : "") + sp.t), el("button", { class: "x", type: "button", "aria-label": "Fechar", onclick: fechar }, "×")), bd,
      el("footer", null, pe, el("div", { class: "pl-acts" }, el("button", { class: "pl-btn", type: "button", onclick: fechar }, "Cancelar"), el("button", { class: "pl-btn pri", type: "submit", disabled: travado && !LIVRES[col].length ? true : null }, novo && !admin && !FIRMES[col] ? "Enviar para aprovação" : "Salvar"))));
    Fm.onsubmit = salvarF; $("plOv").hidden = false; setTimeout(() => { const f = Fm.querySelector("input:not([readonly]),select:not([disabled]),textarea:not([readonly])"); if (f) f.focus(); }, 40);
  }
  function fechar(){ $("plOv").hidden = true; $("plForm").textContent = ""; $("plForm").className = "pl-panel"; render(); }
  $("plOv").addEventListener("click", e => { if (e.target === $("plOv")) fechar(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("plOv").hidden) fechar(); });

  function formPremissas(){
    const c = cfg(), Fm = $("plForm"); Fm.textContent = ""; const ins = {};
    const bd = el("div", { class: "bd" });
    COTAS.forEach(q => { ins[q.k + "p"] = el("input", { type: "text", class: "money", inputmode: "decimal", value: num(c.cotas[q.k].preco) }); ins[q.k + "v"] = el("input", { type: "text", inputmode: "numeric", value: String(c.cotas[q.k].vagas) });
      bd.append(el("label", null, `${q.n}: preço mensal (R$)`, ins[q.k + "p"]), el("label", null, `${q.n}: vagas (com marcas próprias)`, ins[q.k + "v"])); });
    ins.meses = el("input", { type: "text", inputmode: "numeric", value: String(c.meses) }); ins.prazo = el("input", { type: "date", value: c.prazoVenda });
    bd.append(el("label", null, "Meses de cota no ano", ins.meses), el("label", null, "Prazo da venda das cotas", ins.prazo));
    Fm.append(el("header", null, el("h2", null, "Premissas do plano de trade"), el("button", { class: "x", type: "button", onclick: fechar }, "×")), bd,
      el("footer", null, el("span"), el("div", { class: "pl-acts" }, el("button", { class: "pl-btn", type: "button", onclick: fechar }, "Cancelar"), el("button", { class: "pl-btn pri", type: "submit" }, "Salvar"))));
    Fm.onsubmit = async ev => { ev.preventDefault(); const cotas = {}; COTAS.forEach(q => cotas[q.k] = { preco: lerR(ins[q.k + "p"].value), vagas: Math.round(lerR(ins[q.k + "v"].value)) });
      try { await C.plan_config.doc(String(ANO)).update({ cotas, meses: Math.round(lerR(ins.meses.value)) || 12, prazoVenda: ins.prazo.value }); toast("Premissas salvas"); fechar(); } catch (e) { toast((e && e.message) || "Não foi possível salvar."); } };
    $("plOv").hidden = false;
  }

  Central.boot("planejamento", user => {
    me = user; admin = Auth.isAdmin();
    ["plan_config", "plan_fases", "plan_cotas", "plan_eventos", "plan_acoes", "plan_brindes", "plan_orcamento"].forEach(n => C[n] = Store.collection(n));
    const map = { plan_fases: "fases", plan_cotas: "cotas", plan_eventos: "eventos", plan_acoes: "acoes", plan_brindes: "brindes", plan_orcamento: "orc" };
    Object.entries(map).forEach(([n, k]) => C[n].onSnapshot(sn => { D[k] = sn.docs.filter(d => d.exists).map(d => Object.assign({ id: d.id }, d.data())); render(); }));
    C.plan_config.onSnapshot(sn => { const d = sn.docs.find(x => x.id === String(ANO)); D.cfg = d ? d.data() : null; render(); });
    Store.collection("usuarios").onSnapshot(sn => { D.usuarios = sn.docs.map(d => d.data()); });
    if (admin) Store.collection("metas_mensais").onSnapshot(sn => { D.mm = {}; sn.docs.filter(d => d.exists).forEach(d => D.mm[d.id] = d.data()); });
    render();
  });
})();
