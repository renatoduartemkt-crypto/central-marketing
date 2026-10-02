/*
 * Usuários e sessão da Central de Marketing.
 *
 * Modo "local": identificação simples por e-mail, guardada no navegador. NÃO é autenticação segura —
 *               serve para teste e demonstração.
 * Modo "gas":   usuário e senha cadastrados pelo administrador; o servidor (Apps Script) valida e devolve um
 *               token de sessão, guardado só neste navegador.
 * Modo "api":   a sessão vem do servidor (GET {apiBase}/me). A TI deve proteger o site com autenticação
 *               real (SSO Google/Microsoft, link mágico por e-mail ou senha) — ver docs/LEIA-ME-TI.md.
 *
 * Usuário: { email, nome, cargo, perfil: "admin" | "editor", criadoEm }
 * O id do registro na coleção "usuarios" é o e-mail em minúsculas.
 */
(function(){
  const CFG = window.APP_CONFIG || {};
  const KEY = "central-mkt:sessao";
  let me = null;

  const norm = e => String(e || "").trim().toLowerCase();
  const isEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  const domainOk = e => !(CFG.dominiosPermitidos || []).length || CFG.dominiosPermitidos.map(norm).includes(norm(e).split("@")[1]);
  const isAdminEmail = e => (CFG.administradores || []).map(norm).includes(norm(e));
  const users = () => Store.collection("usuarios");
  const docId = e => norm(e).replace(/[^a-z0-9_.@+-]/g, "_");

  async function findUser(email){
    const snap = await users().doc(docId(email)).get();
    return snap.exists ? Object.assign({ email: norm(email) }, snap.data()) : null;
  }

  const ME = "central-mkt:c:__me";
  const lerMe = () => { try { const s = sessionStorage.getItem(ME); return s ? JSON.parse(s) : null; } catch (_) { return null; } };
  const guardarMe = () => { try { if (me) sessionStorage.setItem(ME, JSON.stringify(me)); else sessionStorage.removeItem(ME); } catch (_) {} };

  const Auth = {
    current(){ return me; },
    isAdmin(){ return !!me && (me.perfil === "admin" || isAdminEmail(me.email)); },
    validate(email){
      const e = norm(email);
      if (!isEmail(e)) return "Digite um e-mail válido.";
      if (!domainOk(e)) return "Este e-mail não pertence a um domínio autorizado.";
      return "";
    },
    findUser,
    // carrega a sessão; resolve com o usuário ou null
    async ready(){
      if (me) return me;
      if (CFG.modo === "gas") {
        if (!GAS.token()) return null;
        // o perfil fica guardado nesta aba: o menu aparece na hora; o servidor confere a sessão em todo pedido
        const g = lerMe(); if (g) { me = g; return me; }
        try { const r = await GAS.api({ acao: "me" }); me = r.usuario || null; guardarMe(); return me; }
        catch (e) { if (e && e.code === "unauthenticated") return null; await new Promise(r => setTimeout(r, 1500));
          try { const r = await GAS.api({ acao: "me" }); me = r.usuario || null; guardarMe(); return me; } catch (_) { return null; } }
      }
      if (CFG.modo === "api") {
        try {
          const r = await fetch((CFG.apiBase || "/api").replace(/\/$/, "") + "/me", { credentials: "include" });
          if (r.ok) { me = await r.json(); return me; }
        } catch (_) {}
        return null;
      }
      let email = null;
      try { email = localStorage.getItem(KEY); } catch (_) {}
      if (!email) return null;
      me = await findUser(email);
      return me;
    },
    // modo gas: usuário e senha validados no servidor
    async entrar(usuario, senha){
      const r = await GAS.api({ acao: "login", usuario: String(usuario || "").trim().toLowerCase(), senha: String(senha || "") });
      GAS.setToken(r.token); me = r.usuario; guardarMe(); return me;
    },
    async trocarSenha(atual, nova){ const r = await GAS.api({ acao: "trocarSenha", atual, nova }); me = r.usuario; guardarMe(); return me; },
    precisaTrocarSenha(){ return !!(me && me.trocarSenha); },
    async login(email){
      const u = await findUser(email);
      if (!u) return null;
      try { localStorage.setItem(KEY, u.email); } catch (_) {}
      me = u; return u;
    },
    async register({ email, nome, cargo }){
      const e = norm(email);
      const msg = Auth.validate(e); if (msg) throw { message: msg };
      if (!CFG.cadastroAberto && !isAdminEmail(e)) throw { message: "O cadastro está fechado. Peça a um administrador para incluir seu e-mail." };
      const u = { email: e, nome: String(nome || "").trim(), cargo: String(cargo || "").trim(), perfil: isAdminEmail(e) ? "admin" : "editor", criadoEm: new Date().toISOString() };
      await users().doc(docId(e)).set(u);
      return Auth.login(e);
    },
    async saveUser(u){
      const e = norm(u.email);
      if (CFG.modo === "gas") { const r = await GAS.api({ acao: "salvarUsuario", id: e, nome: u.nome, cargo: u.cargo, perfil: u.perfil, ativo: u.ativo }); if (me && me.email === e) { me = Object.assign({}, me, r.item); guardarMe(); } await Store.refresh("usuarios"); return r.item; }
      await users().doc(docId(e)).set(Object.assign({}, u, { email: e })); if (me && me.email === e) me = Object.assign({}, me, u);
    },
    async createUser(u, senha){ const r = await GAS.api({ acao: "criarUsuario", usuario: norm(u.email), nome: u.nome, cargo: u.cargo, perfil: u.perfil, senha }); await Store.refresh("usuarios"); return r.item; },
    async resetPassword(email, senha){ const r = await GAS.api({ acao: "redefinirSenha", id: norm(email), senha }); await Store.refresh("usuarios"); return r.item; },
    async removeUser(email){
      if (CFG.modo === "gas") { await GAS.api({ acao: "excluirUsuario", id: norm(email) }); await Store.refresh("usuarios"); return; }
      await users().doc(docId(email)).delete();
    },
    docId,
    // modo gas: o Apps Script não deixa o site trocar de página sozinho (só com clique),
    // então o login aparece por cima da própria página
    loginInline(opts){
      opts = opts || {};
      return new Promise(resolve => {
        let box = document.getElementById("loginInline"); if (box) box.remove();
        box = document.createElement("div"); box.id = "loginInline"; box.className = "lgi";
        const M = window.MARCA || {};
        box.innerHTML = '<div class="lgi-card">' +
          (M.grupoNeg ? '<div class="lgi-top"><img alt="Grupo Lopes"></div>' : '') +
          '<form class="lgi-f" id="lgiA" novalidate><div class="eyebrow">Acesso</div><h1>Entrar</h1><p class="hint lgi-msg"></p>' +
          '<label>Usuário<input type="text" id="lgiU" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="80"></label>' +
          '<label>Senha<input type="password" id="lgiP" autocomplete="current-password" maxlength="120"></label>' +
          '<p class="err" id="lgiE" hidden></p><button class="btn primary" type="submit" id="lgiB">Entrar</button>' +
          '<p class="hint">Esqueceu a senha ou ainda não tem acesso? Fale com o administrador da Central.</p></form>' +
          '<form class="lgi-f" id="lgiT" novalidate hidden><div class="eyebrow">Primeiro acesso</div><h1>Crie sua senha</h1>' +
          '<p class="hint">Você entrou com uma senha provisória. Escolha uma senha pessoal: pelo menos 8 caracteres, com letras e números.</p>' +
          '<input type="text" id="lgiTU" autocomplete="username" hidden>' +
          '<label id="lgiTAf">Senha provisória<input type="password" id="lgiTA" autocomplete="current-password" maxlength="120"></label>' +
          '<label>Nova senha<input type="password" id="lgiTN" autocomplete="new-password" maxlength="120"></label>' +
          '<label>Repita a nova senha<input type="password" id="lgiTC" autocomplete="new-password" maxlength="120"></label>' +
          '<p class="err" id="lgiTE" hidden></p><button class="btn primary" type="submit" id="lgiTB">Salvar senha e entrar</button></form>' +
          '<div class="lgi-f" id="lgiOk" hidden><h1>Pronto</h1><p class="hint">Sessão iniciada.</p><a class="btn primary" id="lgiGo" target="_top">Continuar</a></div>' +
          '</div>';
        if (M.grupoNeg) box.querySelector(".lgi-top img").src = M.grupoNeg;
        document.body.append(box); document.documentElement.classList.add("lgi-on");
        const $ = id => box.querySelector("#" + id);
        const err = (id, m) => { $(id).textContent = m; $(id).hidden = !m; };
        if (opts.msg) box.querySelector(".lgi-msg").textContent = opts.msg;
        let atual = "";
        const fim = u => {
          if (opts.reload && !window.GAS_BASE) { location.reload(); return; }
          if (opts.reload) { $("lgiA").hidden = true; $("lgiT").hidden = true; $("lgiOk").hidden = false; $("lgiGo").href = Nav.url(Nav.page()); $("lgiGo").focus(); return; }
          box.remove(); document.documentElement.classList.remove("lgi-on"); resolve(u);
        };
        const troca = u => { $("lgiA").hidden = true; $("lgiT").hidden = false; $("lgiTU").value = u.email; $("lgiTAf").hidden = !!atual; (atual ? $("lgiTN") : $("lgiTA")).focus(); };
        if (me && me.trocarSenha) troca(me); else setTimeout(() => $("lgiU").focus(), 0);
        $("lgiA").addEventListener("submit", async ev => { ev.preventDefault();
          const us = $("lgiU").value.trim().toLowerCase(), pw = $("lgiP").value;
          if (!us || !pw) return err("lgiE", "Informe usuário e senha."); err("lgiE", ""); $("lgiB").disabled = true; $("lgiB").textContent = "Entrando…";
          try { const u = await Auth.entrar(us, pw); $("lgiP").value = ""; if (u.trocarSenha) { atual = pw; return troca(u); } fim(u); }
          catch (e) { err("lgiE", e.message || "Não foi possível entrar."); $("lgiP").value = ""; $("lgiP").focus(); }
          finally { $("lgiB").disabled = false; $("lgiB").textContent = "Entrar"; } });
        $("lgiT").addEventListener("submit", async ev => { ev.preventDefault();
          const a = atual || $("lgiTA").value, n = $("lgiTN").value, c = $("lgiTC").value;
          if (!a) return err("lgiTE", "Informe a senha provisória.");
          if (n.length < 8 || !/[a-zA-Z]/.test(n) || !/[0-9]/.test(n)) return err("lgiTE", "Use pelo menos 8 caracteres, com letras e números.");
          if (n !== c) return err("lgiTE", "As duas senhas não são iguais."); err("lgiTE", ""); $("lgiTB").disabled = true;
          try { const u = await Auth.trocarSenha(a, n); atual = ""; fim(u); } catch (e) { err("lgiTE", e.message || "Não foi possível trocar a senha."); } finally { $("lgiTB").disabled = false; } });
      });
    },
    goLogin(){
      if (CFG.modo === "gas") { if (!document.getElementById("loginInline")) Auth.loginInline({ reload: true, msg: "Sua sessão expirou. Entre de novo para continuar." }); return; }
      const page = Nav.page();
      if (page === "login.html") return;
      Nav.go("login.html?voltar=" + encodeURIComponent(page + (CFG.modo === "gas" ? "" : location.hash)));
    },
    async logout(){
      try { localStorage.removeItem(KEY); } catch (_) {}
      if (CFG.modo === "gas") { try { await GAS.api({ acao: "logout" }); } catch (_) {} GAS.setToken(""); me = null; Auth.loginInline({ reload: true, msg: "Você saiu da Central de Marketing." }); return; }
      me = null;
      if ((CFG.modo === "api" || CFG.modo === "gas") && CFG.urlSair) { try { window.top.location.href = CFG.urlSair; } catch (_) { location.href = CFG.urlSair; } return; }
      if (CFG.modo === "gas") { Nav.go("login.html?saiu=1"); return; }
      Nav.go("login.html");
    }
  };
  window.Auth = Auth;
})();
/*
 * Usuários e sessão da Central de Marketing.
 *
 * Modo "local": identificação simples por e-mail, guardada no navegador. NÃO é autenticação segura —
 *               serve para teste e demonstração.
 * Modo "gas":   usuário e senha cadastrados pelo administrador; o servidor (Apps Script) valida e devolve um
 *               token de sessão, guardado só neste navegador.
 * Modo "api":   a sessão vem do servidor (GET {apiBase}/me). A TI deve proteger o site com autenticação
 *               real (SSO Google/Microsoft, link mágico por e-mail ou senha) — ver docs/LEIA-ME-TI.md.
 *
 * Usuário: { email, nome, cargo, perfil: "admin" | "editor", criadoEm }
 * O id do registro na coleção "usuarios" é o e-mail em minúsculas.
 */
