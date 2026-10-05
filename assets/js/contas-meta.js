/*
 * Contas de anúncio do Meta (Opta e Lopes) — página Tráfego pago.
 *   - Calculadora de verba: saldo de cada conta = recargas registradas − gasto lido dos relatórios do Meta.
 *   - Importação de relatórios do Gerenciador de Anúncios (.csv ou .xlsx): lê o gasto e os principais
 *     indicadores de cada campanha e liga cada campanha do Meta a uma campanha cadastrada no site (pelo nome).
 * Uso: ContasMeta.painel(elemento)
 * Coleções: trafego_recargas, trafego_relatorios (e lê/atualiza trafego_campanhas).
 */
(function(){
  const EMP = [{ k: "opta", n: "Opta" }, { k: "lopes", n: "Lopes" }];
  const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  const pad = n => String(n).padStart(2, "0");
  const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const brl = v => (+v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const int = v => Math.round(+v || 0).toLocaleString("pt-BR");
  const dec = (v, d) => (+v || 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = v => isFinite(v) ? dec(v, 2) + "%" : "—";
  const fd = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "—";
  const fdc = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : "—";
  const lerR = s => Central.lerDinheiro(s);
  const empN = k => (EMP.find(e => e.k === k) || { n: "—" }).n;
  const norm = s => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

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

  /* ---------------- leitura dos relatórios do Meta ---------------- */

  // números do Meta: "1234.56" (CSV), "1.234,56" (planilha em português), 1234.56 (xlsx)
  function numMeta(v){
    if (typeof v === "number") return isFinite(v) ? v : 0;
    let s = String(v == null ? "" : v).trim().replace(/[R$\s %]/g, "");
    if (!s || s === "-" || s === "—") return 0;
    const c = s.lastIndexOf(","), p = s.lastIndexOf(".");
    if (c >= 0 && p >= 0) s = c > p ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
    else if (c >= 0) s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
    else if (/^\d{1,3}(\.\d{3}){2,}$/.test(s)) s = s.replace(/\./g, "");
    const n = parseFloat(s); return isFinite(n) ? n : 0;
  }
  function dataMeta(v){
    if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
    if (typeof v === "number" && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 864e5)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; }
    const s = String(v == null ? "" : v).trim(); let m;
    if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
    if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
    return "";
  }
  // colunas reconhecidas (exportação do Gerenciador de Anúncios em português ou inglês)
  const COLS = [
    ["campanha", /^(nome da campanha|campaign name|campanha)$/],
    ["conta", /^(nome da conta|account name|conta de anuncios|nome da conta de anuncios)$/],
    ["gasto", /^(valor usado|valor gasto|amount spent|valor investido|gasto)( brl)?$/],
    ["impressoes", /^(impressoes|impressions)$/],
    ["alcance", /^(alcance|reach)$/],
    ["cliques", /^(cliques no link|link clicks)$/],
    ["cliquesTodos", /^(cliques todos|clicks all|cliques)$/],
    ["resultados", /^(resultados|results)$/],
    ["indicador", /^(indicador de resultado|indicador de resultados|result indicator|tipo de resultado)$/],
    ["inicio", /^(inicio dos relatorios|reporting starts|inicio do relatorio)$/],
    ["fim", /^(termino dos relatorios|reporting ends|termino do relatorio|fim dos relatorios)$/],
    ["dia", /^(dia|day|data|date)$/],
    ["status", /^(veiculacao da campanha|campaign delivery|status da campanha|veiculacao)$/]
  ];
  const INDICADORES = { "reach": "Alcance", "impressions": "Impressões", "actions:link_click": "Cliques no link", "link_click": "Cliques no link",
    "actions:landing_page_view": "Visualizações da página", "actions:post_engagement": "Engajamento", "actions:page_engagement": "Engajamento",
    "actions:video_view": "Visualizações de vídeo", "video_thruplay_watched_actions": "ThruPlays", "actions:lead": "Cadastros", "actions:leadgen_grouped": "Cadastros",
    "actions:onsite_conversion.lead_grouped": "Cadastros", "actions:onsite_conversion.messaging_conversation_started_7d": "Conversas iniciadas",
    "actions:offsite_conversion.fb_pixel_purchase": "Compras", "actions:omni_purchase": "Compras", "actions:like": "Curtidas na página",
    "actions:onsite_conversion.post_save": "Salvamentos", "actions:offsite_conversion.fb_pixel_lead": "Cadastros (site)" };
  const indicadorN = v => { const s = String(v || "").trim(); return INDICADORES[s] || INDICADORES[s.toLowerCase()] || s.replace(/^actions:/, ""); };
  const chaveCol = h => { const n = norm(h); for (const [k, re] of COLS) if (re.test(n) || re.test(n.replace(/ brl$/, ""))) return k; return null; };

  function lerCSV(txt){
    txt = txt.replace(/^﻿/, "");
    const linha1 = txt.split(/\r?\n/).find(l => l.trim()) || "";
    const sep = [";", ",", "\t"].map(s => [s, linha1.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = []; let row = [], cel = "", q = false;
    for (let i = 0; i < txt.length; i++) {
      const ch = txt[i];
      if (q) { if (ch === '"') { if (txt[i + 1] === '"') { cel += '"'; i++; } else q = false; } else cel += ch; }
      else if (ch === '"') q = true;
      else if (ch === sep) { row.push(cel); cel = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && txt[i + 1] === "\n") i++; row.push(cel); rows.push(row); row = []; cel = ""; }
      else cel += ch;
    }
    if (cel !== "" || row.length) { row.push(cel); rows.push(row); }
    return rows;
  }
  let xlsxP = null;
  function carregarXLSX(){
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!xlsxP) xlsxP = new Promise((ok, erro) => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
      s.onload = () => ok(window.XLSX); s.onerror = () => { xlsxP = null; erro(new Error("Não foi possível carregar o leitor de planilhas. Verifique a internet ou salve o relatório como CSV.")); }; document.head.append(s); });
    return xlsxP;
  }
  async function lerArquivo(file){
    const nome = file.name.toLowerCase();
    if (/\.(xlsx|xls)$/.test(nome)) {
      const X = await carregarXLSX();
      const wb = X.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      let melhor = null;
      for (const n of wb.SheetNames) { const r = X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: "" }); const t = interpretar(r); if (!t.erro) return t; melhor = melhor || t; }
      return melhor || { erro: "A planilha está vazia." };
    }
    return interpretar(lerCSV(await file.text()));
  }
  function interpretar(rows){
    let hi = -1, map = null;
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const m = {}; (rows[i] || []).forEach((h, j) => { const k = chaveCol(h); if (k && !(k in m)) m[k] = j; });
      if ("campanha" in m && "gasto" in m) { hi = i; map = m; break; }
    }
    if (hi < 0) return { erro: "Não encontrei as colunas “Nome da campanha” e “Valor usado (BRL)”. Exporte o relatório no nível de campanhas, com essas colunas." };
    const g = {}, contas = {}; let ini = "", fim = "", linhasLidas = 0;
    const v = (r, k) => k in map ? r[map[k]] : "";
    for (const r of rows.slice(hi + 1)) {
      const nome = String(v(r, "campanha") || "").trim(); if (!nome) continue;   // linha de total ou vazia
      linhasLidas++;
      const x = g[nome] || (g[nome] = { nome, gasto: 0, impressoes: 0, alcance: 0, cliques: 0, resultados: 0, indicadores: {}, partes: 0, status: "" });
      x.partes++;
      x.gasto += numMeta(v(r, "gasto")); x.impressoes += numMeta(v(r, "impressoes")); x.alcance += numMeta(v(r, "alcance"));
      x.cliques += numMeta("cliques" in map ? v(r, "cliques") : v(r, "cliquesTodos")); x.resultados += numMeta(v(r, "resultados"));
      const ind = indicadorN(v(r, "indicador")); if (ind) x.indicadores[ind] = (x.indicadores[ind] || 0) + 1;
      if (!x.status) x.status = String(v(r, "status") || "").trim();
      const c = String(v(r, "conta") || "").trim(); if (c) contas[c] = 1;
      const a = dataMeta(v(r, "inicio")) || dataMeta(v(r, "dia")), b = dataMeta(v(r, "fim")) || dataMeta(v(r, "dia"));
      if (a && (!ini || a < ini)) ini = a; if (b && (!fim || b > fim)) fim = b;
    }
    const linhas = Object.values(g).map(x => ({ nome: x.nome, gasto: Math.round(x.gasto * 100) / 100, impressoes: Math.round(x.impressoes), alcance: Math.round(x.alcance), cliques: Math.round(x.cliques),
      resultados: Math.round(x.resultados * 100) / 100, indicador: Object.entries(x.indicadores).sort((a, b) => b[1] - a[1]).map(e => e[0])[0] || "", alcanceSomado: x.partes > 1, status: x.status }));
    if (!linhas.length) return { erro: "O relatório não tem nenhuma campanha com nome." };
    // conta: pela coluna “Nome da conta” ou pelo nome das campanhas
    const txtConta = norm(Object.keys(contas).join(" ")), txtCamp = norm(linhas.map(l => l.nome).join(" "));
    const achou = t => { const o = (t.match(/\bopta\b/g) || []).length, l = (t.match(/\blopes\b/g) || []).length; return o > l ? "opta" : l > o ? "lopes" : ""; };
    return { linhas, inicio: ini, fim: fim || ini, empresa: achou(txtConta) || achou(txtCamp), contaNome: Object.keys(contas).join(", "), linhasLidas, colunas: Object.keys(map) };
  }

  // liga a campanha do Meta à campanha cadastrada no site (nome igual, contido ou com mais palavras em comum)
  function sugerir(nome, empresa, camps){
    const a = norm(nome), ta = new Set(a.split(" ").filter(w => w.length > 2)); let best = null, nota = 0;
    camps.forEach(c => {
      if (empresa && c.empresa && c.empresa !== empresa) return;
      const b = norm(c.nome); if (!b) return;
      let s = 0; if (a === b) s = 1; else if (a.includes(b) || b.includes(a)) s = .85;
      else { const tb = new Set(b.split(" ").filter(w => w.length > 2)); const inter = [...ta].filter(w => tb.has(w)).length; const uni = new Set([...ta, ...tb]).size; s = uni ? inter / uni * .8 : 0; }
      if (s > nota) { nota = s; best = c; }
    });
    return nota >= .5 ? best.id : "";
  }

  /* ---------------- indicadores ---------------- */
  function kpis(x){
    return { ctr: x.impressoes ? x.cliques / x.impressoes * 100 : NaN, cpc: x.cliques ? x.gasto / x.cliques : NaN, cpm: x.impressoes ? x.gasto / x.impressoes * 1000 : NaN,
      cpr: x.resultados ? x.gasto / x.resultados : NaN, freq: x.alcance ? x.impressoes / x.alcance : NaN };
  }

  /* ---------------- painel ---------------- */
  function painel(host){
    let rec = [], rels = [], camps = [], Y = new Date().getFullYear(), M = new Date().getMonth(), prev = null, abertos = {};
    try { const s = sessionStorage.getItem("cm-mes"); if (s) { const [a, b] = s.split("-"); Y = +a; M = +b; } } catch (_) {}
    const colR = Store.collection("trafego_recargas"), colI = Store.collection("trafego_relatorios"), colC = Store.collection("trafego_campanhas");
    const me = () => (Auth.current() || {}).email || "";
    const podeApagar = d => Auth.isAdmin() || (d.criadoPor && d.criadoPor === me());
    let tt; const toast = m => { const t = document.getElementById("toast"); if (!t) return; t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 2600); };
    const mk = () => `${Y}-${pad(M + 1)}`;
    const typing = () => { const a = document.activeElement; return a && host.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) && a.type !== "file"; };
    let pend = false;
    function render(){ if (typing()) { pend = true; return; } pend = false; draw(); }
    host.addEventListener("focusout", () => setTimeout(() => { if (pend && !typing()) render(); }, 0));

    const gastoConta = (k, so) => rels.filter(r => r.empresa === k && (!so || (r.inicio || "").slice(0, 7) === so)).reduce((s, r) => s + (+r.gasto || 0), 0);
    const recConta = (k, so) => rec.filter(r => r.empresa === k && (!so || (r.data || "").slice(0, 7) === so)).reduce((s, r) => s + (+r.valor || 0), 0);
    const campNome = id => { const c = camps.find(x => x.id === id); return c ? c.nome || "Sem nome" : ""; };

    // gasto por campanha no mês: soma os relatórios do mês, agrupando pela campanha ligada (ou pelo nome do Meta)
    function porCampanha(){
      const g = {};
      rels.filter(r => (r.inicio || "").slice(0, 7) === mk()).forEach(r => (r.linhas || []).forEach(l => {
        const key = l.campanhaId ? "c:" + l.campanhaId : "m:" + r.empresa + ":" + l.nome;
        const x = g[key] || (g[key] = { key, campanhaId: l.campanhaId || "", nome: l.campanhaId ? campNome(l.campanhaId) || l.nome : l.nome, metas: new Set(), empresa: r.empresa,
          gasto: 0, impressoes: 0, alcance: 0, cliques: 0, resultados: 0, indicador: l.indicador || "", aprox: false });
        if (l.alcanceSomado) x.aprox = true;
        x.metas.add(l.nome); x.gasto += +l.gasto || 0; x.impressoes += +l.impressoes || 0; x.alcance += +l.alcance || 0; x.cliques += +l.cliques || 0; x.resultados += +l.resultados || 0;
        if (!x.indicador) x.indicador = l.indicador || "";
      }));
      return Object.values(g).sort((a, b) => b.gasto - a.gasto);
    }
    // gasto total (todos os relatórios) de cada campanha ligada → "Verba investida" da campanha
    const gastoCampanhaTotal = id => rels.reduce((s, r) => s + (r.linhas || []).filter(l => l.campanhaId === id).reduce((t, l) => t + (+l.gasto || 0), 0), 0);
    async function atualizarInvestido(ids, base){
      const L = base || rels;
      for (const id of new Set(ids)) { if (!id || !camps.find(c => c.id === id)) continue;
        const v = Math.round(L.reduce((s, r) => s + (r.linhas || []).filter(l => l.campanhaId === id).reduce((t, l) => t + (+l.gasto || 0), 0), 0) * 100) / 100;
        try { await colC.doc(id).update({ verbaInvestida: v }); } catch (_) {} }
    }

    function draw(){
      host.textContent = "";
      const card = el("div", { class: "cx-card cm" });
      // cabeçalho com o mês
      const mesTxt = `${MESES[M]} de ${Y}`;
      const nav = d => { M += d; if (M < 0) { M = 11; Y--; } if (M > 11) { M = 0; Y++; } try { sessionStorage.setItem("cm-mes", `${Y}-${M}`); } catch (_) {} draw(); };
      card.append(el("div", { class: "cx-head" },
        el("div", null, el("h2", null, "Contas de anúncio no Meta · calculadora de verba"),
          el("p", { class: "cx-hint" }, "Saldo da conta = recargas registradas − gasto lido dos relatórios importados do Gerenciador de Anúncios.")),
        el("div", { class: "cx-mbar" }, el("button", { class: "cx-icon", type: "button", "aria-label": "Mês anterior", onclick: () => nav(-1) }, "‹"),
          el("b", { class: "cx-mtitle" }, `${MESES[M]} ${Y}`), el("button", { class: "cx-icon", type: "button", "aria-label": "Próximo mês", onclick: () => nav(1) }, "›"))));

      // saldos
      const grid = el("div", { class: "cm-contas" });
      const cont = (titulo, ks, cls) => {
        const R = ks.reduce((s, k) => s + recConta(k), 0), G = ks.reduce((s, k) => s + gastoConta(k), 0), S = R - G;
        const Rm = ks.reduce((s, k) => s + recConta(k, mk()), 0), Gm = ks.reduce((s, k) => s + gastoConta(k, mk()), 0);
        const uso = R ? Math.min(100, G / R * 100) : 0;
        return el("div", { class: "cm-conta " + cls },
          el("small", null, titulo), el("b", { class: S < 0 ? "neg" : "" }, brl(S)), el("span", { class: "cm-lab" }, S < 0 ? "saldo negativo — registre a recarga que falta" : "saldo disponível"),
          el("div", { class: "cm-bar", title: `${dec(uso, 1)}% das recargas já gastos` }, el("i", { style: `width:${uso}%;background:var(${uso > 90 ? "--bad" : uso > 75 ? "--warn" : "--ok"})` })),
          el("dl", null, el("dt", null, "Recargas"), el("dd", null, brl(R)), el("dt", null, "Gasto"), el("dd", null, brl(G)),
            el("dt", null, `Recargas em ${MESES[M]}`), el("dd", null, brl(Rm)), el("dt", null, `Gasto em ${MESES[M]}`), el("dd", null, brl(Gm))));
      };
      grid.append(cont("Conta Opta", ["opta"], "opta"), cont("Conta Lopes", ["lopes"], "lopes"), cont("Total das duas contas", ["opta", "lopes"], "tot"));
      card.append(grid);

      // gasto por campanha
      const pc = porCampanha();
      const box = el("div", { class: "cm-sec" }, el("h3", null, `Gasto e indicadores por campanha · ${mesTxt}`));
      if (!pc.length) box.append(el("p", { class: "cx-hint" }, "Nenhum relatório importado para este mês. Use “Importar relatório do Meta” abaixo."));
      else {
        const tb = el("tbody"); let T = { gasto: 0, impressoes: 0, alcance: 0, cliques: 0, resultados: 0, verba: 0 };
        pc.forEach(x => {
          const c = camps.find(z => z.id === x.campanhaId), verba = c ? +c.verba || 0 : 0, k = kpis(x);
          T.gasto += x.gasto; T.impressoes += x.impressoes; T.alcance += x.alcance; T.cliques += x.cliques; T.resultados += x.resultados; T.verba += verba;
          const saldo = verba - (c ? gastoCampanhaTotal(c.id) : x.gasto);
          tb.append(el("tr", null,
            el("td", { class: "cx-l" }, el("b", null, x.nome), el("div", { class: "cx-who" }, empN(x.empresa) + (c ? "" : " · sem campanha ligada no site"), [...x.metas].some(n => n !== x.nome) ? el("div", null, "Meta: " + [...x.metas].join(" · ")) : null)),
            el("td", { class: "cx-r cx-mono" }, verba ? brl(verba) : "—"),
            el("td", { class: "cx-r cx-mono" }, brl(x.gasto)),
            el("td", { class: "cx-r cx-mono" + (c && saldo < 0 ? " neg" : "") }, c && verba ? brl(saldo) : "—"),
            el("td", { class: "cx-r cx-mono" }, x.resultados ? dec(x.resultados, x.resultados % 1 ? 2 : 0) : "—", x.indicador ? el("div", { class: "cx-who" }, x.indicador) : null),
            el("td", { class: "cx-r cx-mono" }, isFinite(k.cpr) ? brl(k.cpr) : "—"),
            el("td", { class: "cx-r cx-mono", title: x.aprox ? "Alcance somado de várias linhas do relatório (dias ou anúncios): a mesma pessoa pode ter sido contada mais de uma vez" : null }, (x.aprox ? "≈ " : "") + int(x.alcance)),
            el("td", { class: "cx-r cx-mono" }, int(x.impressoes)),
            el("td", { class: "cx-r cx-mono" }, int(x.cliques)),
            el("td", { class: "cx-r cx-mono" }, pct(k.ctr)),
            el("td", { class: "cx-r cx-mono" }, isFinite(k.cpc) ? brl(k.cpc) : "—"),
            el("td", { class: "cx-r cx-mono" }, isFinite(k.cpm) ? brl(k.cpm) : "—")));
        });
        const kt = kpis(T);
        box.append(el("div", { class: "cx-tw" }, el("table", { class: "cx-table cm-t" },
          el("thead", null, el("tr", null, ...["Campanha", "Verba projetada", "Gasto no mês", "Saldo da campanha", "Resultados", "Custo/resultado", "Alcance", "Impressões", "Cliques no link", "CTR", "CPC", "CPM"].map((h, i) => el("th", { class: i ? "cx-r" : "" }, h)))),
          tb,
          el("tfoot", null, el("tr", null, el("td", null, "Total do mês"), el("td", { class: "cx-r cx-mono" }, T.verba ? brl(T.verba) : "—"), el("td", { class: "cx-r cx-mono" }, brl(T.gasto)), el("td"),
            el("td", { class: "cx-r cx-hint", title: "Cada campanha mede um tipo de resultado diferente" }, "—"), el("td"), el("td", { class: "cx-r cx-mono", title: "Soma do alcance de cada campanha (a mesma pessoa pode ser contada mais de uma vez)" }, int(T.alcance)),
            el("td", { class: "cx-r cx-mono" }, int(T.impressoes)), el("td", { class: "cx-r cx-mono" }, int(T.cliques)), el("td", { class: "cx-r cx-mono" }, pct(kt.ctr)),
            el("td", { class: "cx-r cx-mono" }, isFinite(kt.cpc) ? brl(kt.cpc) : "—"), el("td", { class: "cx-r cx-mono" }, isFinite(kt.cpm) ? brl(kt.cpm) : "—"))))));
        box.append(el("p", { class: "cx-hint" }, "Saldo da campanha = verba projetada − tudo o que já foi gasto nela (todos os relatórios). CTR, CPC e CPM usam os cliques no link."));
      }
      card.append(box);

      card.append(detalhe("rec", "+ Registrar recarga ou saldo inicial", formRecarga()));
      card.append(detalhe("imp", "Importar relatório do Meta (.csv ou .xlsx)", formImport()));
      card.append(detalhe("hist", `Recargas e relatórios lançados (${rec.length + rels.length})`, historico()));
      host.append(card);
    }
    function detalhe(k, titulo, corpo){
      const d = el("details", { class: "cx-det" }, el("summary", null, titulo), corpo); d.open = !!abertos[k];
      d.addEventListener("toggle", () => { abertos[k] = d.open; }); return d;
    }

    function formRecarga(){
      const conta = el("select", { "aria-label": "Conta" }, ...EMP.map(e => el("option", { value: e.k }, e.n)));
      const data = el("input", { type: "date", value: hoje() }), valor = el("input", { type: "text", class: "cx-money", inputmode: "decimal", placeholder: "0,00", autocomplete: "off" });
      const obs = el("input", { type: "text", maxlength: "120", placeholder: "Ex.: boleto, cartão, saldo inicial de outubro" });
      const f = el("form", { class: "cx-form", novalidate: true, onsubmit: async ev => { ev.preventDefault();
        const v = lerR(valor.value); if (!(v > 0)) { valor.focus(); return toast("Informe o valor da recarga."); }
        const btn = f.querySelector("button"); btn.disabled = true;
        try { await colR.add({ empresa: conta.value, data: data.value || hoje(), valor: v, obs: obs.value.trim() }); valor.value = ""; obs.value = ""; toast(`Recarga de ${brl(v)} registrada na conta ${empN(conta.value)}`); }
        catch (e) { toast((e && e.message) || "Não foi possível salvar."); } finally { btn.disabled = false; } } },
        el("label", { class: "cx-f" }, el("span", null, "Conta"), conta), el("label", { class: "cx-f" }, el("span", null, "Data"), data),
        el("label", { class: "cx-f" }, el("span", null, "Valor (R$)"), valor), el("label", { class: "cx-f" }, el("span", null, "Observação"), obs),
        el("div", null, el("button", { class: "cx-btn cx-primary", type: "submit" }, "Registrar recarga")));
      return el("div", null, f, el("p", { class: "cx-hint", style: "margin:0 14px 12px" }, "Para começar, registre o saldo que cada conta tem hoje como “saldo inicial”. Depois, registre cada novo crédito colocado na conta."));
    }

    function formImport(){
      const wrap = el("div", { class: "cm-imp" });
      const inp = el("input", { type: "file", accept: ".csv,.xlsx,.xls,text/csv", "aria-label": "Relatório do Meta" });
      const msg = el("p", { class: "cx-hint" }, "No Gerenciador de Anúncios: aba Campanhas → escolha o período → Relatórios → Exportar dados da tabela (.csv ou .xlsx). Colunas usadas: Nome da campanha, Valor usado (BRL), Resultados, Indicador de resultado, Alcance, Impressões, Cliques no link e o período do relatório.");
      const area = el("div");
      inp.onchange = async () => {
        const f = inp.files[0]; if (!f) return; area.textContent = ""; area.append(el("p", { class: "cx-hint" }, "Lendo o arquivo…"));
        try { const r = await lerArquivo(f); if (r.erro) { prev = null; area.textContent = ""; area.append(el("p", { class: "cm-erro" }, r.erro)); return; }
          r.arquivo = f.name; r.linhas.forEach(l => l.campanhaId = sugerir(l.nome, r.empresa, camps)); prev = r; area.textContent = ""; area.append(previa()); }
        catch (e) { prev = null; area.textContent = ""; area.append(el("p", { class: "cm-erro" }, (e && e.message) || "Não foi possível ler o arquivo.")); }
      };
      const nomeArq = el("span", { class: "cx-hint" }, "Nenhum arquivo escolhido");
      inp.addEventListener("change", () => { nomeArq.textContent = inp.files[0] ? inp.files[0].name : "Nenhum arquivo escolhido"; });
      wrap.append(el("label", { class: "cm-file" }, el("span", { class: "cx-btn" }, "Escolher arquivo"), inp, nomeArq), msg, area);
      if (prev) area.append(previa());
      return wrap;
    }
    function previa(){
      const r = prev, box = el("div", { class: "cm-prev" });
      const conta = el("select", { "aria-label": "Conta do relatório" }, el("option", { value: "" }, "Escolha a conta…"), ...EMP.map(e => el("option", { value: e.k }, e.n))); conta.value = r.empresa || "";
      const ini = el("input", { type: "date", value: r.inicio || `${hoje().slice(0, 8)}01` }), fim = el("input", { type: "date", value: r.fim || hoje() });
      const atual = el("input", { type: "checkbox", checked: true });
      const sobre = el("div");
      const total = r.linhas.reduce((s, l) => s + l.gasto, 0);
      const opts = () => [el("option", { value: "" }, "— não ligar —"), ...camps.filter(c => !conta.value || !c.empresa || c.empresa === conta.value).map(c => el("option", { value: c.id }, (c.nome || "Sem nome") + (c.empresa ? " · " + empN(c.empresa) : "")))];
      const tb = el("tbody");
      const linhas = () => { tb.textContent = ""; r.linhas.forEach(l => { const s = el("select", { "aria-label": "Campanha do site para " + l.nome, onchange: e => l.campanhaId = e.target.value }, ...opts()); s.value = l.campanhaId || "";
        const k = kpis(l);
        tb.append(el("tr", null, el("td", { class: "cx-l" }, el("b", null, l.nome), l.status ? el("div", { class: "cx-who" }, l.status) : null), el("td", null, s),
          el("td", { class: "cx-r cx-mono" }, brl(l.gasto)), el("td", { class: "cx-r cx-mono" }, l.resultados ? dec(l.resultados, l.resultados % 1 ? 2 : 0) : "—", l.indicador ? el("div", { class: "cx-who" }, l.indicador) : null),
          el("td", { class: "cx-r cx-mono" }, (l.alcanceSomado ? "≈ " : "") + int(l.alcance)), el("td", { class: "cx-r cx-mono" }, int(l.impressoes)), el("td", { class: "cx-r cx-mono" }, int(l.cliques)), el("td", { class: "cx-r cx-mono" }, pct(k.ctr)))); }); };
      // relatórios anteriores da mesma conta com período que se cruza → substituir para não contar duas vezes
      let subst = [];
      const checaSobre = () => { sobre.textContent = ""; subst = [];
        const L = rels.filter(x => x.empresa === conta.value && !(fim.value < x.inicio || ini.value > x.fim));
        if (!L.length || !conta.value) return;
        const ck = el("input", { type: "checkbox", checked: true }); subst = L.map(x => x.id); ck.onchange = () => { subst = ck.checked ? L.map(x => x.id) : []; };
        sobre.append(el("div", { class: "cm-aviso" }, el("b", null, "Já existe relatório desta conta neste período:"),
          el("ul", null, ...L.map(x => el("li", null, `${fd(x.inicio)} a ${fd(x.fim)} · ${brl(x.gasto)} · ${x.arquivo || "relatório"}`))),
          el("label", null, ck, " Substituir pelo novo (recomendado — evita contar o mesmo gasto duas vezes)"))); };
      conta.onchange = () => { linhas(); checaSobre(); }; ini.onchange = checaSobre; fim.onchange = checaSobre;
      const btn = el("button", { class: "cx-btn cx-primary", type: "button", onclick: async () => {
        if (!conta.value) { conta.focus(); return toast("Escolha de qual conta é o relatório."); }
        if (!ini.value || !fim.value || fim.value < ini.value) { ini.focus(); return toast("Confira o período do relatório."); }
        btn.disabled = true; btn.textContent = "Importando…";
        try {
          const doc = { empresa: conta.value, inicio: ini.value, fim: fim.value, arquivo: r.arquivo, gasto: Math.round(total * 100) / 100,
            linhas: r.linhas.map(l => ({ nome: l.nome, campanhaId: l.campanhaId || "", gasto: l.gasto, impressoes: l.impressoes, alcance: l.alcance, cliques: l.cliques, resultados: l.resultados, indicador: l.indicador, alcanceSomado: !!l.alcanceSomado })) };
          const antigos = rels.filter(x => subst.includes(x.id));
          for (const id of subst) await colI.doc(id).delete();
          const novo = await colI.add(doc);
          if (atual.checked) { const ids = doc.linhas.map(l => l.campanhaId).concat(antigos.flatMap(x => (x.linhas || []).map(l => l.campanhaId)));
            // o relatório novo pode já ter entrado na lista local (gravação otimista): conta uma vez só
            const igual = x => (novo && x.id === novo.id) || (x.empresa === doc.empresa && x.inicio === doc.inicio && x.fim === doc.fim && x.arquivo === doc.arquivo && +x.gasto === doc.gasto);
            const base = rels.filter(x => !subst.includes(x.id) && !igual(x)).concat([doc]); await atualizarInvestido(ids, base); }
          prev = null; abertos.imp = false; toast(`Relatório importado: ${r.linhas.length} campanha(s), ${brl(total)} gastos na conta ${empN(conta.value)}`); draw();
        } catch (e) { toast((e && e.message) || "Não foi possível importar."); btn.disabled = false; btn.textContent = "Importar relatório"; }
      } }, "Importar relatório");
      linhas(); checaSobre();
      box.append(
        el("div", { class: "cx-form" }, el("label", { class: "cx-f" }, el("span", null, "Conta"), conta), el("label", { class: "cx-f" }, el("span", null, "Início do período"), ini),
          el("label", { class: "cx-f" }, el("span", null, "Fim do período"), fim),
          el("div", { class: "cx-f" }, el("span", null, "Arquivo"), el("div", { class: "cm-arq" }, `${r.arquivo} · ${r.linhas.length} campanha(s)` + (r.contaNome ? ` · ${r.contaNome}` : "")))),
        el("div", { class: "cx-tw" }, el("table", { class: "cx-table cm-t" }, el("thead", null, el("tr", null, ...["Campanha no Meta", "Campanha no site", "Gasto", "Resultados", "Alcance", "Impressões", "Cliques no link", "CTR"].map((h, i) => el("th", { class: i > 1 ? "cx-r" : "" }, h)))), tb,
          el("tfoot", null, el("tr", null, el("td", null, "Total do relatório"), el("td"), el("td", { class: "cx-r cx-mono" }, brl(total)), el("td", { colspan: "5" }))))),
        sobre,
        el("label", { class: "cm-ck" }, atual, " Atualizar a “Verba investida” das campanhas ligadas com o gasto do Meta"),
        el("div", { class: "cm-acts" }, btn, el("button", { class: "cx-btn", type: "button", onclick: () => { prev = null; draw(); } }, "Cancelar")));
      return box;
    }

    function historico(){
      const w = el("div", { class: "cm-hist" });
      const tr = el("tbody");
      rec.slice().sort((a, b) => (b.data || "").localeCompare(a.data || "")).forEach(x => tr.append(el("tr", null,
        el("td", { class: "cx-mono" }, fd(x.data)), el("td", null, empN(x.empresa)), el("td", null, x.obs || "—", el("div", { class: "cx-who" }, Custos.userName(x.criadoPor) || "")),
        el("td", { class: "cx-r cx-mono" }, brl(x.valor)), el("td", null, podeApagar(x) ? apagar(() => colR.doc(x.id).delete(), "Recarga excluída") : null))));
      w.append(el("h3", null, "Recargas"), rec.length ? el("div", { class: "cx-tw" }, el("table", { class: "cx-table" }, el("thead", null, el("tr", null, el("th", null, "Data"), el("th", null, "Conta"), el("th", null, "Observação"), el("th", { class: "cx-r" }, "Valor"), el("th"))), tr)) : el("p", { class: "cx-hint" }, "Nenhuma recarga registrada."));
      const ti = el("tbody");
      rels.slice().sort((a, b) => (b.inicio || "").localeCompare(a.inicio || "")).forEach(x => ti.append(el("tr", null,
        el("td", { class: "cx-mono" }, `${fdc(x.inicio)} a ${fd(x.fim)}`), el("td", null, empN(x.empresa)), el("td", null, x.arquivo || "—", el("div", { class: "cx-who" }, `${(x.linhas || []).length} campanha(s) · ${Custos.userName(x.criadoPor) || ""}`)),
        el("td", { class: "cx-r cx-mono" }, brl(x.gasto)),
        el("td", null, podeApagar(x) ? apagar(async () => { const ids = (x.linhas || []).map(l => l.campanhaId); await colI.doc(x.id).delete(); await atualizarInvestido(ids, rels.filter(z => z.id !== x.id)); }, "Relatório excluído") : null))));
      w.append(el("h3", null, "Relatórios importados"), rels.length ? el("div", { class: "cx-tw" }, el("table", { class: "cx-table" }, el("thead", null, el("tr", null, el("th", null, "Período"), el("th", null, "Conta"), el("th", null, "Arquivo"), el("th", { class: "cx-r" }, "Gasto"), el("th"))), ti)) : el("p", { class: "cx-hint" }, "Nenhum relatório importado."));
      return w;
    }
    function apagar(fn, ok){
      const b = el("span", { class: "cx-act" }); const draw0 = c => { b.textContent = "";
        if (!c) b.append(el("button", { class: "cx-btn cx-bad", type: "button", onclick: () => draw0(true) }, "Excluir"));
        else b.append(el("button", { class: "cx-btn cx-bad", type: "button", onclick: async () => { try { await fn(); toast(ok); } catch (e) { toast((e && e.message) || "Não foi possível excluir."); } } }, "Confirmar"),
          el("button", { class: "cx-btn", type: "button", onclick: () => draw0(false) }, "Não")); };
      draw0(false); return b;
    }

    estilo();
    colR.onSnapshot(sn => { rec = sn.docs.filter(d => d.exists).map(d => Object.assign({ id: d.id }, d.data())); render(); });
    colI.onSnapshot(sn => { rels = sn.docs.filter(d => d.exists).map(d => Object.assign({ id: d.id }, d.data())); render(); });
    colC.onSnapshot(sn => { camps = sn.docs.filter(d => d.exists).map(d => Object.assign({ id: d.id }, d.data())); render(); });
    draw();
  }

  function estilo(){
    if (document.getElementById("cm-css")) return;
    const s = document.createElement("style"); s.id = "cm-css";
    s.textContent = `
.cm{margin-bottom:18px}
.cm-contas{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.cm-conta{border:1px solid var(--line);border-radius:10px;padding:14px;background:var(--bg);display:flex;flex-direction:column;gap:6px;min-width:0;border-top:4px solid var(--cc,var(--navy))}
.cm-conta.opta{--cc:#EE3B2D}.cm-conta.lopes{--cc:var(--navy)}.cm-conta.tot{--cc:var(--accent)}
.cm-conta small{font-size:12px;font-weight:700;color:var(--muted)}
.cm-conta>b{font-family:var(--mono);font-weight:500;font-size:24px;color:var(--ok);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cm-conta>b.neg{color:var(--bad)}
.cm-lab{font-size:12px;color:var(--muted)}
.cm-bar{height:8px;border-radius:4px;background:var(--surface-2);overflow:hidden}.cm-bar i{display:block;height:100%}
.cm-conta dl{display:grid;grid-template-columns:auto auto;gap:3px 10px;margin:4px 0 0;font-size:12.5px}
.cm-conta dt{color:var(--muted)}.cm-conta dd{margin:0;text-align:right;font-family:var(--mono)}
.cm-sec h3,.cm-hist h3{font-size:15px;margin:4px 0 8px}
.cm-t{min-width:1100px}.cm-t td.neg{color:var(--bad);font-weight:700}
.cm-imp,.cm-hist{padding:12px 14px;display:flex;flex-direction:column;gap:10px}
.cm-file{display:inline-flex;align-items:center;gap:10px;align-self:flex-start}
.cm-file{cursor:pointer}.cm-file input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}.cm-file:focus-within .cx-btn{outline:2px solid var(--accent);outline-offset:2px}
.cm-t td:first-child{min-width:230px}.cm-t td.cx-mono .cx-who{font-family:var(--display)}
.cm-prev{display:flex;flex-direction:column;gap:10px;border-top:1px solid var(--line);padding-top:10px}
.cm-prev .cx-form{padding:0}
.cm-prev select{background:var(--surface);border:1px solid var(--line);border-radius:7px;padding:5px 8px;font-size:12.5px;color:var(--fg);max-width:240px}
.cm-arq{font-size:13px;padding:8px 0;overflow-wrap:anywhere}
.cm-aviso{background:var(--warn-bg);color:var(--warn);border-radius:8px;padding:10px 12px;font-size:13px}
.cm-aviso ul{margin:6px 0;padding-left:18px}.cm-aviso label{font-weight:700;display:flex;gap:6px;align-items:center}
.cm-ck{font-size:13px;display:flex;gap:6px;align-items:center}
.cm-acts{display:flex;gap:8px;flex-wrap:wrap}
.cm-erro{color:var(--bad);font-weight:600;font-size:13.5px;margin:0}
.cm .cx-l{text-align:left}
.cm .cx-table th.cx-r{text-align:right}
@media (max-width:900px){.cm-contas{grid-template-columns:1fr}}`;
    document.head.append(s);
  }

  window.ContasMeta = { painel, lerArquivo, interpretar, numMeta };
})();
