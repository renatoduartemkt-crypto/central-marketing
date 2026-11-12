/*
 * Notificações (sininho no topo de todas as páginas).
 * Junta, para quem está logado:
 *  - tarefas e subtarefas vencidas e a vencer (próximos 3 dias), em que a pessoa é responsável;
 *  - ações das Campanhas integradas vencidas e a vencer, em que a pessoa é responsável;
 *  - comentários novos de outras pessoas nas tarefas em que ela está envolvida (responsável, criou ou tem subtarefa);
 *  - aprovações: para administradores, o que está aguardando aprovação; para quem pediu, o que foi aprovado ou recusado.
 * "Lido" fica guardado neste navegador (horário da última vez que a pessoa abriu o sininho).
 * Carregado pelo layout.js depois que o menu é montado: Notificacoes.iniciar(usuario, elementoDoBotao).
 */
(function(){
  const TZ = "America/Campo_Grande", DIAS_AVISO = 3, DIAS_HIST = 14, MAX = 8;
  const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const somaDias = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const difDias = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 864e5);
  const fd = s => s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : "";
  const fdt = s => { const d = new Date(s); return isNaN(d) ? "" : d.toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }); };
  const url = h => window.Nav ? Nav.url(h) : h;
  const curto = (t, n) => { t = String(t || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };
  function el(tag, attrs, ...kids){
    const e = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === "class") e.className = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v); }
    kids.flat().forEach(c => { if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return e;
  }

  let me = null, btn = null, painel = null, users = [];
  const D = { tarefas: [], campanhas_multicanal: [], aprov: [] };
  const KV = () => "central-mkt:notif-visto:" + (me && me.email || "");
  const visto = () => { try { return localStorage.getItem(KV()) || ""; } catch (_) { return ""; } };
  const marcarVisto = () => { try { localStorage.setItem(KV(), new Date().toISOString()); } catch (_) {} };
  const nome = e => { const u = users.find(x => x.email === e); return u ? (u.nome || u.email) : (e || "alguém"); };
  const admin = () => window.Auth && Auth.isAdmin && Auth.isAdmin();

  // texto do prazo: "venceu há 2 dias", "vence hoje", "vence amanhã", "vence em 3 dias"
  function prazo(d){
    const n = difDias(hoje(), d);
    if (n < 0) return n === -1 ? "venceu ontem" : `venceu há ${-n} dias`;
    return n === 0 ? "vence hoje" : n === 1 ? "vence amanhã" : `vence em ${n} dias`;
  }

  /* ---------- monta a lista ---------- */
  function lista(){
    const h = hoje(), lim = somaDias(h, DIAS_AVISO), desde = new Date(Date.now() - DIAS_HIST * 864e5).toISOString(), v = visto(), eu = me.email;
    const prazos = [], coments = [], aprov = [];
    const addPrazo = (data, titulo, sub, href) => { if (!data || data > lim) return; prazos.push({ tipo: data < h ? "vencida" : "avencer", data, titulo, sub: [sub, prazo(data)].filter(Boolean).join(" · "), href }); };

    // tarefas
    D.tarefas.forEach(t => {
      if (t.fase === "realizado") return;
      const href = url("tarefas.html?t=" + encodeURIComponent(t.id));
      if ((t.responsaveis || []).includes(eu) && t.entrega) addPrazo(t.entrega, t.titulo || "Tarefa", "Tarefa", href);
      (t.subtarefas || []).forEach(s => { if (!s.feito && s.resp === eu && s.data) addPrazo(s.data, s.texto || "Subtarefa", "Subtarefa de " + curto(t.titulo || "tarefa", 40), href); });
      const envolvido = (t.responsaveis || []).includes(eu) || t.criadoPor === eu || (t.subtarefas || []).some(s => s.resp === eu);
      if (envolvido) (t.comentarios || []).forEach(c => {
        if (c.autor === eu || !c.em || c.em < desde) return;
        coments.push({ tipo: "comentario", em: c.em, novo: !v || c.em > v, titulo: `${nome(c.autor)} comentou em “${curto(t.titulo || "Tarefa", 50)}”`, sub: curto(c.texto, 90), href });
      });
    });
    // ações das campanhas integradas
    D.campanhas_multicanal.forEach(doc => (doc.campanhas || []).forEach(c => {
      if (c.status === "encerrada") return;
      Object.keys(c.canais || {}).forEach(k => { const cn = c.canais[k] || {}; if (!cn.ativo) return;
        (cn.acoes || []).forEach(a => { if (a.resp === eu && a.status !== "feito" && a.status !== "cancelado" && a.data) addPrazo(a.data, a.nome || "Ação", "Campanha " + curto(c.nome || "", 40), url("campanhas.html?v=minhas")); });
      });
    }));
    // aprovações
    D.aprov.forEach(i => {
      const desc = curto([i.descricao, i.fornecedor, i.refNome].filter(Boolean).join(" · ") || "Lançamento", 80);
      const valor = (+i.valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      if (i.status === "pendente" && admin()) aprov.push({ tipo: "pendente", em: i.raw && (i.raw.criadoEm || i.raw.atualizadoEm) || "", novo: true, titulo: "Aguardando sua aprovação: " + valor, sub: desc, href: url("aprovacoes.html") });
      else if ((i.status === "aprovado" || i.status === "recusado") && i.solicitadoPor === eu && i.aprovadoPor !== eu && i.aprovadoEm && i.aprovadoEm >= desde)
        aprov.push({ tipo: i.status, em: i.aprovadoEm, novo: !v || i.aprovadoEm > v, titulo: `${i.status === "aprovado" ? "Aprovado" : "Recusado"} por ${nome(i.aprovadoPor)}: ${valor}`, sub: desc + (i.status === "recusado" && i.motivoRecusa ? ` · motivo: ${curto(i.motivoRecusa, 60)}` : ""),
          href: url(i.src === "producao" ? "producao.html" : i.src === "eventos" || i.src === "aditivo" ? "eventos.html" : "metas.html") });
    });
    prazos.sort((a, b) => a.data.localeCompare(b.data));
    coments.sort((a, b) => b.em.localeCompare(a.em));
    aprov.sort((a, b) => (a.tipo === "pendente" ? 0 : 1) - (b.tipo === "pendente" ? 0 : 1) || String(b.em).localeCompare(String(a.em)));
    return { vencidas: prazos.filter(x => x.tipo === "vencida"), avencer: prazos.filter(x => x.tipo === "avencer"), coments, aprov };
  }
  // o número no sininho: vencidas + a vencer + aguardando aprovação + comentários e decisões ainda não vistos
  const conta = L => L.vencidas.length + L.avencer.length + L.coments.filter(x => x.novo).length + L.aprov.filter(x => x.tipo === "pendente" || x.novo).length;

  /* ---------- desenho ---------- */
  function atualizaBotao(){
    if (!btn) return; const L = lista(), n = conta(L);
    const b = btn.querySelector(".nt-n"); b.textContent = n > 99 ? "99+" : String(n); b.hidden = !n;
    btn.classList.toggle("tem", n > 0); btn.classList.toggle("urg", L.vencidas.length > 0);
    btn.setAttribute("aria-label", n ? `Notificações: ${n} pendente${n === 1 ? "" : "s"}` : "Notificações: nada pendente");
    if (painel && !painel.hidden) desenha();
  }
  function desenha(){
    const L = lista(); painel.textContent = "";
    const resumo = [[L.vencidas.length, "vencida", "vencidas", "v"], [L.avencer.length, "a vencer", "a vencer", "a"], [L.coments.filter(x => x.novo).length, "comentário novo", "comentários novos", "c"], [L.aprov.filter(x => x.tipo === "pendente" || x.novo).length, "aprovação", "aprovações", "p"]]
      .filter(r => r[0]).map(([n, s, p, k]) => el("span", { class: "nt-chip k-" + k }, `${n} ${n === 1 ? s : p}`));
    painel.append(el("div", { class: "nt-hd" }, el("b", null, "Notificações"),
      el("button", { type: "button", class: "nt-x", "aria-label": "Fechar", onclick: fechar }, "×")),
      el("div", { class: "nt-res" }, resumo.length ? resumo : el("span", { class: "nt-ok" }, "Tudo em dia. Nenhuma pendência.")));
    const item = x => el("a", { class: "nt-it t-" + x.tipo + (x.novo ? " novo" : ""), href: x.href, target: Store.modo() === "gas" ? "_top" : null },
      el("i", { "aria-hidden": "true" }), el("span", { class: "nt-tx" }, el("b", null, x.titulo), el("small", null, x.sub, x.em ? (x.sub ? " · " : "") + fdt(x.em) : "")));
    const secao = (tit, arr, mais) => { if (!arr.length) return;
      painel.append(el("div", { class: "nt-sec" }, el("h4", null, tit, el("span", null, arr.length)), ...arr.slice(0, MAX).map(item),
        arr.length > MAX && mais ? el("a", { class: "nt-mais", href: url(mais), target: Store.modo() === "gas" ? "_top" : null }, `Ver todas (${arr.length})`) : null)); };
    secao("Vencidas", L.vencidas, "tarefas.html");
    secao(`A vencer (próximos ${DIAS_AVISO} dias)`, L.avencer, "tarefas.html");
    secao("Comentários", L.coments, "tarefas.html");
    secao("Aprovações", L.aprov, admin() ? "aprovacoes.html" : null);
  }
  // no computador o painel abre ao lado do menu; no celular, logo abaixo da barra do topo
  function posiciona(){
    const r = btn.getBoundingClientRect(), W = Math.min(390, innerWidth - 20);
    if (innerWidth > 900 && r.right + 12 + W <= innerWidth) { painel.style.left = (r.right + 12) + "px"; painel.style.top = Math.max(10, r.top) + "px"; painel.style.right = ""; }
    else { painel.style.left = ""; painel.style.right = "10px"; painel.style.top = (r.bottom + 8) + "px"; }
  }
  function abrir(){ desenha(); posiciona(); painel.hidden = false; btn.setAttribute("aria-expanded", "true"); marcarVisto(); }
  function fechar(){ if (!painel || painel.hidden) return; painel.hidden = true; btn.setAttribute("aria-expanded", "false"); atualizaBotao(); }

  /* ---------- dados ---------- */
  function assinar(nomeCol, fn){ try { Store.collection(nomeCol).onSnapshot(sn => { fn(sn.docs.map(d => Object.assign({ id: d.id }, d.data()))); atualizaBotao(); }, () => {}); } catch (_) {} }

  function iniciar(user, botao){
    if (!user || !botao || me) return;
    me = user; btn = botao;
    painel = el("div", { class: "nt-painel", id: "nt-painel", role: "dialog", "aria-label": "Notificações", hidden: true });
    document.body.append(painel);
    btn.setAttribute("aria-controls", "nt-painel"); btn.setAttribute("aria-expanded", "false");
    btn.addEventListener("click", e => { e.stopPropagation(); painel.hidden ? abrir() : fechar(); });
    document.addEventListener("click", e => { if (!painel.hidden && !painel.contains(e.target) && !btn.contains(e.target)) fechar(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") fechar(); });
    // espera a página carregar o que é dela antes de pedir os dados do sininho
    setTimeout(() => {
      assinar("usuarios", L => users = L.map(u => Object.assign({ email: u.email || u.id }, u)));
      assinar("tarefas", L => D.tarefas = L);
      assinar("campanhas_multicanal", L => D.campanhas_multicanal = L);
      if (window.Custos && Custos.watch) Custos.watch(st => { D.aprov = Custos.pendencias(st.raw); atualizaBotao(); }, ["custos", "eventos", "producao"]);
    }, 1200);
    // a data muda à meia-noite e o "vence hoje" precisa acompanhar
    setInterval(atualizaBotao, 5 * 60 * 1000);
    atualizaBotao();
  }
  window.Notificacoes = { iniciar };
})();
