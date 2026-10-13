/* Central de Marketing — exportar a área da página como PDF, PNG ou JPEG (para montar apresentações).
 * Uso: Exportar.menu(elementoDoBotao, { alvo: () => elemento, titulo: () => "Planejamento 2027", secao: () => "Eventos", arquivo: () => "planejamento-2027-eventos" })
 * Carrega html2canvas (cdnjs) e jsPDF (assets/vendor) só na hora de exportar.
 */
(function(){
  const CFG = window.APP_CONFIG || {};
  const H2C = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
  const load = src => new Promise((ok, erro) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => erro(new Error("Não foi possível carregar o gerador de imagem. Verifique a internet e tente de novo.")); document.head.append(s); });
  async function libs(pdf){
    if (!window.html2canvas) await load(CFG.html2canvasUrl || H2C);
    if (pdf && !(window.jspdf && window.jspdf.jsPDF)) await load((CFG.vendorBase || "assets/vendor/") + "jspdf.umd.min.js");
  }
  const slug = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const IGNORAR = ".no-exp,.acts,.pl-hclear,.exp-menu";

  async function capturar(alvo, o){
    const bg = getComputedStyle(document.body).backgroundColor || "#ffffff";
    const W = 1360, id = alvo.id || (alvo.id = "exp-" + Date.now());
    const hoje = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    const M = window.MARCA || {};
    return window.html2canvas(alvo, {
      scale: 2, backgroundColor: bg, useCORS: true, logging: false, windowWidth: W + 120,
      ignoreElements: n => !!(n.matches && n.matches(IGNORAR)),
      onclone: doc => {
        const a = doc.getElementById(id); if (!a) return;
        a.style.width = W + "px"; a.style.maxWidth = "none"; a.style.padding = "28px"; a.style.boxSizing = "border-box"; a.style.background = bg;
        const h = doc.createElement("div"); h.className = "exp-head";
        const tx = doc.createElement("div");
        const e = doc.createElement("div"); e.className = "e"; e.textContent = o.marca || "Distribuidora Lopes · Marketing";
        const t = doc.createElement("div"); t.className = "t"; t.textContent = (o.titulo || "") + " "; const sp = doc.createElement("span"); sp.textContent = o.secao || ""; t.append(sp);
        const s = doc.createElement("div"); s.className = "s"; s.textContent = "Gerado em " + hoje + (o.sub ? " · " + o.sub : "");
        tx.append(e, t, s); h.append(tx);
        if (M.lopesNeg) { const im = doc.createElement("img"); im.src = M.lopesNeg; im.alt = "Distribuidora Lopes"; h.append(im); }
        a.prepend(h);
        // pontos de quebra de página: fim de cada bloco (filhos e netos da área), para o PDF não cortar no meio de um cartão
        const top = a.getBoundingClientRect().top, c1 = new Set(), c2 = new Set();
        [...a.children].forEach(c => { c1.add(c.getBoundingClientRect().bottom - top); [...c.children].forEach(g => { c2.add(g.getBoundingClientRect().bottom - top); [...g.children].forEach(n => c2.add(n.getBoundingClientRect().bottom - top)); }); });
        const ord = S => [...S].filter(v => v > 0).sort((x, y) => x - y);
        capturar.cortes = [ord(c1), ord(c2)];
      }
    });
  }
  const baixar = (url, nome) => { const a = document.createElement("a"); a.href = url; a.download = nome; document.body.append(a); a.click(); a.remove(); setTimeout(() => { if (url.startsWith("blob:")) URL.revokeObjectURL(url); }, 4000); };

  async function exportar(fmt, o){
    const pdf = fmt === "pdf"; await libs(pdf);
    const alvo = o.alvo(); if (!alvo) throw new Error("Nada para exportar.");
    const cv = await capturar(alvo, { titulo: o.titulo && o.titulo(), secao: o.secao && o.secao(), sub: o.sub && o.sub(), marca: o.marca });
    const nome = slug(o.arquivo ? o.arquivo() : "exportacao") || "exportacao";
    if (fmt === "png" || fmt === "jpeg") {
      const blob = await new Promise(ok => cv.toBlob(ok, "image/" + fmt, .92));
      baixar(URL.createObjectURL(blob), `${nome}.${fmt === "jpeg" ? "jpg" : "png"}`); return;
    }
    // PDF em páginas 16:9 (como slides); se a área for mais alta, divide em várias páginas
    const J = window.jspdf.jsPDF, pw = 1600, ph = 900, esc = pw / cv.width, alturaPag = Math.floor(ph / esc);
    const doc = new J({ orientation: "landscape", unit: "px", format: [pw, ph], hotfixes: ["px_scaling"], compress: true });
    const bgc = getComputedStyle(document.body).backgroundColor || "#ffffff";
    const fator = cv.width / 1360, cortes = (capturar.cortes || [[], []]).map(L => L.map(v => Math.round((v + 14) * fator)));
    let y = 0, n = 0;
    while (y < cv.height) {
      let h = Math.min(alturaPag, cv.height - y);
      if (y + h < cv.height) {
        const dentro = L => L.filter(v => v > y + alturaPag * .2 && v <= y + alturaPag);
        const ok = dentro(cortes[0]).length ? dentro(cortes[0]) : dentro(cortes[1]); if (ok.length) h = ok[ok.length - 1] - y; }
      const c = document.createElement("canvas"); c.width = cv.width; c.height = alturaPag;
      const x = c.getContext("2d"); x.fillStyle = bgc; x.fillRect(0, 0, c.width, c.height); x.drawImage(cv, 0, y, cv.width, h, 0, 0, cv.width, h);
      if (n) doc.addPage([pw, ph], "landscape");
      doc.addImage(c.toDataURL("image/jpeg", .92), "JPEG", 0, 0, pw, ph);
      y += h; n++;
    }
    doc.save(`${nome}.pdf`);
  }

  function menu(host, o){
    if (!host) return;
    const d = document.createElement("details"); d.className = "exp-menu no-exp";
    d.innerHTML = '<summary aria-label="Exportar esta aba">⤓ Exportar</summary><div class="exp-op" role="menu">' +
      '<button type="button" data-f="pdf" role="menuitem">PDF<small>páginas 16:9, prontas para slide</small></button>' +
      '<button type="button" data-f="png" role="menuitem">PNG<small>imagem em alta, fundo da página</small></button>' +
      '<button type="button" data-f="jpeg" role="menuitem">JPEG<small>imagem mais leve</small></button></div>';
    const sum = d.querySelector("summary"), rot = sum.textContent;
    d.querySelector(".exp-op").addEventListener("click", async e => {
      const b = e.target.closest("button[data-f]"); if (!b) return;
      const bs = d.querySelectorAll("button"); bs.forEach(x => x.disabled = true); sum.textContent = "Gerando…"; d.open = false;
      try { await exportar(b.dataset.f, o); }
      catch (err) { const t = document.getElementById("toast"); const m = (err && err.message) || "Não foi possível exportar."; if (t) { t.textContent = m; t.hidden = false; setTimeout(() => t.hidden = true, 3500); } else alert(m); }
      finally { bs.forEach(x => x.disabled = false); sum.textContent = rot; }
    });
    document.addEventListener("click", e => { if (d.open && !d.contains(e.target)) d.open = false; });
    host.append(d);
  }
  window.Exportar = { menu, exportar };
})();
