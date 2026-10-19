/**
 * Importação inicial da Central de Marketing (rode UMA vez pelo editor; pode repetir sem duplicar).
 * Escolha "importarTudo" no menu de funções e clique em Executar.
 *  - centros de custo e metas/projetado (Out–Dez 2026): atualiza se já existir
 *  - e-mails planejados e campanhas de tráfego: só inclui os que ainda não existem
 * Depois de importar, este arquivo pode ser apagado.
 */
function importarTudo() {
  soEditor_();
  const D = DADOS_INICIAIS_();
  const res = {};
  comLock_(function () {
    ['centros_custo', 'metas_mensais'].forEach(function (col) {
      let n = 0;
      D[col].forEach(function (it) {
        const id = String(it.id); const d = Object.assign({}, it); delete d.id;
        const a = ler_(col, id);
        gravarLinha_(col, id, Object.assign({}, a ? a.dados : {}, d), 'importação', !a); n++;
      });
      res[col] = n + ' gravados';
    });
    ['emails', 'trafego_campanhas'].forEach(function (col) {
      let n = 0, p = 0;
      D[col].forEach(function (it) {
        const id = String(it.id); const d = Object.assign({}, it); delete d.id;
        if (ler_(col, id)) { p++; return; }
        gravarLinha_(col, id, d, 'importação', true); n++;
      });
      res[col] = n + ' incluídos, ' + p + ' já existiam';
    });
  });
  log_('importação', 'importar tudo', '', '', JSON.stringify(res));
  console.log(JSON.stringify(res, null, 1));
  return res;
}

