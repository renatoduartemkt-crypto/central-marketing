/*
 * Cabeçalho e menu comuns a todas as páginas.
 * Uso em cada página:  Central.boot("emails", user => { ...inicia a página... });
 */
(function(){
  const CFG = window.APP_CONFIG || {};
  const PAGES = [
    { k: "painel",   href: "index.html",    n: "Painel" },
    { k: "emails",   href: "emails.html",   n: "E-mail marketing" },
    { k: "trafego",  href: "trafego.html",  n: "Tráfego pago" },
    { k: "redes",    href: "redes.html",    n: "Redes sociais" },
    { k: "eventos",  href: "eventos.html",  n: "Eventos" },
    { k: "brindes",  href: "brindes.html",  n: "Brindes" },
    { k: "producao", href: "producao.html", n: "Produção" },
    { k: "metas",    href: "metas.html",    n: "Metas e custos" },
    { k: "planejamento", href: "planejamento.html", n: "Planejamento 2027" },
    { k: "tarefas",  href: "tarefas.html",  n: "Tarefas" },
    { k: "aprovacoes", href: "aprovacoes.html", n: "Aprovações", admin: true },
    { k: "usuarios", href: "usuarios.html", n: "Usuários" }
  ];
  const initials = n => String(n || "?").trim().split(/\s+/).slice(0, 2).map(p => p[0]).join("").toUpperCase();

  function mount(active, user){
    const host = document.getElementById("app-nav");
    if (!host) return;
    host.className = "appbar";
    host.innerHTML = "";
    const inner = document.createElement("div"); inner.className = "appbar-in";
    const brand = document.createElement("a"); brand.href = window.Nav ? Nav.url("index.html") : "index.html"; if (Store.modo() === "gas") brand.target = "_top"; brand.className = "brand";
    const M = window.MARCA || {};
    brand.innerHTML = M.grupoNeg ? '<img class="logo" alt="Grupo Lopes"><span class="sep" aria-hidden="true"></span><span><b></b><small></small></span>' : '<span class="mark" aria-hidden="true"></span><span><b></b><small></small></span>';
    if (M.grupoNeg) brand.querySelector("img").src = M.grupoNeg;
    brand.querySelector("b").textContent = CFG.nomeSite || "Central de Marketing";
    brand.querySelector("small").textContent = M.grupoNeg ? "Marketing & E-commerce" : (CFG.empresa || "");
    const nav = document.createElement("nav"); nav.className = "appnav"; nav.setAttribute("aria-label", "Páginas");
    PAGES.filter(p => !p.admin || (window.Auth && Auth.isAdmin())).forEach(p => { const a = document.createElement("a"); a.href = window.Nav ? Nav.url(p.href) : p.href; if (Store.modo() === "gas") a.target = "_top"; a.textContent = p.n; if (p.k === active) a.setAttribute("aria-current", "page"); nav.append(a); });
    const who = document.createElement("div"); who.className = "who";
    if (user) {
      who.innerHTML = '<span class="av" aria-hidden="true"></span><span class="wt"><b></b><small></small></span><button type="button" class="sair">Sair</button>';
      who.querySelector(".av").textContent = initials(user.nome || user.email);
      who.querySelector("b").textContent = user.nome || user.email;
      who.querySelector("small").textContent = user.cargo || "";
      who.querySelector(".sair").onclick = () => Auth.logout();
    }
    inner.append(brand, nav, who); host.append(inner);
    if (Store.modo() === "local") {
      const b = document.createElement("div"); b.className = "modo-local";
      b.textContent = "Modo de teste: os dados ficam salvos só neste navegador. Para uso da equipe, a TI precisa ativar o modo servidor (docs/LEIA-ME-TI.md).";
      host.append(b);
    }
    footer();
  }
  function footer(){
    if (document.querySelector(".appfoot")) return;
    const M = window.MARCA || {};
    const f = document.createElement("footer"); f.className = "appfoot";
    f.innerHTML = '<div class="appfoot-in"><div class="logos"></div><span></span></div>';
    [["lopesNeg", "Distribuidora Lopes"], ["optaNeg", "Opta Suprimentos"]].forEach(([k, n]) => { if (M[k]) { const i = document.createElement("img"); i.src = M[k]; i.alt = n; f.querySelector(".logos").append(i); } });
    f.querySelector("span").textContent = (CFG.nomeSite || "Central de Marketing") + " · " + (CFG.empresa || "Grupo Lopes") + " · uso interno";
    document.body.append(f);
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

  window.Central = { boot, mount, PAGES, lerDinheiro, mostraDinheiro };
})();
