/* Central de Marketing — anexos de tarefas e orçamentos.
   Os arquivos ficam numa pasta PRIVADA do Drive (backend: anexoEnviar / anexoBaixar / anexoExcluir).
   O registro (tarefa, pedido, orçamento) guarda só a lista: { id, nome, tipo, tamanho, por, em }.
   Uso: Anexos.widget({ lista: () => [...], salvar: async lista => {...}, podeEditar: true, ref: "tarefa: X", compacto: false })
   No modo de teste (local), o arquivo fica guardado só neste navegador. */
(function(){
  const MAX = 10 * 1024 * 1024;
  const TIPOS = /^(image\/(jpeg|png|webp|gif)|application\/pdf|text\/(plain|csv)|application\/(msword|vnd\.ms-excel|vnd\.ms-powerpoint|zip|x-zip-compressed|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)))$/;
  const POR_EXT = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", pdf: "application/pdf", txt: "text/plain", csv: "text/csv",
    doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", zip: "application/zip" };
  const ACEITA = Object.keys(POR_EXT).map(e => "." + e).join(",");
  const LK = "central-mkt:anexo:";
  const local = () => !(window.Store && Store.modo() === "gas");
  const eu = () => (window.Auth && Auth.current && Auth.current()) || {};
  const admin = () => !!(window.Auth && Auth.isAdmin && Auth.isAdmin());

  const tam = n => n >= 1048576 ? (n / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round((n || 0) / 1024)) + " KB";
  const extDe = nome => { const m = /\.([a-z0-9]{1,5})$/i.exec(nome || ""); return m ? m[1].toLowerCase() : ""; };
  const rotulo = a => (extDe(a.nome) || String(a.tipo || "").split("/").pop() || "ARQ").toUpperCase().slice(0, 4);
  const ehImg = a => /^image\//.test(a.tipo || "");
  const dataBR = s => { const d = new Date(s); return isNaN(d) ? "" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }); };
  const nomePadrao = email => { try { const u = (window.Central && Central.usuarios && Central.usuarios()) || []; const x = u.find(y => y.email === email); return (x && x.nome) || (email || "").split("@")[0]; } catch (_) { return (email || "").split("@")[0]; } };
  const tipoDe = f => { const t = String(f.type || "").toLowerCase(); return TIPOS.test(t) ? t : (POR_EXT[extDe(f.name)] || t); };

  function paraB64(blob){ return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.onerror = () => rej(r.error); r.readAsDataURL(blob); }); }
  // fotos grandes (JPEG/WEBP) são reduzidas antes de enviar: no máximo 2400 px no lado maior
  async function reduzir(file, tipo){
    if (!/^image\/(jpeg|webp)$/.test(tipo) || file.size < 1.2 * 1048576 || !window.createImageBitmap) return { file, tipo };
    try {
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      const b = await new Promise(r => c.toBlob(r, "image/jpeg", 0.85));
      if (b && b.size < file.size) return { file: new File([b], file.name.replace(/\.(webp|jpe?g)$/i, "") + ".jpg", { type: "image/jpeg" }), tipo: "image/jpeg" };
    } catch (_) {}
    return { file, tipo };
  }

  async function enviar(file, ref, extra){
    let tipo = tipoDe(file);
    if (!TIPOS.test(tipo)) throw new Error(`“${file.name}”: tipo de arquivo não permitido. Envie imagem, PDF, Word, Excel, PowerPoint, CSV, TXT ou ZIP.`);
    const r = await reduzir(file, tipo); const f = r.file; tipo = r.tipo;
    if (f.size > MAX) throw new Error(`“${file.name}” tem ${tam(f.size)}. O limite é 10 MB por arquivo.`);
    if (!f.size) throw new Error(`“${file.name}” está vazio.`);
    const b64 = await paraB64(f);
    let a;
    if (local()) {
      const id = "local" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      try { localStorage.setItem(LK + id, JSON.stringify({ nome: f.name, tipo, base64: b64 })); }
      catch (_) { throw new Error("Sem espaço neste navegador para guardar o arquivo (modo de teste)."); }
      a = { id, nome: f.name, tipo, tamanho: f.size, por: eu().email || "", em: new Date().toISOString() };
    } else {
      a = (await GAS.api(Object.assign({ acao: "anexoEnviar", nome: f.name, tipo, base64: b64, ref: String(ref || "").slice(0, 200) }, extra || {}))).anexo;
    }
    if (f.size < file.size) a.original = file.size;
    return a;
  }
  async function baixarBlob(a){
    let r;
    if (local()) { try { r = JSON.parse(localStorage.getItem(LK + a.id) || "null"); } catch (_) { r = null; } if (!r) throw new Error("Arquivo não encontrado neste navegador."); }
    else r = await GAS.api({ acao: "anexoBaixar", id: a.id });
    const bin = atob(r.base64 || ""), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type: r.tipo || a.tipo || "application/octet-stream" });
  }
  async function excluir(a){
    if (local()) { try { localStorage.removeItem(LK + a.id); } catch (_) {} return; }
    await GAS.api({ acao: "anexoExcluir", id: a.id });
  }
  /* visualizador na própria página (sem abrir outra aba): imagens e PDF; setas para passar entre os arquivos */
  const podeVer = a => /^image\//.test(a.tipo || "") || a.tipo === "application/pdf" || /\.(pdf|jpe?g|png|webp|gif)$/i.test(a.nome || "");
  function ver(lista, idx){
    lista = (lista || []).filter(Boolean); if (!lista.length) return; let i = Math.max(0, Math.min(idx || 0, lista.length - 1));
    const urls = {}, antes = document.activeElement;
    const titulo = h("b", { class: "anx-lb-t" }), cont = h("span", { class: "anx-lb-c" }), palco = h("div", { class: "anx-lb-p" });
    const fechar = () => { document.removeEventListener("keydown", tecla, true); ov.remove(); Object.values(urls).forEach(u => URL.revokeObjectURL(u)); if (antes && antes.focus) antes.focus(); };
    const btnX = h("button", { type: "button", class: "anx-lb-b", "aria-label": "Fechar" }, "×"); btnX.onclick = fechar;
    const btnD = h("button", { type: "button", class: "anx-lb-b", "aria-label": "Baixar" }, "↓");
    const ant = h("button", { type: "button", class: "anx-lb-n prev", "aria-label": "Anterior" }, "‹"), prox = h("button", { type: "button", class: "anx-lb-n next", "aria-label": "Próxima" }, "›");
    const ov = h("div", { class: "anx-lb", role: "dialog", "aria-modal": "true", "aria-label": "Visualizar arquivo" },
      h("div", { class: "anx-lb-h" }, titulo, cont, btnD, btnX), palco, lista.length > 1 ? ant : null, lista.length > 1 ? prox : null);
    ov.addEventListener("click", e => { if (e.target === ov || e.target === palco) fechar(); });
    async function mostra(){ const a = lista[i]; titulo.textContent = a.nome || "Arquivo"; cont.textContent = lista.length > 1 ? `${i + 1} de ${lista.length}` : "";
      palco.textContent = ""; palco.append(h("div", { class: "anx-lb-load" }, "Carregando…"));
      try { if (!urls[a.id]) urls[a.id] = URL.createObjectURL(await baixarBlob(a)); if (lista[i] !== a) return; palco.textContent = "";
        const pdf = a.tipo === "application/pdf" || /\.pdf$/i.test(a.nome || "");
        palco.append(pdf ? h("iframe", { src: urls[a.id], title: a.nome || "PDF", class: "anx-lb-pdf" }) : h("img", { src: urls[a.id], alt: a.nome || "Imagem", class: "anx-lb-img" }));
      } catch (e) { palco.textContent = ""; palco.append(h("div", { class: "anx-lb-load" }, (e && e.message) || "Não foi possível abrir o arquivo.")); } }
    btnD.onclick = async () => { const a = lista[i]; try { if (!urls[a.id]) urls[a.id] = URL.createObjectURL(await baixarBlob(a)); const l = h("a", { href: urls[a.id], download: a.nome || "arquivo" }); document.body.append(l); l.click(); l.remove(); } catch (_) {} };
    const vai = d => { i = (i + d + lista.length) % lista.length; mostra(); };
    ant.onclick = () => vai(-1); prox.onclick = () => vai(1);
    // as teclas ficam só com o visualizador (o Esc não fecha o formulário que está por trás)
    function tecla(e){ const k = e.key; if (k !== "Escape" && k !== "ArrowLeft" && k !== "ArrowRight") return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      if (k === "Escape") fechar(); else if (lista.length > 1) vai(k === "ArrowLeft" ? -1 : 1); }
    document.addEventListener("keydown", tecla, true);
    document.body.append(ov); btnX.focus(); mostra();
  }
  const podeRemover = a => admin() || !a.por || a.por === eu().email;

  function h(tag, attrs, ...kids){ const e = document.createElement(tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => { if (v == null || v === false) return; if (k === "class") e.className = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v); });
    kids.flat().forEach(k => { if (k != null && k !== false) e.append(k.nodeType ? k : String(k)); }); return e; }
  const avisoPadrao = m => { if (window.toast) window.toast(m); else if (window.Sync) Sync.erro(m); else alert(m); };
  const ICO_CLIP = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.5l-8.5 8.5a5 5 0 0 1-7-7L14 5.5a3.5 3.5 0 0 1 5 5L10.5 19a2 2 0 0 1-3-3L15 8.5"/></svg>';
  const ICO_UP = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>';

  /** Caixa de anexos. opts: lista(), salvar(lista), podeEditar, ref, compacto, nome(email), aviso(msg) */
  function widget(opts){
    const aviso = m => (opts.aviso || avisoPadrao)(m), nomeDe = e => (opts.nome ? opts.nome(e) : nomePadrao(e));
    const box = h("div", { class: "anx" + (opts.compacto ? " anx-c" : "") });
    let ocupado = 0;
    const lista = () => (opts.lista() || []).slice();
    async function abrir(a, baixar){
      if (!baixar && podeVer(a)) { const L = lista().filter(podeVer); return ver(L, Math.max(0, L.findIndex(x => x.id === a.id))); }
      // a janela precisa abrir no clique (senão o navegador bloqueia); o conteúdo chega em seguida
      const w = baixar || !(ehImg(a) || a.tipo === "application/pdf" || /^text\//.test(a.tipo || "")) ? null : window.open("", "_blank");
      if (w) { try { w.document.title = a.nome; w.document.body.style.cssText = "font:15px system-ui,sans-serif;padding:24px;color:#16233A"; w.document.body.textContent = "Abrindo " + a.nome + "…"; } catch (_) {} }
      try {
        const url = URL.createObjectURL(await baixarBlob(a));
        if (w) w.location.href = url;
        else { const l = h("a", { href: url, download: a.nome }); document.body.append(l); l.click(); l.remove(); }
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } catch (e) { if (w) w.close(); aviso((e && e.message) || "Não foi possível abrir o arquivo."); }
    }
    async function remover(a, btn){
      if (!btn.dataset.conf) { btn.dataset.conf = "1"; btn.textContent = "Remover?"; btn.classList.add("conf"); setTimeout(() => { if (btn.isConnected) { delete btn.dataset.conf; btn.textContent = "×"; btn.classList.remove("conf"); } }, 3500); return; }
      btn.disabled = true;
      try { await excluir(a); } catch (e) { if (!/não encontrado/i.test((e && e.message) || "")) { btn.disabled = false; return aviso((e && e.message) || "Não foi possível remover."); } }
      try { await opts.salvar(lista().filter(x => x.id !== a.id)); } catch (_) { aviso("O arquivo saiu do Drive, mas a lista não foi salva. Tente de novo."); }
      draw();
    }
    async function receber(files){
      files = [...(files || [])]; if (!files.length) return;
      for (const file of files) {
        const tmp = h("li", { class: "anx-i up" }, h("span", { class: "anx-ico" }, rotulo({ nome: file.name, tipo: file.type })),
          h("span", { class: "anx-tx" }, h("b", null, file.name), h("span", { class: "anx-bar" }, h("i")), h("small", null, "Enviando…")));
        ul.append(tmp); ocupado++;
        try {
          const a = await enviar(file, opts.ref, opts.pdl ? { pdl: opts.pdl } : null);
          await opts.salvar(lista().concat([a]));
        } catch (e) { aviso((e && e.message) || `Não foi possível enviar “${file.name}”.`); }
        finally { ocupado--; tmp.remove(); }
      }
      draw();
    }
    let ul;
    function draw(){
      box.textContent = "";
      const L = lista(), pode = !!opts.podeEditar;
      ul = h("ul", { class: "anx-l" });
      L.forEach(a => {
        const meta = [tam(a.tamanho), nomeDe(a.por), dataBR(a.em)].filter(Boolean).join(" · ") + (a.original ? ` · reduzida de ${tam(a.original)}` : "");
        const rm = pode && podeRemover(a) ? h("button", { type: "button", class: "anx-x", "aria-label": "Remover " + a.nome, title: "Remover", onclick: ev => remover(a, ev.currentTarget) }, "×") : null;
        ul.append(h("li", { class: "anx-i" },
          h("span", { class: "anx-ico" + (ehImg(a) ? " img" : a.tipo === "application/pdf" ? " pdf" : "") }, rotulo(a)),
          h("span", { class: "anx-tx" }, h("button", { type: "button", class: "anx-n", title: "Abrir " + a.nome, onclick: () => abrir(a, false) }, a.nome), opts.compacto ? null : h("small", null, meta)),
          h("button", { type: "button", class: "anx-b", "aria-label": "Baixar " + a.nome, title: "Baixar", onclick: () => abrir(a, true) },
            h("span", { "aria-hidden": "true" }, "↓")), rm));
      });
      if (!L.length && !pode) ul.append(h("li", { class: "anx-vz" }, "Nenhum arquivo anexado."));
      box.append(ul);
      if (!pode) return;
      const inp = h("input", { type: "file", multiple: true, accept: opts.aceita || ACEITA, class: "anx-in", "aria-label": "Escolher arquivos para anexar", onchange: ev => { receber(ev.target.files); ev.target.value = ""; } });
      const drop = h("label", { class: "anx-d" });
      if (opts.compacto) drop.innerHTML = ICO_CLIP + "<span>Anexar</span>";
      else drop.innerHTML = ICO_UP + "<b>" + (opts.titulo || "Arraste arquivos ou clique para enviar") + "</b><small>" + (opts.dica || "Imagens, PDF, Word, Excel, PowerPoint · até 10 MB · fotos grandes são reduzidas") + "</small>";
      drop.append(inp);
      ["dragenter", "dragover"].forEach(t => drop.addEventListener(t, ev => { ev.preventDefault(); drop.classList.add("on"); }));
      ["dragleave", "drop"].forEach(t => drop.addEventListener(t, ev => { ev.preventDefault(); drop.classList.remove("on"); }));
      drop.addEventListener("drop", ev => receber(ev.dataTransfer && ev.dataTransfer.files));
      box.append(drop);
      if (!opts.compacto) box.append(h("p", { class: "anx-lk" }, opts.privacidade || "Só quem tem login na Central abre estes arquivos."));
    }
    draw();
    box.atualizar = () => { if (!ocupado) draw(); };
    return box;
  }

  window.Anexos = { widget, enviar, baixarBlob, excluir, ver, tam, MAX };
})();
