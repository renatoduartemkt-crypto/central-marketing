/* Central de Marketing — Análise 2026 (BI) dentro do Planejamento 2027.
 * Painel no estilo Power BI com a base de gastos 2026 (Gestão AGM): visão geral com filtros cruzados,
 * desvios e alertas, sugestões de lançamentos recorrentes para 2027 e a lista de lançamentos.
 * Dados: coleção plan_bi, documento "2026" (importado pelo gerente; nunca fica no GitHub).
 * Uso: BI.render(elemento, ctx) — ctx vem do planejamento.js.
 */
(function(){
  const MES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const MES_L = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const CONTAS = [
    ["200020", "Material de venda / propaganda"], ["200021", "Material terceirizado"], ["200022", "Eventos"], ["200023", "Brindes"],
    ["200024", "Softwares"], ["200310", "Folha e viagens de marketing"], ["fora", "Fora do escopo de marketing"], ["credito", "Crédito (verba cooperada)"]];
  const contaN = c => (CONTAS.find(x => x[0] === c) || [c, c])[1];
  const COR = c => `var(--bi-${({ "200020": 1, "200021": 2, "200022": 3, "200023": 4, "200024": 5, "200310": 6, fora: 7, credito: 0 })[c] || 7})`.replace("--bi-0", "--muted");
  const PROBLEMA = st => st !== "OK";
  const ST_N = { "OK": "OK", "Reclassificar": "Lançado na conta errada", "Estorno (par anulado)": "Estorno (par que se anula)", "Possível duplicidade": "Possível duplicidade" };
  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const soma = a => a.reduce((s, v) => s + (+v || 0), 0);

  const S = { aba: "visao", meses: [], conta: "", nat: "", ini: "", marca: "", visao: "2027", busca: "", pag: 0, ord: "valor", reaj: 5, sel: {}, ed: {} };

  let ctx, el, brl, brl0, curto, pct, R = [], doc = null;

  /* ---------- dados ---------- */
  function preparar(d){
    if (doc === d) return; doc = d;
    const cols = d.cols; R = d.lanc.map(a => { const o = {}; cols.forEach((k, i) => o[k] = a[i]); return o; });
  }
  const contaDe = r => S.visao === "2027" ? r.conta2027 : (r.contaOrigem === "200316" || /^2003(09|1[0-5])$/.test(r.contaOrigem) ? "200310" : r.contaOrigem);
  function filtrar(sem){
    return R.filter(r => (sem === "mes" || !S.meses.length || S.meses.includes(r.mes)) && (sem === "conta" || !S.conta || contaDe(r) === S.conta) &&
      (sem === "nat" || !S.nat || r.natureza === S.nat) && (sem === "ini" || !S.ini || r.iniciativa === S.ini) && (sem === "marca" || !S.marca || r.marca === S.marca));
  }
  const agrupar = (L, f) => { const m = new Map(); L.forEach(r => { const k = f(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }); return m; };
  const temFiltro = () => S.meses.length || S.conta || S.nat || S.ini || S.marca;
  const toggleMes = m => { S.meses = S.meses.includes(m) ? S.meses.filter(x => x !== m) : S.meses.concat(m).sort((a, b) => a - b); rr(); };
  const set = (k, v) => { S[k] = S[k] === v ? "" : v; S.pag = 0; rr(); };

  /* ---------- peças visuais ---------- */
  // redesenha mesmo com o foco num controle do painel (o planejamento adia o redesenho enquanto se digita)
  const rr = () => { const a = document.activeElement; if (a && a.blur && a !== document.body) a.blur(); ctx.render(); };
  const tip = (node, txt) => { node.setAttribute("data-tip", txt); return node; };
  const svg = (tag, a, ...kids) => { const e = document.createElementNS("http://www.w3.org/2000/svg", tag); Object.entries(a || {}).forEach(([k, v]) => v != null && e.setAttribute(k, v)); kids.forEach(k => k && e.append(k)); return e; };
  const card = (titulo, sub, ...kids) => el("section", { class: "bi-card" }, el("header", null, el("h3", null, titulo), sub ? el("span", { class: "bi-sub" }, sub) : null), ...kids);
  const tabela = (cab, linhas, cls) => el("div", { class: "pl-tw" }, el("table", { class: "pl-t bi-t " + (cls || "") }, el("thead", null, el("tr", null, ...cab.map(([h, r]) => el("th", { class: r ? "r" : "" }, h)))), el("tbody", null, ...linhas)));
  const verTabela = (cab, linhas) => el("details", { class: "bi-dt" }, el("summary", null, "Ver os números em tabela"), tabela(cab, linhas));
  const legenda = itens => el("div", { class: "bi-leg" }, ...itens.map(([n, cor, onclick, ativo]) => el(onclick ? "button" : "span", { type: onclick ? "button" : null, class: ativo ? "on" : "", onclick }, el("i", { style: `background:${cor}` }), n)));
  const mil = v => Math.abs(v) < 1000 ? "<1" : Math.round(v / 1000).toLocaleString("pt-BR");
  const statusPill = (v, txt) => el("span", { class: "bi-st " + (v > 0.05 ? "bad" : v < -0.05 ? "ok" : "neu") }, v > 0.05 ? "▲ " : v < -0.05 ? "▼ " : "● ", txt);

  /* barras empilhadas por mês (uma escala só) */
  function barrasMes(L){
    const contas = CONTAS.map(c => c[0]).filter(c => L.some(r => contaDe(r) === c));
    const por = {}; for (let m = 1; m <= 10; m++) { por[m] = {}; contas.forEach(c => por[m][c] = 0); }
    L.forEach(r => { if (r.mes >= 1 && r.mes <= 10) por[r.mes][contaDe(r)] += r.valor; });
    const tot = m => soma(contas.map(c => Math.max(0, por[m][c])));
    const max = Math.max(1, ...Array.from({ length: 10 }, (_, i) => tot(i + 1)));
    const W = 760, H = 250, pl = 54, pb = 26, pt = 10, bw = (W - pl - 10) / 10, y = v => H - pb - (v / max) * (H - pb - pt);
    const g = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "bi-svg", role: "img", "aria-label": "Gasto por mês, por conta" });
    [0, .25, .5, .75, 1].forEach(f => { const v = max * f; g.append(svg("line", { x1: pl, x2: W - 6, y1: y(v), y2: y(v), class: "bi-grid" }), svg("text", { x: pl - 6, y: y(v) + 4, class: "bi-ax", "text-anchor": "end" }, document.createTextNode(curto(v).replace("R$ ", "")))); });
    for (let m = 1; m <= 10; m++) {
      const x = pl + (m - 1) * bw + 6, w = bw - 12; let acc = 0; const sel = !S.meses.length || S.meses.includes(m);
      const grp = svg("g", { class: "bi-bar" + (sel ? "" : " off"), tabindex: "0", role: "button", "aria-label": `${MES_L[m - 1]}: ${brl0(tot(m))}` });
      contas.forEach((c, i) => { const v = Math.max(0, por[m][c]); if (!v) return; const y0 = y(acc), y1 = y(acc + v); acc += v;
        grp.append(svg("rect", { x, y: y1, width: w, height: Math.max(0, y0 - y1 - 2), rx: 3, fill: COR(c) })); });
      grp.append(svg("rect", { x: x - 4, y: pt, width: w + 8, height: H - pb - pt, fill: "transparent" }));
      grp.append(svg("text", { x: x + w / 2, y: H - 8, class: "bi-ax", "text-anchor": "middle" }, document.createTextNode(MES[m - 1] + (m === 10 ? "*" : ""))));
      if (tot(m)) grp.append(svg("text", { x: x + w / 2, y: y(tot(m)) - 5, class: "bi-val", "text-anchor": "middle" }, document.createTextNode(curto(tot(m)).replace("R$ ", ""))));
      tip(grp, `<b>${MES_L[m - 1]}${m === 10 ? " (parcial, até 15/10)" : ""}</b><br>${contas.filter(c => por[m][c]).map(c => `${c} ${contaN(c)}: ${brl0(por[m][c])}`).join("<br>")}<br><b>Total: ${brl0(tot(m))}</b><br><i>clique para filtrar o mês</i>`);
      grp.addEventListener("click", () => toggleMes(m)); grp.addEventListener("keydown", e => { if (e.key === "Enter") toggleMes(m); });
      g.append(grp);
    }
    const linhas = Array.from({ length: 10 }, (_, i) => el("tr", null, el("td", null, MES_L[i]), ...contas.map(c => el("td", { class: "r m" }, brl0(por[i + 1][c]))), el("td", { class: "r m" }, el("b", null, brl0(tot(i + 1))))));
    return [legenda(contas.map(c => [`${/^\d/.test(c) ? c + " " : ""}${contaN(c)}`, COR(c), () => set("conta", c), S.conta === c])), g, el("p", { class: "bi-nota" }, "* outubro parcial (até 15/10). Clique numa barra para filtrar o mês; clique de novo para tirar."),
      verTabela([["Mês"]].concat(contas.map(c => [c, 1])).concat([["Total", 1]]), linhas)];
  }

  /* acumulado do ano × orçamento linear (mesma escala) */
  function acumulado(L, orc, proj){
    const mens = Array.from({ length: 10 }, (_, i) => soma(L.filter(r => r.mes === i + 1).map(r => r.valor)));
    const ac = []; mens.reduce((s, v, i) => (ac[i] = s + v), 0);
    const W = 760, H = 230, pl = 54, pb = 24, pt = 12, max = Math.max(1, orc, proj, ac[9] || 0) * 1.05;
    const x = m => pl + (m - 0.5) * ((W - pl - 10) / 12), y = v => H - pb - (v / max) * (H - pb - pt);
    const g = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "bi-svg", role: "img", "aria-label": "Gasto acumulado contra o orçamento" });
    [0, .25, .5, .75, 1].forEach(f => { const v = max * f; g.append(svg("line", { x1: pl, x2: W - 6, y1: y(v), y2: y(v), class: "bi-grid" }), svg("text", { x: pl - 6, y: y(v) + 4, class: "bi-ax", "text-anchor": "end" }, document.createTextNode(curto(v).replace("R$ ", "")))); });
    MES.forEach((m, i) => g.append(svg("text", { x: x(i + 1), y: H - 6, class: "bi-ax", "text-anchor": "middle" }, document.createTextNode(m))));
    if (orc) g.append(svg("path", { d: `M${x(1)},${y(orc / 12)} ` + MES.map((_, i) => `L${x(i + 1)},${y(orc / 12 * (i + 1))}`).join(" "), class: "bi-ln orc" }));
    g.append(svg("path", { d: ac.map((v, i) => `${i ? "L" : "M"}${x(i + 1)},${y(v)}`).join(" "), class: "bi-ln real" }));
    if (proj) g.append(svg("path", { d: `M${x(10)},${y(ac[9])} L${x(12)},${y(proj)}`, class: "bi-ln proj" }));
    ac.forEach((v, i) => { const c = svg("circle", { cx: x(i + 1), cy: y(v), r: 4.5, class: "bi-pt" }); tip(c, `<b>${MES_L[i]}</b><br>acumulado: ${brl0(v)}${orc ? `<br>orçamento proporcional: ${brl0(orc / 12 * (i + 1))}<br>diferença: ${brl0(v - orc / 12 * (i + 1))}` : ""}`); g.append(c); });
    if (orc) g.append(svg("text", { x: x(12) - 4, y: proj > orc ? y(orc) + 16 : y(orc) - 6, class: "bi-lbl", "text-anchor": "end" }, document.createTextNode("orçado " + curto(orc))));
    if (proj) g.append(svg("text", { x: x(12) - 4, y: proj > orc ? y(proj) - 8 : y(proj) + 16, class: "bi-lbl", "text-anchor": "end" }, document.createTextNode("projeção " + curto(proj))));
    return [legenda([["Realizado acumulado", "var(--bi-1)"], ["Orçamento proporcional ao mês", "var(--muted)"], ["Projeção até dezembro", "var(--bi-2)"]]), g];
  }

  /* barra horizontal simples (uma cor) */
  const hbar = (v, max, cor) => el("div", { class: "bi-hb" }, el("i", { style: `width:${max ? Math.max(0, v) / max * 100 : 0}%;background:${cor || "var(--bi-1)"}` }));

  /* ---------- páginas ---------- */
  function visao(B){
    const L = filtrar(), real = soma(L.map(r => r.valor));
    const orcTot = doc.orcado.filter(o => !S.conta || o.conta === S.conta).reduce((s, o) => s + o.orcado, 0);
    const fracMes = S.meses.length ? S.meses.length / 12 : 1, soOrc = !(S.nat || S.ini || S.marca);
    const orc = soOrc ? orcTot * fracMes : 0;
    const proj = S.visao === "2027" && !S.meses.length && soOrc ? doc.orcado.filter(o => !S.conta || o.conta === S.conta).reduce((s, o) => s + o.proj, 0) : 0;
    const ritmo = doc.mesesRef / 12, exec = orc ? real / orc : 0;
    const prob = L.filter(r => PROBLEMA(r.status)), dup = L.filter(r => r.status === "Possível duplicidade"), fora = L.filter(r => r.conta2027 === "fora");
    const pos = L.filter(r => r.valor > 0);
    B.append(el("section", { class: "pl-tot bi-kpis" },
      kpi(brl0(real), `realizado 2026${S.meses.length ? "" : " (jan a 15/out)"}`, "net"),
      kpi(orc ? brl0(orc) : "—", soOrc ? `orçado 2026${S.meses.length ? " (proporcional aos meses)" : ""}` : "orçado (não se aplica a este filtro)"),
      kpi(orc ? pct(exec * 100) : "—", orc ? `executado · ritmo esperado ${pct(ritmo * 100)}` : "execução do orçamento", orc && exec > ritmo * 1.05 ? "bad" : orc && exec < ritmo * .8 ? "warn" : ""),
      kpi(proj ? brl0(proj) : "—", proj ? `projeção 12 meses · ${proj > orcTot ? "+" : ""}${pct((proj - orcTot) / (orcTot || 1) * 100)} vs. orçado` : "projeção 12 meses (sem filtro de mês)", proj > orcTot * 1.05 ? "bad" : "")));
    const g1 = el("div", { class: "bi-g2" },
      card("Gasto por mês", S.visao === "2027" ? "por conta correta (reclassificada)" : "por conta em que foi lançado no sistema", ...barrasMes(filtrar("mes"))),
      card("Acumulado do ano × orçamento", orc ? "abaixo da linha cinza = dentro do orçamento" : "sem orçamento comparável neste filtro", ...acumulado(filtrar("mes"), orcTot * (soOrc ? 1 : 0), proj)));
    B.append(g1);
    B.append(el("div", { class: "bi-g2" }, contasCard(), naturezaCard(filtrar("nat"))));
    B.append(iniciativasCard(filtrar("ini")));
    B.append(el("details", { class: "bi-mais" }, el("summary", null, "Mais análises: mapa de calor, conta errada, marca e filial, qualidade dos lançamentos"),
      el("div", { class: "bi-g2" }, heatmapCard(L), matrizCard(L)), el("div", { class: "bi-g2" }, marcaFilialCard(filtrar("marca")), produtividadeCard(L))));
  }
  const kpi = (v, k, cls) => el("div", { class: "t " + (cls || "") }, el("b", null, v), el("span", null, k));

  function contasCard(){
    const L = filtrar("conta").filter(() => true);
    const linhas = doc.orcado.filter(o => o.orcado || o.reclass || L.some(r => contaDe(r) === o.conta)).map(o => {
      const real = soma(L.filter(r => contaDe(r) === o.conta).map(r => r.valor));
      const sist = soma(L.filter(r => (r.contaOrigem === o.conta || (o.conta === "200310" && /^2003(09|1[0-6])$/.test(r.contaOrigem)))).map(r => r.valor));
      return { o, real, sist, proj: S.meses.length ? 0 : o.proj }; });
    const max = Math.max(1, ...linhas.map(l => Math.max(l.o.orcado, l.real, l.proj)));
    const rows = linhas.map(l => { const d = l.o.orcado ? (Math.max(l.real, l.proj) - l.o.orcado) / l.o.orcado : (l.real ? 1 : 0);
      const track = el("div", { class: "bi-bullet" }, el("i", { class: "proj", style: `width:${l.proj / max * 100}%` }), el("i", { class: "real", style: `width:${Math.max(0, l.real) / max * 100}%;background:${COR(l.o.conta)}` }),
        l.o.orcado ? el("b", { class: "orc", style: `left:${l.o.orcado / max * 100}%` }) : null);
      return tip(el("button", { type: "button", class: "bi-crow" + (S.conta === l.o.conta ? " on" : ""), onclick: () => set("conta", l.o.conta) },
        el("span", { class: "n" }, el("b", null, l.o.conta === "fora" || l.o.conta === "credito" ? "" : l.o.conta), " ", contaN(l.o.conta)), track,
        el("span", { class: "v" }, brl0(l.real)), l.o.orcado ? statusPill(d, (d > 0 ? "+" : "") + pct(d * 100)) : (l.real > 0 ? el("span", { class: "bi-st bad" }, "▲ sem orçamento") : el("span"))),
        `<b>${l.o.conta} ${contaN(l.o.conta)}</b><br>Orçado 2026: ${brl0(l.o.orcado)}<br>Realizado (conta correta): ${brl0(l.real)}<br>Como lançado no sistema: ${brl0(l.sist)}${l.proj ? `<br>Projeção 12 meses: ${brl0(l.proj)}` : ""}`); });
    return card("Orçado × realizado × projeção por conta", "barra = realizado · faixa clara = projeção 12m · traço = orçado",
      el("div", { class: "bi-crows" }, ...rows), legenda([["Realizado", "var(--bi-1)"], ["Projeção 12 meses", "var(--surface-2)"], ["Orçado 2026", "var(--fg)"]]),
      verTabela([["Conta"], ["Orçado 2026", 1], ["Realizado (correto)", 1], ["Como lançado", 1], ["Projeção 12m", 1]], linhas.map(l => el("tr", null, el("td", null, `${l.o.conta} ${contaN(l.o.conta)}`), el("td", { class: "r m" }, brl0(l.o.orcado)), el("td", { class: "r m" }, brl0(l.real)), el("td", { class: "r m" }, brl0(l.sist)), el("td", { class: "r m" }, brl0(l.proj))))));
  }

  function naturezaCard(L){
    const G = [...agrupar(L, r => r.natureza)].map(([n, rs]) => ({ n, v: soma(rs.map(r => r.valor)), q: rs.filter(r => r.valor > 0).length })).filter(g => g.v).sort((a, b) => b.v - a.v);
    const top = G.slice(0, 8), resto = G.slice(8), tot = soma(G.map(g => g.v)), max = Math.max(1, ...top.map(g => g.v));
    const rows = top.map(g => { const tp = (doc.natureza[g.n] || {}).tipo;
      return tip(el("button", { type: "button", class: "bi-nrow" + (S.nat === g.n ? " on" : ""), onclick: () => set("nat", g.n) },
        el("span", { class: "n" }, g.n, tp === "Recorrente" ? el("em", { class: "bi-tag" }, "recorrente") : null), hbar(g.v, max), el("span", { class: "v" }, brl0(g.v)), el("span", { class: "p" }, pct(g.v / tot * 100))),
        `<b>${g.n}</b><br>${brl0(g.v)} · ${g.q} lançamentos<br>ticket médio ${brl0(g.q ? g.v / g.q : 0)}<br>${pct(g.v / tot * 100)} do total filtrado`); });
    if (resto.length) rows.push(el("div", { class: "bi-nrow mut" }, el("span", { class: "n" }, `Outras ${resto.length} naturezas`), hbar(soma(resto.map(g => g.v)), max, "var(--muted)"), el("span", { class: "v" }, brl0(soma(resto.map(g => g.v)))), el("span", { class: "p" }, pct(soma(resto.map(g => g.v)) / tot * 100))));
    return card("Por natureza do gasto", "clique para filtrar todo o painel", el("div", { class: "bi-nrows" }, ...rows),
      verTabela([["Natureza"], ["Valor", 1], ["Lançamentos", 1], ["Ticket médio", 1]], G.map(g => el("tr", null, el("td", null, g.n), el("td", { class: "r m" }, brl0(g.v)), el("td", { class: "r m" }, String(g.q)), el("td", { class: "r m" }, brl0(g.q ? g.v / g.q : 0))))));
  }

  // eventos/ações do planejamento 2027 parecidos com a iniciativa de 2026
  const PAL = s => norm(s).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2 && !["de", "dos", "das", "para", "com", "negocios", "confirmar", "lopes"].includes(w));
  function plano2027(nome){
    const a = PAL(nome); if (!a.length) return [];
    const D = ctx.D, cand = (D.eventos || []).map(x => ({ t: "Evento", nome: x.nome, v: +x.custo || 0, x, col: "plan_eventos" })).concat((D.acoes || []).map(x => ({ t: "Ação", nome: x.nome, v: +x.custo || 0, x, col: "plan_acoes" })));
    return cand.filter(c => { const b = PAL(c.nome); const comum = a.filter(w => b.includes(w)).length; return comum >= Math.min(2, a.length) || (a.length === 1 && b.includes(a[0])); });
  }
  function iniciativasCard(L){
    const G = [...agrupar(L, r => r.iniciativa)].map(([n, rs]) => ({ n, rs, v: soma(rs.map(r => r.valor)), q: rs.filter(r => r.valor > 0).length, meses: new Set(rs.map(r => r.mes)).size, pont: rs.some(r => r.pontual) })).filter(g => g.v).sort((a, b) => b.v - a.v);
    const tot = soma(G.map(g => g.v)), max = Math.max(1, ...G.map(g => g.v));
    const top3 = soma(G.slice(0, 3).map(g => g.v));
    const lim = S.todas ? G.length : 8, rows = G.slice(0, lim).map(g => { const p = plano2027(g.n), pv = soma(p.map(x => x.v));
      return el("tr", { class: "click" + (S.ini === g.n ? " on" : ""), onclick: () => set("ini", g.n) },
        el("td", null, el("b", null, g.n), /confirmar|não identificado/i.test(g.n) ? el("span", { class: "bi-st warn" }, "a confirmar") : null),
        el("td", null, hbar(g.v, max)), el("td", { class: "r m" }, brl0(g.v)), el("td", { class: "r m" }, pct(g.v / tot * 100)),
        el("td", { class: "r m" }, p.length ? tip(el("span", null, brl0(pv)), p.map(x => `${x.t}: ${x.nome} · ${brl0(x.v)}`).join("<br>")) : el("span", { class: "mut" }, g.pont ? "não planejado" : "—"))); });
    return card("Iniciativas e eventos", `as 3 maiores concentram ${pct(top3 / (tot || 1) * 100)} do gasto · clique para filtrar`,
      tabela([["Iniciativa / evento"], [""], ["Realizado 2026", 1], ["% do total", 1], ["Previsto 2027", 1]], rows, "bi-ini"),
      G.length > 8 ? el("button", { type: "button", class: "pl-link", onclick: () => { S.todas = !S.todas; rr(); } }, S.todas ? "Mostrar só as 8 maiores" : `Ver todas (${G.length})`) : null);
  }

  function heatmapCard(L){
    const N = [...agrupar(L, r => r.natureza)].map(([n, rs]) => [n, soma(rs.map(r => r.valor))]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 10).map(x => x[0]);
    const val = (n, m) => soma(L.filter(r => r.natureza === n && r.mes === m).map(r => r.valor));
    const max = Math.max(1, ...N.flatMap(n => Array.from({ length: 10 }, (_, i) => val(n, i + 1))));
    const steps = ["--bi-q1", "--bi-q2", "--bi-q3", "--bi-q4", "--bi-q5", "--bi-q6"];
    const cor = v => v <= 0 ? "var(--surface-2)" : `var(${steps[Math.min(5, Math.floor(Math.sqrt(v / max) * 6))]})`;
    const rows = N.map(n => el("tr", null, el("th", { class: "n" }, n), ...Array.from({ length: 10 }, (_, i) => { const v = val(n, i + 1);
      return el("td", null, tip(el("button", { type: "button", class: "bi-hc" + (Math.sqrt(v / max) > .6 ? " esc" : ""), style: `background:${cor(v)}`, onclick: () => { S.nat = n; S.meses = [i + 1]; rr(); } }, v ? mil(v) : ""), `<b>${n}</b><br>${MES_L[i]}: ${brl0(v)}`)); })));
    return card("Mapa de calor · natureza × mês", "valores em R$ mil · cor mais forte = maior gasto",
      el("div", { class: "pl-tw" }, el("table", { class: "bi-heat" }, el("thead", null, el("tr", null, el("th"), ...MES.slice(0, 10).map(m => el("th", null, m)))), el("tbody", null, ...rows))),
      el("div", { class: "bi-scale" }, el("span", null, "menor"), ...steps.map(s => el("i", { style: `background:var(${s})` })), el("span", null, "maior")));
  }

  function matrizCard(L){
    const orig = [...new Set(L.map(r => r.contaOrigem === "200316" || /^2003(09|1[0-5])$/.test(r.contaOrigem) ? "200310" : r.contaOrigem))].sort();
    const dest = CONTAS.map(c => c[0]).filter(c => L.some(r => r.conta2027 === c));
    const o2 = r => (r.contaOrigem === "200316" || /^2003(09|1[0-5])$/.test(r.contaOrigem) ? "200310" : r.contaOrigem);
    const val = (o, d) => soma(L.filter(r => o2(r) === o && r.conta2027 === d).map(r => r.valor));
    const fora = soma(L.filter(r => o2(r) !== r.conta2027).map(r => r.valor)), tot = soma(L.map(r => r.valor));
    const rows = orig.map(o => el("tr", null, el("th", { class: "n" }, `${o}`), ...dest.map(d => { const v = val(o, d); const ok = o === d;
      return el("td", { class: "r m " + (v && !ok ? "bi-off" : ok && v ? "bi-diag" : "") }, v ? tip(el("span", null, mil(v)), `Lançado em <b>${o}</b>, natureza de <b>${d} ${contaN(d)}</b>: ${brl0(v)}`) : ""); })));
    return card("Onde foi lançado × onde deveria estar", `${brl0(fora)} (${pct(fora / (tot || 1) * 100)}) lançados em conta diferente da natureza do gasto`,
      el("div", { class: "pl-tw" }, el("table", { class: "pl-t bi-mx" }, el("thead", null, el("tr", null, el("th", null, "R$ mil · lançado ↓ / correto →"), ...dest.map(d => el("th", { class: "r" }, d)))), el("tbody", null, ...rows))),
      el("p", { class: "bi-nota" }, "Laranja = lançado na conta errada (distorce o orçado × realizado)."));
  }

  function marcaFilialCard(L){
    const M = [...agrupar(L, r => r.marca)].map(([n, rs]) => [n, soma(rs.map(r => r.valor))]).sort((a, b) => b[1] - a[1]);
    const F = [...agrupar(filtrar(), r => "Filial " + r.filial)].map(([n, rs]) => [n, soma(rs.map(r => r.valor))]).sort((a, b) => b[1] - a[1]);
    const mx = Math.max(1, ...M.map(x => x[1])), mf = Math.max(1, ...F.map(x => x[1]));
    return card("Por marca e por filial", "Opta saiu do site: o gasto dela em 2026 não deve se repetir em 2027",
      el("div", { class: "bi-nrows" }, ...M.map(([n, v]) => tip(el("button", { type: "button", class: "bi-nrow" + (S.marca === n ? " on" : ""), onclick: () => set("marca", n) }, el("span", { class: "n" }, n, /Opta/.test(n) ? el("em", { class: "bi-tag warn" }, "não repete") : null), hbar(v, mx), el("span", { class: "v" }, brl0(v)), el("span", { class: "p" }, "")), `<b>${n}</b>: ${brl0(v)}`))),
      el("h4", { class: "bi-h4" }, "Filial que lançou"), el("div", { class: "bi-nrows" }, ...F.map(([n, v]) => el("div", { class: "bi-nrow" }, el("span", { class: "n" }, n), hbar(v, mf, "var(--bi-6)"), el("span", { class: "v" }, brl0(v)), el("span", { class: "p" }, "")))));
  }

  function produtividadeCard(L){
    const meses = Array.from({ length: 10 }, (_, i) => i + 1).filter(m => !S.meses.length || S.meses.includes(m));
    const rows = meses.map(m => { const rs = L.filter(r => r.mes === m), pos = rs.filter(r => r.valor > 0), pr = rs.filter(r => PROBLEMA(r.status));
      return el("tr", null, el("td", null, MES_L[m - 1]), el("td", { class: "r m" }, String(pos.length)), el("td", { class: "r m" }, brl0(pos.length ? soma(pos.map(r => r.valor)) / pos.length : 0)),
        el("td", { class: "r m" }, rs.length ? statusPill(pr.length / rs.length - .15, pct(pr.length / rs.length * 100)) : "—"), el("td", { class: "r m" }, String(new Set(rs.map(r => r.iniciativa)).size))); });
    const ev = [...agrupar(L.filter(r => r.pontual), r => r.iniciativa)].map(([n, rs]) => soma(rs.map(r => r.valor)));
    const pr = L.filter(r => PROBLEMA(r.status)), est = L.filter(r => r.status.startsWith("Estorno"));
    return card("Produtividade e qualidade dos lançamentos", "a base não traz dados de equipe; aqui a produtividade é a do gasto e do processo",
      el("div", { class: "bi-mini" }, kpi(pct(pr.length / (L.length || 1) * 100), "dos lançamentos precisam de revisão (retrabalho)", pr.length / (L.length || 1) > .15 ? "warn" : ""),
        kpi(String(est.length), "lançamentos de estorno (lançou e desfez)"), kpi(ev.length ? brl0(soma(ev) / ev.length) : "—", `custo médio por evento/iniciativa pontual (${ev.length})`)),
      tabela([["Mês"], ["Lançamentos", 1], ["Ticket médio", 1], ["% a revisar", 1], ["Iniciativas", 1]], rows));
  }

  /* ---------- desvios e alertas ---------- */
  function desvios(B){
    const L = filtrar(), tot = soma(L.map(r => r.valor)) || 1, itens = [];
    const add = (grupo, titulo, valor, texto, filtro, nivel) => itens.push({ grupo, titulo, valor, texto, filtro, nivel });
    // 1. desvios não previstos
    doc.orcado.forEach(o => { const real = soma(R.filter(r => r.conta2027 === o.conta).map(r => r.valor)), base = Math.max(real, o.proj);
      if (o.orcado && base > o.orcado * 1.05) add("desvio", `${o.conta} ${contaN(o.conta)} acima do orçado`, base - o.orcado, `Orçado ${brl0(o.orcado)}; ${real >= o.proj ? "já realizado" : "projeção 12 meses"} ${brl0(base)} (+${pct((base - o.orcado) / o.orcado * 100)}).`, { conta: o.conta }, "bad");
      if (o.orcado && o.proj && o.proj < o.orcado * .6) add("desvio", `${o.conta} ${contaN(o.conta)} muito abaixo do orçado`, o.orcado - o.proj, `Projeção ${brl0(o.proj)} para ${brl0(o.orcado)} orçados: verba superdimensionada ou lançada em outra conta (veja a matriz). Dá para reduzir o orçamento 2027.`, { conta: o.conta }, "warn"); });
    const mens = Array.from({ length: 9 }, (_, i) => soma(R.filter(r => r.mes === i + 1).map(r => r.valor))), med = soma(mens) / 9, dp = Math.sqrt(soma(mens.map(v => (v - med) ** 2)) / 9);
    mens.forEach((v, i) => { if (v > med + dp) { const top = [...agrupar(R.filter(r => r.mes === i + 1), r => r.iniciativa)].map(([n, rs]) => [n, soma(rs.map(r => r.valor))]).sort((a, b) => b[1] - a[1]).slice(0, 3);
      add("desvio", `Pico de gasto em ${MES_L[i]}`, v - med, `${brl0(v)} contra média de ${brl0(med)}/mês. Maiores: ${top.map(t => `${t[0]} (${curto(t[1])})`).join(", ")}.`, { meses: [i + 1] }, "warn"); } });
    Object.entries(doc.natureza).filter(([, n]) => n.tipo === "Recorrente").forEach(([n]) => { const v = Array.from({ length: 9 }, (_, i) => soma(R.filter(r => r.natureza === n && r.mes === i + 1).map(r => r.valor))).filter(x => x > 0);
      if (v.length >= 3) { const m = soma(v) / v.length, cv = Math.sqrt(soma(v.map(x => (x - m) ** 2)) / v.length) / m; if (cv > .6) add("desvio", `${n}: valor mensal instável`, Math.max(...v) - Math.min(...v), `Gasto recorrente variando de ${brl0(Math.min(...v))} a ${brl0(Math.max(...v))} por mês. Defina um valor mensal fixo para 2027.`, { nat: n }, "warn"); } });
    // 2. possivelmente desnecessários
    const dup = R.filter(r => r.status === "Possível duplicidade"); if (dup.length) add("desnec", `${dup.length} possíveis duplicidades`, soma(dup.map(r => r.valor)), dup.map(r => `${r.historico.slice(0, 50)} (${brl0(r.valor)})`).join("; ") + ". Confirmar com o financeiro e pedir estorno.", null, "bad", dup);
    const fora = R.filter(r => r.conta2027 === "fora" && r.valor > 0); if (fora.length) add("desnec", "Gastos fora do escopo de marketing", soma(fora.map(r => r.valor)), fora.map(r => `${r.natureza}: ${r.historico.slice(0, 45)}`).join("; ") + ". Devem sair do orçamento de marketing.", null, "bad", fora);
    const opta = R.filter(r => /Opta/.test(r.marca) && r.valor > 0); if (opta.length) add("desnec", "Gastos com a marca Opta", soma(opta.map(r => r.valor)), `${opta.length} lançamentos em 2026. A Opta saiu do site: confirme quais não se repetem em 2027 (registro de marca, mídia, materiais).`, { marca: "Opta" }, "warn");
    const est = R.filter(r => r.status.startsWith("Estorno")); if (est.length) add("desnec", `${est.length} lançamentos de estorno`, soma(est.filter(r => r.valor > 0).map(r => r.valor)), "Valores lançados e desfeitos: não custam, mas geram retrabalho e distorcem relatórios. Vale revisar o processo de lançamento.", null, "warn", est);
    const pic = [...agrupar(R.filter(r => r.valor > 0 && r.valor < 300 && r.status === "OK"), r => r.iniciativa)].filter(([, rs]) => rs.length >= 5);
    pic.forEach(([n, rs]) => add("desnec", `Compras pequenas e picadas em ${n}`, soma(rs.map(r => r.valor)), `${rs.length} lançamentos abaixo de R$ 300. Juntar em pedidos maiores reduz frete, tempo de aprovação e custo administrativo.`, { ini: n }, "warn"));
    const nid = R.filter(r => /não identificado|confirmar/i.test(r.iniciativa) && r.valor > 0); if (nid.length) add("desnec", "Gastos sem evento identificado", soma(nid.map(r => r.valor)), `${nid.length} lançamentos sem iniciativa clara. Sem dono, não dá para saber se o gasto se pagou.`, null, "warn", nid);
    // 3. não previstos
    doc.orcado.filter(o => !o.orcado).forEach(o => { const real = soma(R.filter(r => r.conta2027 === o.conta).map(r => r.valor)); if (real > 0) add("naoprev", `${o.conta === "fora" ? "" : o.conta + " "}${contaN(o.conta)} sem orçamento 2026`, real, `Gasto de ${brl0(real)} sem verba prevista${o.proj ? `; projeção 12 meses ${brl0(o.proj)}` : ""}. Precisa entrar no orçamento 2027.`, { conta: o.conta }, "bad"); });
    const rec = R.filter(r => r.status === "Reclassificar"); if (rec.length) add("naoprev", `${rec.length} lançamentos na conta errada`, soma(rec.map(r => r.valor)), "Somam numa conta que não previa esse gasto. Veja a matriz \"Onde foi lançado × onde deveria estar\" na visão geral.", null, "warn", rec);
    const ev = new Set((ctx.D.eventos || []).map(e => e.nome));
    const semPlano = [...agrupar(R.filter(r => r.pontual && r.valor > 0), r => r.iniciativa)].map(([n, rs]) => [n, soma(rs.map(r => r.valor))]).filter(([n]) => !/confirmar|identificado|Opta/i.test(n) && !plano2027(n).length);
    if (semPlano.length && ev.size) add("naoprev", "Iniciativas de 2026 sem correspondente no planejamento 2027", soma(semPlano.map(x => x[1])), semPlano.map(([n, v]) => `${n} (${curto(v)})`).join("; ") + ". Se vão se repetir, cadastre em Eventos ou Ações promocionais.", null, "warn");

    const G = [["desvio", "Desvios não previstos", "onde o gasto saiu do plano"], ["desnec", "Gastos possivelmente desnecessários", "o que dá para cortar ou evitar"], ["naoprev", "Gastos não previstos", "o que aconteceu sem estar no orçamento"]];
    B.append(el("section", { class: "pl-tot bi-kpis" }, ...G.map(([k, n]) => { const xs = itens.filter(i => i.grupo === k); return kpi(brl0(soma(xs.map(i => i.valor))), `${n.toLowerCase()} · ${xs.length} alerta${xs.length === 1 ? "" : "s"}`, xs.some(i => i.nivel === "bad") ? "bad" : "warn"); })));
    const ver = i => i.filtro ? el("button", { type: "button", class: "pl-link", onclick: () => { Object.assign(S, { meses: [], conta: "", nat: "", ini: "", marca: "" }, i.filtro); S.aba = "visao"; rr(); } }, "Ver →") : null;
    G.forEach(([k, n]) => { const xs = itens.filter(i => i.grupo === k).sort((a, b) => b.valor - a.valor); if (!xs.length) return;
      B.append(card(n, null, el("ul", { class: "bi-alerts" }, ...xs.map(i => el("li", { class: i.nivel },
        el("details", null, el("summary", { class: "h" }, el("span", { class: "ic", "aria-hidden": "true" }, i.nivel === "bad" ? "!" : "•"), el("b", null, i.titulo), el("span", { class: "v" }, brl0(i.valor))), el("p", null, i.texto)), ver(i)))))); });
    const P = R.filter(r => PROBLEMA(r.status) && !r.status.startsWith("Estorno")).sort((a, b) => b.valor - a.valor);
    B.append(el("details", { class: "bi-mais" }, el("summary", null, `Detalhes para o financeiro: achados da base e ${P.length} lançamentos para revisar (${brl0(soma(P.map(r => r.valor)))})`),
      card("Achados da base", doc.fonte, el("ul", { class: "bi-ach" }, ...doc.achados.map(a => el("li", null, a)))),
      card("Lançamentos para revisar", null, listaLanc(P, 30))));
  }

  /* ---------- recorrentes 2027 ---------- */
  const CAT_SUG = r => ({ "200024": "assinaturas", "200310": /Viagens/.test(r.natureza) ? "outros" : "salarios", "200021": /tráfego/i.test(r.natureza) ? "agencia" : /Comunica/.test(r.natureza) ? "plotagem" : "producao", "200020": /Mídia|tráfego/i.test(r.natureza) ? "midia" : "outros" })[r.centro] || "outros";
  const chaveRec = r => "bi2026:" + norm(r.centro + "|" + r.natureza + "|" + r.chave).replace(/[^a-z0-9|]/g, "").slice(0, 80);
  function recorrentes(B){
    const D = ctx.D, f = 1 + (+S.reaj || 0) / 100;
    const ja = k => (D.orc || []).filter(x => x.origem === k);
    const linhas = doc.recorrentes.map((r, i) => {
      const k = chaveRec(r), e = S.ed[k] = S.ed[k] || { centro: r.centro, cat: CAT_SUG(r), desc: descSug(r), modo: r.mensal ? "mensal" : "meses", valor: Math.round(r.mediana) };
      const meses = e.modo === "mensal" ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : r.meses2026;
      const valMes = m => e.modo === "mensal" ? e.valor * f : (+r.porMes[String(m)] || 0) * f;
      const total = soma(meses.map(valMes)), feitos = ja(k);
      return { r, k, e, meses, valMes, total, feitos, i }; });
    const sel = linhas.filter(l => S.sel[l.k] && !l.feitos.length);
    const lanc = async () => {
      if (!sel.length) return ctx.toast("Marque pelo menos uma sugestão.");
      const n = soma(sel.map(l => l.meses.length)); if (!confirm(`Lançar ${n} lançamentos (${brl0(soma(sel.map(l => l.total)))}) no Financeiro 2027 como previsto (aguardando aprovação)?`)) return;
      let feitos = 0; const btn = document.getElementById("biLanc"); if (btn) btn.disabled = true;
      try {
        for (const l of sel) { const serie = "s" + Date.now().toString(36) + l.i;
          for (const m of l.meses) { if (btn) btn.textContent = `Lançando ${feitos + 1} de ${n}…`;
            await ctx.C.plan_orcamento.add({ centro: l.e.centro, categoria: l.e.cat, descricao: l.e.desc, valor: Math.round(l.valMes(m) * 100) / 100, mes: m, status: "proposto", criadoPor: ctx.me && ctx.me.email, serie, origem: l.k }); feitos++; }
          S.sel[l.k] = false; }
        ctx.toast(`${feitos} lançamentos criados como previsto`);
      } catch (e) { ctx.toast((e && e.message) || "Não foi possível lançar."); }
      rr();
    };
    B.append(card("Lançamentos recorrentes de 2026 · sugestões para 2027", "marque, ajuste e lance como previsto no Financeiro 2027",
      el("div", { class: "bi-rtools" }, el("label", null, "Reajuste para 2027 (%) ", el("input", { type: "text", inputmode: "decimal", value: String(S.reaj), class: "bi-in s", onchange: e => { S.reaj = Math.max(-50, Math.min(100, +String(e.target.value).replace(",", ".") || 0)); rr(); } })),
        el("span", { class: "bi-sub" }, "Mensal = mesmo valor nos 12 meses (mediana de 2026). Mesmos meses = repete os meses e valores de 2026."),
        el("button", { type: "button", id: "biLanc", class: "pl-btn pri", onclick: lanc }, sel.length ? `Lançar ${soma(sel.map(l => l.meses.length))} lançamentos · ${brl0(soma(sel.map(l => l.total)))}` : "Lançar selecionados")),
      tabela([[""], ["Recorrente em 2026"], ["Lançar em 2027 como"], ["Valor", 1], ["Total 2027", 1]], linhas.map(l => {
        const { r, e } = l, feito = l.feitos.length;
        const ck = el("input", { type: "checkbox", checked: S.sel[l.k] && !feito ? true : null, disabled: feito ? true : null, "aria-label": "Selecionar " + e.desc, onchange: ev => { S.sel[l.k] = ev.target.checked; rr(); } });
        const cen = el("select", { class: "bi-in", onchange: ev => { e.centro = ev.target.value; e.cat = (ctx.CATS[e.centro] || [["outros"]])[0][0]; rr(); } }, ...ctx.CENTROS.map(c => el("option", { value: c.c, selected: c.c === e.centro ? true : null }, `${c.c} · ${c.n}`)));
        const cat = el("select", { class: "bi-in", onchange: ev => { e.cat = ev.target.value; } }, ...(ctx.CATS[e.centro] || [["outros", "Outros"]]).map(([k, n]) => el("option", { value: k, selected: k === e.cat ? true : null }, n)));
        const desc = el("input", { type: "text", class: "bi-in", value: e.desc, maxlength: "160", onchange: ev => { e.desc = ev.target.value.trim() || e.desc; } });
        const modo = el("select", { class: "bi-in s", onchange: ev => { e.modo = ev.target.value; rr(); } }, el("option", { value: "mensal", selected: e.modo === "mensal" ? true : null }, "Mensal (12 meses)"), el("option", { value: "meses", selected: e.modo === "meses" ? true : null }, "Mesmos meses de 2026"));
        const val = e.modo === "mensal" ? el("input", { type: "text", class: "bi-in s money", inputmode: "decimal", value: ctx.num(e.valor), onchange: ev => { e.valor = ctx.lerR(ev.target.value) || e.valor; rr(); } }) : el("span", { class: "m" }, "como em 2026");
        return el("tr", { class: feito ? "bi-feito" : "" }, el("td", null, ck),
          el("td", null, el("b", null, r.natureza), r.opta >= .5 ? el("span", { class: "bi-st warn" }, "Opta: não repete?") : r.opta > 0 ? el("span", { class: "bi-tag" }, `${pct(r.opta * 100)} Opta`) : null,
            el("div", { class: "pl-who" }, `${r.centro} · ${r.n} lançamentos · ${brl0(r.total2026)} · meses: ${r.meses2026.map(m => MES[m - 1]).join(", ")}`),
            el("div", { class: "pl-who" }, "ex.: " + r.historicos.slice(0, 2).join(" · ")),
            feito ? el("div", { class: "bi-st ok" }, `✓ já lançado em 2027 (${l.feitos.length} meses)`) : null),
          el("td", null, el("div", { class: "bi-rf" }, cen, cat, desc, modo)), el("td", { class: "r" }, val), el("td", { class: "r m" }, el("b", null, brl0(l.total)), el("div", { class: "pl-who" }, `${l.meses.length} mês(es)`))); }), "bi-rec"),
      el("p", { class: "bi-nota" }, "Eventos e brindes não entram aqui: eles têm abas próprias no planejamento. Os gastos de eventos de 2026 sem correspondente em 2027 aparecem abaixo.")));
    // iniciativas pontuais de 2026 × planejamento 2027
    const G = [...agrupar(R.filter(r => r.pontual && r.valor > 0 && r.status !== "Possível duplicidade"), r => r.iniciativa)].map(([n, rs]) => ({ n, v: soma(rs.map(r => r.valor)), mes: Math.max(...rs.map(r => r.mes)), p: plano2027(n) })).filter(g => g.v > 1000 && !/confirmar|identificado/i.test(g.n)).sort((a, b) => b.v - a.v);
    B.append(card("Eventos e iniciativas de 2026 × planejamento 2027", "compare o que foi gasto com o que já está previsto",
      tabela([["Iniciativa 2026"], ["Realizado 2026", 1], ["Com reajuste", 1], ["No planejamento 2027"], ["Previsto 2027", 1], ["Diferença", 1], [""]], G.map(g => { const pv = soma(g.p.map(x => x.v)), alvo = g.v * f;
        return el("tr", null, el("td", null, el("b", null, g.n)), el("td", { class: "r m" }, brl0(g.v)), el("td", { class: "r m" }, brl0(alvo)),
          el("td", null, g.p.length ? g.p.map(x => `${x.t}: ${x.nome}`).join(" · ") : el("span", { class: "bi-st warn" }, "não está no planejamento")),
          el("td", { class: "r m" }, g.p.length ? brl0(pv) : "—"), el("td", { class: "r m" }, g.p.length ? statusPill((pv - alvo) / (alvo || 1), (pv >= alvo ? "+" : "") + brl0(pv - alvo)) : "—"),
          el("td", null, !g.p.length && !/Opta|Estrutura|digital|conteúdo|Frota|Fachadas|Marca e|Catálogos|Materiais/i.test(g.n) ? el("button", { type: "button", class: "pl-btn", onclick: () => ctx.form("plan_eventos", null, { nome: g.n, custo: Math.round(alvo), custo2026: Math.round(g.v * 100) / 100, obs: `Base 2026: ${brl0(g.v)} (último gasto em ${MES_L[g.mes - 1]})` }) }, "+ Cadastrar em Eventos") : null)); }))));
  }
  const descSug = r => ({ "Pessoal – remuneração e encargos": "Folha de marketing (salários e encargos)", "Softwares e assinaturas": "Softwares e assinaturas (RD e licenças)", "Mídia paga digital (Meta/Google/LinkedIn)": "Mídia paga digital (Meta/Google)",
    "Gestão de tráfego (fee de agência)": "Fee da agência de tráfego pago", "Produção de conteúdo (foto/vídeo)": "Produção de conteúdo (foto/vídeo/storymaker)", "Viagens e deslocamento": "Viagens e deslocamento do marketing" })[r.natureza] || (r.chave && r.chave !== "*" ? r.chave.charAt(0) + r.chave.slice(1).toLowerCase() : r.natureza);

  /* ---------- lista de lançamentos ---------- */
  function listaLanc(L, lim){
    const q = norm(S.busca);
    let X = L.filter(r => !q || norm([r.historico, r.natureza, r.iniciativa, r.marca, r.contaOrigem, r.conta2027, r.obs].join(" ")).includes(q));
    X = X.slice().sort((a, b) => S.ord === "data" ? String(a.data).localeCompare(b.data) : b.valor - a.valor);
    const pag = lim || 50, ini = S.pag * pag, V = X.slice(ini, ini + pag);
    const rows = V.map(r => el("tr", { class: PROBLEMA(r.status) ? "bi-prob" : "" }, el("td", { class: "m" }, r.data.split("-").reverse().join("/")), el("td", null, el("b", null, r.contaOrigem), r.conta2027 !== r.contaOrigem && r.conta2027 !== "200310" ? el("div", { class: "pl-who" }, "→ " + r.conta2027) : null),
      el("td", null, r.historico, r.obs ? el("div", { class: "pl-who" }, r.obs) : null), el("td", null, r.natureza, el("div", { class: "pl-who" }, r.iniciativa)), el("td", null, r.marca),
      el("td", null, PROBLEMA(r.status) ? el("span", { class: "bi-st " + (r.status === "Possível duplicidade" ? "bad" : "warn") }, ST_N[r.status] || r.status) : el("span", { class: "mut" }, "OK")), el("td", { class: "r m" }, brl(r.valor))));
    const nav = X.length > pag ? el("div", { class: "bi-pag" }, el("button", { type: "button", class: "pl-btn", disabled: S.pag ? null : true, onclick: () => { S.pag--; rr(); } }, "← anteriores"),
      el("span", null, `${ini + 1}–${Math.min(X.length, ini + pag)} de ${X.length}`), el("button", { type: "button", class: "pl-btn", disabled: ini + pag < X.length ? null : true, onclick: () => { S.pag++; rr(); } }, "próximos →")) : null;
    return el("div", null, tabela([["Data"], ["Conta"], ["Histórico"], ["Natureza / iniciativa"], ["Marca"], ["Situação"], ["Valor", 1]], rows, "bi-lanc"),
      el("p", { class: "bi-nota" }, `Total: ${brl(soma(X.map(r => r.valor)))} em ${X.length} lançamentos`), nav);
  }
  function lancamentos(B){
    const L = filtrar();
    const busca = el("input", { type: "search", class: "bi-in", placeholder: "Buscar no histórico, natureza, evento, marca…", value: S.busca, id: "biBusca", oninput: ev => { S.busca = ev.target.value; S.pag = 0; clearTimeout(lancamentos.t);
      lancamentos.t = setTimeout(() => { const i = document.getElementById("biBusca"), p = i ? i.selectionStart : null; if (i) i.blur(); rr();
        const n = document.getElementById("biBusca"); if (n) { n.focus(); try { n.setSelectionRange(p, p); } catch (_) {} } }, 350); } });
    B.append(card("Lançamentos 2026", "respeitam os filtros acima", el("div", { class: "bi-rtools" }, busca, el("select", { class: "bi-in s", onchange: ev => { S.ord = ev.target.value; rr(); } }, el("option", { value: "valor", selected: S.ord === "valor" ? true : null }, "Maior valor primeiro"), el("option", { value: "data", selected: S.ord === "data" ? true : null }, "Por data"))), listaLanc(L)));
  }

  /* ---------- casca ---------- */
  function filtros(){
    const opts = (k, lista, rot) => { const s = el("select", { class: "bi-in", "aria-label": rot, onchange: ev => { S[k] = ev.target.value; S.pag = 0; rr(); } }, el("option", { value: "" }, rot + ": todos"), ...lista.map(([v, n]) => el("option", { value: v, selected: S[k] === v ? true : null }, n))); return s; };
    const nat = [...new Set(R.map(r => r.natureza))].sort(), ini = [...new Set(R.map(r => r.iniciativa))].sort(), mar = [...new Set(R.map(r => r.marca))].sort();
    const meses = el("div", { class: "bi-meses", role: "group", "aria-label": "Meses" }, ...MES.slice(0, 10).map((m, i) => el("button", { type: "button", "aria-pressed": String(S.meses.includes(i + 1)), onclick: () => toggleMes(i + 1) }, m)));
    return el("div", { class: "bi-filtros" }, meses,
      opts("conta", CONTAS.filter(c => R.some(r => contaDe(r) === c[0])).map(c => [c[0], `${c[0] === "fora" || c[0] === "credito" ? "" : c[0] + " · "}${c[1]}`]), "Conta"),
      opts("nat", nat.map(n => [n, n]), "Natureza"), opts("ini", ini.map(n => [n, n]), "Iniciativa"), opts("marca", mar.map(n => [n, n]), "Marca"),
      el("div", { class: "pl-seg", role: "group", "aria-label": "Visão das contas" }, ...[["2027", "Conta correta"], ["origem", "Como lançado"]].map(([k, n]) => el("button", { type: "button", "aria-pressed": String(S.visao === k), onclick: () => { S.visao = k; S.conta = ""; rr(); } }, n))),
      temFiltro() ? el("button", { type: "button", class: "pl-link", onclick: () => { Object.assign(S, { meses: [], conta: "", nat: "", ini: "", marca: "", pag: 0 }); rr(); } }, "Limpar filtros") : null);
  }
  function semDados(B){
    B.append(el("div", { class: "pl-empty" }, ctx.admin ? "A base de gastos 2026 ainda não foi carregada." : "A base de gastos 2026 ainda não foi carregada pelo gerente."));
  }

  function render(B, c){
    ctx = c; ({ el, brl, brl0, curto, pct } = c);
    if (!c.bi) { semDados(B); return; }
    preparar(c.bi);
    const abas = [["visao", "Visão geral"], ["desvios", "Desvios e alertas"], ["recorrentes", "Recorrentes 2027"], ["lancamentos", "Lançamentos"]];
    B.append(el("header", { class: "pl-hero bi-hero" }, el("p", { class: "brand" }, "Distribuidora Lopes · análise de gastos de marketing 2026"), el("h2", null, "Painel BI · gastos 2026"),
      el("p", { class: "lede" }, `${R.length} lançamentos de jan a 15/out (Gestão AGM). Clique nas barras e linhas para filtrar.`)));
    B.append(el("div", { class: "pl-subtabs", role: "tablist", "aria-label": "Painel BI" }, ...abas.map(([k, n]) => el("button", { type: "button", role: "tab", "aria-selected": String(S.aba === k), onclick: () => { S.aba = k; S.pag = 0; rr(); } }, n))));
    if (S.aba === "visao" || S.aba === "lancamentos") B.append(filtros());
    ({ visao, desvios, recorrentes, lancamentos })[S.aba](B);
    ligarTip();
  }
  const nomeAba = () => ({ visao: "Visão geral", desvios: "Desvios e alertas", recorrentes: "Recorrentes 2027", lancamentos: "Lançamentos" })[S.aba];

  // dica flutuante (tooltip) para tudo que tem data-tip
  let tipEl = null;
  function ligarTip(){
    if (tipEl) return;
    tipEl = document.createElement("div"); tipEl.className = "bi-tip"; tipEl.hidden = true; document.body.append(tipEl);
    const mostrar = (t, x, y) => { tipEl.innerHTML = t; tipEl.hidden = false; const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
      tipEl.style.left = Math.min(window.innerWidth - w - 8, x + 14) + "px"; tipEl.style.top = Math.max(8, y - h - 12) + "px"; };
    document.addEventListener("mousemove", e => { const t = e.target.closest && e.target.closest("[data-tip]"); if (!t) { tipEl.hidden = true; return; } mostrar(t.getAttribute("data-tip"), e.clientX, e.clientY); });
    document.addEventListener("focusin", e => { const t = e.target.closest && e.target.closest("[data-tip]"); if (!t) { tipEl.hidden = true; return; } const r = t.getBoundingClientRect(); mostrar(t.getAttribute("data-tip"), r.left, r.top); });
    document.addEventListener("scroll", () => { tipEl.hidden = true; }, true);
  }

  window.BI = { render, nomeAba };
})();