(function(){
  const CFG = window.APP_CONFIG || {};
  const KEY = "central-mkt:sessao";
  let me = null;

  const norm = e => String(e || "").trim().toLowerCase();
  const isEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  const domainOk = e => !(CFG.dominiosPermitidos || []).length || CFG.dominiosPermitidos.map(norm).includes(norm(e).split("@")[1]);
  const isAdminEmail = e => (CFG.administradores || []).map(norm).includes(norm(e));
  const users = () => Store.collection("usuarios");
  const docId = e => norm(e).replace(/[^a-z0-9_.@+-]/g, "_");

  async function findUser(email){
    const snap = await users().doc(docId(email)).get();
    return snap.exists ? Object.assign({ email: norm(email) }, snap.data()) : null;
  }

  const Auth = {
    current(){ return me; },
    isAdmin(){ return !!me && (me.perfil === "admin" || isAdminEmail(me.email)); },
    validate(email){
      const e = norm(email);
      if (!isEmail(e)) return "Digite um e-mail válido.";
      if (!domainOk(e)) return "Este e-mail não pertence a um domínio autorizado.";
      return "";
    },
    findUser,
    // carrega a sessão; resolve com o usuário ou null
    async ready(){
      if (me) return me;
      if (CFG.modo === "gas") {
        if (!GAS.token()) return null;
        try { const r = await GAS.api({ acao: "me" }); me = r.usuario || null; return me; } catch (_) { return null; }
      }
      if (CFG.modo === "api") {
        try {
          const r = await fetch((CFG.apiBase || "/api").replace(/\/$/, "") + "/me", { credentials: "include" });
          if (r.ok) { me = await r.json(); return me; }
        } catch (_) {}
        return null;
      }
      let email = null;
      try { email = localStorage.getItem(KEY); } catch (_) {}
      if (!email) return null;
      me = await findUser(email);
      return me;
    },
    // modo gas: usuário e senha validados no servidor
    async entrar(usuario, senha){
      const r = await GAS.api({ acao: "login", usuario: String(usuario || "").trim().toLowerCase(), senha: String(senha || "") });
      GAS.setToken(r.token); me = r.usuario; return me;
    },
    async trocarSenha(atual, nova){ const r = await GAS.api({ acao: "trocarSenha", atual, nova }); me = r.usuario; return me; },
    precisaTrocarSenha(){ return !!(me && me.trocarSenha); },
    async login(email){
      const u = await findUser(email);
      if (!u) return null;
      try { localStorage.setItem(KEY, u.email); } catch (_) {}
      me = u; return u;
    },
    async register({ email, nome, cargo }){
      const e = norm(email);
      const msg = Auth.validate(e); if (msg) throw { message: msg };
      if (!CFG.cadastroAberto && !isAdminEmail(e)) throw { message: "O cadastro está fechado. Peça a um administrador para incluir seu e-mail." };
      const u = { email: e, nome: String(nome || "").trim(), cargo: String(cargo || "").trim(), perfil: isAdminEmail(e) ? "admin" : "editor", criadoEm: new Date().toISOString() };
      await users().doc(docId(e)).set(u);
      return Auth.login(e);
    },
    async saveUser(u){
      const e = norm(u.email);
      if (CFG.modo === "gas") { const r = await GAS.api({ acao: "salvarUsuario", id: e, nome: u.nome, cargo: u.cargo, perfil: u.perfil, ativo: u.ativo }); if (me && me.email === e) me = Object.assign({}, me, r.item); await users().get(); return r.item; }
      await users().doc(docId(e)).set(Object.assign({}, u, { email: e })); if (me && me.email === e) me = Object.assign({}, me, u);
    },
    async createUser(u, senha){ const r = await GAS.api({ acao: "criarUsuario", usuario: norm(u.email), nome: u.nome, cargo: u.cargo, perfil: u.perfil, senha }); await users().get(); return r.item; },
    async resetPassword(email, senha){ const r = await GAS.api({ acao: "redefinirSenha", id: norm(email), senha }); await users().get(); return r.item; },
    async removeUser(email){
      if (CFG.modo === "gas") { await GAS.api({ acao: "excluirUsuario", id: norm(email) }); await users().get(); return; }
      await users().doc(docId(email)).delete();
    },
    docId,
    // modo gas: o Apps Script não deixa o site trocar de página sozinho (só com clique),
    // então o login aparece por cima da própria página
    loginInline(opts){
      opts = opts || {};
      return new Promise(resolve => {
        let box = document.getElementById("loginInline"); if (box) box.remove();
        box = document.createElement("div"); box.id = "loginInline"; box.className = "lgi";
        const M = window.MARCA || {};
        box.innerHTML = '<div class="lgi-card">' +
          (M.grupoNeg ? '<div class="lgi-top"><img alt="Grupo Lopes"></div>' : '') +
          '<form class="lgi-f" id="lgiA" novalidate><div class="eyebrow">Acesso</div><h1>Entrar</h1><p class="hint lgi-msg"></p>' +
          '<label>Usuário<input type="text" id="lgiU" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="80"></label>' +
          '<label>Senha<input type="password" id="lgiP" autocomplete="current-password" maxlength="120"></label>' +
          '<p class="err" id="lgiE" hidden></p><button class="btn primary" type="submit" id="lgiB">Entrar</button>' +
          '<p class="hint">Esqueceu a senha ou ainda não tem acesso? Fale com o administrador da Central.</p></form>' +
          '<form class="lgi-f" id="lgiT" novalidate hidden><div class="eyebrow">Primeiro acesso</div><h1>Crie sua senha</h1>' +
          '<p class="hint">Você entrou com uma senha provisória. Escolha uma senha pessoal: pelo menos 8 caracteres, com letras e números.</p>' +
          '<input type="text" id="lgiTU" autocomplete="username" hidden>' +
          '<label id="lgiTAf">Senha provisória<input type="password" id="lgiTA" autocomplete="current-password" maxlength="120"></label>' +
          '<label>Nova senha<input type="password" id="lgiTN" autocomplete="new-password" maxlength="120"></label>' +
          '<label>Repita a nova senha<input type="password" id="lgiTC" autocomplete="new-password" maxlength="120"></label>' +
          '<p class="err" id="lgiTE" hidden></p><button class="btn primary" type="submit" id="lgiTB">Salvar senha e entrar</button></form>' +
          '<div class="lgi-f" id="lgiOk" hidden><h1>Pronto</h1><p class="hint">Sessão iniciada.</p><a class="btn primary" id="lgiGo" target="_top">Continuar</a></div>' +
          '</div>';
        if (M.grupoNeg) box.querySelector(".lgi-top img").src = M.grupoNeg;
        document.body.append(box); document.documentElement.classList.add("lgi-on");
        const $ = id => box.querySelector("#" + id);
        const err = (id, m) => { $(id).textContent = m; $(id).hidden = !m; };
        if (opts.msg) box.querySelector(".lgi-msg").textContent = opts.msg;
        let atual = "";
        const fim = u => {
          if (opts.reload && !window.GAS_BASE) { location.reload(); return; }
          if (opts.reload) { $("lgiA").hidden = true; $("lgiT").hidden = true; $("lgiOk").hidden = false; $("lgiGo").href = Nav.url(Nav.page()); $("lgiGo").focus(); return; }
          box.remove(); document.documentElement.classList.remove("lgi-on"); resolve(u);
        };
        const troca = u => { $("lgiA").hidden = true; $("lgiT").hidden = false; $("lgiTU").value = u.email; $("lgiTAf").hidden = !!atual; (atual ? $("lgiTN") : $("lgiTA")).focus(); };
        if (me && me.trocarSenha) troca(me); else setTimeout(() => $("lgiU").focus(), 0);
        $("lgiA").addEventListener("submit", async ev => { ev.preventDefault();
          const us = $("lgiU").value.trim().toLowerCase(), pw = $("lgiP").value;
          if (!us || !pw) return err("lgiE", "Informe usuário e senha."); err("lgiE", ""); $("lgiB").disabled = true; $("lgiB").textContent = "Entrando…";
          try { const u = await Auth.entrar(us, pw); $("lgiP").value = ""; if (u.trocarSenha) { atual = pw; return troca(u); } fim(u); }
          catch (e) { err("lgiE", e.message || "Não foi possível entrar."); $("lgiP").value = ""; $("lgiP").focus(); }
          finally { $("lgiB").disabled = false; $("lgiB").textContent = "Entrar"; } });
        $("lgiT").addEventListener("submit", async ev => { ev.preventDefault();
          const a = atual || $("lgiTA").value, n = $("lgiTN").value, c = $("lgiTC").value;
          if (!a) return err("lgiTE", "Informe a senha provisória.");
          if (n.length < 8 || !/[a-zA-Z]/.test(n) || !/[0-9]/.test(n)) return err("lgiTE", "Use pelo menos 8 caracteres, com letras e números.");
          if (n !== c) return err("lgiTE", "As duas senhas não são iguais."); err("lgiTE", ""); $("lgiTB").disabled = true;
          try { const u = await Auth.trocarSenha(a, n); atual = ""; fim(u); } catch (e) { err("lgiTE", e.message || "Não foi possível trocar a senha."); } finally { $("lgiTB").disabled = false; } });
      });
    },
    goLogin(){
      if (CFG.modo === "gas") { if (!document.getElementById("loginInline")) Auth.loginInline({ reload: true, msg: "Sua sessão expirou. Entre de novo para continuar." }); return; }
      const page = Nav.page();
      if (page === "login.html") return;
      Nav.go("login.html?voltar=" + encodeURIComponent(page + (CFG.modo === "gas" ? "" : location.hash)));
    },
    async logout(){
      try { localStorage.removeItem(KEY); } catch (_) {}
      if (CFG.modo === "gas") { try { await GAS.api({ acao: "logout" }); } catch (_) {} GAS.setToken(""); me = null; Auth.loginInline({ reload: true, msg: "Você saiu da Central de Marketing." }); return; }
      me = null;
      if ((CFG.modo === "api" || CFG.modo === "gas") && CFG.urlSair) { try { window.top.location.href = CFG.urlSair; } catch (_) { location.href = CFG.urlSair; } return; }
      if (CFG.modo === "gas") { Nav.go("login.html?saiu=1"); return; }
      Nav.go("login.html");
    }
  };
  window.Auth = Auth;
})();
