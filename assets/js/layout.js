/*
 * Cabeçalho e menu comuns a todas as páginas.
 * Uso em cada página:  Central.boot("emails", user => { ...inicia a página... });
 */
(function(){
  const CFG = window.APP_CONFIG || {};
  // menu lateral agrupado (V2). "g" é o grupo; páginas sem grupo ficam no topo.
  const PAGES = [
    { k: "painel",   href: "index.html",    n: "Painel" },
    { k: "tarefas",  href: "tarefas.html",  n: "Tarefas",          g: "Operação" },
    { k: "producao", href: "producao.html", n: "Produção",         g: "Operação" },
    { k: "redes",    href: "redes.html",    n: "Redes sociais",    g: "Operação" },
    { k: "emails",   href: "emails.html",   n: "E-mail marketing", g: "Operação" },
    { k: "trafego",  href: "trafego.html",  n: "Tráfego pago",     g: "Operação" },
    { k: "eventos",  href: "eventos.html",  n: "Eventos",          g: "Eventos e trade" },
    { k: "brindes",  href: "brindes.html",  n: "Brindes",          g: "Eventos e trade" },
    { k: "planejamento", href: "planejamento.html", n: "Planejamento 2027", g: "Planejamento" },
    { k: "metas",    href: "metas.html",    n: "Metas e custos",   g: "Planejamento" },
    { k: "aprovacoes", href: "aprovacoes.html", n: "Aprovações",   g: "Gestão", admin: true },
    { k: "usuarios", href: "usuarios.html", n: "Usuários",         g: "Gestão" }
  ];
  const initials = n => String(n || "?").trim().split(/\s+/).slice(0, 2).map(p => p[0]).join("").toUpperCase();
  // avatar: foto de perfil, ou as iniciais do nome quando não há foto
  function avatar(u, tam){
    u = u || {}; const e = document.createElement("span"); e.className = "av"; e.setAttribute("aria-hidden", "true");
    if (tam) { e.style.width = e.style.height = tam + "px"; e.style.fontSize = Math.round(tam * .36) + "px"; }
    if (u.foto && /^data:image\//.test(u.foto)) { const i = document.createElement("img"); i.src = u.foto; i.alt = ""; e.append(i); e.classList.add("foto"); }
    else e.textContent = initials(u.nome || u.email);
    return e;
  }
  const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  function mount(active, user){
    const host = document.getElementById("app-nav");
    if (!host) return;
    document.body.classList.add("has-side");
    host.className = "appbar";
    host.innerHTML = "";
    const inner = mk("div", "side-in");
    const M = window.MARCA || {};

    // topo: marca + botão do menu (só aparece no celular)
    const top = mk("div", "side-top");
    const brand = mk("a", "brand"); brand.href = window.Nav ? Nav.url("index.html") : "index.html"; if (Store.modo() === "gas") brand.target = "_top";
    if (M.grupoNeg) { const img = mk("img", "logo"); img.src = M.grupoNeg; img.alt = "Grupo Lopes"; brand.append(img); }
    else brand.append(mk("span", "mark"));
    brand.append(mk("small", null, CFG.nomeSite || "Central de Marketing"));
    const tog = mk("button", "side-toggle"); tog.type = "button"; tog.setAttribute("aria-expanded", "false"); tog.setAttribute("aria-controls", "side-body");
    tog.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg><span>Menu</span>';
    tog.onclick = () => { const open = !host.classList.contains("open"); host.classList.toggle("open", open); tog.setAttribute("aria-expanded", String(open)); };
    top.append(brand, tog);

    // páginas por grupo
    const body = mk("div", "side-body"); body.id = "side-body";
    const nav = mk("nav", "appnav"); nav.setAttribute("aria-label", "Páginas");
    const grupos = [];
    PAGES.filter(p => !p.admin || (window.Auth && Auth.isAdmin())).forEach(p => {
      let g = grupos.find(x => x.n === (p.g || "")); if (!g) { g = { n: p.g || "", el: mk("div", "nav-grp") }; if (g.n) g.el.append(mk("span", "nav-t", g.n)); grupos.push(g); }
      const a = mk("a", null, p.n); a.href = window.Nav ? Nav.url(p.href) : p.href; if (Store.modo() === "gas") a.target = "_top";
      if (p.k === active) a.setAttribute("aria-current", "page");
      g.el.append(a);
    });
    grupos.forEach(g => nav.append(g.el));
    body.append(nav);

    // quem está usando (rodapé do menu)
    if (user) {
      const who = mk("div", "who");
      who.innerHTML = '<span class="wt"><b></b><small></small></span><button type="button" class="sair">Sair</button>';
      who.prepend(avatar(user, 36));
      who.querySelector("b").textContent = user.nome || user.email;
      who.querySelector("small").textContent = user.cargo || "";
      who.querySelector(".sair").onclick = () => Auth.logout();
      body.append(who);
    }
    body.append(mk("small", "side-foot", (CFG.empresa || "Grupo Lopes") + " · uso interno"));
    inner.append(top, body); host.append(inner);
    if (Store.modo() === "local") {
      const b = mk("div", "modo-local");
      b.textContent = "Modo de teste: os dados ficam salvos só neste navegador. Para uso da equipe, a TI precisa ativar o modo servidor (docs/LEIA-ME-TI.md).";
      document.body.insertBefore(b, host.nextSibling);
    }
  }

  async function boot(active, start){
    let user = await Auth.ready();
    if (!user || (Auth.precisaTrocarSenha && Auth.precisaTrocarSenha())) {
      if (Store.modo() !== "gas") { Auth.goLogin(); return; }
      user = await Auth.loginInline();
    }
    mount(active, user);
    try { start(user); } catch (e) { console.error(e); }
  }

  /* ícone da aba (símbolo da Lopes) em todas as páginas */
  const ICONE = "data:image/png;base64,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";
  [["icon","image/png"],["apple-touch-icon",null]].forEach(([rel,type]) => {
    let l = document.querySelector(`link[rel="${rel}"]`); if (!l) { l = document.createElement("link"); l.rel = rel; document.head.append(l); }
    l.href = ICONE; if (type) l.type = type;
  });

  /* Dinheiro no padrão brasileiro: todo campo com a classe "money" ou "cx-money" aceita 21000, 21.000,00 ou 21000,5
     e, ao sair do campo, mostra 21.000,00. Quem grava lê o valor com Central.lerDinheiro(). */
  function lerDinheiro(s){
    if (s == null) return 0; s = String(s).replace(/[R$\s\u00a0]/g, ""); if (!s) return 0;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", "."); else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    const n = parseFloat(s); return isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }
  const mostraDinheiro = v => v == null || v === "" ? "" : (+v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  document.addEventListener("focusout", e => {
    const t = e.target;
    if (!t || t.tagName !== "INPUT" || t.readOnly || !(t.classList.contains("money") || t.classList.contains("cx-money"))) return;
    if (t.value.trim() === "") return;
    t.value = mostraDinheiro(lerDinheiro(t.value));
  });

  // a Opta saiu da Central: registros só da Opta ficam guardados na planilha, mas não aparecem no site
  const ehOpta = k => k === "opta" || k === "Opta Suprimentos";
  function semOpta(x){
    if (!x) return true;
    if (ehOpta(x.empresa) || x.site === "opta") return false;
    if (Array.isArray(x.perfis) && x.perfis.length && x.perfis.every(ehOpta)) return false;
    if (Array.isArray(x.empresas) && x.empresas.length && x.empresas.every(ehOpta)) return false;
    return true;
  }
  function limpaOpta(x){
    if (Array.isArray(x.perfis)) x.perfis = x.perfis.filter(k => !ehOpta(k));
    if (Array.isArray(x.empresas)) x.empresas = x.empresas.filter(k => !ehOpta(k));
    return x;
  }
  const filtraOpta = L => L.filter(semOpta).map(limpaOpta);

  window.Central = { boot, mount, PAGES, lerDinheiro, mostraDinheiro, semOpta, filtraOpta, avatar };
})();
