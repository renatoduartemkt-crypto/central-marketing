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
  const GAS = {
    call(fn, ...args){
      // site no GitHub Pages: conversa com o backend (Apps Script) pelo link /exec
      if (CFG.backendUrl) {
        return fetch(CFG.backendUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ fn, args }), redirect: "follow" })
          .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
          .then(j => { if (j && j.erro) throw new Error(j.erro); return j ? j.result : null; })
          .catch(e => { throw { code: "unavailable", message: (e && e.message) || "Sem conexão com o servidor." }; });
      }
      return new Promise((res, rej) => {
        if (!(window.google && google.script && google.script.run)) return rej({ code: "unavailable", message: "Google Apps Script indisponível" });
        google.script.run.withSuccessHandler(res).withFailureHandler(e => rej({ code: "unavailable", message: (e && e.message) || String(e) }))[fn](...args);
      });
    },
    // sessão por usuário e senha: o token fica só neste navegador e vai junto em cada chamada
    token(){ try { return localStorage.getItem(TOKEN_KEY) || memToken; } catch (_) { return memToken; } },
    setToken(t){ memToken = t || ""; try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch (_) {} },
    api(req){
      return GAS.call("api", Object.assign({}, req, { token: GAS.token() })).then(r => {
        if (r && r.erro) {
          if (r.codigo === "unauthenticated") GAS.setToken("");
          if ((r.codigo === "unauthenticated" || r.codigo === "trocar_senha") && window.Auth && req.acao !== "me") Auth.goLogin();
          throw { code: r.codigo || "invalid_argument", message: r.erro };
        }
        return r;
      });
    }
  };
  const TOKEN_KEY = "central-mkt:token"; let memToken = "";
  window.GAS = GAS;
  const toMap = arr => { const map = {}; (arr || []).forEach(r => { const id = r.id; const d = Object.assign({}, r); delete d.id; map[id] = d; }); return map; };
  const Gas = {
    async list(name){ const r = await GAS.api({ acao: "listar", colecao: name }); cache[name] = toMap(r.itens); emit(name); return cache[name]; },
    async create(name, data){ const r = await GAS.api({ acao: "criar", colecao: name, dados: data }); applyGas(name, r); return { id: r.id }; },
    async put(name, id, data){ const r = await GAS.api({ acao: "gravar", colecao: name, id, dados: data }); applyGas(name, r); },
    async patch(name, id, data){ const r = await GAS.api({ acao: "mesclar", colecao: name, id, dados: data }); applyGas(name, r); },
    async remove(name, id){ await GAS.api({ acao: "excluir", colecao: name, id }); if (cache[name]) delete cache[name][id]; emit(name); }
  };
  function applyGas(name, r){ if (r && r.item) { cache[name] = cache[name] || {}; const d = Object.assign({}, r.item); delete d.id; cache[name][r.item.id] = d; emit(name); } }
  // uma única chamada atualiza todas as coleções abertas na página
  let gasTimer = null;
  function gasPoll(){
    if (gasTimer) return;
    gasTimer = setInterval(async () => {
      const names = Object.keys(listeners).filter(n => listeners[n].size);
      if (!names.length || document.hidden) return;
      try { const r = await GAS.api({ acao: "listarVarias", colecoes: names }); names.forEach(n => { cache[n] = toMap((r.colecoes || {})[n]); emit(n); }); } catch (_) {}
    }, CFG.intervaloAtualizacao || 20000);
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

  window.Store = { collection, modo: () => CFG.modo || "local" };

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
