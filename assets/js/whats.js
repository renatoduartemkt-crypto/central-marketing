/* WhatsApp · campanhas de disparo — usado pelo Meu painel (cartões curtos) e pela página whatsapp.html (detalhes).
   O administrador sobe duas planilhas (o navegador lê os arquivos; só os números e a lista de clientes por código e
   razão social vão para metas_mensais/whats-AAAA-MM — nada de telefone, contato ou texto de mensagem):
     1) "Disparos de Mensagens Meta" (Versotec): uma linha por conversa, com template, envio, resposta, situação do pedido
        (orçamento/carrinho/pedido), canal da compra e valor comprado em até 30 dias.
     2) "Conversão de Pedido de Venda por Canal B2B": por cliente, orçamentos iniciados no site ainda abertos
        (orcamento_b2b / _callcenter / _forcavendas) e pedidos fechados em cada canal (b2b / callcenter / forcavendas).
        O cliente monta o orçamento no site e pode enviá-lo ao Callcenter ou à Força de vendas para fechar lá; às vezes cota
        nos dois canais. Por isso um cliente pode ter orçamento aberto em mais de um canal (pode ser o mesmo pedido).
        valor_orcado_total da planilha = soma das 8 colunas (conferido em 18/11/2026).
   Opta fica de fora (template com "opta", gerente Thiago Neves, supervisor Luiz Couto, carteiras 1994 e 2322).
   Formato gravado: disparos.cli = [cod, nome, templates, dataEnvio, respondeu 0/1, situações, canais, valor30d]
                    vendas.cli   = [cod, cliente, representante, abSite, abCC, abFV, feSite, feCC, feFV] */
