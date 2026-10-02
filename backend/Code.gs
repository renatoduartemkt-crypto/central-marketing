/**
 * Central de Marketing · Grupo Lopes — BACKEND (API)
 * Banco de dados numa Planilha Google + este Apps Script publicado como App da Web.
 * As telas do site ficam no GitHub Pages e conversam com este backend pelo link /exec.
 *
 * Como funciona
 *  - O site faz POST no link /exec com {"fn":"api","args":[{acao, token, ...}]} (Content-Type text/plain).
 *  - Cada coleção do site é uma aba da planilha (emails, posts, eventos, custos, brindes, ...).
 *    Colunas: id | dados (JSON) | criado_em | atualizado_em | atualizado_por | dados_2 ... (JSON muito grande é dividido)
 *  - Toda ação fica registrada na aba "_log" (data, usuário, ação, coleção, id, resumo).
 *  - Toda movimentação de brindes também vai, legível, para a aba "Movimentações de brindes".
 *  - Relatórios em PDF são salvos na pasta "Central de Marketing - Relatórios" do Drive.
 *  - Acesso por USUÁRIO e SENHA, cadastrados pelo administrador na página Usuários.
 *    Implantação: "Executar como: Eu" + "Qualquer pessoa". A planilha fica PRIVADA na conta do dono.
 *  - Senhas guardadas só como hash (HMAC-SHA256 com sal e segredo do servidor, 1.000 rodadas). Nunca saem do servidor.
 *  - Sessão: token aleatório guardado no cache do script, expira após 6 horas sem uso.
 *  - 5 senhas erradas seguidas bloqueiam o usuário por 15 minutos.
 *  - Só administradores aprovam/recusam custos e cadastram, alteram, bloqueiam ou excluem usuários (validado aqui no servidor).
 *
 * Primeiro acesso do administrador (uma vez, pelo editor):
 *  1. Em Propriedades do script, crie ADMIN_SENHA_INICIAL com uma senha provisória (mín. 8 caracteres).
 *  2. Rode a função criarAdministrador. Ela cria o usuário de ADMIN_USUARIO e APAGA a propriedade da senha.
 *  3. Entre no site com esse usuário e a senha provisória; o sistema pede para trocar a senha.
 *
 * Propriedades do script (Configurações do projeto → Propriedades do script):
 *  ADMIN_USUARIO        login do administrador (padrão: renatoduarte.mkt@gmail.com)
 *  ADMIN_SENHA_INICIAL  senha provisória, lida e apagada por criarAdministrador
 *  ADMINISTRADORES      logins que sempre são administradores, separados por vírgula (opcional)
 *  SEGREDO              gerado automaticamente; NÃO apague (invalida todas as senhas)
 *  PLANILHA_ID          id da planilha (se o script NÃO estiver vinculado a ela)
 *  PASTA_RELATORIOS     id da pasta do Drive para os PDFs (senão cria "Central de Marketing - Relatórios")
 *  IMPORTACAO_ID        id da planilha de importação de metas/projetado (usada por importarMetas)
 *
 * IMPORTANTE (armadilhas conhecidas): ao alterar este arquivo, cole-o INTEIRO no editor e crie uma
 * NOVA VERSÃO da implantação (Implantar → Gerenciar implantações → editar → Nova versão).
 */

const COLECOES = ['usuarios', 'emails', 'trafego_campanhas', 'posts', 'eventos', 'custos', 'centros_custo', 'brindes', 'brindes_mov',
                  'producao', 'metas_ecommerce', 'metas_mensais', 'tarefas'];
const CHUNK = 45000;           // limite seguro por célula (o Sheets aceita 50.000 caracteres)
const ABA_LOG = '_log';
const ABA_MOV = 'Movimentações de brindes';

/* ======================= entrada da API (site no GitHub) ======================= */

const VERSAO_API = '2026-10-02';

/** Abrir o link /exec no navegador mostra só o status do backend (as telas ficam no GitHub). */
function doGet() {
  return resposta_({ ok: true, app: 'Central de Marketing · Grupo Lopes', tipo: 'backend', versao: VERSAO_API });
}

