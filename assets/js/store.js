/*
 * Camada de dados da Central de Marketing.
 *
 * Todas as páginas usam apenas esta interface:
 *   const col = Store.collection("emails");
 *   col.onSnapshot(snap => snap.docs.forEach(d => d.id, d.data()))   // lista + atualizações
 *   col.add(dados)            -> Promise<{id}>
 *   col.doc(id).set(dados)    -> substitui o registro
 *   col.doc(id).update(campos)-> altera só os campos enviados
 *   col.doc(id).delete()
 *   col.doc(id).get()         -> Promise<{id, exists, data()}>
 *
 * Modo "local": localStorage (teste). Modo "api": REST (produção) — contrato em docs/LEIA-ME-TI.md.
 * Modo "gas":   Google Apps Script + Planilha Google no Drive (apps-script/Code.gs) — ver docs/GOOGLE-DRIVE.md.
 * Coleções: emails, trafego_campanhas, posts, usuarios.
 */
(function(){
  const CFG = window.APP_CONFIG || {};
  const PREFIX = "central-mkt:";
  const listeners = {};          // nome -> Set<fn>
  const cache = {};              // nome -> {id: dados}

  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const clone = o => JSON.parse(JSON.stringify(o));
  const stamp = obj => {
    const u = window.Auth && Auth.current && Auth.current();
    return Object.assign({}, obj, { atualizadoEm: new Date().toISOString(), atualizadoPor: u ? u.email : "" });
  };
  const snapshot = name => {
    const map = cache[name] || {};
    return { docs: Object.keys(map).map(id => ({ id, exists: true, data: () => clone(map[id]) })) };
  };
  const emit = name => (listeners[name] || new Set()).forEach(fn => { try { fn(snapshot(name)); } catch (e) { console.error(e); } });

  /* ---------- modo local ---------- */
  const Local = {
    load(name){
      if (cache[name]) return;
      let raw = null;
      try { raw = localStorage.getItem(PREFIX + name); } catch (_) {}
      if (raw) { try { cache[name] = JSON.parse(raw); return; } catch (_) {} }
      const seed = (window.SEED_DATA || {})[name] || {};
      cache[name] = clone(seed);
      Local.persist(name);
    },
    persist(name){ try { localStorage.setItem(PREFIX + name, JSON.stringify(cache[name])); } catch (e) { console.warn("Não foi possível salvar no navegador", e); } },
    async list(name){ Local.load(name); return cache[name]; },
    async create(name, data){ Local.load(name); const id = newId(); cache[name][id] = data; Local.persist(name); emit(name); return { id }; },
    async put(name, id, data){ Local.load(name); cache[name][id] = data; Local.persist(name); emit(name); },
    async patch(name, id, data){ Local.load(name); if (!cache[name][id]) throw { code: "invalid_argument", message: "Registro não encontrado" }; cache[name][id] = Object.assign({}, cache[name][id], data); Local.persist(name); emit(name); },
    async remove(name, id){ Local.load(name); delete cache[name][id]; Local.persist(name); emit(name); }
  };
  // outra aba alterou os dados
  window.addEventListener("storage", ev => {
    if (!ev.key || ev.key.indexOf(PREFIX) !== 0) return;
    const name = ev.key.slice(PREFIX.length);
    if (!listeners[name]) return;
    try { cache[name] = JSON.parse(ev.newValue || "{}"); } catch (_) { return; }
    emit(name);
  });

  /* ---------- modo api ---------- */
  const base = () => (CFG.apiBase || "/api").replace(/\/$/, "");
  async function http(method, path, body){
    let res;
    try {
      res = await fetch(base() + path, { method, credentials: "include", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
    } catch (e) { throw { code: "unavailable", message: "Sem conexão com o servidor" }; }
    if (res.status === 401) { if (window.Auth) Auth.goLogin(); throw { code: "unauthenticated", message: "Sessão expirada" }; }
    if (res.status === 403) throw { code: "invalid_argument", message: "Sem permissão" };
    if (!res.ok) throw { code: "unavailable", message: "Erro " + res.status };
    return res.status === 204 ? null : res.json().catch(() => null);
  }
  const Api = {
    async list(name){
      const arr = await http("GET", "/" + name) || [];
      const map = {}; arr.forEach(r => { const id = r.id; const d = Object.assign({}, r); delete d.id; map[id] = d; });
      cache[name] = map; return map;
    },
    async create(name, data){ const r = await http("POST", "/" + name, data); await Api.refresh(name); return { id: r && r.id }; },
    async put(name, id, data){ await http("PUT", "/" + name + "/" + encodeURIComponent(id), data); await Api.refresh(name); },
    async patch(name, id, data){ await http("PATCH", "/" + name + "/" + encodeURIComponent(id), data); await Api.refresh(name); },
    async remove(name, id){ await http("DELETE", "/" + name + "/" + encodeURIComponent(id)); await Api.refresh(name); },
    async refresh(name){ await Api.list(name); emit(name); }
  };
  const polls = {};

  /* ---------- modo gas (Google Apps Script + Planilha no Drive) ---------- */
  // O Google responde cada pedido em alguns segundos e fica instável com vários pedidos ao mesmo tempo.
  // Por isso: (1) os pedidos vão em fila, um por vez; (2) falha passageira é repetida; (3) a página pede
  // todas as coleções de uma vez; (4) o que já foi carregado fica guardado nesta aba (sessionStorage)
  // e aparece na hora ao trocar de página, enquanto a versão nova chega.
  let fila = Promise.resolve();
  const espera = ms => new Promise(r => setTimeout(r, ms));
  function viaFetch(fn, args){
    const uma = () => fetch(CFG.backendUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ fn, args }), redirect: "follow" })
      .then(r => { if (!r.ok) throw { passageira: true, message: "HTTP " + r.status }; return r.json().catch(() => { throw { passageira: true, message: "Resposta inválida do servidor." }; }); })
      .then(j => {
        if (j && j.erro) throw { code: "invalid_argument", message: j.erro };
        if (!j || !("result" in j)) throw { passageira: true, message: "Resposta incompleta do servidor." };
        return j.result;
      }, e => { if (e && e.passageira) throw e; throw { passageira: true, message: (e && e.message) || "Sem conexão com o servidor." }; });
    const tentar = n => uma().catch(e => { if (!e.passageira || n <= 0) throw e; return espera(1500).then(() => tentar(n - 1)); });
    const p = fila.then(() => tentar(2));
    fila = p.catch(() => {});
    GAS.ocupado++; const fim = () => { GAS.ocupado--; };
    p.then(fim, fim);
    return p.catch(e => { throw { code: e.code || "unavailable", message: e.message || "Sem conexão com o servidor." }; });
  }
  const GAS = {
    ocupado: 0,
    call(fn, ...args){
      // site no GitHub Pages: conversa com o backend (Apps Script) pelo link /exec
      if (CFG.backendUrl) return viaFetch(fn, args);
      return new Promise((res, rej) => {
        if (!(window.google && google.script && google.script.run)) return rej({ code: "unavailable", message: "Google Apps Script indisponível" });
        google.script.run.withSuccessHandler(res).withFailureHandler(e => rej({ code: "unavailable", message: (e && e.message) || String(e) }))[fn](...args);
      });
    },
    // sessão por usuário e senha: o token fica só neste navegador e vai junto em cada chamada
    token(){ try { return localStorage.getItem(TOKEN_KEY) || memToken; } catch (_) { return memToken; } },
    setToken(t){ memToken = t || ""; try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch (_) {} if (!t) GAS.limparCache(); },
    limparCache(){ try { Object.keys(sessionStorage).filter(k => k.indexOf(SS) === 0).forEach(k => sessionStorage.removeItem(k)); } catch (_) {} },
    api(req){
      return GAS.call("api", Object.assign({}, req, { token: GAS.token() })).then(r => {
        if (r && r.erro) {
          if (r.codigo === "unauthenticated") GAS.setToken("");
          if ((r.codigo === "unauthenticated" || r.codigo === "trocar_senha") && window.Auth && req.acao !== "me" && req.acao !== "login") Auth.goLogin();
          throw { code: r.codigo || "invalid_argument", message: r.erro };
        }
        return r;
      });
    }
  };
  const TOKEN_KEY = "central-mkt:token"; let memToken = "";
  const SS = "central-mkt:c:";
  window.GAS = GAS;
  const toMap = arr => { const map = {}; (arr || []).forEach(r => { const id = r.id; const d = Object.assign({}, r); delete d.id; map[id] = d; }); return map; };
  const ultimo = {}, fresco = {};
  const lerGuardado = n => { try { const s = sessionStorage.getItem(SS + n); return s ? JSON.parse(s) : null; } catch (_) { return null; } };
  const guardar = n => { try { sessionStorage.setItem(SS + n, JSON.stringify(cache[n] || {})); } catch (_) {} };
  // aplica a lista que veio do servidor; só redesenha a tela se algo mudou
  function aplicar(n, arr){
    if (!Array.isArray(arr)) return;
    const m = toMap(arr), j = JSON.stringify(m);
    fresco[n] = true;
    if (ultimo[n] === j && cache[n]) return;
    ultimo[n] = j; cache[n] = m; guardar(n); emit(n);
  }
  // junta os pedidos de várias coleções feitos ao mesmo tempo num único pedido ao servidor
  let lote = null;
  function buscar(n){
    return new Promise((res, rej) => {
      if (!lote) { lote = { nomes: new Set(), quem: [] }; setTimeout(enviarLote, 60); }
      lote.nomes.add(n); lote.quem.push({ n, res, rej });
    });
  }
  async function enviarLote(){
    const l = lote; lote = null; const nomes = [...l.nomes];
    try {
      const r = await GAS.api({ acao: "listarVarias", colecoes: nomes });
      nomes.forEach(n => aplicar(n, (r.colecoes || {})[n]));
      l.quem.forEach(q => q.res(cache[q.n] || {}));
    } catch (e) { l.quem.forEach(q => q.rej(e)); }
  }
  const Gas = {
    async list(name){
      if (cache[name] && fresco[name]) return cache[name];
      if (!cache[name]) { const g = lerGuardado(name); if (g) { cache[name] = g; ultimo[name] = JSON.stringify(g); } }
      const p = buscar(name);
      if (cache[name]) { p.catch(() => {}); return cache[name]; }   // mostra o que já tinha; a versão nova chega em seguida
      return p;
    },
    refresh(name){ fresco[name] = false; return buscar(name); },
    async create(name, data){ const r = await GAS.api({ acao: "criar", colecao: name, dados: data }); applyGas(name, r); return { id: r.id }; },
    async put(name, id, data){ const r = await GAS.api({ acao: "gravar", colecao: name, id, dados: data }); applyGas(name, r); },
    async patch(name, id, data){ const r = await GAS.api({ acao: "mesclar", colecao: name, id, dados: data }); applyGas(name, r); },
    async remove(name, id){ await GAS.api({ acao: "excluir", colecao: name, id }); if (cache[name]) delete cache[name][id]; ultimo[name] = JSON.stringify(cache[name] || {}); guardar(name); emit(name); }
  };
  function applyGas(name, r){ if (r && r.item) { cache[name] = cache[name] || {}; const d = Object.assign({}, r.item); delete d.id; cache[name][r.item.id] = d; ultimo[name] = JSON.stringify(cache[name]); guardar(name); emit(name); } }
  // de tempos em tempos, um único pedido atualiza todas as coleções abertas na página
  let gasTimer = null;
  function gasPoll(){
    if (gasTimer) return;
    gasTimer = setInterval(() => {
      const names = Object.keys(listeners).filter(n => listeners[n].size);
      if (!names.length || document.hidden || GAS.ocupado || !GAS.token()) return;
      names.forEach(n => { fresco[n] = false; buscar(n).catch(() => {}); });
    }, Math.max(CFG.intervaloAtualizacao || 30000, 30000));
  }

  const A = () => (CFG.modo === "api" ? Api : CFG.modo === "gas" ? Gas : Local);

  function collection(name){
    return {
      onSnapshot(next, onError){
        (listeners[name] = listeners[name] || new Set()).add(next);
        A().list(name).then(() => next(snapshot(name))).catch(e => onError && onError(e));
        if (CFG.modo === "api" && !polls[name]) polls[name] = setInterval(() => Api.refresh(name).catch(() => {}), CFG.intervaloAtualizacao || 20000);
        if (CFG.modo === "gas") gasPoll();
        return () => listeners[name].delete(next);
      },
      async get(){ await A().list(name); return snapshot(name); },
      add(data){ return A().create(name, stamp(Object.assign({ criadoEm: new Date().toISOString() }, data))); },
      doc(id){
        return {
          id,
          async get(){ await A().list(name); const d = (cache[name] || {})[id]; return { id, exists: !!d, data: () => d ? clone(d) : undefined }; },
          set(data){ return A().put(name, id, stamp(data)); },
          update(data){ return A().patch(name, id, stamp(data)); },
          delete(){ return A().remove(name, id); }
        };
      }
    };
  }

  window.Store = { collection, modo: () => CFG.modo || "local", refresh: name => (CFG.modo === "gas" ? Gas.refresh(name) : A().list(name)) };

  /* ---------- navegação entre páginas (no Apps Script as páginas são ?p=nome) ---------- */
  const isGas = () => CFG.modo === "gas" && window.GAS_BASE;
  function absolute(href){
    const m = String(href || "").match(/^([a-z]+)\.html(\?[^#]*)?(#.*)?$/);
    if (!m) return href;
    if (!isGas()) return href;
    const q = (m[2] || "").replace(/^\?/, "");
    return window.GAS_BASE + "?p=" + m[1] + (q ? "&" + q : "") + (m[3] || "");
  }
  const Nav = {
    page(){ if (isGas()) return (window.GAS_PAGE || "index") + ".html"; return location.pathname.split("/").pop() || "index.html"; },
    param(n){ if (isGas()) return (window.GAS_PARAMS || {})[n] || null; return new URLSearchParams(location.search).get(n); },
    url: absolute,
    go(href){ const u = absolute(href); if (isGas()) { try { window.top.location.href = u; } catch (_) { window.open(u, "_top"); } } else location.href = u; }
  };
  window.Nav = Nav;
  // no Apps Script, links internos (ex.: "emails.html") viram o endereço do app e abrem na janela principal
  document.addEventListener("click", ev => {
    if (!isGas()) return;
    const a = ev.target.closest && ev.target.closest("a[href]"); if (!a) return;
    const h = a.getAttribute("href"); if (!/^[a-z]+\.html/.test(h)) return;
    a.setAttribute("href", absolute(h)); a.setAttribute("target", "_top");
  }, true);
})();