(function(){
  const pad=n=>String(n).padStart(2,"0");
  const iso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const addD=(s,n)=>{const d=new Date(s+"T12:00:00");d.setDate(d.getDate()+n);return iso(d);};
  const num=v=>(+v||0).toLocaleString("pt-BR");
  const brl=v=>(+v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL",minimumFractionDigits:2,maximumFractionDigits:2});
  // R$ curto para os cartões: R$ 165,3 mil · R$ 1,53 mi
  const brlC=v=>{v=+v||0;const a=Math.abs(v);if(a>=1e6)return `R$ ${(v/1e6).toLocaleString("pt-BR",{maximumFractionDigits:2})} mi`;
    if(a>=1e4)return `R$ ${(v/1e3).toLocaleString("pt-BR",{maximumFractionDigits:1})} mil`;return brl(v);};
  const pp=v=>`${((+v||0)*100).toLocaleString("pt-BR",{maximumFractionDigits:1})}%`;
  const dm=s=>s?`${s.slice(8,10)}/${s.slice(5,7)}`:"";
  const nCan=k=>({CALLCENTER:"Callcenter",FORCA_VENDAS:"Força de vendas",B2B:"Site",WEB:"Site"}[k]||k||"");
  const nSit=s=>String(s||"").split(/,\s*/).filter(Boolean).map(x=>({PEDIDO:"pedido",ORCAMENTO:"orçamento",CARRINHO:"carrinho",PERDIDO:"perdido",EXCLUIDO:"excluído",CANCELADO_ERP:"cancelado",PEDIDO_MESCLADO:"pedido mesclado"}[x]||x.toLowerCase()));
  const temSit=(s,...k)=>k.some(x=>String(s||"").indexOf(x)>=0);
  const CAN=[["site","Site","var(--accent)","pelo"],["cc","Callcenter","var(--cc)","pelo"],["fv","Força de vendas","var(--ok)","pela"]];

  /* ---------- leitura das planilhas ---------- */
  let xlsxP=null;
  const xlsxLib=()=>xlsxP||(xlsxP=new Promise((ok,no)=>{if(window.XLSX)return ok(window.XLSX);
    const t=document.createElement("script");t.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    t.onload=()=>ok(window.XLSX);t.onerror=()=>{xlsxP=null;no(new Error("não carregou o leitor de planilhas"));};document.head.append(t);}));
  const lerPlanilha=async f=>{const X=await xlsxLib(),wb=X.read(await f.arrayBuffer(),{type:"array",cellDates:true});
    const ws=wb.Sheets[wb.SheetNames[0]];return X.utils.sheet_to_json(ws,{defval:"",raw:true});};
  const dtx=v=>{if(v instanceof Date)return iso(v)+" "+pad(v.getHours())+":"+pad(v.getMinutes());const t=String(v||"").trim();
    let m=t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);if(m)return `${m[1]}-${m[2]}-${m[3]}${m[4]?" "+m[4]+":"+m[5]:""}`;
    m=t.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);if(m)return `${m[3]}-${m[2]}-${m[1]}${m[4]?" "+m[4]+":"+m[5]:""}`;return "";};
  const nv=v=>{if(typeof v==="number")return v;const t=String(v||"").replace(/[R$\s]/g,"");if(!t)return 0;
    return +(t.indexOf(",")>=0?t.replace(/\./g,"").replace(",","."):t)||0;};
  const optaV=x=>/THIAGO NEVES/i.test(x.gerente)||/LUIZ COUTO/i.test(x.supervisor)||["1994","2322"].indexOf(String(x.codigo_representante))>=0||/OPTA/i.test(x.representante);
  function procDisparos(L){
    const conv=L.filter(x=>!/opta/i.test(x.disparo_api_template||x.primeira_nossa_template||""));
    const api=conv.filter(x=>String(x.disparo_api_template||"").trim());
    const datas=api.map(x=>dtx(x.disparo_api_enviado_em).slice(0,10)).filter(Boolean).sort();
    const tudo=conv.map(x=>dtx(x.datahora_criacao).slice(0,10)).filter(Boolean).sort();
    const C={},cli={};
    api.forEach(x=>{const t=String(x.disparo_api_template).trim(),d=dtx(x.disparo_api_enviado_em).slice(0,10),cod=String(x.codcli||"").trim();
      const c=C[t]||(C[t]={t,ini:d,fim:d,msgs:0,resp:0,ccli:{},semCad:0});
      c.msgs++;if(d&&(!c.ini||d<c.ini))c.ini=d;if(d>c.fim)c.fim=d;if(x.primeira_cliente_em)c.resp++;
      if(!cod){c.semCad++;return;}
      const o=c.ccli[cod]||(c.ccli[cod]={v:0,orc:0});o.v=Math.max(o.v,nv(x.valor_comprado_30d));if(temSit(x.situacao_pedido,"ORCAMENTO","CARRINHO"))o.orc=1;});
    conv.forEach(x=>{const cod=String(x.codcli||"").trim();if(!cod)return;const t=String(x.disparo_api_template||"").trim();
      const d=dtx(x.disparo_api_enviado_em||x.datahora_criacao).slice(0,10);
      const o=cli[cod]||(cli[cod]={cod,nome:String(x.razaosocial||x.fantasia||"").trim().slice(0,60),t:[],d:"",r:0,sit:[],k:[],v:0,ini:0});
      if(t&&o.t.indexOf(t)<0)o.t.push(t);if(!t)o.ini=1;if(d&&(!o.d||d<o.d))o.d=d;if(x.primeira_cliente_em)o.r=1;
      nSit(x.situacao_pedido).forEach(z=>{if(o.sit.indexOf(z)<0)o.sit.push(z);});
      String(x.canal_compra||"").split(/,\s*/).filter(Boolean).forEach(z=>{if(o.k.indexOf(z)<0)o.k.push(z);});
      o.v=Math.max(o.v,nv(x.valor_comprado_30d));});
    const camps=Object.values(C).sort((a,b)=>a.ini<b.ini?-1:1).map(c=>{const V=Object.values(c.ccli);
      return {t:c.t,ini:c.ini,fim:c.fim,msgs:c.msgs,resp:c.resp,cli:V.length,semCad:c.semCad,compr:V.filter(o=>o.v>0).length,valor:Math.round(V.reduce((s,o)=>s+o.v,0)*100)/100,orc:V.filter(o=>o.orc).length};});
    const lista=Object.values(cli).map(o=>[o.cod,o.nome,o.t.join(" + ")||"conversa iniciada pelo cliente",o.d,o.r,o.sit.join(", "),o.k.join(", "),Math.round(o.v*100)/100]);
    return {ini:datas[0]||tudo[0]||"",ate:datas[datas.length-1]||"",ateConv:tudo[tudo.length-1]||"",msgs:api.length,
      contatos:new Set(api.map(x=>String(x.codcli||"").trim()||"t"+String(x.canal_id||x.id))).size,
      conversas:conv.length,iniciadasCliente:conv.length-api.length,
      respConv:api.filter(x=>x.primeira_cliente_em).length,semCad:api.filter(x=>!String(x.codcli||"").trim()).length,camps,cli:lista};}
  function procVendas(L){const fora=L.filter(optaV).length;
    const cli=L.filter(x=>!optaV(x)).map(x=>{const g=k=>Math.round(nv(x[k])*100)/100;
      return [String(x.codigo_cliente||"").trim(),String(x.cliente||"").trim().slice(0,60),String(x.representante||"").trim().slice(0,40),
        // destino do pedido: site→Callcenter (b2b_callcenter) conta no Callcenter; site→representante (b2b_forcavendas) na Força de vendas
        g("orcamento_b2b"),g("orcamento_callcenter"),g("orcamento_forcavendas")+g("orcamento_b2b_forcavendas"),g("b2b"),g("callcenter")+g("b2b_callcenter"),g("forcavendas")+g("b2b_forcavendas")];})
      .filter(r=>r[0]&&r.slice(3).some(v=>v>0));
    // relatório antigo: o mesmo cliente vinha em duas carteiras com valores idênticos (conta uma vez só).
    // relatório novo (TI, 18/11): duas linhas = representantes diferentes, cada uma com o seu valor (soma).
    const u=new Map();let rep=0;cli.forEach(r=>{const a=u.get(r[0]);if(!a){u.set(r[0],r.slice());return;}
      if(r[2]&&a[2].indexOf(r[2])<0)a[2]=(a[2]+" / "+r[2]).slice(0,80);
      if(r.slice(3).join()===a.slice(3).join()){rep++;return;}
      for(let i=3;i<9;i++)a[i]=Math.round((a[i]+r[i])*100)/100;});
    // fluxos origem → destino, no mesmo formato do relatório resumido (contraprova). "todos" inclui a Opta, como o resumido.
    const FX={"B2B -> B2B":"b2b","B2B -> CALLCENTER":"b2b_callcenter","B2B -> FORCA_VENDAS":"b2b_forcavendas","CALLCENTER -> CALLCENTER":"callcenter","FORCA_VENDAS -> FORCA_VENDAS":"forcavendas"};
    const soma=(A,k)=>Math.round(A.reduce((s,x)=>s+nv(x[k]),0)*100)/100, fx=A=>{const o={};Object.keys(FX).forEach(k=>o[k]=soma(A,FX[k]));return o;};
    const fluxo=L.length&&"b2b_callcenter" in L[0]?{todos:fx(L),lopes:fx(L.filter(x=>!optaV(x)))}:null;
    return {cli:[...u.values()],fora,repetidos:rep,linhas:L.length,fluxo};}
  // relatório "Conversão de Pedido de Venda por Canal B2B Resumido": origem -> destino, quantidade de pedidos e valor
  function procResumo(L){return {linhas:L.map(x=>{const m=String(x.origem||"").split(/\s*->\s*/);
      return [m[0].trim(),(m[1]||"").trim(),Math.round(nv(x.quantidade)),Math.round(nv(x.valor)*100)/100];}).filter(r=>r[0]&&r[1])};}
  // contraprova: compara o resumido com o detalhado, fluxo a fluxo (null se faltar um dos dois)
  function contraprova(W){const r=W&&W.resumido, f=W&&W.vendas&&W.vendas.fluxo;if(!r)return null;
    const L=r.linhas.map(([o,d,q,v])=>{const k=o+" -> "+d, det=f&&k in f.todos?f.todos[k]:null;
      return {o,d,q,v,det,lopes:f&&k in f.lopes?f.lopes[k]:null,dif:det===null?null:Math.round((v-det)*100)/100};});
    const tot={q:L.reduce((s,x)=>s+x.q,0),v:L.reduce((s,x)=>s+x.v,0),det:f?Object.values(f.todos).reduce((s,v)=>s+v,0):null,lopes:f?Object.values(f.lopes).reduce((s,v)=>s+v,0):null};
    tot.dif=tot.det===null?null:Math.round((tot.v-tot.det)*100)/100;
    const semCol=L.filter(x=>x.det===null&&x.v>0);
    return {L,tot,temDet:!!f,confere:!!f&&Math.abs(tot.dif)<1&&!semCol.length,semCol,
      mesmoPeriodo:!W.vendas||!r.periodo||!W.vendas.periodo||r.periodo===W.vendas.periodo};}
  /* lê os arquivos e grava metas_mensais/whats-AAAA-MM (mês do último disparo). Devolve {mes, msg}. */
  async function subir(files,mensais,mesAtual){
    let dis=null,ven=null,res=null;const nomes=[];
    for(const f of files){const L=await lerPlanilha(f),h=L[0]||{};
      if("disparo_api_template" in h||"situacao_sessao" in h){dis=procDisparos(L);dis.arq=f.name;nomes.push(f.name);}
      else if("orcamento_b2b" in h||"valor_orcado_total" in h){ven=procVendas(L);ven.arq=f.name;nomes.push(f.name);}
      else if("origem" in h&&"valor" in h){res=procResumo(L);res.arq=f.name;nomes.push(f.name);}
      else throw new Error(`não reconheci as colunas de "${f.name}". Use o relatório de disparos da Meta ou o de conversão de pedido por canal (detalhado ou resumido).`);}
    if(!dis&&!ven&&!res)return null;
    const mes=dis&&dis.ate?dis.ate.slice(0,7):mesAtual, id="whats-"+mes, ant=mensais[id]||{};
    if(ven||res){const p=prompt("Qual é o período do relatório de vendas por canal? (ex.: 01/11 a 16/11/2026)",(ant.vendas&&ant.vendas.periodo)||(ant.resumido&&ant.resumido.periodo)||"");
      if(p===null)return {mes:null,msg:"Envio cancelado."};if(ven)ven.periodo=p.trim().slice(0,60);if(res)res.periodo=p.trim().slice(0,60);}
    // quem subiu: fica no histórico do mês (o servidor também carimba atualizadoPor e grava na aba _log)
    const eu=(window.Auth&&Auth.current&&Auth.current())||{}, em=new Date().toISOString(), por=String(eu.email||"").toLowerCase();
    [dis,ven,res].forEach(o=>{if(o){o.enviadoPor=por;o.enviadoEm=em;}});
    const envio={em,por,nome:String(eu.nome||"").slice(0,60),arq:nomes.map(n=>String(n).slice(0,90)),tipos:[dis?"disparos":null,ven?"vendas":null,res?"resumido":null].filter(Boolean)};
    if(ven||res)envio.periodo=(ven||res).periodo;
    const d=Object.assign({},ant,{tipo:"whats",mes,atualizadoEm:em,envios:(ant.envios||[]).concat([envio]).slice(-50)});
    if(dis)d.disparos=dis; if(ven)d.vendas=ven; if(res)d.resumido=res;
    await Store.collection("metas_mensais").doc(id).set(d);mensais[id]=d;
    return {mes,msg:`Atualizado com ${nomes.join(" e ")}.`+(ven&&ven.fora?` ${ven.fora} clientes da Opta ficaram de fora.`:"")};}

  /* ---------- resumos (os números dos cartões) ---------- */
  // campanha ativa = teve disparo nos últimos 7 dias do relatório
  function resumoDisparos(dis){
    const L=dis.cli, comp=L.filter(r=>r[7]>0), orc=r=>/orçamento|carrinho/.test(r[5]);
    const lim=addD(dis.ateConv||dis.ate,-6), ativas=dis.camps.filter(c=>c.fim>=lim);
    // cada cliente fica em um grupo só (somam o total de clientes)
    const g={comp:comp.length,orc:L.filter(r=>!(r[7]>0)&&orc(r)).length,resp:L.filter(r=>!(r[7]>0)&&!orc(r)&&r[4]).length};
    g.sem=L.length-g.comp-g.orc-g.resp;
    const can=k=>comp.filter(r=>r[6].indexOf(k)>=0).length;
    return {msgs:dis.msgs,contatos:dis.contatos,camps:dis.camps.length,ativas:ativas.length,lim,clientes:L.length,g,
      resp:L.filter(r=>r[4]).length,respConv:dis.respConv,orcTot:L.filter(orc).length,valor:comp.reduce((s,r)=>s+r[7],0),
      respComp:comp.filter(r=>r[4]).length,cc:can("CALLCENTER"),fv:can("FORCA_VENDAS"),site:comp.filter(r=>/B2B|WEB|SITE/i.test(r[6])).length};}
  // orçado no site = já virou pedido (por canal) + ainda em aberto. Os valores somam; os clientes: fecharam + nada fechado = orçaram.
  function resumoFunil(ven,dis){
    const C=ven.cli, wa=new Set(dis?dis.cli.map(r=>r[0]):[]), s=(a,f)=>a.reduce((t,r)=>t+f(r),0);
    const feT=r=>r[6]+r[7]+r[8], abT=r=>r[3]+r[4]+r[5];
    const fech=C.filter(r=>feT(r)>0), nada=C.filter(r=>feT(r)===0);
    // canal principal de quem fechou: onde fechou mais valor (assim cada cliente conta uma vez)
    const prin={site:0,cc:0,fv:0}, k3=["site","cc","fv"];
    fech.forEach(r=>{const i=[6,7,8].reduce((b,j)=>r[j]>r[b]?j:b,6);prin[k3[i-6]]++;});
    return {clientes:C.length,orcado:s(C,r=>abT(r)+feT(r)),fechado:s(C,feT),aberto:s(C,abT),
      fe:{site:s(C,r=>r[6]),cc:s(C,r=>r[7]),fv:s(C,r=>r[8])},ab:{site:s(C,r=>r[3]),cc:s(C,r=>r[4]),fv:s(C,r=>r[5])},
      cliFe:{site:C.filter(r=>r[6]>0).length,cc:C.filter(r=>r[7]>0).length,fv:C.filter(r=>r[8]>0).length},
      cliAb:{site:C.filter(r=>r[3]>0).length,cc:C.filter(r=>r[4]>0).length,fv:C.filter(r=>r[5]>0).length},
      fecharam:fech.length,nada:nada.length,abertos:C.filter(r=>abT(r)>0).length,prin,
      migraram:C.filter(r=>!(r[6]>0)&&(r[7]+r[8])>0).length,multi:fech.filter(r=>[6,7,8].filter(j=>r[j]>0).length>1).length,
      wa:C.filter(r=>wa.has(r[0])).length,valorNada:s(nada,abT),multiAb:C.filter(r=>[3,4,5].filter(j=>r[j]>0).length>1).length,
      abMin:s(C,r=>Math.max(r[3],r[4],r[5]))}; // em aberto se os orçamentos em dois canais forem o mesmo pedido
  }

  /* ---------- cartões no mesmo formato do E-mail: número grande, barra, linhas e quadrinhos ---------- */
  function el(tag,attrs,...kids){const e=document.createElement(tag);if(attrs)for(const[k,v]of Object.entries(attrs)){if(k==="class")e.className=v;else if(typeof v==="function")e.addEventListener(k.replace(/^on/,""),v);else if(k==="style")e.setAttribute("style",v);else if(v!=null)e.setAttribute(k,v);}kids.forEach(c=>{if(c!=null&&c!==false)e.append(c.nodeType?c:document.createTextNode(String(c)));});return e;}
  const row=(label,val,c)=>el("div",{class:"row"},el("span",null,c?el("i",{class:"dot",style:`--c:${c}`}):null,label),el("b",null,val));
  const meter=parts=>{const t=parts.reduce((s,p)=>s+p[0],0)||1;return el("div",{class:"meter"},...parts.map(([n,c])=>el("i",{style:`width:${n/t*100}%;background:${c}`})));};
  const tile=(v,l,extra,cls)=>el("div",{class:"tile"},el("b",cls?{class:cls}:null,v),el("span",null,l),extra?el("small",null,extra):null);
  const head=(t,href,per,lab)=>el("header",null,el("div",{class:"ttl"},el("h2",null,t),per?el("span",{class:"per"},per):null),href?el("a",{href},lab||"Abrir ›"):null);
  const plural=(n,s,p)=>n===1?s:p;

  /* Disparos = nutrição e reativação: a mensagem vai só para clientes inativos há mais de 90 dias, e o relatório
     só conta orçamento, carrinho e compra que aconteceram DEPOIS do envio. Reativado = comprou em até 30 dias. */
  function cardDisparos(W,o){o=o||{};const dis=W&&W.disparos, out=[head("WhatsApp · nutrição de inativos",o.link,dis&&dis.ini?`Disparos de ${dm(dis.ini)} a ${dm(dis.ate)}`:o.per,o.lab)];
    if(!dis){out.push(el("p",{class:"foot"},o.vazio||"Os disparos deste mês ainda não foram enviados."));return out;}
    const R=resumoDisparos(dis), g=R.g;
    out.push(el("div",{class:"kpi"},el("b",null,num(R.msgs)),el("span",null,`mensagens para inativos há +90 dias · ${R.ativas} de ${R.camps} ${plural(R.camps,"campanha ativa","campanhas ativas")}`)),
      meter([[g.comp,"var(--ok)"],[g.orc,"var(--warn)"],[g.resp,"var(--info)"],[g.sem,"var(--surface-2)"]]),
      el("div",{class:"rows"},row("Reativados (compraram em até 30 dias)",num(g.comp),"var(--ok)"),row("Voltaram ao site, ainda sem comprar",num(g.orc),"var(--warn)"),
        row("Só responderam",num(g.resp),"var(--info)"),row("Sem retorno ainda",num(g.sem),"var(--muted)"),row("Clientes que receberam (soma)",num(R.clientes))),
      el("div",{class:"sec"},el("div",{class:"sub"},"Nutrição e reativação · depois da mensagem"),
        el("div",{class:"tiles q4"},tile(num(R.resp),"responderam",`${pp(R.resp/(R.clientes||1))} dos clientes`),tile(num(R.orcTot),"voltaram ao site","carrinho ou orçamento"),
          tile(brlC(R.valor),"reativados",`${num(g.comp)} clientes`),tile(`${num(R.cc)} · ${num(R.fv)}`,"Callcenter · FV","canal da compra")),
        el("p",{class:"foot"},`${num(g.comp-R.respComp)} dos ${num(g.comp)} reativados não responderam: leram e compraram pelo canal de costume.${R.site?` ${num(R.site)} compraram pelo site.`:""}`)));
    return out;}
  /* Jornada do site = todos os clientes que passaram pelo site no período (ativos ou não, com RCA ou não).
     Objetivo diferente dos disparos: aqui não entra WhatsApp. O cruzamento fica só na validação (validacao()). */
  function cardFunil(W,o){o=o||{};const ven=W&&W.vendas, out=[head("Jornada do site · orçamentos",o.link,ven&&ven.periodo?ven.periodo:o.per,o.lab)];
    if(!ven){out.push(el("p",{class:"foot"},o.vazio||"O relatório de vendas por canal deste mês ainda não foi enviado."));return out;}
    const F=resumoFunil(ven), t=F.orcado||1;
    out.push(el("div",{class:"kpi"},el("b",null,`${Math.round(F.fechado/t*100)}%`),el("span",null,`dos ${brlC(F.orcado)} orçados no site já viraram pedido`)),
      meter([[F.fe.site,"var(--accent)"],[F.fe.cc,"var(--cc)"],[F.fe.fv,"var(--ok)"],[F.aberto,"var(--surface-2)"]]),
      el("div",{class:"rows"},row("Fechado pelo site",brl(F.fe.site),"var(--accent)"),row("Fechado pelo Callcenter",brl(F.fe.cc),"var(--cc)"),
        row("Fechado pela Força de vendas",brl(F.fe.fv),"var(--ok)"),row("Ainda em aberto",brl(F.aberto),"var(--muted)"),row("Total orçado no site (soma)",brl(F.orcado))),
      el("div",{class:"sec"},el("div",{class:"sub"},`Clientes · ${num(F.clientes)} orçaram no site`),
        el("div",{class:"tiles q4"},tile(num(F.fecharam),"fecharam pedido","em algum canal"),tile(num(F.nada),"não fecharam nada",brlC(F.valorNada)),
          tile(num(F.migraram),"saíram do site","fecharam fora"),tile(num(F.multiAb),"aberto em 2+ canais","pode ser o mesmo")),
        el("p",{class:"foot"},`${num(F.fecharam)} + ${num(F.nada)} = ${num(F.clientes)} clientes. Os valores das linhas somam o total orçado. Inclui todos os clientes que passaram pelo site, ativos ou não.`)));
    const X=contraprova(W);
    if(X&&X.temDet)out.push(el("p",{class:"foot"},el("span",{class:"tag "+(X.confere&&X.mesmoPeriodo?"ok":"warn")},X.confere&&X.mesmoPeriodo?"Contraprova ok":"Contraprova com diferença"),
      ` Resumido ${brl(X.tot.v)} × detalhado ${brl(X.tot.det)}${Math.abs(X.tot.dif)>=0.01?` (diferença de ${brl(X.tot.dif)})`:""}${X.mesmoPeriodo?"":" · períodos diferentes"}. Os dois contam a Opta; o cartão acima não conta.`));
    else if(ven)out.push(el("p",{class:"foot"},"Suba também o relatório resumido para conferir o detalhado (contraprova)."));
    return out;}
  /* Validação dos disparos: só os clientes que estão nas duas planilhas. Caminho completo = depois da mensagem foi ao site
     (carrinho/orçamento no relatório de disparos), comprou em até 30 dias, e o relatório de vendas mostra o pedido vindo do site. */
  function validacao(W){const dis=W&&W.disparos, ven=W&&W.vendas;if(!dis||!ven)return null;
    const V=new Map(ven.cli.map(r=>[r[0],r]));
    const L=dis.cli.filter(r=>V.has(r[0])).map(r=>{const v=V.get(r[0]), site=/orçamento|carrinho/.test(r[5]), comp=r[7]>0, fora=v[7]+v[8], noSite=v[6];
      const st=site&&comp&&fora>0?["completo","Mensagem → site → pedido em outro canal","ok"]:site&&comp&&noSite>0?["site","Mensagem → site → pedido no site","ok"]
        :site?["foi","Foi ao site, ainda não fechou","warn"]:comp?["semsite","Comprou, sem passagem pelo site depois da mensagem",""]:["nada","Sem retorno depois da mensagem",""];
      return {r,v,st,igual:comp&&Math.abs((fora+noSite)-r[7])<0.05};});
    const ord={completo:0,site:1,foi:2,semsite:3,nada:4};L.sort((a,b)=>ord[a.st[0]]-ord[b.st[0]]||b.r[7]-a.r[7]);
    return {L,total:L.length,completo:L.filter(x=>x.st[0]==="completo"||x.st[0]==="site").length};}
  window.Whats={procDisparos,procVendas,procResumo,contraprova,subir,resumoDisparos,resumoFunil,cardDisparos,cardFunil,validacao,CAN,nCan,num,brl,brlC,pp,dm,el,row,meter,tile,head};
})();