/** O site chama: POST /exec, corpo {"fn":"api"|"salvarRelatorio","args":[...]}. Só essas duas funções são aceitas. */
function doPost(e) {
  let req;
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return resposta_({ erro: 'Pedido inválido.' }); }
  const args = Array.isArray(req.args) ? req.args : [];
  try {
    if (req.fn === 'api') return resposta_({ result: api(args[0]) });
    if (req.fn === 'salvarRelatorio') return resposta_({ result: salvarRelatorio(args[0], args[1], args[2]) });
    return resposta_({ erro: 'Função não permitida.' });
  } catch (err) {
    return resposta_({ erro: err && err.message ? err.message : String(err) });
  }
}

function resposta_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* ======================= API ======================= */

function api(req) {
  try {
    req = req || {};
    if (req.acao === 'login') return login_(req.usuario, req.senha);

    const eu = sessao_(req.token);
    if (!eu) return { erro: 'Sua sessão expirou. Entre de novo.', codigo: 'unauthenticated' };

    if (req.acao === 'me') return { usuario: publico_(eu) };
    if (req.acao === 'logout') { CacheService.getScriptCache().remove('s:' + String(req.token)); return { ok: true }; }
    if (req.acao === 'trocarSenha') return trocarSenha_(eu, req.atual, req.nova);
    if (eu.trocarSenha) return { erro: 'Troque a senha provisória para continuar.', codigo: 'trocar_senha' };

    switch (req.acao) {
      case 'criarUsuario':   return criarUsuario_(eu, req);
      case 'salvarUsuario':  return salvarUsuario_(eu, req);
      case 'redefinirSenha': return redefinirSenha_(eu, req.id, req.senha);
      case 'excluirUsuario': return excluirUsuario_(eu, req.id);
    }

    if (req.acao === 'listarVarias') {
      const out = {};
      (req.colecoes || []).forEach(function (c) { if (COLECOES.indexOf(c) >= 0) out[c] = listarPublico_(c); });
      return { colecoes: out };
    }
    const col = req.colecao;
    if (COLECOES.indexOf(col) < 0) return { erro: 'Coleção desconhecida: ' + col };
    if (col === 'usuarios' && req.acao !== 'listar') return { erro: 'Use a página Usuários para alterar cadastros.' };
    switch (req.acao) {
      case 'listar':  return { itens: listarPublico_(col) };
      case 'criar':   return escrever_(eu, col, null, req.dados, 'criar');
      case 'gravar':  return escrever_(eu, col, String(req.id), req.dados, 'gravar');
      case 'mesclar': return escrever_(eu, col, String(req.id), req.dados, 'mesclar');
      case 'excluir': return excluir_(eu, col, String(req.id));
    }
    return { erro: 'Ação desconhecida: ' + req.acao };
  } catch (err) {
    return { erro: err && err.message ? err.message : String(err) };
  }
}

/* PDF de relatório → pasta no Drive. Retorna o link. */
function salvarRelatorio(token, base64, nome) {
  const eu = sessao_(token);
  if (!eu || eu.trocarSenha) throw new Error('Sua sessão expirou. Entre de novo.');
  const email = eu.email;
  const pasta = pastaRelatorios_();
  const blob = Utilities.newBlob(Utilities.base64Decode(base64), 'application/pdf', String(nome || 'relatorio.pdf'));
  const f = pasta.createFile(blob);
  log_(email, 'relatório PDF', '', f.getId(), f.getName());
  return { url: f.getUrl(), id: f.getId(), nome: f.getName() };
}

/* ======================= usuários e permissões ======================= */

function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }
function lista_(k) { return prop_(k).split(',').map(function (x) { return x.trim().toLowerCase(); }).filter(String); }
function docId_(login) { return String(login).trim().toLowerCase().replace(/[^a-z0-9_.@+-]/g, '_'); }
function loginOk_(login) { return /^[a-z0-9_.@+-]{3,80}$/.test(login); }
const SEGREDOS_ = ['senhaHash', 'sal', 'iter'];