function DADOS_INICIAIS_() {
  return {
"centros_custo": [
{
"id": "propaganda",
"nome": "Material de venda / propaganda",
"codigo": "200020",
"ordem": 1,
"ativo": true
},
{
"id": "terceirizado",
"nome": "Material terceirizado",
"codigo": "200021",
"ordem": 2,
"ativo": true
},
{
"id": "eventos",
"nome": "Eventos",
"codigo": "200022",
"ordem": 3,
"ativo": true
},
{
"id": "brindes",
"nome": "Brindes",
"codigo": "200023",
"ordem": 4,
"ativo": true
},
{
"id": "softwares",
"nome": "Softwares",
"codigo": "200024",
"ordem": 5,
"ativo": true
}
],
"metas_mensais": [
{
"id": "custos-2026-10",
"tipo": "custos",
"mes": "2026-10",
"projetado": {
"propaganda": 16500.0,
"terceirizado": 23400.0,
"eventos": 0,
"brindes": 0,
"softwares": 2595.1
},
"fonte": "Planejamento financeiro 2026 — Setor de Marketing",
"itens": [
{
"centro": "propaganda",
"conta": "200020",
"item": "INVESTIMENTO TRAFEGO PAGO META LOPES",
"valor": 2000.0
},
{
"centro": "propaganda",
"conta": "200020",
"item": "INVESTIMENTO TRAFEGO PAGO GOOGLE LOPES",
"valor": 1000.0
},
{
"centro": "propaganda",
"conta": "200020",
"item": "INVESTIMENTO TRAFEGO PAGO META OPTA",
"valor": 500.0
},
{
"centro": "propaganda",
"conta": "200020",
"item": "INVESTIMENTO TRAFEGO PAGO GOOGLE OPTA",
"valor": 1000.0
},
{
"centro": "propaganda",
"conta": "200020",
"item": "MIDIAS OFFILINE RO/AC (linha 8 da planilha original)",
"valor": 6000.0
},
{
"centro": "propaganda",
"conta": "200020",
"item": "MIDIAS OFFILINE RO/AC (linha 9 da planilha original)",
"valor": 6000.0
},
{
"centro": "terceirizado",
"conta": "200021",
"item": "PRODUÇÃO DE CONTEUDO MT",
"valor": 800.0
},
{
"centro": "terceirizado",
"conta": "200021",
"item": "PRODUÇÃO DE CONTEUDO RO",
"valor": 600.0
},
{
"centro": "terceirizado",
"conta": "200021",
"item": "PLOTAGEM CAMINHÕES GRUPO LOPES",
"valor": 22000.0
},
{
"centro": "softwares",
"conta": "200024",
"item": "SOFTWARE DE GESTÃO (RD STATION)",
"valor": 2358.75
},
{
"centro": "softwares",
"conta": "200024",
"item": "PLATAFORMAS DE AUTOMAÇÃO DE MKT (MLABS | CAPCUT | ADOBE)",
"valor": 236.35
}
]
},
{
"id": "custos-2026-11",
"tipo": "custos",
"mes": "2026-11",
"projetado": {
"propaganda": 4500.0,
"terceirizado": 23400.0,
"eventos": 0,
"brindes": 0,
"softwares": 2595.1
},
"fonte": "Planejamento financeiro 2026 — Setor de Marketing",
"itens": [
{
"centro": "propaganda",
"conta": "200020",
"item": "INVESTIMENTO TRAFEGO PAGO META LOPES",
"valor": 2000.0
},
{
"centro": "propaganda",
"conta": "200020",
"item": "INVESTIMENTO TRAFEGO PAGO GOOGLE LOPES",
"valor": 1000.0
},
{
"centro": "propaganda",
"conta": "200020",
"item": "INVESTIMENTO TRAFEGO PAGO META OPTA",
"valor": 500.0
},
{
"centro": "propaganda",
"conta": "200020",
"item": "INVESTIMENTO TRAFEGO PAGO GOOGLE OPTA",
"valor": 1000.0
},
{
"centro": "terceirizado",
"conta": "200021",
"item": "PRODUÇÃO DE CONTEUDO MT",
"valor": 800.0
},
{
"centro": "terceirizado",
"conta": "200021",
"item": "PRODUÇÃO DE CONTEUDO RO",
"valor": 600.0
},
{
"centro": "terceirizado",
"conta": "200021",
"item": "PLOTAGEM CAMINHÕES GRUPO LOPES",
"valor": 22000.0
},
{
"centro": "softwares",
"conta": "200024",
"item": "SOFTWARE DE GESTÃO (RD STATION)",
"valor": 2358.75
},
{
"centro": "softwares",
"conta": "200024",
"item": "PLATAFORMAS DE AUTOMAÇÃO DE MKT (MLABS | CAPCUT | ADOBE)",
"valor": 236.35
}
]
},
{
"id": "custos-2026-12",
"tipo": "custos",
"mes": "2026-12",
"projetado": {
"propaganda": 15500.0,
"terceirizado": 1400.0,
"eventos": 0,
"brindes": 55000.0,
"softwares": 2595.1
},
"fonte": "Planejamento financeiro 2026 — Setor de Marketing",
"itens": [
{
"centro": "propaganda",
"conta": "200020",
"item": "INVESTIMENTO TRAFEGO PAGO META LOPES",
"valor": 1000.0
},
{
"centro": "propaganda",
"conta": "200020",
"item": "INVESTIMENTO TRAFEGO PAGO GOOGLE LOPES",
"valor": 1000.0
},
{
"centro": "propaganda",
"conta": "200020",
"item": "INVESTIMENTO TRAFEGO PAGO META OPTA",
"valor": 500.0
},
{
"centro": "propaganda",
"conta": "200020",
"item": "INVESTIMENTO TRAFEGO PAGO GOOGLE OPTA",
"valor": 1000.0
},
{
"centro": "propaganda",
"conta": "200020",
"item": "MIDIAS OFFILINE RO/AC (linha 8 da planilha original)",
"valor": 6000.0
},
{
"centro": "propaganda",
"conta": "200020",
"item": "MIDIAS OFFILINE RO/AC (linha 9 da planilha original)",
"valor": 6000.0
},
{
"centro": "terceirizado",
"conta": "200021",
"item": "PRODUÇÃO DE CONTEUDO MT",
"valor": 800.0
},
{
"centro": "terceirizado",
"conta": "200021",
"item": "PRODUÇÃO DE CONTEUDO RO",
"valor": 600.0
},
{
"centro": "brindes",
"conta": "200023",
"item": "CALENDÁRIO | CATÁLOGO",
"valor": 55000.0
},
{
"centro": "softwares",
"conta": "200024",
"item": "SOFTWARE DE GESTÃO (RD STATION)",
"valor": 2358.75
},
{
"centro": "softwares",
"conta": "200024",
"item": "PLATAFORMAS DE AUTOMAÇÃO DE MKT (MLABS | CAPCUT | ADOBE)",
"valor": 236.35
}
]
},
{
"id": "ecom-2026-10",
"tipo": "ecommerce",
"site": "lopes",
"mes": "2026-10",
"metaVendas": 591523.52
},
{
"id": "ecom-2026-11",
"tipo": "ecommerce",
"site": "lopes",
"mes": "2026-11",
"metaVendas": 492397.4
},
{
"id": "ecom-2026-12",
"tipo": "ecommerce",
"site": "lopes",
"mes": "2026-12",
"metaVendas": 558894.04
},
{
"id": "ecom-opta-2026-10",
"tipo": "ecommerce",
"site": "opta",
"mes": "2026-10",
"metaVendas": 42000.0
},
{
"id": "ecom-opta-2026-11",
"tipo": "ecommerce",
"site": "opta",
"mes": "2026-11",
"metaVendas": 43000.0
},
{
"id": "ecom-opta-2026-12",
"tipo": "ecommerce",
"site": "opta",
"mes": "2026-12",
"metaVendas": 43000.0
},
{
"id": "alcance-2026-10",
"tipo": "alcance",
"mes": "2026-10",
"ig_lopes": {
"meta": 288011,
"realizado": 0
},
"ig_opta": {
"meta": 140074,
"realizado": 0
},
"in_lopes": {
"meta": 18289,
"realizado": 0
},
"in_opta": {
"meta": 3981,
"realizado": 0
},
"roas_email": {
"meta": 9.89,
"realizado": 0
},
"roas_pago": {
"meta": 10.26,
"realizado": 0
}
},
{
"id": "alcance-2026-11",
"tipo": "alcance",
"mes": "2026-11",
"ig_lopes": {
"meta": 305292,
"realizado": 0
},
"ig_opta": {
"meta": 168089,
"realizado": 0
},
"in_lopes": {
"meta": 19203,
"realizado": 0
},
"in_opta": {
"meta": 4778,
"realizado": 0
},
"roas_email": {
"meta": 10.58,
"realizado": 0
},
"roas_pago": {
"meta": 11.08,
"realizado": 0
}
},
{
"id": "alcance-2026-12",
"tipo": "alcance",
"mes": "2026-12",
"ig_lopes": {
"meta": 320556,
"realizado": 0
},
"ig_opta": {
"meta": 201706,
"realizado": 0
},
"in_lopes": {
"meta": 19971,
"realizado": 0
},
"in_opta": {
"meta": 5733,
"realizado": 0
},
"roas_email": {
"meta": 11.22,
"realizado": 0
},
"roas_pago": {
"meta": 11.86,
"realizado": 0
}
}
],
"emails": [
{
"id": "fk0i28ndn02ss2pbox77",
"assunto": "Começo de mês, com Ofertas incríveis!",
"atualizadoEm": "2026-10-01T14:37:19.301Z",
"criadoEm": "2026-10-01T14:37:19.301Z",
"data": "2026-10-01",
"empresa": "lopes",
"estados": [],
"hora": "06:00",
"nome": "Ofertas do Mês",
"notas": "",
"tipo": "ofertas",
"segs": [
"engajados"
],
"execucao": "nao_enviado"
},
{
"id": "06we4vtuoappqpy0w7bp",
"assunto": "Ofertas do Mês",
"atualizadoEm": "2026-10-01T14:38:33.984Z",
"criadoEm": "2026-10-01T14:38:33.984Z",
"data": "2026-10-01",
"empresa": "lopes",
"estados": [],
"hora": "18:00",
"nome": "Ofertas do Mês",
"notas": "Colocar botão para descadastramento no corpo do e-mail.",
"tipo": "ofertas",
"segs": [
"indeterminados"
],
"execucao": "nao_enviado"
},
{
"id": "umwy9gmf0bw2f2ckj4u9",
"assunto": "Novidades, curiosidades e dicas da semana",
"atualizadoEm": "2026-10-01T14:40:01.439Z",
"criadoEm": "2026-10-01T14:40:01.439Z",
"data": "2026-10-02",
"empresa": "opta",
"estados": [],
"hora": "12:00",
"nome": "Opta News",
"notas": "Colocar botão de descadastramento em destaque",
"tipo": "blog",
"segs": [
"indeterminados"
],
"execucao": "nao_enviado"
},
{
"id": "llykz8d01mrgy91vp43i",
"assunto": "Novos produtos na Lopes",
"atualizadoEm": "2026-10-01T14:41:37.727Z",
"criadoEm": "2026-10-01T14:41:37.727Z",
"data": "2026-10-05",
"empresa": "lopes",
"estados": [],
"hora": "06:00",
"nome": "Novidades da Semana",
"notas": "",
"tipo": "novidades",
"segs": [
"engajados"
],
"execucao": "nao_enviado"
},
{
"id": "pm51x00btsl60nd93k6l",
"assunto": "Ofertas Corporativas",
"atualizadoEm": "2026-10-01T14:44:29.720Z",
"criadoEm": "2026-10-01T14:44:29.720Z",
"data": "2026-10-05",
"empresa": "opta",
"estados": [
"MS",
"MT"
],
"hora": "06:00",
"nome": "Ofertas Corporativas",
"notas": "",
"segs": [
"engajados"
],
"tipo": "ofertas",
"execucao": "nao_enviado"
},
{
"id": "6snz0308bjjobj25x3i8",
"assunto": "Tenha todo mix da Lopes na palma da sua mão",
"atualizadoEm": "2026-10-01T15:04:18.846Z",
"criadoEm": "2026-10-01T14:48:54.644Z",
"data": "2026-10-07",
"empresa": "lopes",
"estados": [
"MS",
"MT",
"RO",
"AC"
],
"hora": "06:00",
"nome": "Compre de qualquer Lugar",
"notas": "- falar do site e do Aplicativo",
"segs": [
"indeterminados"
],
"tipo": "institucional",
"execucao": "nao_enviado"
},
{
"id": "fc88hqdv64taihyffs4l",
"assunto": "",
"atualizadoEm": "2026-10-01T15:05:41.582Z",
"criadoEm": "2026-10-01T14:50:11.804Z",
"data": "2026-10-07",
"empresa": "opta",
"estados": [
"MS",
"MT"
],
"hora": "06:00",
"nome": "Oferta Revenda",
"notas": "",
"segs": [
"indeterminados"
],
"tipo": "ofertas",
"execucao": "nao_enviado"
},
{
"id": "392vduwqj0o3wmpj5nrh",
"assunto": "",
"atualizadoEm": "2026-10-01T14:51:53.411Z",
"criadoEm": "2026-10-01T14:51:53.411Z",
"data": "2026-10-09",
"empresa": "lopes",
"estados": [
"MS",
"MT",
"RO",
"AC"
],
"hora": "06:00",
"nome": "Ofertas de Fim de Semana (E-commerce)",
"notas": "",
"segs": [
"engajados",
"novos",
"indeterminados"
],
"tipo": "ofertas",
"execucao": "nao_enviado"
},
{
"id": "3d7toxca3emw46btfxu8",
"assunto": "",
"atualizadoEm": "2026-10-01T14:52:05.659Z",
"criadoEm": "2026-10-01T14:50:48.138Z",
"data": "2026-10-09",
"empresa": "opta",
"estados": [
"MS",
"MT"
],
"hora": "06:00",
"nome": "Opta News",
"notas": "",
"segs": [
"engajados",
"novos",
"indeterminados"
],
"tipo": "blog",
"execucao": "nao_enviado"
},
{
"id": "x0kuw4og5fptedt08xvf",
"assunto": "",
"atualizadoEm": "2026-10-01T15:00:15.418Z",
"criadoEm": "2026-10-01T14:54:10.274Z",
"data": "2026-10-13",
"empresa": "opta",
"estados": [
"MS",
"MT"
],
"hora": "06:00",
"nome": "Ofertas Corporativas",
"notas": "",
"segs": [
"engajados"
],
"tipo": "ofertas",
"execucao": "nao_enviado"
},
{
"id": "ykupnhk9sj5iuq1wccyd",
"assunto": "",
"atualizadoEm": "2026-10-01T15:01:43.765Z",
"criadoEm": "2026-10-01T15:01:43.765Z",
"data": "2026-10-13",
"empresa": "lopes",
"estados": [
"MS",
"MT",
"RO",
"AC"
],
"hora": "06:00",
"nome": "Novidades da semana",
"notas": "",
"segs": [
"engajados"
],
"tipo": "novidades",
"execucao": "nao_enviado"
},
{
"id": "cwotqgqb8njxq5zw3koa",
"assunto": "",
"atualizadoEm": "2026-10-01T15:02:57.234Z",
"criadoEm": "2026-10-01T15:02:57.234Z",
"data": "2026-10-16",
"empresa": "lopes",
"estados": [
"MS",
"MT",
"RO",
"AC"
],
"hora": "06:00",
"nome": "Ofertas de Fim de Semana",
"notas": "",
"segs": [
"engajados",
"novos",
"indeterminados"
],
"tipo": "ofertas",
"execucao": "nao_enviado"
},
{
"id": "fgfuvc064d50qnc7nut0",
"assunto": "",
"atualizadoEm": "2026-10-01T15:03:27.990Z",
"criadoEm": "2026-10-01T15:03:27.990Z",
"data": "2026-10-16",
"empresa": "opta",
"estados": [
"MS",
"MT"
],
"hora": "06:00",
"nome": "Opta News",
"notas": "",
"segs": [
"engajados",
"novos",
"indeterminados"
],
"tipo": "blog",
"execucao": "nao_enviado"
},
{
"id": "kubgw27p2boe2ta5bxv4",
"assunto": "",
"atualizadoEm": "2026-10-01T15:00:15.418Z",
"criadoEm": "2026-10-01T14:54:10.274Z",
"data": "2026-10-19",
"empresa": "opta",
"estados": [
"MS",
"MT"
],
"hora": "06:00",
"nome": "Ofertas Corporativas",
"notas": "",
"segs": [
"engajados"
],
"serie": "smupnv2th",
"tipo": "ofertas",
"execucao": "nao_enviado"
},
{
"id": "xxu0lihhai8f3ri96atj",
"assunto": "",
"atualizadoEm": "2026-10-01T15:01:43.765Z",
"criadoEm": "2026-10-01T15:01:43.765Z",
"data": "2026-10-19",
"empresa": "lopes",
"estados": [
"MS",
"MT",
"RO",
"AC"
],
"hora": "06:00",
"nome": "Novidades da semana",
"notas": "",
"segs": [
"engajados"
],
"serie": "smupnwz0h",
"tipo": "novidades",
"execucao": "nao_enviado"
},
{
"id": "2ibb1pca7oij5qqib52z",
"assunto": "Tenha todo mix da Lopes na palma da sua mão",
"atualizadoEm": "2026-10-01T15:04:18.846Z",
"criadoEm": "2026-10-01T14:48:54.644Z",
"data": "2026-10-21",
"empresa": "lopes",
"estados": [
"MS",
"MT",
"RO",
"AC"
],
"hora": "06:00",
"nome": "Compre de qualquer Lugar",
"notas": "- falar do site e do Aplicativo",
"segs": [
"indeterminados"
],
"serie": "smupo0aml",
"tipo": "institucional",
"execucao": "nao_enviado"
},
{
"id": "8sslopixbd9vcobw7fhy",
"assunto": "",
"atualizadoEm": "2026-10-01T15:05:41.582Z",
"criadoEm": "2026-10-01T14:50:11.804Z",
"data": "2026-10-21",
"empresa": "opta",
"estados": [
"MS",
"MT"
],
"hora": "06:00",
"nome": "Oferta Revenda",
"notas": "",
"segs": [
"indeterminados"
],
"serie": "smupo22g3",
"tipo": "ofertas",
"execucao": "nao_enviado"
},
{
"id": "4gccvqbfe3mlh7ktdr9n",
"assunto": "",
"atualizadoEm": "2026-10-01T15:02:57.234Z",
"criadoEm": "2026-10-01T15:02:57.234Z",
"data": "2026-10-23",
"empresa": "lopes",
"estados": [
"MS",
"MT",
"RO",
"AC"
],
"hora": "06:00",
"nome": "Ofertas de Fim de Semana",
"notas": "",
"segs": [
"engajados",
"novos",
"indeterminados"
],
"serie": "smupnyjp3",
"tipo": "ofertas",
"execucao": "nao_enviado"
},
{
"id": "uvnxuo373h1aoc79tlyc",
"assunto": "",
"atualizadoEm": "2026-10-01T15:03:27.990Z",
"criadoEm": "2026-10-01T15:03:27.990Z",
"data": "2026-10-23",
"empresa": "opta",
"estados": [
"MS",
"MT"
],
"hora": "06:00",
"nome": "Opta News",
"notas": "",
"segs": [
"engajados",
"novos",
"indeterminados"
],
"serie": "smupnz7f6",
"tipo": "blog",
"execucao": "nao_enviado"
},
{
"id": "i6ydms87shzk6lixgk1p",
"assunto": "",
"atualizadoEm": "2026-10-01T15:00:15.418Z",
"criadoEm": "2026-10-01T14:54:10.274Z",
"data": "2026-10-26",
"empresa": "opta",
"estados": [
"MS",
"MT"
],
"hora": "06:00",
"nome": "Ofertas Corporativas",
"notas": "",
"segs": [
"engajados"
],
"serie": "smupnv2th",
"tipo": "ofertas",
"execucao": "nao_enviado"
},
{
"id": "irauglsh86lr8fvxmke3",
"assunto": "",
"atualizadoEm": "2026-10-01T15:01:43.765Z",
"criadoEm": "2026-10-01T15:01:43.765Z",
"data": "2026-10-26",
"empresa": "lopes",
"estados": [
"MS",
"MT",
"RO",
"AC"
],
"hora": "06:00",
"nome": "Novidades da semana",
"notas": "",
"segs": [
"engajados"
],
"serie": "smupnwz0h",
"tipo": "novidades",
"execucao": "nao_enviado"
},
{
"id": "8ogtodrinq7qxemlj019",
"assunto": "",
"atualizadoEm": "2026-10-01T15:05:41.582Z",
"criadoEm": "2026-10-01T14:50:11.804Z",
"data": "2026-10-28",
"empresa": "opta",
"estados": [
"MS",
"MT"
],
"hora": "06:00",
"nome": "Oferta Revenda",
"notas": "",
"segs": [
"indeterminados"
],
"serie": "smupo22g3",
"tipo": "ofertas",
"execucao": "nao_enviado"
},
{
"id": "wn7zapzj536fpm6hsk7t",
"assunto": "Tenha todo mix da Lopes na palma da sua mão",
"atualizadoEm": "2026-10-01T15:04:18.846Z",
"criadoEm": "2026-10-01T14:48:54.644Z",
"data": "2026-10-28",
"empresa": "lopes",
"estados": [
"MS",
"MT",
"RO",
"AC"
],
"hora": "06:00",
"nome": "Compre de qualquer Lugar",
"notas": "- falar do site e do Aplicativo",
"segs": [
"indeterminados"
],
"serie": "smupo0aml",
"tipo": "institucional",
"execucao": "nao_enviado"
},
{
"id": "z455lnq8kgmai5k5gc3g",
"assunto": "",
"atualizadoEm": "2026-10-01T15:03:27.990Z",
"criadoEm": "2026-10-01T15:03:27.990Z",
"data": "2026-10-30",
"empresa": "opta",
"estados": [
"MS",
"MT"
],
"hora": "06:00",
"nome": "Opta News",
"notas": "",
"segs": [
"engajados",
"novos",
"indeterminados"
],
"serie": "smupnz7f6",
"tipo": "blog",
"execucao": "nao_enviado"
},
{
"id": "zqqbb41gzui54tajidij",
"assunto": "",
"atualizadoEm": "2026-10-01T15:02:57.234Z",
"criadoEm": "2026-10-01T15:02:57.234Z",
"data": "2026-10-30",
"empresa": "lopes",
"estados": [
"MS",
"MT",
"RO",
"AC"
],
"hora": "06:00",
"nome": "Ofertas de Fim de Semana",
"notas": "",
"segs": [
"engajados",
"novos",
"indeterminados"
],
"serie": "smupnyjp3",
"tipo": "ofertas",
"execucao": "nao_enviado"
}
],
"trafego_campanhas": [
{
"id": "gmxi0p0tdzvsdwnybymq",
"atualizadoEm": "2026-10-01T17:23:03.765Z",
"conjuntos": [
{
"criativos": {
"carrossel": 0,
"carrosselDesc": "",
"estatico": 2,
"estaticoDesc": "",
"video": 4,
"videoDesc": ""
},
"nome": "Advantage + publico aberto"
},
{
"criativos": {
"carrossel": 0,
"carrosselDesc": "",
"estatico": 2,
"estaticoDesc": "",
"video": 4,
"videoDesc": ""
},
"nome": "Mix Publico Frio (lookalike + interesses)"
}
],
"criadoEm": "2026-10-01T15:39:00.731Z",
"cta": "Ver mais",
"empresa": "opta",
"fim": "2026-10-31",
"frase": "",
"inicio": "2026-10-05",
"link": "https://www.instagram.com/optasuprimentos/",
"nome": "Reconhecimento de Marca",
"objetivo": "reconhecimento",
"publicoDet": "acima de 22 anos e abaixo de 55 anos",
"publicos": [
"frio",
"semelhante",
"aberto"
],
"regioes": [
"MS",
"MT"
],
"tipo": "institucional",
"tipoOutro": "",
"verba": 800,
"statusCampanha": "planejamento",
"verbaInvestida": 0
},
{
"id": "xhq7cm1my575oql5vu90",
"atualizadoEm": "2026-10-01T17:43:12.161Z",
"conjuntos": [
{
"criativos": {
"carrossel": 0,
"carrosselDesc": "",
"estatico": 2,
"estaticoDesc": "",
"video": 2,
"videoDesc": ""
},
"nome": "MS e MT"
},
{
"criativos": {
"carrossel": 0,
"carrosselDesc": "",
"estatico": 2,
"estaticoDesc": "",
"video": 2,
"videoDesc": ""
},
"nome": "RO e AC"
}
],
"criadoEm": "2026-10-01T17:43:12.161Z",
"cta": "Ver mais",
"empresa": "lopes",
"fim": "2026-10-31",
"frase": "",
"inicio": "2026-10-05",
"link": "https://www.instagram.com/distribuidoralopes/",
"nome": "Reconhecimento de marca",
"objetivo": "reconhecimento",
"publicoDet": "",
"publicos": [
"frio",
"semelhante",
"lista"
],
"regioes": [
"MS",
"MT",
"RO",
"AC"
],
"tipo": "institucional",
"tipoOutro": "",
"verba": 500,
"statusCampanha": "planejamento",
"verbaInvestida": 0
},
{
"id": "bju0hp3lw486nl3q9y1m",
"atualizadoEm": "2026-10-01T18:03:28.160Z",
"conjuntos": [
{
"criativos": {
"carrossel": 0,
"carrosselDesc": "",
"estatico": 2,
"estaticoDesc": "",
"video": 3,
"videoDesc": ""
},
"nome": "publico aberto (advantage+)"
},
{
"criativos": {
"carrossel": 0,
"carrosselDesc": "",
"estatico": 2,
"estaticoDesc": "",
"video": 3,
"videoDesc": ""
},
"nome": "Mix de publico Frio"
},
{
"criativos": {
"carrossel": 2,
"carrosselDesc": "",
"estatico": 0,
"estaticoDesc": "",
"video": 0,
"videoDesc": ""
},
"nome": "carrossel de produtos + publico frio"
}
],
"criadoEm": "2026-10-01T18:03:28.160Z",
"cta": "Comprar agora",
"empresa": "lopes",
"fim": "2026-10-31",
"frase": "",
"inicio": "2026-10-09",
"link": "https://distribuidoralopes.com.br/",
"nome": "Site",
"objetivo": "trafego",
"publicoDet": "",
"publicos": [
"semelhante",
"remarketing",
"site",
"aberto"
],
"regioes": [
"MS",
"MT",
"RO",
"AC"
],
"tipo": "leads",
"tipoOutro": "",
"verba": 1000,
"statusCampanha": "planejamento",
"verbaInvestida": 0
},
{
"id": "jgcmpu8bzs1yjxfau391",
"atualizadoEm": "2026-10-01T17:55:42.841Z",
"conjuntos": [
{
"criativos": {
"carrossel": 0,
"carrosselDesc": "",
"estatico": 3,
"estaticoDesc": "",
"video": 3,
"videoDesc": ""
},
"nome": "MS"
},
{
"criativos": {
"carrossel": 0,
"carrosselDesc": "",
"estatico": 3,
"estaticoDesc": "",
"video": 3,
"videoDesc": ""
},
"nome": "MT"
},
{
"criativos": {
"carrossel": 0,
"carrosselDesc": "",
"estatico": 3,
"estaticoDesc": "",
"video": 3,
"videoDesc": ""
},
"nome": "RO"
},
{
"criativos": {
"carrossel": 0,
"carrosselDesc": "",
"estatico": 3,
"estaticoDesc": "",
"video": 3,
"videoDesc": ""
},
"nome": "AC"
}
],
"criadoEm": "2026-10-01T17:55:42.841Z",
"cta": "Enviar mensagem pelo WhatsApp",
"empresa": "lopes",
"fim": "2026-10-31",
"frase": "LP.01  Olá vii o anuncio e quero saber mais!",
"inicio": "2026-10-15",
"link": "",
"nome": "Captação de Leads",
"objetivo": "engajamento",
"publicoDet": "",
"publicos": [
"lista",
"aberto"
],
"regioes": [
"MS",
"MT",
"RO",
"AC"
],
"tipo": "leads",
"tipoOutro": "",
"verba": 1000,
"statusCampanha": "planejamento",
"verbaInvestida": 0
},
{
"id": "u0esaduo6te6ax4t3vem",
"atualizadoEm": "2026-10-01T17:15:55.477Z",
"conjuntos": [
{
"criativos": {
"carrossel": 0,
"carrosselDesc": "",
"estatico": 2,
"estaticoDesc": "",
"video": 4,
"videoDesc": ""
},
"nome": "Lista de Clientes (OPTA 01)"
},
{
"criativos": {
"carrossel": 0,
"carrosselDesc": "",
"estatico": 2,
"estaticoDesc": "",
"video": 4,
"videoDesc": ""
},
"nome": "Lookalike + mix publico frio"
},
{
"criativos": {
"carrossel": 0,
"carrosselDesc": "",
"estatico": 2,
"estaticoDesc": "",
"video": 4,
"videoDesc": ""
},
"nome": "Mix de publico Quente - quem interagiu com a campanha de reconhecimento + redes"
}
],
"criadoEm": "2026-10-01T16:52:24.810Z",
"cta": "Enviar mensagem pelo WhatsApp",
"empresa": "opta",
"fim": "2026-10-31",
"frase": "OP.01 - Olá vi o anuncio no Facebook| Instagram e quero saber mais informações!",
"inicio": "2026-10-15",
"link": "",
"nome": "Engajamento Whatsapp",
"objetivo": "engajamento",
"publicoDet": "",
"publicos": [
"frio",
"semelhante",
"lista"
],
"regioes": [
"MS",
"MT"
],
"tipo": "leads",
"tipoOutro": "",
"verba": 1000,
"statusCampanha": "planejamento",
"verbaInvestida": 0
},
{
"id": "w7hyd62t7gihgkk0g12c",
"atualizadoEm": "2026-10-01T17:31:55.196Z",
"conjuntos": [
{
"criativos": {
"carrossel": 0,
"carrosselDesc": "",
"estatico": 2,
"estaticoDesc": "Saiba quanto sua empresa gasta em suprimentos",
"video": 1,
"videoDesc": "Calcule quanto tempo sua equipe perde com a compra de suprimentos descentralizados"
},
"nome": "Lista de clientes"
}
],
"criadoEm": "2026-10-01T17:29:01.249Z",
"cta": "Cadastre-se",
"empresa": "opta",
"fim": "2026-10-31",
"frase": "",
"inicio": "2026-10-15",
"link": "",
"nome": "Formulário Nativo",
"objetivo": "cadastros",
"publicoDet": "",
"publicos": [
"lista"
],
"regioes": [
"MS",
"MT"
],
"tipo": "leads",
"tipoOutro": "",
"verba": 700,
"statusCampanha": "planejamento",
"verbaInvestida": 0
},
{
"id": "v9jjpjc8tcp1s5tx6ubb",
"atualizadoEm": "2026-10-01T18:06:54.655Z",
"conjuntos": [
{
"criativos": {
"carrossel": 0,
"carrosselDesc": "",
"estatico": 2,
"estaticoDesc": "",
"video": 1,
"videoDesc": ""
},
"nome": "remarketing"
}
],
"criadoEm": "2026-10-01T18:06:54.655Z",
"cta": "Comprar agora",
"empresa": "lopes",
"fim": "2026-10-31",
"frase": "",
"inicio": "2026-10-15",
"link": "https://distribuidoralopes.com.br/",
"nome": "Remarketing",
"objetivo": "trafego",
"publicoDet": "",
"publicos": [
"semelhante",
"remarketing",
"site",
"lista"
],
"regioes": [
"MS",
"MT",
"RO",
"AC"
],
"tipo": "remarketing",
"tipoOutro": "",
"verba": 500,
"statusCampanha": "planejamento",
"verbaInvestida": 0
}
]
};
}
