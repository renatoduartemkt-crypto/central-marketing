/*
 * Custos do setor — módulo compartilhado.
 *
 * Junta, por centro de custo, todos os custos do setor:
 *   - coleção "custos"   : lançamentos de Redes sociais, Tráfego pago, Brindes (compras) e lançamentos manuais
 *   - coleção "eventos"  : notas fiscais lançadas em cada evento (campo custos[] do evento)
 *   - coleção "producao" : pedidos de produção de material aprovados (orçamento escolhido)
 * Só entra no realizado o que estiver APROVADO. Só administradores aprovam ou recusam.
 *
 * Uso:
 *   Custos.watch(estado => { estado.itens, estado.centros, estado.raw })
 *   Custos.decidir(item, "aprovado" | "recusado", motivo)
 *   Custos.painel(elemento, { origem: "redes", titulo, centroPadrao: "redes", tipos: [...] })
 */
(function(){
  // Contas contábeis do setor (Planejamento financeiro 2026 — Setor de Marketing)
  const CENTROS_PADRAO = [
    { id: "propaganda",   codigo: "200020", nome: "Material de venda / propaganda", ordem: 1 },
    { id: "terceirizado", codigo: "200021", nome: "Material terceirizado",          ordem: 2 },
    { id: "eventos",      codigo: "200022", nome: "Eventos",                        ordem: 3 },
    { id: "brindes",      codigo: "200023", nome: "Brindes",                        ordem: 4 },
    { id: "softwares",    codigo: "200024", nome: "Softwares",                      ordem: 5 }
  ];
  // centro de custo sugerido para cada origem/tipo de lançamento
  const CENTRO_SUGERIDO = { impulsionamento: "propaganda", producao: "terceirizado", compra: "brindes", redes: "terceirizado", trafego: "propaganda", brindes: "brindes", eventos: "eventos", manual: "propaganda" };
  const sugerido = (origem, tipo) => CENTRO_SUGERIDO[tipo] || CENTRO_SUGERIDO[origem] || "propaganda";
  const ORIGENS = { aditivo: "Aditivo de contrato", custos: "Lançamento", manual: "Lançamento manual", redes: "Redes sociais", trafego: "Tráfego pago", brindes: "Brindes", eventos: "Eventos", producao: "Produção de material" };
  const STATUS = { pendente: "Aguardando aprovação", aprovado: "Aprovado", recusado: "Recusado" };

  const pad = n => String(n).padStart(2, "0");
  const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const brl = v => (+v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const num = v => (+v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fd = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "—";
  const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  function parseBR(s){
    if (s == null) return 0; s = String(s).replace(/[R$\s]/g, ""); if (!s) return 0;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", "."); else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    const n = parseFloat(s); return isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }
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
  const isAdmin = () => !!(window.Auth && Auth.isAdmin && Auth.isAdmin());
  const meEmail = () => { const u = window.Auth && Auth.current && Auth.current(); return u ? u.email : ""; };

  function centros(docs){
    const L = (docs || []).filter(c => c && c.nome);
    const list = L.length ? L : CENTROS_PADRAO;
    return list.slice().sort((a, b) => (a.ordem || 50) - (b.ordem || 50) || String(a.nome).localeCompare(b.nome));
  }
  const centroNome = (id, list) => { const c = (list || CENTROS_PADRAO).find(x => x.id === id); return c ? c.nome : (id || "Sem centro de custo"); };
  const centroRotulo = (id, list) => { const c = (list || CENTROS_PADRAO).find(x => x.id === id); return c ? (c.codigo ? c.codigo + " · " : "") + c.nome : (id || "Sem centro de custo"); };

  // status de um pedido de produção -> status de custo
  const prodStatus = s => s === "aguardando" ? "pendente" : (s === "aprovado" || s === "produzindo" || s === "entregue") ? "aprovado" : s === "recusado" ? "recusado" : null;
  const prodEscolhido = p => { const o = (p.orcamentos || [])[p.escolhido]; return o || null; };

  // transforma as três fontes numa lista única de itens de custo
  function itens(raw){
    const out = [];
    (raw.custos || []).forEach(c => out.push({
      key: "custos:" + c.id, src: "custos", docId: c.id, origem: c.origem || "manual", tipo: c.tipo || "",
      data: c.data || (c.criadoEm || "").slice(0, 10), centro: c.centro || sugerido(c.origem, c.tipo),
      descricao: c.descricao || "", fornecedor: c.fornecedor || "", nf: c.nf || "", valor: +c.valor || 0,
      status: c.status || "pendente", refNome: c.refNome || "", solicitadoPor: c.solicitadoPor || c.atualizadoPor || "",
      aprovadoPor: c.aprovadoPor || "", aprovadoEm: c.aprovadoEm || "", motivoRecusa: c.motivoRecusa || "", raw: c
    }));
    (raw.eventos || []).forEach(e => (e.custos || []).forEach(n => out.push({
      key: "eventos:" + e.id + ":" + n.id, src: "eventos", docId: e.id, subId: n.id, origem: "eventos", tipo: n.centro || "",
      data: n.data || "", centro: e.centroSetor || "eventos", descricao: (n.desc ? n.desc : "Nota fiscal") + (n.centro ? " · " + n.centro : ""),
      fornecedor: n.fornecedor || "", nf: n.nf || "", valor: +n.valor || 0, status: n.status || "pendente", refNome: e.nome || "",
      solicitadoPor: n.lancadoPor || "", aprovadoPor: n.aprovadoPor || "", aprovadoEm: n.aprovadoEm || "", motivoRecusa: n.motivoRecusa || "", raw: n
    })));
    (raw.producao || []).forEach(p => {
      const st = prodStatus(p.status); if (!st) return; const o = prodEscolhido(p);
      out.push({
        key: "producao:" + p.id, src: "producao", docId: p.id, origem: "producao", tipo: p.tipo || "",
        data: p.dataPedido || (p.criadoEm || "").slice(0, 10), centro: p.centro || "terceirizado",
        descricao: (p.titulo || "Pedido de produção") + (p.quantidade ? ` · ${p.quantidade} un.` : ""),
        fornecedor: o ? o.fornecedor : "", nf: p.nf || "", valor: o ? (+o.valor || 0) : 0, status: st, refNome: p.titulo || "",
        solicitadoPor: p.solicitante || p.criadoPor || "", aprovadoPor: p.aprovadoPor || "", aprovadoEm: p.aprovadoEm || "", motivoRecusa: p.motivoRecusa || "", raw: p
      });
    });
    return out;
  }

  // aditivos de contrato dos eventos (compromissos: não somam no realizado, mas precisam de aprovação)
  function aditivos(raw){
    const out = [];
    (raw.eventos || []).forEach(e => (e.contratos || []).forEach(c => (c.aditivos || []).forEach(a => out.push({
      key: "aditivo:" + e.id + ":" + c.id + ":" + a.id, src: "aditivo", docId: e.id, contratoId: c.id, subId: a.id, origem: "aditivo", tipo: a.tipo || "acrescimo",
      data: a.data || "", centro: e.centroSetor || "eventos", descricao: "Aditivo · " + (a.desc || "") + (a.motivo ? " — " + a.motivo : ""),
      fornecedor: c.fornecedor || "", nf: "", valor: (a.tipo === "reducao" ? -1 : 1) * (+a.valor || 0), status: a.status || "pendente", refNome: e.nome || "",
      contratoValor: +c.valor || 0, solicitadoPor: a.criadoPor || "", aprovadoPor: a.statusPor || a.aprovadoPor || "", aprovadoEm: a.statusEm || a.aprovadoEm || "", motivoRecusa: a.motivoRecusa || "", raw: a
    }))));
    return out;
  }
  // tudo o que precisa de decisão (ou já foi decidido), de todas as páginas
  const pendencias = raw => itens(raw).concat(aditivos(raw));

  // assina as coleções e devolve o estado consolidado sempre que algo muda
  function watch(cb, cols){
    const raw = { custos: [], eventos: [], producao: [], centros_custo: [] };
    const names = cols || ["custos", "eventos", "producao", "centros_custo"];
    const fire = () => cb({ itens: itens(raw), centros: centros(raw.centros_custo), raw });
    names.forEach(n => Store.collection(n).onSnapshot(sn => { raw[n] = sn.docs.map(d => Object.assign({ id: d.id }, d.data())); fire(); }, () => {}));
    return raw;
  }

  // aprovar / recusar (somente admin)
  async function decidir(item, status, motivo, raw){
    if (!isAdmin()) throw { message: "Só administradores podem aprovar ou recusar custos." };
    const stamp = { status, aprovadoPor: meEmail(), aprovadoEm: new Date().toISOString(), motivoRecusa: status === "recusado" ? (motivo || "") : "" };
    if (item.src === "custos") return Store.collection("custos").doc(item.docId).update(stamp);
    if (item.src === "producao") return Store.collection("producao").doc(item.docId).update(Object.assign({}, stamp, { status: status === "aprovado" ? "aprovado" : "recusado" }));
    if (item.src === "aditivo") {
      const snap = await Store.collection("eventos").doc(item.docId).get(); if (!snap.exists) throw { message: "Evento não encontrado." };
      const ev = snap.data();
      const contratos = (ev.contratos || []).map(c => c.id !== item.contratoId ? c : Object.assign({}, c, { aditivos: (c.aditivos || []).map(a => a.id !== item.subId ? a : Object.assign({}, a, stamp, { statusPor: stamp.aprovadoPor, statusEm: stamp.aprovadoEm })) }));
      return Store.collection("eventos").doc(item.docId).update({ contratos });
    }
    if (item.src === "eventos") {
      const snap = await Store.collection("eventos").doc(item.docId).get(); if (!snap.exists) throw { message: "Evento não encontrado." };
      const ev = snap.data(); const arr = (ev.custos || []).map(n => n.id === item.subId ? Object.assign({}, n, stamp) : n);
      return Store.collection("eventos").doc(item.docId).update({ custos: arr });
    }
  }

  // botões Aprovar/Recusar (ou situação) para uma linha
  function acoes(item, onDone){
    const box = el("div", { class: "cx-act" });
    const draw = mode => {
      box.textContent = "";
      if (item.status === "aprovado") { box.append(el("span", { class: "cx-who" }, item.aprovadoPor ? "por " + userName(item.aprovadoPor) : "")); return; }
      if (item.status === "recusado") { box.append(el("span", { class: "cx-who" }, (item.motivoRecusa ? "“" + item.motivoRecusa + "” · " : "") + (item.aprovadoPor ? userName(item.aprovadoPor) : ""))); if (!isAdmin()) return; }
      if (!isAdmin()) { box.append(el("span", { class: "cx-who" }, "aguarda um administrador")); return; }
      if (mode === "recusar") {
        const inp = el("input", { type: "text", class: "cx-in", placeholder: "Motivo da recusa", maxlength: "200", "aria-label": "Motivo da recusa" });
        box.append(inp, el("button", { type: "button", class: "cx-btn cx-bad", onclick: async () => { try { await decidir(item, "recusado", inp.value.trim()); onDone && onDone("Custo recusado"); } catch (e) { onDone && onDone(e.message || "Erro"); } } }, "Confirmar"),
          el("button", { type: "button", class: "cx-btn", onclick: () => draw() }, "Voltar"));
        setTimeout(() => inp.focus(), 20); return;
      }
      if (item.status !== "aprovado") box.append(el("button", { type: "button", class: "cx-btn cx-ok", onclick: async () => { try { await decidir(item, "aprovado"); onDone && onDone("Custo aprovado"); } catch (e) { onDone && onDone(e.message || "Erro"); } } }, "Aprovar"));
      if (item.status === "pendente") box.append(el("button", { type: "button", class: "cx-btn cx-bad", onclick: () => draw("recusar") }, "Recusar"));
    };
    draw(); return box;
  }
  const pill = s => el("span", { class: "cx-pill cx-" + s }, STATUS[s] || s);

  // nomes de usuários (para "aprovado por")
  let USERS = [];
  try { Store.collection("usuarios").onSnapshot(sn => { USERS = sn.docs.map(d => d.data()); }); } catch (_) {}
  function userName(e){ const u = USERS.find(x => x.email === e); return u ? (u.nome || e) : (e || ""); }

  let tt; function toast(m){ let t = document.getElementById("toast"); if (!t) { t = el("div", { class: "toast", id: "toast" }); document.body.append(t); } t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 2400); }

  /*
   * Painel de custos para uma página (Redes sociais, Tráfego pago...).
   * opts: { origem, titulo, centroPadrao, tipos:[{k,n}], refLabel, refs: () => [{id, nome}] }
   */
  function painel(host, opts){
    const o = Object.assign({ tipos: [{ k: "producao", n: "Produção" }, { k: "impulsionamento", n: "Impulsionamento" }], refLabel: "Referência" }, opts);
    let Y = new Date().getFullYear(), M = new Date().getMonth(), state = { itens: [], centros: centros([]) }, filtro = "";
    const mk = () => `${Y}-${pad(M + 1)}`;
    host.classList.add("cx-card"); host.textContent = "";
    const title = el("b", { class: "cx-mtitle" });
    const head = el("div", { class: "cx-head" }, el("div", null, el("h2", null, o.titulo || "Custos"), el("p", { class: "cx-hint" }, "Lance aqui os custos. Depois de aprovados por um administrador, eles entram em Metas e custos.")),
      el("div", { class: "cx-mbar" }, el("button", { type: "button", class: "cx-icon", "aria-label": "Mês anterior", onclick: () => { M--; if (M < 0) { M = 11; Y--; } draw(); } }, "‹"), title,
        el("button", { type: "button", class: "cx-icon", "aria-label": "Próximo mês", onclick: () => { M++; if (M > 11) { M = 0; Y++; } draw(); } }, "›")));
    const kpis = el("div", { class: "cx-kpis" });
    // formulário (montado uma vez, não é redesenhado)
    const fid = "cx-" + o.origem + "-";
    const selTipo = el("select", { id: fid + "tipo" }, o.tipos.map(t => el("option", { value: t.k }, t.n)));
    const selCentro = el("select", { id: fid + "centro" });
    const selRef = el("select", { id: fid + "ref" });
    const iDesc = el("input", { type: "text", id: fid + "desc", maxlength: "160", placeholder: "Ex.: vídeo institucional, impulsionamento do post de ofertas" });
    const iForn = el("input", { type: "text", id: fid + "forn", maxlength: "100" });
    const iNF = el("input", { type: "text", id: fid + "nf", maxlength: "30", placeholder: "Opcional" });
    const iVal = el("input", { type: "text", id: fid + "valor", inputmode: "decimal", class: "cx-money", placeholder: "0,00" });
    const iData = el("input", { type: "date", id: fid + "data", value: hoje() });
    const fillSelects = () => {
      const cur = selCentro.value; selCentro.textContent = "";
      state.centros.filter(c => c.ativo !== false).forEach(c => selCentro.append(el("option", { value: c.id }, (c.codigo ? c.codigo + " · " : "") + c.nome)));
      selCentro.value = cur || sugerido(o.origem, selTipo.value) || o.centroPadrao || ""; if (!selCentro.value && selCentro.options.length) selCentro.selectedIndex = 0;
      const refs = o.refs ? o.refs() : []; const cr = selRef.value; selRef.textContent = ""; selRef.append(el("option", { value: "" }, "—"));
      refs.forEach(r => selRef.append(el("option", { value: r.id }, r.nome))); selRef.value = cr;
    };
    const lab = (t, f) => el("label", { class: "cx-f" }, el("span", null, t), f);
    const form = el("form", { class: "cx-form", novalidate: true, onsubmit: async ev => {
      ev.preventDefault();
      const valor = parseBR(iVal.value), d = iDesc.value.trim();
      if (!d) { iDesc.focus(); return toast("Descreva o custo."); }
      if (!(valor > 0)) { iVal.focus(); return toast("Informe o valor."); }
      const ref = selRef.value ? (o.refs ? o.refs() : []).find(r => r.id === selRef.value) : null;
      const body = { origem: o.origem, tipo: selTipo.value, centro: selCentro.value || sugerido(o.origem, selTipo.value), descricao: d, fornecedor: iForn.value.trim(), nf: iNF.value.trim(), valor, data: iData.value || hoje(),
        status: "pendente", solicitadoPor: meEmail(), refId: ref ? ref.id : "", refNome: ref ? ref.nome : "" };
      try { await Store.collection("custos").add(body); toast("Custo enviado para aprovação"); iDesc.value = ""; iForn.value = ""; iNF.value = ""; iVal.value = ""; iDesc.focus(); }
      catch (e) { toast("Não foi possível salvar. Tente de novo."); }
    } },
      lab("Tipo", selTipo), lab("Descrição", iDesc), lab("Fornecedor", iForn), lab("Nº NF", iNF), lab("Valor (R$)", iVal), lab("Data", iData), lab("Centro de custo", selCentro),
      o.refs ? lab(o.refLabel, selRef) : null, el("button", { type: "submit", class: "cx-btn cx-primary" }, "Enviar para aprovação"));
    selTipo.addEventListener("change", () => { const s = sugerido(o.origem, selTipo.value); if ([...selCentro.options].some(x => x.value === s)) selCentro.value = s; });
    iVal.addEventListener("blur", () => { const v = parseBR(iVal.value); iVal.value = v ? num(v) : ""; });
    const det = el("details", { class: "cx-det" }, el("summary", null, "+ Lançar custo"), form);
    const filt = el("div", { class: "cx-seg" });
    const table = el("div", { class: "cx-tw" });
    host.append(head, kpis, det, filt, table);

    function draw(){
      title.textContent = `${MESES[M]} ${Y}`;
      fillSelects();
      const L = state.itens.filter(i => i.src === "custos" && i.origem === o.origem && (i.data || "").slice(0, 7) === mk());
      const sum = (st, t) => L.filter(i => i.status === st && (!t || i.tipo === t)).reduce((s, i) => s + i.valor, 0);
      kpis.textContent = "";
      kpis.append(el("div", { class: "cx-kpi ok" }, el("small", null, "Aprovado no mês"), el("b", null, brl(sum("aprovado")))),
        el("div", { class: "cx-kpi warn" }, el("small", null, "Aguardando aprovação"), el("b", null, brl(sum("pendente"))), el("span", null, `${L.filter(i => i.status === "pendente").length} lançamento(s)`)),
        ...o.tipos.map(t => el("div", { class: "cx-kpi" }, el("small", null, t.n + " (aprovado)"), el("b", null, brl(sum("aprovado", t.k))))),
        el("div", { class: "cx-kpi" }, el("small", null, "Recusado"), el("b", null, brl(sum("recusado")))));
      filt.textContent = "";
      [["", "Todos"], ["pendente", "Aguardando"], ["aprovado", "Aprovados"], ["recusado", "Recusados"]].forEach(([k, n]) => filt.append(el("button", { type: "button", "aria-pressed": String(filtro === k), onclick: () => { filtro = k; draw(); } }, n)));
      const LL = L.filter(i => !filtro || i.status === filtro).sort((a, b) => (b.data || "").localeCompare(a.data || ""));
      table.textContent = "";
      if (!LL.length) { table.append(el("p", { class: "cx-hint", style: "padding:10px 2px" }, L.length ? "Nenhum lançamento neste filtro." : "Nenhum custo lançado neste mês.")); return; }
      const tipoN = k => (o.tipos.find(t => t.k === k) || { n: k }).n;
      const tb = el("tbody");
      LL.forEach(i => tb.append(el("tr", null,
        el("td", { class: "cx-mono" }, fd(i.data).slice(0, 5)), el("td", null, tipoN(i.tipo)),
        el("td", null, el("b", null, i.descricao), i.refNome ? el("div", { class: "cx-hint" }, i.refNome) : null),
        el("td", null, i.fornecedor || "—", i.nf ? el("div", { class: "cx-hint" }, "NF " + i.nf) : null),
        el("td", null, centroNome(i.centro, state.centros)),
        el("td", { class: "cx-r cx-mono" }, brl(i.valor)), el("td", null, pill(i.status)),
        el("td", null, acoes(i, m => toast(m)), i.status === "pendente" && i.solicitadoPor === meEmail() && !isAdmin() ? el("button", { type: "button", class: "cx-btn", onclick: async () => { await Store.collection("custos").doc(i.docId).delete(); toast("Lançamento excluído"); } }, "Excluir") : null))));
      table.append(el("table", { class: "cx-table" }, el("thead", null, el("tr", null, ...["Data", "Tipo", "Descrição", "Fornecedor", "Centro", "Valor", "Situação", ""].map((h, k) => el("th", { class: k === 5 ? "cx-r" : "" }, h)))), tb,
        el("tfoot", null, el("tr", null, el("td", { colspan: "5" }, "Total aprovado no mês"), el("td", { class: "cx-r cx-mono" }, brl(sum("aprovado"))), el("td", { colspan: "2" }, "")))));
    }
    watch(s => { state = s; draw(); }, ["custos", "centros_custo"]);
    draw();
    return { redraw: draw };
  }

  window.Custos = { CENTROS_PADRAO, ORIGENS, STATUS, centros, centroNome, centroRotulo, sugerido, itens, aditivos, pendencias, watch, decidir, acoes, pill, painel, brl, num, parseBR, fd, hoje, userName, isAdmin, prodEscolhido };
})();
