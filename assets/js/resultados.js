/* Central de Marketing — resultados trazidos pela rotina automática (mLabs e RD Station).
   Resultados.redes(doc, { ano, mes, compacto })  → bloco com Instagram e LinkedIn: realizado, meta, ritmo e evolução dia a dia
   Resultados.emails(lista, { ano, mes, compacto }) → bloco com os disparos do mês: entregues, aberturas, cliques e taxa de cada envio
   doc = metas_mensais "alcance-AAAA-MM" ({ ig_lopes:{meta,realizado,auto}, in_lopes:{…}, serie:[{ate,ig_lopes,in_lopes}] })
   Os gráficos são SVG simples, sem biblioteca, para funcionarem também na exportação em PDF. */
(function(){
  const NS = "http://www.w3.org/2000/svg";
  const pad = n => String(n).padStart(2, "0");
  const nf = n => Math.round(+n || 0).toLocaleString("pt-BR");
  const curto = n => { n = +n || 0; const a = Math.abs(n);
    if (a >= 1e6) return (n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi";
    if (a >= 1e4) return (n / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil";
    return nf(n); };
  const pctTx = v => (Math.round((+v || 0) * 10) / 10).toLocaleString("pt-BR") + "%";
  const dataHora = s => { const d = new Date(s); return isNaN(d) ? "" : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); };
  function h(tag, attrs, ...kids){ const e = document.createElement(tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => { if (v == null || v === false) return; if (k === "class") e.className = v; else e.setAttribute(k, v); });
    kids.flat().forEach(k => { if (k != null && k !== false) e.append(k.nodeType ? k : String(k)); }); return e; }
  function s(tag, attrs){ const e = document.createElementNS(NS, tag); Object.entries(attrs || {}).forEach(([k, v]) => v != null && e.setAttribute(k, v)); return e; }

  /* linha acumulada do mês: eixo x = dias do mês, linha tracejada = meta */
  function grafLinha(pontos, { dias, meta, cor, rotulo, alto }){
    const W = 520, H = alto || 150, L = 8, R = 8, T = 12, B = 22;
    const max = Math.max(1, meta || 0, ...pontos.map(p => p.v)) * 1.08;
    const x = d => L + (d - 1) / Math.max(1, dias - 1) * (W - L - R), y = v => T + (1 - v / max) * (H - T - B);
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "rs-svg", role: "img", "aria-label": rotulo });
    [0.5, 1].forEach(f => svg.append(s("line", { x1: L, x2: W - R, y1: y(max / 1.08 * f), y2: y(max / 1.08 * f), class: "rs-grid" })));
    if (meta) { svg.append(s("line", { x1: L, x2: W - R, y1: y(meta), y2: y(meta), class: "rs-meta" }));
      const t = s("text", { x: W - R, y: y(meta) - 4, class: "rs-tmeta", "text-anchor": "end" }); t.textContent = "meta " + curto(meta); svg.append(t); }
    [1, 8, 15, 22, dias].forEach(d => { const t = s("text", { x: x(d), y: H - 6, class: "rs-tx", "text-anchor": d === 1 ? "start" : d === dias ? "end" : "middle" }); t.textContent = pad(d); svg.append(t); });
    if (pontos.length) {
      const P = pontos.map(p => [x(p.d), y(p.v)]);
      if (P.length > 1) {
        svg.append(s("path", { d: `M${P[0][0]},${y(0)} ` + P.map(q => `L${q[0]},${q[1]}`).join(" ") + ` L${P[P.length - 1][0]},${y(0)} Z`, class: "rs-area", style: `fill:${cor}` }));
        svg.append(s("path", { d: "M" + P.map(q => q.join(",")).join(" L"), class: "rs-line", style: `stroke:${cor}` }));
      }
      const u = P[P.length - 1]; svg.append(s("circle", { cx: u[0], cy: u[1], r: 4.5, class: "rs-dot", style: `fill:${cor}` }));
    }
    return svg;
  }
  /* barras por disparo: altura = taxa de abertura */
  function grafBarras(L, { alto }){
    const n = Math.max(1, L.length), gap = 8, H = alto || 150, T = 16, B = 22, W = Math.max(260, Math.min(720, n * 54 + gap));
    const bw = Math.min(46, (W - gap * (n + 1)) / n), max = Math.max(10, ...L.map(e => +e.resultados.taxaAbertura || 0)) * 1.15;
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, class: "rs-svg rs-bars", role: "img", "aria-label": "Taxa de abertura de cada disparo do mês", style: `max-width:${W}px` });
    svg.append(s("line", { x1: 0, x2: W, y1: H - B, y2: H - B, class: "rs-grid" }));
    L.forEach((e, i) => { const r = e.resultados, v = +r.taxaAbertura || 0, bh = (v / max) * (H - T - B), x0 = gap + i * (bw + gap);
      const rect = s("rect", { x: x0, y: H - B - bh, width: bw, height: Math.max(1, bh), rx: 3, class: "rs-bar" });
      const tt = s("title"); tt.textContent = `${e.nome || e.assunto || "E-mail"} (${(e.data || "").slice(8, 10)}/${(e.data || "").slice(5, 7)}): ${pctTx(v)} de abertura, ${pctTx(r.taxaClique)} de cliques`; rect.append(tt); svg.append(rect);
      const t = s("text", { x: x0 + bw / 2, y: H - B - bh - 3, class: "rs-tv", "text-anchor": "middle" }); t.textContent = Math.round(v) + "%"; svg.append(t);
      const d = s("text", { x: x0 + bw / 2, y: H - 6, class: "rs-tx", "text-anchor": "middle" }); d.textContent = (e.data || "").slice(8, 10); svg.append(d); });
    return svg;
  }

  const REDES = [["ig_lopes", "Instagram Lopes", "alcance", "var(--accent)"], ["in_lopes", "LinkedIn Lopes", "interações", "var(--info)"]];
  function redes(doc, { ano, mes, compacto } = {}){
    doc = doc || {};
    const dias = new Date(ano, mes, 0).getDate(), serie = Array.isArray(doc.serie) ? doc.serie : [];
    const box = h("div", { class: "rs rs-redes" + (compacto ? " rs-c" : "") });
    let ultimo = "";
    REDES.forEach(([k, nome, metrica, cor]) => {
      const x = doc[k] || {}, real = +x.realizado || 0, meta = +x.meta || 0;
      const pts = serie.filter(p => p && p[k] != null && (p.ate || "").slice(0, 7) === `${ano}-${pad(mes)}`).map(p => ({ d: +p.ate.slice(8, 10), v: +p[k] }));
      if (!pts.length && x.realizado != null && x.auto && x.auto.ate) pts.push({ d: +x.auto.ate.slice(8, 10), v: real });
      const ate = pts.length ? pts[pts.length - 1].d : 0;
      const ritmo = ate && ate < dias ? real / ate * dias : 0;   // projeção para o fim do mês, mantido o ritmo
      if (x.auto && x.auto.em && x.auto.em > ultimo) ultimo = x.auto.em;
      const pc = meta ? real / meta * 100 : 0;
      box.append(h("section", { class: "rs-item" },
        h("div", { class: "rs-hd" }, h("span", { class: "rs-nm" }, h("i", { style: `background:${cor}` }), nome, h("small", null, " · " + metrica)),
          meta ? h("span", { class: "rs-pc " + (pc >= 100 ? "ok" : pc >= (ate / dias) * 100 ? "bom" : "baixo") }, Math.floor(pc) + "% da meta") : null),
        h("div", { class: "rs-vl" }, h("b", null, x.realizado != null ? curto(real) : "—"), h("span", null, meta ? `de ${curto(meta)}` : "sem meta definida")),
        meta ? h("div", { class: "rs-bar-m", "aria-hidden": "true" }, h("i", { style: `width:${Math.min(100, pc)}%;background:${cor}` })) : null,
        compacto ? null : h("div", { class: "rs-sub" }, ate ? `até ${pad(ate)}/${pad(mes)}` : "ainda sem leitura neste mês", ritmo ? ` · no ritmo atual, fecha o mês com ${curto(ritmo)}` : ""),
        pts.length ? grafLinha(pts, { dias, meta, cor, rotulo: `Evolução de ${nome} (${metrica}) no mês`, alto: compacto ? 90 : 150 }) : h("p", { class: "rs-vz" }, "O gráfico aparece a partir da primeira leitura do mês.")));
    });
    box.append(h("p", { class: "rs-ft" }, ultimo ? `Números do mLabs, atualizados automaticamente em ${dataHora(ultimo)}.` : "Os números chegam pela rotina diária do mLabs."));
    return box;
  }

  function emails(lista, { ano, mes, compacto } = {}){
    const pre = `${ano}-${pad(mes)}`, L = (lista || []).filter(e => e && e.resultados && (e.data || "").slice(0, 7) === pre).sort((a, b) => (a.data || "").localeCompare(b.data || ""));
    const tot = L.reduce((t, e) => { const r = e.resultados; t.ent += +(r.entregues || r.enviados) || 0; t.ab += +r.aberturas || 0; t.cl += +r.cliques || 0; return t; }, { ent: 0, ab: 0, cl: 0 });
    const box = h("div", { class: "rs rs-mail" + (compacto ? " rs-c" : "") });
    const planejados = (lista || []).filter(e => (e.data || "").slice(0, 7) === pre).length;
    box.append(h("div", { class: "rs-kpis" },
      h("div", null, h("small", null, "Disparos com resultado"), h("b", null, `${L.length}`), h("span", null, `de ${planejados} planejados`)),
      h("div", null, h("small", null, "Entregues"), h("b", null, curto(tot.ent)), h("span", null, "no mês")),
      h("div", null, h("small", null, "Abertura média"), h("b", null, tot.ent ? pctTx(tot.ab / tot.ent * 100) : "—"), h("span", null, `${curto(tot.ab)} aberturas`)),
      h("div", null, h("small", null, "Clique médio"), h("b", null, tot.ent ? pctTx(tot.cl / tot.ent * 100) : "—"), h("span", null, `${curto(tot.cl)} cliques`))));
    if (L.length) {
      box.append(h("div", { class: "rs-gt" }, "Taxa de abertura de cada disparo (dia do mês)"), grafBarras(L, { alto: compacto ? 100 : 150 }));
      if (!compacto) {
        const top = L.slice().sort((a, b) => (+b.resultados.taxaAbertura || 0) - (+a.resultados.taxaAbertura || 0)).slice(0, 3);
        box.append(h("div", { class: "rs-top" }, h("small", null, "Melhores aberturas do mês"),
          ...top.map(e => h("div", { class: "rs-tl" }, h("span", null, `${(e.data || "").slice(8, 10)}/${(e.data || "").slice(5, 7)} · ${e.nome || e.assunto || "E-mail"}`), h("b", null, pctTx(e.resultados.taxaAbertura))))));
      }
      const ult = L.reduce((m, e) => (e.resultados.em > m ? e.resultados.em : m), "");
      box.append(h("p", { class: "rs-ft" }, `Números do RD Station, atualizados automaticamente em ${dataHora(ult)}.`));
    } else box.append(h("p", { class: "rs-vz" }, "Nenhum disparo do mês com resultado ainda. Os números chegam pela rotina diária do RD Station."));
    return box;
  }
  window.Resultados = { redes, emails, curto };
})();
