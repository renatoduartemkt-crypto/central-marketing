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

  window.Central = { boot, mount, PAGES };
})();
