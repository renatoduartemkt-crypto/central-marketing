/*
 * Relatórios em PDF (auditoria) — usa jsPDF + AutoTable (assets/vendor, licença MIT).
 *
 * Relatorio.gerar({
 *   titulo, subtitulo, arquivo,
 *   info:   [["Evento", "Feirão MT"], ...],          // bloco de identificação
 *   resumo: [["Verba projetada", "R$ 10.000,00"], ...],
 *   secoes: [{ titulo, nota, colunas: [{ h, r }], linhas: [[...]], total: [...] }]
 * })
 * Modo "gas" (Google Apps Script): o PDF é salvo na pasta de relatórios do Drive e o link é exibido.
 * Outros modos: o navegador baixa o arquivo.
 */
(function(){
  const CFG = window.APP_CONFIG || {};
  const NAVY = [27, 45, 73], ORANGE = [240, 79, 44], GREY = [92, 107, 130];
  // a fonte padrão do PDF não tem alguns símbolos: troca por equivalentes
  const txt = v => String(v == null ? "" : v).replace(/[·•]/g, "-").replace(/[−–]/g, "-").replace(/[→⟶]/g, "->").replace(/[←]/g, "<-").replace(/[✓✔]/g, "OK").replace(/[⚑⚠]/g, "!").replace(/[\u{1F300}-\u{1FAFF}]/gu, "").replace(/ /g, " ");

  function load(src){
    return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Não foi possível carregar " + src)); document.head.append(s); });
  }
  async function lib(){
    if (!(window.jspdf && window.jspdf.jsPDF)) await load((CFG.vendorBase || "assets/vendor/") + "jspdf.umd.min.js");
    const J = window.jspdf.jsPDF;
    if (!J.API.autoTable) await load((CFG.vendorBase || "assets/vendor/") + "jspdf.plugin.autotable.min.js");
    return J;
  }
  const quem = () => { const u = window.Auth && Auth.current && Auth.current(); return u ? `${u.nome || u.email} (${u.email})` : ""; };
  const agora = () => { const d = new Date(); return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); };

  async function gerar(r){
    const J = await lib();
    const doc = new J({ orientation: "landscape", unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 36;
    // cabeçalho
    doc.setFillColor(...NAVY); doc.rect(0, 0, W, 64, "F");
    doc.setFillColor(...ORANGE); doc.rect(0, 64, W, 3, "F");
    let tx = M;
    if (window.MARCA && MARCA.grupoNeg) { try { doc.addImage(MARCA.grupoNeg, "PNG", M, 15, 121, 34); tx = M + 140; doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.6); doc.line(tx - 10, 16, tx - 10, 50); } catch (_) {} }
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.text(txt(r.titulo), tx, 30);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.text(txt(r.subtitulo || ""), tx, 48);
    doc.text(txt((CFG.nomeSite || "Central de Marketing") + " · " + (CFG.empresa || "")), W - M, 30, { align: "right" });
    doc.text(txt("Gerado em " + agora()), W - M, 48, { align: "right" });
    let y = 88;
    doc.setTextColor(22, 35, 58);
    const kv = (rows, title) => {
      if (!rows || !rows.length) return;
      if (title) { doc.setFont("helvetica", "bold"); doc.setFontSize(11.5); doc.text(txt(title), M, y); y += 6; }
      doc.autoTable({ startY: y, margin: { left: M, right: M }, theme: "plain", styles: { fontSize: 9.5, cellPadding: 3, textColor: [22, 35, 58] },
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 170, textColor: GREY } }, body: rows.map(([k, v]) => [txt(k), txt(v)]) });
      y = doc.lastAutoTable.finalY + 14;
    };
    kv(r.info, "Identificação");
    kv(r.resumo, "Resumo");
    (r.secoes || []).forEach(s => {
      if (y > H - 110) { doc.addPage(); y = 50; }
      doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...NAVY); doc.text(txt(s.titulo), M, y); y += 4;
      if (s.nota) { doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...GREY); const lines = doc.splitTextToSize(txt(s.nota), W - 2 * M); doc.text(lines, M, y + 10); y += 10 + lines.length * 10; }
      const cols = s.colunas || [];
      const colStyles = {}; cols.forEach((c, i) => { if (c.r) colStyles[i] = { halign: "right" }; if (c.w) colStyles[i] = Object.assign(colStyles[i] || {}, { cellWidth: c.w }); });
      const body = (s.linhas || []).map(l => l.map(txt));
      doc.autoTable({
        startY: y + 4, margin: { left: M, right: M, bottom: 40 }, head: [cols.map(c => txt(c.h))], body: body.length ? body : [[{ content: txt(s.vazio || "Nenhum registro."), colSpan: Math.max(1, cols.length), styles: { textColor: GREY, fontStyle: "italic" } }]],
        foot: s.total ? [s.total.map(txt)] : undefined, showFoot: "lastPage",
        styles: { fontSize: 8.5, cellPadding: 4, overflow: "linebreak", lineColor: [221, 227, 236], lineWidth: 0.5, textColor: [22, 35, 58] },
        headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold" }, footStyles: { fillColor: [233, 237, 244], textColor: [22, 35, 58], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [247, 249, 252] }, columnStyles: colStyles,
        didParseCell: d => { if ((d.section === "foot") && cols[d.column.index] && cols[d.column.index].r) d.cell.styles.halign = "right"; }
      });
      y = doc.lastAutoTable.finalY + 20;
    });
    if (r.assinatura !== false) {
      if (y > H - 90) { doc.addPage(); y = 60; }
      doc.setDrawColor(150); doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...GREY);
      doc.line(M, y + 30, M + 230, y + 30); doc.text("Responsável pelo setor", M, y + 42);
      doc.line(M + 290, y + 30, M + 520, y + 30); doc.text("Conferido por (auditoria)", M + 290, y + 42);
    }
    // rodapé em todas as páginas
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...GREY);
      doc.text(txt("Emitido por " + quem() + " · " + agora()), M, H - 18);
      doc.text(`Página ${i} de ${n}`, W - M, H - 18, { align: "right" });
    }
    return entregar(doc, r.arquivo || "relatorio.pdf");
  }

  async function entregar(doc, nome){
    nome = nome.replace(/[\\/:*?"<>|]+/g, "-");
    if (window.Store && Store.modo() === "gas" && window.GAS) {
      const b64 = doc.output("datauristring").split(",")[1];
      const r = await GAS.call("salvarRelatorio", GAS.token(), b64, nome);
      aviso(r && r.url, nome);
      return r;
    }
    doc.save(nome);
    return { arquivo: nome };
  }
  function aviso(url, nome){
    const box = document.createElement("div");
    box.setAttribute("role", "dialog"); box.className = "rel-aviso";
    box.innerHTML = '<div><b>Relatório salvo no Google Drive</b><p></p><a target="_blank" rel="noopener">Abrir PDF</a> <button type="button">Fechar</button></div>';
    box.querySelector("p").textContent = nome;
    const a = box.querySelector("a"); if (url) a.href = url; else a.remove();
    box.querySelector("button").onclick = () => box.remove();
    document.body.append(box);
  }

  // helpers de formatação para quem monta o relatório
  const brl = v => (+v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fd = s => s ? `${String(s).slice(8, 10)}/${String(s).slice(5, 7)}/${String(s).slice(0, 4)}` : "—";
  window.Relatorio = { gerar, brl, fd };
})();