/* Usuário completo (com hash) — só para uso interno do servidor. "email" = login, por compatibilidade com as páginas. */
function usuario_(login) {
  login = String(login || '').trim().toLowerCase();
  if (!login) return null;
  const u = ler_('usuarios', docId_(login));
  if (!u) return null;
  const out = Object.assign({}, u.dados, { email: login, usuario: login });
  if (lista_('ADMINISTRADORES').indexOf(login) >= 0) out.perfil = 'admin';
  return out;
}
function publico_(u) { const o = Object.assign({}, u); SEGREDOS_.forEach(function (k) { delete o[k]; }); return o; }
function listarPublico_(col) { const L = listar_(col); return col === 'usuarios' ? L.map(function (u) { return publico_(Object.assign({}, u, { email: u.id, usuario: u.id })); }) : L; }
function isAdmin_(u) { return !!u && (u.perfil === 'admin' || lista_('ADMINISTRADORES').indexOf(u.email) >= 0); }

/* ---------- senhas ---------- */
function segredo_() {
  let k = prop_('SEGREDO');
  if (!k) { k = Utilities.getUuid() + Utilities.getUuid(); PropertiesService.getScriptProperties().setProperty('SEGREDO', k); }
  return k;
}
function hash_(senha, sal, iter) {
  const chave = Utilities.newBlob(segredo_() + ':' + sal).getBytes();
  let h = Utilities.computeHmacSha256Signature(Utilities.newBlob(String(senha)).getBytes(), chave);
  for (let i = 1; i < iter; i++) h = Utilities.computeHmacSha256Signature(h, chave);
  return Utilities.base64Encode(h);
}
function iguais_(a, b) { a = String(a); b = String(b); let d = a.length ^ b.length; for (let i = 0; i < Math.min(a.length, b.length); i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
function senhaFraca_(s) {
  s = String(s || '');
  if (s.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (!/[a-zA-Z]/.test(s) || !/[0-9]/.test(s)) return 'Use letras e números na senha.';
  return '';
}
function comSenha_(dados, senha) {
  const sal = Utilities.getUuid().replace(/-/g, '');
  return Object.assign(dados, { sal: sal, iter: 1000, senhaHash: hash_(senha, sal, 1000) });
}

/* ---------- sessão ---------- */
const SESSAO_SEG = 21600;   // 6 horas (máximo do CacheService), renovada a cada uso
function sessao_(token) {
  token = String(token || '');
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const c = CacheService.getScriptCache();
  const login = c.get('s:' + token);
  if (!login) return null;
  const u = usuario_(login);
  if (!u || u.ativo === false) { c.remove('s:' + token); return null; }
  c.put('s:' + token, login, SESSAO_SEG);
  return u;
}
function login_(login, senha) {
  login = String(login || '').trim().toLowerCase();
  const falha = { erro: 'Usuário ou senha incorretos.', codigo: 'login' };
  if (!loginOk_(login) || !senha) return falha;
  const c = CacheService.getScriptCache(), kf = 'f:' + docId_(login);
  const tentativas = Number(c.get(kf) || 0);
  if (tentativas >= 5) return { erro: 'Muitas tentativas erradas. Aguarde 15 minutos ou peça ao administrador para redefinir sua senha.', codigo: 'login' };
  const u = usuario_(login);
  if (!u || !u.senhaHash || u.ativo === false || !iguais_(hash_(senha, u.sal, u.iter || 1000), u.senhaHash)) {
    c.put(kf, String(tentativas + 1), 900);
    if (u) log_(login, 'login recusado', 'usuarios', docId_(login), 'senha incorreta ou usuário bloqueado');
    return falha;
  }
  c.remove(kf);
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').toLowerCase();
  c.put('s:' + token, login, SESSAO_SEG);
  comLock_(function () { const a = ler_('usuarios', docId_(login)); gravarLinha_('usuarios', docId_(login), Object.assign({}, a.dados, { ultimoAcesso: new Date().toISOString() }), login, false); });
  log_(login, 'login', 'usuarios', docId_(login), '');
  return { token: token, usuario: publico_(usuario_(login)) };
}
function trocarSenha_(eu, atual, nova) {
  if (!iguais_(hash_(atual, eu.sal, eu.iter || 1000), eu.senhaHash)) return { erro: 'A senha atual não confere.' };
  const fraca = senhaFraca_(nova); if (fraca) return { erro: fraca };
  if (String(nova) === String(atual)) return { erro: 'A nova senha precisa ser diferente da atual.' };
  comLock_(function () {
    const a = ler_('usuarios', docId_(eu.email));
    const d = comSenha_(Object.assign({}, a.dados), nova); d.trocarSenha = false; d.senhaTrocadaEm = new Date().toISOString();
    gravarLinha_('usuarios', docId_(eu.email), d, eu.email, false);
  });
  log_(eu.email, 'troca de senha', 'usuarios', docId_(eu.email), '');
  return { ok: true, usuario: publico_(usuario_(eu.email)) };
}

/* ---------- cadastro de usuários (página Usuários) ---------- */
function soAdmin_(eu) { if (!isAdmin_(eu)) throw new Error('Só o administrador cadastra e altera usuários.'); }
function criarUsuario_(eu, r) {
  soAdmin_(eu);
  const login = String(r.usuario || '').trim().toLowerCase();
  if (!loginOk_(login)) return { erro: 'Usuário inválido: use de 3 a 80 letras minúsculas, números, ponto, hífen ou @ (sem espaços).' };
  const nome = String(r.nome || '').trim(), cargo = String(r.cargo || '').trim();
  if (!nome || !cargo) return { erro: 'Informe nome e cargo.' };
  const fraca = senhaFraca_(r.senha); if (fraca) return { erro: fraca };
  return comLock_(function () {
    if (ler_('usuarios', docId_(login))) return { erro: 'Este usuário já existe.' };
    const d = comSenha_({ nome: nome, cargo: cargo, perfil: r.perfil === 'admin' ? 'admin' : 'editor', ativo: true, trocarSenha: true,
      criadoEm: new Date().toISOString(), criadoPor: eu.email }, r.senha);
    gravarLinha_('usuarios', docId_(login), d, eu.email, true);
    log_(eu.email, 'criar usuário', 'usuarios', docId_(login), nome + ' · ' + cargo + ' · ' + d.perfil);
    return { item: publico_(usuario_(login)) };
  });
}
function salvarUsuario_(eu, r) {
  const login = String(r.id || '').trim().toLowerCase();
  const self = login === eu.email;
  if (!self) soAdmin_(eu);
  return comLock_(function () {
    const a = ler_('usuarios', docId_(login)); if (!a) return { erro: 'Usuário não encontrado.' };
    const d = Object.assign({}, a.dados);
    if (r.nome != null) d.nome = String(r.nome).trim() || d.nome;
    if (r.cargo != null) d.cargo = String(r.cargo).trim() || d.cargo;
    if (isAdmin_(eu) && !self) {
      if (r.perfil) d.perfil = r.perfil === 'admin' ? 'admin' : 'editor';
      if (r.ativo != null) d.ativo = !!r.ativo;
    } else if ((r.perfil && r.perfil !== (d.perfil || 'editor')) || (r.ativo != null && !!r.ativo !== (d.ativo !== false))) {
      return { erro: self ? 'Você não pode mudar o próprio perfil nem se bloquear.' : 'Só o administrador muda perfis.' };
    }
    d.atualizadoEm = new Date().toISOString(); d.atualizadoPor = eu.email;
    gravarLinha_('usuarios', docId_(login), d, eu.email, false);
    log_(eu.email, 'alterar usuário', 'usuarios', docId_(login), resumo_(publico_(d)));
    return { item: publico_(usuario_(login)) };
  });
}
function redefinirSenha_(eu, id, senha) {
  soAdmin_(eu);
  const login = String(id || '').trim().toLowerCase();
  if (login === eu.email) return { erro: 'Para a sua própria senha, use “Trocar minha senha”.' };
  const fraca = senhaFraca_(senha); if (fraca) return { erro: fraca };
  return comLock_(function () {
    const a = ler_('usuarios', docId_(login)); if (!a) return { erro: 'Usuário não encontrado.' };
    const d = comSenha_(Object.assign({}, a.dados), senha); d.trocarSenha = true;
    gravarLinha_('usuarios', docId_(login), d, eu.email, false);
    CacheService.getScriptCache().remove('f:' + docId_(login));
    log_(eu.email, 'redefinir senha', 'usuarios', docId_(login), 'senha provisória definida');
    return { item: publico_(usuario_(login)) };
  });
}
function excluirUsuario_(eu, id) {
  soAdmin_(eu);
  const login = String(id || '').trim().toLowerCase();
  if (login === eu.email) return { erro: 'Você não pode excluir o próprio usuário.' };
  return comLock_(function () {
    const a = ler_('usuarios', docId_(login)); if (!a) return { ok: true };
    aba_('usuarios').deleteRow(a.linha);
    log_(eu.email, 'excluir usuário', 'usuarios', docId_(login), resumo_(publico_(a.dados)));
    return { ok: true };
  });
}

/* Aprovar/recusar é só para administradores. Procura, no registro antigo e no novo, todo objeto com "status"
   (no próprio registro ou dentro de listas, ex.: custos[] de um evento, aditivos[] de contratos)
   e bloqueia quem não é admin de mudar um status para "aprovado" ou "recusado". */
function statusMap_(obj, path, out) {
  if (!obj || typeof obj !== 'object') return out;
  if (Array.isArray(obj)) { obj.forEach(function (x, i) { statusMap_(x, path + '[' + (x && x.id ? x.id : i) + ']', out); }); return out; }
  if (typeof obj.status === 'string') out[path] = obj.status;
  Object.keys(obj).forEach(function (k) { if (obj[k] && typeof obj[k] === 'object') statusMap_(obj[k], path + '.' + k, out); });
  return out;
}
function checarAprovacao_(eu, antigo, novo) {
  if (isAdmin_(eu)) return;
  const a = statusMap_(antigo || {}, '', {}), n = statusMap_(novo || {}, '', {});
  Object.keys(n).forEach(function (k) {
    if ((n[k] === 'aprovado' || n[k] === 'recusado') && a[k] !== n[k]) throw new Error('Só administradores podem aprovar ou recusar.');
  });
  // produção: "produzindo"/"entregue" exigem que já esteja aprovado
  if (novo && (novo.status === 'produzindo' || novo.status === 'entregue') && antigo && ['aprovado', 'produzindo', 'entregue'].indexOf(antigo.status) < 0) throw new Error('O pedido precisa estar aprovado.');
}
/* ======================= planilha ======================= */

function ss_() {
  const id = prop_('PLANILHA_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}
function aba_(nome) {
  const ss = ss_();
  let sh = ss.getSheetByName(nome);
  if (!sh) {
    sh = ss.insertSheet(nome);
    sh.getRange(1, 1, 1, 5).setValues([['id', 'dados', 'criado_em', 'atualizado_em', 'atualizado_por']]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function linhas_(nome) {
  const sh = aba_(nome);
  const n = sh.getLastRow();
  if (n < 2) return { sh: sh, rows: [] };
  const w = Math.max(5, sh.getLastColumn());
  return { sh: sh, rows: sh.getRange(2, 1, n - 1, w).getValues() };
}
function json_(row) {
  let s = String(row[1] || '');
  for (let i = 5; i < row.length; i++) if (row[i]) s += String(row[i]);
  try { return JSON.parse(s || '{}'); } catch (e) { return {}; }
}
function listar_(nome) {
  return linhas_(nome).rows.filter(function (r) { return r[0] !== ''; }).map(function (r) { return Object.assign({ id: String(r[0]) }, json_(r)); });
}
function ler_(nome, id) {
  const L = linhas_(nome).rows;
  for (let i = 0; i < L.length; i++) if (String(L[i][0]) === String(id)) return { linha: i + 2, dados: json_(L[i]), criado: L[i][2] };
  return null;
}
function gravarLinha_(nome, id, dados, email, novo) {
  const sh = aba_(nome);
  const s = JSON.stringify(dados);
  const partes = [];
  for (let i = 0; i < s.length; i += CHUNK) partes.push(s.slice(i, i + CHUNK));
  if (!partes.length) partes.push('{}');
  const agora = new Date().toISOString();
  const atual = novo ? null : ler_(nome, id);
  const row = [id, partes[0], atual ? atual.criado : agora, agora, email].concat(partes.slice(1));
  const largura = Math.max(sh.getLastColumn(), row.length);
  while (row.length < largura) row.push('');
  if (atual) sh.getRange(atual.linha, 1, 1, row.length).setValues([row]);
  else sh.appendRow(row);
}
function comLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function escrever_(eu, col, id, dados, acao) {
  dados = dados || {};
  return comLock_(function () {
    const antigo = id ? ler_(col, id) : null;
    let final;
    if (acao === 'mesclar') {
      if (!antigo) throw new Error('Registro não encontrado.');
      final = Object.assign({}, antigo.dados, dados);
    } else final = Object.assign({}, dados);
    if (!id) id = Utilities.getUuid().replace(/-/g, '').slice(0, 20);
    checarAprovacao_(eu, antigo && antigo.dados, final);
    final.atualizadoEm = new Date().toISOString();
    final.atualizadoPor = eu.email;                 // o servidor sempre carimba quem gravou
    if (!antigo && !final.criadoEm) final.criadoEm = final.atualizadoEm;
    gravarLinha_(col, id, final, eu.email, !antigo);
    log_(eu.email, acao, col, id, resumo_(acao === 'mesclar' ? dados : final));
    if (col === 'brindes_mov' && !antigo) movimentacao_(final, eu);
    return { id: id, item: Object.assign({ id: id }, final) };
  });
}
function excluir_(eu, col, id) {
  return comLock_(function () {
    const antigo = ler_(col, id);
    if (!antigo) return { ok: true };
    if (col === 'brindes_mov') throw new Error('Movimentações de brindes não podem ser apagadas. Use “Estornar”.');
    if (antigo.dados && antigo.dados.status === 'aprovado' && !isAdmin_(eu)) throw new Error('Só administradores excluem registros aprovados.');
    aba_(col).deleteRow(antigo.linha);
    log_(eu.email, 'excluir', col, id, resumo_(antigo.dados));
    return { ok: true };
  });
}

/* ======================= registros legíveis ======================= */

function resumo_(o) { const s = JSON.stringify(o || {}); return s.length > 300 ? s.slice(0, 297) + '...' : s; }
function log_(email, acao, col, id, texto) {
  try {
    const ss = ss_();
    let sh = ss.getSheetByName(ABA_LOG);
    if (!sh) { sh = ss.insertSheet(ABA_LOG); sh.appendRow(['data_hora', 'usuario', 'acao', 'colecao', 'id', 'resumo']); sh.setFrozenRows(1); sh.getRange(1, 1, 1, 6).setFontWeight('bold'); }
    sh.appendRow([new Date(), email, acao, col, id, texto]);
  } catch (e) { console.error(e); }
}
function movimentacao_(m, eu) {
  const ss = ss_();
  let sh = ss.getSheetByName(ABA_MOV);
  if (!sh) {
    sh = ss.insertSheet(ABA_MOV);
    sh.appendRow(['Registrado em', 'Data', 'Brinde', 'Tipo', 'Quantidade', 'Saldo antes', 'Saldo depois', 'Destino / origem', 'Evento', 'Responsável', 'Registrado por', 'Valor da compra', 'NF', 'Observação']);
    sh.setFrozenRows(1); sh.getRange(1, 1, 1, 14).setFontWeight('bold');
  }
  const tipos = { saida: 'Entrega', entrada: 'Entrada', ajuste: 'Ajuste', estorno: 'Estorno' };
  sh.appendRow([new Date(), m.data || '', m.brindeNome || '', tipos[m.tipo] || m.tipo, Number(m.delta) || 0, Number(m.saldoAntes) || 0, Number(m.saldoApos) || 0,
    m.destino || '', m.eventoNome || '', m.responsavel || '', eu.email, m.valorCompra || '', m.nf || '', m.obs || '']);
}
function pastaRelatorios_() {
  const id = prop_('PASTA_RELATORIOS');
  if (id) return DriveApp.getFolderById(id);
  const it = DriveApp.getFoldersByName('Central de Marketing - Relatórios');
  if (it.hasNext()) return it.next();
  const f = DriveApp.createFolder('Central de Marketing - Relatórios');
  PropertiesService.getScriptProperties().setProperty('PASTA_RELATORIOS', f.getId());
  return f;
}

/* ======================= instalação ======================= */

/* Funções de manutenção só rodam pelo editor, na conta dona do script (nunca pelo site). */
function soEditor_() {
  const ativo = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  const dono = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (!ativo || ativo !== dono) throw new Error('Esta função só pode ser executada pelo editor do Apps Script.');
}

/** Rode uma vez pelo editor (menu de funções → instalar → Executar) para criar as abas e autorizar o acesso. */
function instalar() {
  soEditor_();
  COLECOES.forEach(aba_);
  log_('instalação', 'instalar', '', '', 'abas criadas');
  pastaRelatorios_();
  segredo_();
  return 'ok';
}

/**
 * Cria (ou recupera) o usuário administrador. Rode pelo editor depois de criar a propriedade ADMIN_SENHA_INICIAL.
 * A propriedade com a senha é apagada logo em seguida; no primeiro acesso o site pede uma senha nova.
 */
function criarAdministrador() {
  soEditor_();
  const P = PropertiesService.getScriptProperties();
  const login = (prop_('ADMIN_USUARIO') || 'renatoduarte.mkt@gmail.com').trim().toLowerCase();
  const senha = prop_('ADMIN_SENHA_INICIAL');
  if (!senha) throw new Error('Crie a propriedade do script ADMIN_SENHA_INICIAL com uma senha provisória e rode de novo.');
  const fraca = senhaFraca_(senha); if (fraca) throw new Error(fraca);
  if (!loginOk_(login)) throw new Error('ADMIN_USUARIO inválido.');
  comLock_(function () {
    const a = ler_('usuarios', docId_(login));
    const base = a ? Object.assign({}, a.dados) : { nome: 'Renato Duarte', cargo: 'Gerente de Marketing', criadoEm: new Date().toISOString() };
    const d = comSenha_(Object.assign(base, { perfil: 'admin', ativo: true, trocarSenha: true }), senha);
    gravarLinha_('usuarios', docId_(login), d, 'instalação', !a);
  });
  P.deleteProperty('ADMIN_SENHA_INICIAL');
  CacheService.getScriptCache().remove('f:' + docId_(login));
  log_('instalação', 'criar administrador', 'usuarios', docId_(login), 'senha provisória definida');
  return 'Administrador pronto: ' + login + '. Entre no site e troque a senha provisória.';
}

/** Importa os dados iniciais (data/*.json do pacote) colados na aba "_importar": coluna A = coleção, B = JSON da lista. */
function importarDados() {
  soEditor_();
  const sh = ss_().getSheetByName('_importar');
  if (!sh) throw new Error('Crie a aba _importar (A = coleção, B = JSON).');
  const L = sh.getDataRange().getValues();
  comLock_(function () {
    L.forEach(function (r) {
      const col = String(r[0] || '').trim(); if (COLECOES.indexOf(col) < 0) return;
      const itens = JSON.parse(String(r[1] || '[]'));
      itens.forEach(function (it) { const id = String(it.id); const d = Object.assign({}, it); delete d.id; if (!ler_(col, id)) gravarLinha_(col, id, d, 'importação', true); });
    });
  });
  return 'ok';
}

/**
 * Importa a planilha "Central de Marketing — Importação" (metas e projetado).
 * Copie as abas "Centros de custo", "Projetado", "Itens do planejamento", "Metas e-commerce" e "Metas de redes e ROAS"
 * para esta planilha (ou abra a planilha de importação e informe o id em IMPORTACAO_ID) e rode esta função.
 * Pode rodar quantas vezes quiser: os registros são atualizados, não duplicados.
 */
function importarMetas() {
  soEditor_();
  const idImp = prop_('IMPORTACAO_ID');
  const fonte = idImp ? SpreadsheetApp.openById(idImp) : ss_();
  const email = 'importação';
  const tab = function (nome) { const sh = fonte.getSheetByName(nome); if (!sh) return []; const v = sh.getDataRange().getValues(); const h = v.shift().map(String); return v.filter(function (r) { return r.some(function (x) { return x !== ''; }); }).map(function (r) { const o = {}; h.forEach(function (k, i) { o[k.trim()] = r[i]; }); return o; }); };
  const mes = function (v) { const m = v instanceof Date ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM') : String(v).trim().slice(0, 7); return /^\d{4}-\d{2}$/.test(m) ? m : ''; };
  const vazio = function (v) { return v === '' || v == null; };
  const num = function (v) { return v === '' || v == null ? 0 : Number(v) || 0; };
  const mensal = {};
  const doc = function (id, base) { if (!mensal[id]) { const a = ler_('metas_mensais', id); mensal[id] = Object.assign({}, a ? a.dados : {}, base); } return mensal[id]; };
  comLock_(function () {
    tab('Centros de custo').forEach(function (r) {
      const id = String(r['id']).trim(); if (!id) return;
      const a = ler_('centros_custo', id);
      gravarLinha_('centros_custo', id, Object.assign({}, a ? a.dados : {}, { nome: String(r['Nome']), codigo: String(r['Código contábil'] || ''), ordem: num(r['Ordem']) || 50, ativo: String(r['Ativo']).toLowerCase() !== 'não' }), email, !a);
    });
    tab('Projetado').forEach(function (r) {
      const m = mes(r['Mês']); const c = String(r['id do centro']).trim(); if (!m || !c) return;
      const d = doc('custos-' + m, { tipo: 'custos', mes: m }); d.projetado = d.projetado || {}; d.projetado[c] = num(r['Projetado (R$)']);
    });
    const itensPorMes = {};
    tab('Itens do planejamento').forEach(function (r) {
      const m = mes(r['Mês']); if (!m) return;
      (itensPorMes[m] = itensPorMes[m] || []).push({ centro: String(r['id do centro']).trim(), conta: String(r['Código contábil'] || ''), item: String(r['Item']), valor: num(r['Valor (R$)']) });
    });
    Object.keys(itensPorMes).forEach(function (m) { const d = doc('custos-' + m, { tipo: 'custos', mes: m }); d.itens = itensPorMes[m]; d.fonte = 'Planejamento financeiro 2026 — Setor de Marketing'; });
    tab('Metas e-commerce').forEach(function (r) {
      const m = mes(r['Mês']); const site = String(r['Site']).toLowerCase().indexOf('opta') >= 0 ? 'opta' : 'lopes'; if (!m) return;
      if (vazio(r['Meta de vendas (R$)']) && vazio(r['Meta de positivações'])) return;   // linha ainda não preenchida: não apaga o que já existe
      const d = doc(site === 'opta' ? 'ecom-opta-' + m : 'ecom-' + m, { tipo: 'ecommerce', site: site, mes: m });
      if (!vazio(r['Meta de vendas (R$)'])) d.metaVendas = num(r['Meta de vendas (R$)']);
      if (!vazio(r['Meta de positivações'])) d.metaPositivacoes = num(r['Meta de positivações']);
    });
    tab('Metas de redes e ROAS').forEach(function (r) {
      const m = mes(r['Mês']); if (!m) return;
      const d = doc('alcance-' + m, { tipo: 'alcance', mes: m });
      [['ig_lopes', 'Instagram Lopes (alcance)'], ['ig_opta', 'Instagram Opta (alcance)'], ['in_lopes', 'LinkedIn Lopes (interações)'], ['in_opta', 'LinkedIn Opta (seguidores)'], ['roas_email', 'ROAS E-mail (RD)'], ['roas_pago', 'ROAS Pago (Meta + Google)']].forEach(function (k) {
        if (r[k[1]] === '' || r[k[1]] == null) return; d[k[0]] = Object.assign({ realizado: 0 }, d[k[0]] || {}, { meta: num(r[k[1]]) });
      });
    });
    Object.keys(mensal).forEach(function (id) { const a = ler_('metas_mensais', id); const d = mensal[id]; d.atualizadoEm = new Date().toISOString(); d.atualizadoPor = email; gravarLinha_('metas_mensais', id, d, email, !a); });
  });
  log_(email, 'importar metas', 'metas_mensais', '', Object.keys(mensal).join(', '));
  return 'ok: ' + Object.keys(mensal).length + ' registros de metas/projetado';
}
