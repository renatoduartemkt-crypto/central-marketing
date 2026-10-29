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
 *  PASTA_ANEXOS         id da pasta privada dos anexos de tarefas e orçamentos (senão cria "Central de Marketing - Anexos")
 *  PASTA_PDL            id da pasta privada do PDL, com uma subpasta por colaborador (senão cria "Central de Marketing - PDL")
 *  PASTA_ENTRADA        id da pasta onde a rotina automática (Claude Cowork) deixa os arquivos JSON de dados (senão cria "Central de Marketing - Entrada automática")
 *  IMPORTACAO_ID        id da planilha de importação de metas/projetado (usada por importarMetas)
 *
 * IMPORTANTE (armadilhas conhecidas): ao alterar este arquivo, cole-o INTEIRO no editor e crie uma
 * NOVA VERSÃO da implantação (Implantar → Gerenciar implantações → editar → Nova versão).
 */

const COLECOES = ['usuarios', 'emails', 'trafego_campanhas', 'posts', 'eventos', 'custos', 'centros_custo', 'brindes', 'brindes_mov',
                  'producao', 'metas_ecommerce', 'metas_mensais', 'tarefas', 'trafego_recargas', 'trafego_relatorios',
                  'plan_config', 'plan_fases', 'plan_cotas', 'plan_eventos', 'plan_orcamento', 'plan_brindes', 'plan_acoes', 'plan_bi',
                  'rd_segmentacoes'];
// coleções de dinheiro das contas de anúncio: quem criou fica registrado pelo servidor; só o autor ou um administrador apaga
const COL_AUTORIA_ = ['trafego_recargas', 'trafego_relatorios'];
const CHUNK = 45000;           // limite seguro por célula (o Sheets aceita 50.000 caracteres)
const ABA_LOG = '_log';
const ABA_MOV = 'Movimentações de brindes';

/* ======================= entrada da API (site no GitHub) ======================= */

const VERSAO_API = '2026-10-29a';

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
      case 'anexoEnviar':    return anexoEnviar_(eu, req);
      case 'anexoBaixar':    return anexoBaixar_(eu, req.id);
      case 'anexoExcluir':   return anexoExcluir_(eu, req.id);
      case 'pdlListar':      return pdlListar_(eu);
      case 'pdlItem':        return pdlItem_(eu, req);
      case 'pdlItemExcluir': return pdlItemExcluir_(eu, req);
      case 'pdlCurso':       return pdlCurso_(eu, req);
      case 'pdlCursoExcluir':return pdlCursoExcluir_(eu, req);
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
  const c = CacheService.getScriptCache(), k = 'u:' + docId_(login);
  let u = null; try { const s = c.get(k); if (s) u = JSON.parse(s); } catch (e) {}
  if (!u) { u = ler_('usuarios', docId_(login)); if (!u) return null; u = { dados: u.dados }; try { c.put(k, JSON.stringify(u), CACHE_SEG); } catch (e) {} }
  const out = Object.assign({}, u.dados, { email: login, usuario: login });
  if (lista_('ADMINISTRADORES').indexOf(login) >= 0) out.perfil = 'admin';
  return out;
}
function usuarioCacheApagar_(id) { try { CacheService.getScriptCache().remove('u:' + String(id)); } catch (e) {} }
function publico_(u) { const o = Object.assign({}, u); SEGREDOS_.forEach(function (k) { delete o[k]; }); return o; }
function listarPublico_(col) { let L = cacheLer_(col); if (!L) { L = listar_(col); cacheGravar_(col, L); } return col === 'usuarios' ? L.map(function (u) { return publico_(Object.assign({}, u, { email: u.id, usuario: u.id })); }) : L; }
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
    // foto de perfil: imagem pequena (a página reduz para 192 px) guardada no próprio cadastro; "" remove
    if (r.foto !== undefined && r.foto !== null) {
      const f = String(r.foto);
      if (f && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(f)) return { erro: 'Foto inválida. Envie uma imagem JPG, PNG ou WEBP.' };
      if (f.length > 80000) return { erro: 'A foto ficou grande demais. Escolha outra imagem.' };
      d.foto = f;
    }
    if (isAdmin_(eu) && !self) {
      if (r.perfil) d.perfil = r.perfil === 'admin' ? 'admin' : 'editor';
      if (r.ativo != null) d.ativo = !!r.ativo;
    } else if ((r.perfil && r.perfil !== (d.perfil || 'editor')) || (r.ativo != null && !!r.ativo !== (d.ativo !== false))) {
      return { erro: self ? 'Você não pode mudar o próprio perfil nem se bloquear.' : 'Só o administrador muda perfis.' };
    }
    d.atualizadoEm = new Date().toISOString(); d.atualizadoPor = eu.email;
    gravarLinha_('usuarios', docId_(login), d, eu.email, false);
    usuarioCacheApagar_(docId_(login));
    log_(eu.email, 'alterar usuário', 'usuarios', docId_(login), resumo_(Object.assign(publico_(d), { foto: d.foto ? '(com foto)' : '' })));
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
    aba_('usuarios').deleteRow(a.linha); cacheApagar_('usuarios'); usuarioCacheApagar_(docId_(login));
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
/* Metas, projetado e centros de custo: só o administrador define ou altera.
   A equipe continua lançando o REALIZADO (vendas, alcance, ROAS realizado), mas não muda o objetivo. */
const CAMPOS_META_ = ['metaVendas', 'metaPositivacoes', 'projetado', 'itens', 'fonte'];
function checarMetas_(eu, col, antigo, novo) {
  if (isAdmin_(eu)) return;
  if (col === 'centros_custo') throw new Error('Só o administrador altera os centros de custo.');
  if (col !== 'metas_mensais') return;
  const a = antigo || {}, n = novo || {};
  const igual = function (x, y) { return JSON.stringify(x === undefined ? null : x) === JSON.stringify(y === undefined ? null : y); };
  const metaDe = function (v) { return v && typeof v === 'object' && !Array.isArray(v) && 'meta' in v ? Number(v.meta) || 0 : null; };
  Object.keys(Object.assign({}, a, n)).forEach(function (k) {
    if (CAMPOS_META_.indexOf(k) >= 0 && !igual(a[k], n[k])) throw new Error('Só o administrador altera metas e projetado.');
    const ma = metaDe(a[k]), mn = metaDe(n[k]);
    if ((ma !== null || mn !== null) && (ma || 0) !== (mn || 0)) throw new Error('Só o administrador altera metas e projetado.');
  });
}

/* Planejamento anual: a equipe propõe, o administrador aprova.
   - item novo da equipe entra sempre como "proposto"; do administrador, como "aprovado" (se não vier outro status)
   - item aprovado: a equipe só altera os campos de acompanhamento (situação da tarefa, etapa da negociação, observações)
   - plan_config (preços, vagas, ativos, linha de base): só o administrador */
const PLANO_LIVRES_ = { plan_fases: ['situacao', 'obs'], plan_cotas: ['etapa', 'obs', 'contato'], plan_orcamento: [] };
/* Eventos e brindes ainda em planejamento: cada item tem uma situação (etapa). A equipe cadastra e edita enquanto
   está em ideia/negociação/cotação; só o administrador confirma. Item confirmado fica travado para a equipe (só observação). */
const PLANO_ETAPAS_ = {
  plan_eventos: { todas: ['ideia', 'negociacao', 'confirmado', 'realizado', 'cancelado'], firmes: ['confirmado', 'realizado'] },
  plan_brindes: { todas: ['ideia', 'cotando', 'aprovado', 'comprado', 'entregue', 'cancelado'], firmes: ['aprovado', 'comprado', 'entregue'] },
  plan_acoes: { todas: ['ideia', 'planejando', 'aprovado', 'executada', 'cancelado'], firmes: ['aprovado', 'executada'] } };
const PLANO_SISTEMA_ = ['atualizadoEm', 'atualizadoPor', 'criadoEm', 'criadoPor', 'status'];
function checarPlano_(eu, col, antigo, novo) {
  if (col === 'plan_config') { if (!isAdmin_(eu)) throw new Error('Só o administrador altera as premissas do planejamento.'); return; }
  if (col === 'plan_bi') { if (!isAdmin_(eu)) throw new Error('Só o administrador altera a base de análise.'); return; }
  if (col in PLANO_ETAPAS_) { checarEtapa_(eu, col, antigo, novo); return; }
  if (!(col in PLANO_LIVRES_)) return;
  // lançamento do financeiro nasce como previsto (proposto) até o gerente aprovar, mesmo quando o gerente lança
  if (isAdmin_(eu)) { if (!antigo && !novo.status) novo.status = col === 'plan_orcamento' ? 'proposto' : 'aprovado'; return; }
  if (!antigo) { novo.status = 'proposto'; novo.criadoPor = eu.email; return; }
  if (antigo.status !== 'aprovado') { if (novo.status !== antigo.status && novo.status !== 'proposto') novo.status = antigo.status; return; }
  const igual = function (x, y) { return JSON.stringify(x === undefined ? null : x) === JSON.stringify(y === undefined ? null : y); };
  Object.keys(Object.assign({}, antigo, novo)).forEach(function (k) {
    if (PLANO_SISTEMA_.indexOf(k) >= 0 || PLANO_LIVRES_[col].indexOf(k) >= 0) return;
    if (!igual(antigo[k], novo[k])) throw new Error('Item já aprovado: só o administrador altera valores, datas e descrição.');
  });
  if (novo.status !== 'aprovado') throw new Error('Item já aprovado: só o administrador altera o status.');
}
function checarEtapa_(eu, col, antigo, novo) {
  const E = PLANO_ETAPAS_[col], firme = function (x) { return E.firmes.indexOf(x) >= 0; };
  if (!novo.etapa) novo.etapa = (antigo && antigo.etapa) || 'ideia';
  if (E.todas.indexOf(novo.etapa) < 0) throw new Error('Situação inválida.');
  if (!isAdmin_(eu)) {
    if (!antigo) novo.criadoPor = eu.email;
    if (antigo && firme(antigo.etapa)) {
      const igual = function (x, y) { return JSON.stringify(x === undefined ? null : x) === JSON.stringify(y === undefined ? null : y); };
      Object.keys(Object.assign({}, antigo, novo)).forEach(function (k) {
        if (PLANO_SISTEMA_.indexOf(k) >= 0 || k === 'obs') return;
        if (!igual(antigo[k], novo[k])) throw new Error('Item já confirmado: só o administrador altera.');
      });
    } else if (firme(novo.etapa)) throw new Error('Só o administrador confirma itens do planejamento.');
  }
  novo.status = firme(novo.etapa) ? 'aprovado' : (novo.etapa === 'cancelado' ? 'recusado' : 'proposto');
}

/* ======================= planilha ======================= */

let SS_ = null, TZ_ = null;   // abertos uma vez por pedido
function ss_() {
  if (SS_) return SS_;
  const id = prop_('PLANILHA_ID');
  SS_ = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  return SS_;
}
function tz_() { if (!TZ_) TZ_ = ss_().getSpreadsheetTimeZone(); return TZ_; }

/* ---------- cache das listas (CacheService) ----------
   A lista de cada coleção fica guardada até 10 minutos; qualquer gravação pelo site apaga o cache daquela coleção.
   Textos grandes são divididos em pedaços de 90 mil caracteres (limite do CacheService: 100 KB por chave). */
const CACHE_SEG = 600, CACHE_PED = 90000;
function cacheLer_(nome) {
  try {
    const c = CacheService.getScriptCache(), n = Number(c.get('c:' + nome + ':n') || 0);
    if (!n) return null;
    const ks = []; for (let i = 0; i < n; i++) ks.push('c:' + nome + ':' + i);
    const m = c.getAll(ks); let s = '';
    for (let i = 0; i < n; i++) { if (m[ks[i]] == null) return null; s += m[ks[i]]; }
    return JSON.parse(s);
  } catch (e) { return null; }
}
function cacheGravar_(nome, L) {
  try {
    const s = JSON.stringify(L); if (s.length > CACHE_PED * 50) return;
    const o = {}; let n = 0; for (let i = 0; i < s.length || !n; i += CACHE_PED) o['c:' + nome + ':' + (n++)] = s.slice(i, i + CACHE_PED);
    o['c:' + nome + ':n'] = String(n);
    CacheService.getScriptCache().putAll(o, CACHE_SEG);
  } catch (e) { console.error(e); }
}
function cacheApagar_(nome) { try { const c = CacheService.getScriptCache(); c.remove('c:' + nome + ':n'); } catch (e) {} }
function limparCache() { COLECOES.forEach(cacheApagar_); }
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
/* O Google Planilhas transforma textos como "2026-10-01" em data. O id é sempre lido como texto
   (datas voltam para AAAA-MM-DD) e gravado com formato de texto puro, para nunca mais mudar. */
function idCel_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  return String(v);
}
// se houver linhas repetidas com o mesmo id, vale a última gravada
function listar_(nome) {
  const ordem = [], mapa = {};
  linhas_(nome).rows.forEach(function (r) {
    if (r[0] === '') return;
    const id = idCel_(r[0]);
    if (!(id in mapa)) ordem.push(id);
    mapa[id] = Object.assign({ id: id }, json_(r));
  });
  return ordem.map(function (id) { return mapa[id]; });
}
// procura o id só na coluna A (bem mais rápido que ler a aba inteira) e depois lê apenas a linha encontrada
function ler_(nome, id) {
  const sh = aba_(nome), n = sh.getLastRow();
  if (n < 2) return null;
  const ids = sh.getRange(2, 1, n - 1, 1).getValues(); let linha = 0; const outras = [];
  for (let i = 0; i < ids.length; i++) if (ids[i][0] !== '' && idCel_(ids[i][0]) === String(id)) { if (linha) outras.push(linha); linha = i + 2; }
  if (!linha) return null;
  const row = sh.getRange(linha, 1, 1, Math.max(5, sh.getLastColumn())).getValues()[0];
  return { linha: linha, dados: json_(row), criado: row[2], repetidas: outras };
}
function gravarLinha_(nome, id, dados, email, novo, jaLido) {
  const sh = aba_(nome);
  const s = JSON.stringify(dados);
  const partes = [];
  for (let i = 0; i < s.length; i += CHUNK) partes.push(s.slice(i, i + CHUNK));
  if (!partes.length) partes.push('{}');
  const agora = new Date().toISOString();
  const atual = novo ? null : (jaLido || ler_(nome, id));
  const row = [id, partes[0], atual ? atual.criado : agora, agora, email].concat(partes.slice(1));
  const largura = Math.max(sh.getLastColumn(), row.length);
  while (row.length < largura) row.push('');
  const linha = atual ? atual.linha : sh.getLastRow() + 1;
  const rg = sh.getRange(linha, 1, 1, row.length);
  rg.setNumberFormat('@');                       // texto puro: o id e o JSON não viram data nem número
  rg.setValues([row]);
  // apaga cópias antigas do mesmo registro (de baixo para cima, para não deslocar as linhas)
  if (atual && atual.repetidas && atual.repetidas.length) atual.repetidas.slice().sort(function (a, b) { return b - a; }).forEach(function (n) { sh.deleteRow(n); });
  cacheApagar_(nome);
  if (nome === 'usuarios') usuarioCacheApagar_(id);
}
function comLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function escrever_(eu, col, id, dados, acao) {
  dados = dados || {};
  return comLock_(function () {
    if (id && !/^[A-Za-z0-9_.@+-]{1,100}$/.test(id)) throw new Error('Identificador inválido.');
    const antigo = id ? ler_(col, id) : null;
    let final;
    // "mesclar" altera só os campos enviados; se o registro ainda não existe, ele é criado (nunca apaga os outros campos)
    if (acao === 'mesclar') final = Object.assign({}, antigo ? antigo.dados : {}, dados);
    else final = Object.assign({}, dados);
    if (!id) id = Utilities.getUuid().replace(/-/g, '').slice(0, 20);
    checarAprovacao_(eu, antigo && antigo.dados, final);
    checarMetas_(eu, col, antigo && antigo.dados, final);
    checarPlano_(eu, col, antigo && antigo.dados, final);
    final.atualizadoEm = new Date().toISOString();
    final.atualizadoPor = eu.email;                 // o servidor sempre carimba quem gravou
    if (!antigo && !final.criadoEm) final.criadoEm = final.atualizadoEm;
    if (COL_AUTORIA_.indexOf(col) >= 0) final.criadoPor = antigo && antigo.dados.criadoPor ? antigo.dados.criadoPor : eu.email;
    gravarLinha_(col, id, final, eu.email, !antigo, antigo);
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
    if ((col === 'metas_mensais' || col === 'centros_custo' || col === 'plan_bi') && !isAdmin_(eu)) throw new Error(col === 'plan_bi' ? 'Só o administrador exclui a base de análise.' : 'Só o administrador exclui metas e centros de custo.');
    if (COL_AUTORIA_.indexOf(col) >= 0 && !isAdmin_(eu) && antigo.dados.criadoPor !== eu.email) throw new Error('Só quem lançou ou um administrador pode excluir este registro.');
    if (antigo.dados && antigo.dados.status === 'aprovado' && !isAdmin_(eu)) throw new Error('Só administradores excluem registros aprovados.');
    const sh = aba_(col);
    [antigo.linha].concat(antigo.repetidas || []).sort(function (a, b) { return b - a; }).forEach(function (n) { sh.deleteRow(n); });
    cacheApagar_(col); if (col === 'usuarios') usuarioCacheApagar_(id);
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

/* ======================= anexos (arquivos de tarefas e orçamentos) ======================= */
// Os arquivos ficam numa pasta PRIVADA do Drive do dono do script. O site só abre um arquivo por aqui,
// com sessão válida, e o backend só entrega arquivos que estão nessa pasta (nunca outro arquivo do Drive).
const ANEXO_MAX = 10 * 1024 * 1024;   // 10 MB por arquivo
const ANEXO_TIPOS_ = /^(image\/(jpeg|png|webp|gif)|application\/pdf|text\/(plain|csv)|application\/(msword|vnd\.ms-excel|vnd\.ms-powerpoint|zip|x-zip-compressed|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)))$/;
function pastaAnexos_() {
  const id = prop_('PASTA_ANEXOS');
  if (id) return DriveApp.getFolderById(id);
  const it = DriveApp.getFoldersByName('Central de Marketing - Anexos');
  const f = it.hasNext() ? it.next() : DriveApp.createFolder('Central de Marketing - Anexos');
  PropertiesService.getScriptProperties().setProperty('PASTA_ANEXOS', f.getId());
  return f;
}
function anexoArquivo_(id, eu) {
  id = String(id || '');
  if (!/^[A-Za-z0-9_-]{10,100}$/.test(id)) throw new Error('Anexo inválido.');
  let f;
  try { f = DriveApp.getFileById(id); } catch (e) { throw new Error('Anexo não encontrado.'); }
  if (f.isTrashed()) throw new Error('Anexo não encontrado.');
  const pasta = pastaAnexos_().getId(), pdl = pastaPdl_().getId(), pais = f.getParents();
  while (pais.hasNext()) {
    const p = pais.next();
    if (p.getId() === pasta) return f;
    // comprovante do PDL: fica na subpasta do colaborador; só ele ou um administrador abre
    const avos = p.getParents();
    while (avos.hasNext()) if (avos.next().getId() === pdl) {
      let dono = '';
      try { dono = JSON.parse(f.getDescription() || '{}').pdl || ''; } catch (e) {}
      if (eu && (isAdmin_(eu) || dono === eu.email)) return f;
      throw new Error('Anexo não encontrado.');
    }
  }
  throw new Error('Anexo não encontrado.');
}
function anexoEnviar_(eu, r) {
  const nome = String(r.nome || 'arquivo').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 120) || 'arquivo';
  const tipo = String(r.tipo || '').toLowerCase();
  if (!ANEXO_TIPOS_.test(tipo)) throw new Error('Tipo de arquivo não permitido. Envie imagem, PDF, Word, Excel, PowerPoint, CSV, TXT ou ZIP.');
  const b64 = String(r.base64 || '');
  if (b64.length > Math.ceil(ANEXO_MAX / 3) * 4 + 8) throw new Error('O arquivo passa de 10 MB.');
  const bytes = Utilities.base64Decode(b64);
  if (!bytes.length) throw new Error('O arquivo está vazio.');
  if (bytes.length > ANEXO_MAX) throw new Error('O arquivo passa de 10 MB.');
  const ref = String(r.ref || '').slice(0, 200);
  let destino = pastaAnexos_(), extra = {};
  if (r.pdl) {   // comprovante de curso do PDL: vai para a subpasta do colaborador
    const login = pdlAlvo_(eu, r.pdl);
    if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(tipo)) throw new Error('No PDL, envie o comprovante em PDF ou foto (JPG, PNG ou WEBP).');
    destino = pastaPdlDe_(login); extra = { pdl: login };
  }
  const f = destino.createFile(Utilities.newBlob(bytes, tipo, nome));
  f.setDescription(JSON.stringify(Object.assign({ por: eu.email, ref: ref }, extra)));
  const a = { id: f.getId(), nome: nome, tipo: tipo, tamanho: bytes.length, por: eu.email, em: new Date().toISOString() };
  log_(eu.email, 'anexo enviado', '', a.id, nome + (ref ? ' · ' + ref : ''));
  return { anexo: a };
}
function anexoBaixar_(eu, id) {
  const f = anexoArquivo_(id, eu), b = f.getBlob();
  return { nome: f.getName(), tipo: b.getContentType(), base64: Utilities.base64Encode(b.getBytes()) };
}
function anexoExcluir_(eu, id) {
  const f = anexoArquivo_(id, eu);
  let por = '';
  try { por = JSON.parse(f.getDescription() || '{}').por || ''; } catch (e) {}
  if (!isAdmin_(eu) && por !== eu.email) throw new Error('Só quem enviou o arquivo ou um administrador pode removê-lo.');
  f.setTrashed(true);   // vai para a lixeira do Drive: dá para recuperar por 30 dias
  log_(eu.email, 'anexo removido', '', id, f.getName());
  return { ok: true };
}

/* ======================= PDL (desenvolvimento de cada colaborador) ======================= */
// Aba "pdl" fora de COLECOES: nunca sai pela listagem genérica. Cada pessoa vê só o próprio PDL; o administrador (gestor) vê todos.
// Pontos positivos, pontos de melhoria e cursos podem ser incluídos pela própria pessoa ou pelo gestor.
const PDL_CAMPOS_ = ['positivos', 'melhorias'];
function pastaPdl_() {
  const id = prop_('PASTA_PDL');
  if (id) return DriveApp.getFolderById(id);
  const it = DriveApp.getFoldersByName('Central de Marketing - PDL');
  const f = it.hasNext() ? it.next() : DriveApp.createFolder('Central de Marketing - PDL');
  PropertiesService.getScriptProperties().setProperty('PASTA_PDL', f.getId());
  return f;
}
// subpasta com o nome do colaborador (guardada pelo id: renomear a pessoa não perde a pasta)
function pastaPdlDe_(login) {
  const k = 'PDL_' + docId_(login), id = prop_(k);
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  const u = usuario_(login), nome = String((u && u.nome) || login).replace(/[\\/:*?"<>|]/g, '_').trim();
  const raiz = pastaPdl_(), it = raiz.getFoldersByName(nome);
  const f = it.hasNext() ? it.next() : raiz.createFolder(nome);
  PropertiesService.getScriptProperties().setProperty(k, f.getId());
  return f;
}
// de quem é o PDL que está sendo mexido: a própria pessoa, ou qualquer um se for administrador
function pdlAlvo_(eu, alvo) {
  const login = String(alvo || '').trim().toLowerCase();
  if (!login || !usuario_(login)) throw new Error('Colaborador não encontrado.');
  if (login !== eu.email && !isAdmin_(eu)) throw new Error('Você só pode ver e alterar o seu próprio PDL.');
  return login;
}
function pdlDoc_(login) { const a = ler_('pdl', docId_(login)); return { a: a, d: Object.assign({ usuario: login, positivos: [], melhorias: [], cursos: [] }, a ? a.dados : {}) }; }
function pdlGravar_(eu, login, x) { gravarLinha_('pdl', docId_(login), x.d, eu.email, !x.a, x.a); return { item: Object.assign({ id: docId_(login) }, x.d) }; }
const pdlId_ = () => Utilities.getUuid().replace(/-/g, '').slice(0, 16);
// só aceita (e só apaga) arquivos que estão na subpasta do PDL e pertencem a este colaborador
function pdlArquivoDe_(id, login, eu) {
  try { const f = anexoArquivo_(id, eu); return JSON.parse(f.getDescription() || '{}').pdl === login; } catch (e) { return false; }
}
function pdlListar_(eu) {
  if (isAdmin_(eu)) return { itens: listar_('pdl') };
  const x = pdlDoc_(eu.email); return { itens: x.a ? [Object.assign({ id: docId_(eu.email) }, x.d)] : [] };
}
function pdlItem_(eu, r) {
  const login = pdlAlvo_(eu, r.usuario), campo = String(r.campo || '');
  if (PDL_CAMPOS_.indexOf(campo) < 0) throw new Error('Campo inválido.');
  const texto = String(r.texto || '').trim().slice(0, 2000);
  if (!texto) throw new Error('Escreva o ponto antes de adicionar.');
  return comLock_(function () {
    const x = pdlDoc_(login);
    x.d[campo] = (x.d[campo] || []).concat([{ id: pdlId_(), texto: texto, por: eu.email, em: new Date().toISOString() }]);
    log_(eu.email, 'PDL: ponto incluído', 'pdl', docId_(login), campo);
    return pdlGravar_(eu, login, x);
  });
}
function pdlItemExcluir_(eu, r) {
  const login = pdlAlvo_(eu, r.usuario), campo = String(r.campo || '');
  if (PDL_CAMPOS_.indexOf(campo) < 0) throw new Error('Campo inválido.');
  return comLock_(function () {
    const x = pdlDoc_(login), it = (x.d[campo] || []).find(function (o) { return o.id === r.id; });
    if (!it) return { item: Object.assign({ id: docId_(login) }, x.d) };
    if (it.por !== eu.email && !isAdmin_(eu)) throw new Error('Só quem escreveu o ponto ou o gestor pode removê-lo.');
    x.d[campo] = x.d[campo].filter(function (o) { return o.id !== r.id; });
    log_(eu.email, 'PDL: ponto removido', 'pdl', docId_(login), campo);
    return pdlGravar_(eu, login, x);
  });
}
// cria ou atualiza um curso (nome, instituição, data, carga horária e os comprovantes já enviados)
function pdlCurso_(eu, r) {
  const login = pdlAlvo_(eu, r.usuario), c = r.curso || {};
  const nome = String(c.nome || '').trim().slice(0, 200);
  if (!nome) throw new Error('Informe o nome do curso.');
  const anexos = (Array.isArray(c.anexos) ? c.anexos : []).slice(0, 20).map(function (a) {
    return { id: String(a.id || ''), nome: String(a.nome || '').slice(0, 120), tipo: String(a.tipo || ''), tamanho: +a.tamanho || 0, por: String(a.por || ''), em: String(a.em || '') };
  }).filter(function (a) { return pdlArquivoDe_(a.id, login, eu); });
  return comLock_(function () {
    const x = pdlDoc_(login), L = x.d.cursos || [], i = c.id ? L.findIndex(function (o) { return o.id === c.id; }) : -1;
    const base = i >= 0 ? L[i] : { id: pdlId_(), por: eu.email, em: new Date().toISOString() };
    const novo = Object.assign({}, base, { nome: nome, instituicao: String(c.instituicao || '').trim().slice(0, 200), data: /^\d{4}-\d{2}-\d{2}$/.test(c.data || '') ? c.data : '',
      horas: Math.max(0, Math.min(9999, +c.horas || 0)), anexos: anexos });
    if (i >= 0) L[i] = novo; else L.push(novo);
    x.d.cursos = L;
    log_(eu.email, i >= 0 ? 'PDL: curso alterado' : 'PDL: curso incluído', 'pdl', docId_(login), nome);
    return pdlGravar_(eu, login, x);
  });
}
function pdlCursoExcluir_(eu, r) {
  const login = pdlAlvo_(eu, r.usuario);
  return comLock_(function () {
    const x = pdlDoc_(login), c = (x.d.cursos || []).find(function (o) { return o.id === r.id; });
    if (!c) return { item: Object.assign({ id: docId_(login) }, x.d) };
    if (c.por !== eu.email && !isAdmin_(eu)) throw new Error('Só quem cadastrou o curso ou o gestor pode removê-lo.');
    // os comprovantes vão para a lixeira do Drive (recuperáveis por 30 dias)
    (c.anexos || []).forEach(function (a) { if (pdlArquivoDe_(a.id, login, eu)) try { DriveApp.getFileById(a.id).setTrashed(true); } catch (e) {} });
    x.d.cursos = x.d.cursos.filter(function (o) { return o.id !== r.id; });
    log_(eu.email, 'PDL: curso removido', 'pdl', docId_(login), c.nome);
    return pdlGravar_(eu, login, x);
  });
}

/* ======================= entrada automática (rotina diária do Claude Cowork) ======================= */
// A rotina agendada lê o mLabs e o RD Station pelos conectores e grava um arquivo JSON na pasta "Central de Marketing - Entrada automática".
// Este backend confere a pasta de hora em hora (gatilho criado por instalarGatilhos), valida e importa. Nada é apagado:
// o arquivo vai para a subpasta "processados" (ou "com erro", com o motivo na descrição do arquivo).
const ROTINA_ = 'rotina automática';
const ENTRADA_REDES_ = ['ig_lopes', 'in_lopes'];   // mesmas chaves da página Metas (Instagram Lopes · alcance, LinkedIn Lopes · interações)
function pastaEntrada_() {
  const id = prop_('PASTA_ENTRADA');
  if (id) return DriveApp.getFolderById(id);
  const it = DriveApp.getFoldersByName('Central de Marketing - Entrada automática');
  const f = it.hasNext() ? it.next() : DriveApp.createFolder('Central de Marketing - Entrada automática');
  PropertiesService.getScriptProperties().setProperty('PASTA_ENTRADA', f.getId());
  return f;
}
function subpasta_(pai, nome) { const it = pai.getFoldersByName(nome); return it.hasNext() ? it.next() : pai.createFolder(nome); }
const numOk_ = v => { const n = Number(v); if (!isFinite(n) || n < 0) throw new Error('número inválido: ' + v); return n; };

// números do mês das redes (mLabs): grava o "realizado" na página Metas, mantendo a meta definida pelo gestor
function entradaRedes_(j) {
  const mes = String(j.mes || '');
  if (!/^\d{4}-\d{2}$/.test(mes)) throw new Error('mês inválido (use AAAA-MM).');
  const v = j.valores || {}, chaves = Object.keys(v).filter(function (k) { return ENTRADA_REDES_.indexOf(k) >= 0; });
  if (!chaves.length) throw new Error('nenhum valor reconhecido (use ' + ENTRADA_REDES_.join(', ') + ').');
  return comLock_(function () {
    const id = 'alcance-' + mes, a = ler_('metas_mensais', id), d = Object.assign({ tipo: 'alcance', mes: mes }, a ? a.dados : {});
    const em = new Date().toISOString();
    chaves.forEach(function (k) { d[k] = Object.assign({}, d[k] || {}, { realizado: numOk_(v[k]), auto: { fonte: String(j.fonte || 'mLabs').slice(0, 40), em: em, ate: String(j.ate || '').slice(0, 10) } }); });
    // histórico do mês: uma leitura por dia (a mais recente do dia substitui a anterior), para o gráfico de evolução
    const ate = /^\d{4}-\d{2}-\d{2}$/.test(j.ate || '') ? j.ate : em.slice(0, 10);
    const serie = (Array.isArray(d.serie) ? d.serie : []).filter(function (x) { return x && x.ate !== ate; });
    const ant = (Array.isArray(d.serie) ? d.serie : []).find(function (x) { return x && x.ate === ate; }) || {};
    const ponto = Object.assign({}, ant, { ate: ate });
    chaves.forEach(function (k) { ponto[k] = d[k].realizado; });
    d.serie = serie.concat([ponto]).sort(function (x, y) { return x.ate < y.ate ? -1 : 1; }).slice(-62);
    d.atualizadoEm = em; d.atualizadoPor = ROTINA_;
    gravarLinha_('metas_mensais', id, d, ROTINA_, !a, a);
    return 'redes ' + mes + ': ' + chaves.map(function (k) { return k + '=' + d[k].realizado; }).join(', ');
  });
}
// resultados dos disparos (RD Station): encontra o e-mail planejado do mesmo dia e grava os números nele
// palavras que não ajudam a reconhecer o e-mail (marca, estados, cópias)
const NOME_IGNORA_ = ['lopes', 'opta', 'duplicado', 'copia', 'para', 'com', 'das', 'dos'];
const normT_ = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(function (w) { return w.length > 2 && NOME_IGNORA_.indexOf(w) < 0; });
function parecido_(a, b) { const A = normT_(a), B = normT_(b); if (!A.length || !B.length) return 0; const S = {}; B.forEach(function (w) { S[w] = 1; }); return A.filter(function (w) { return S[w]; }).length / Math.min(A.length, B.length); }
// Um e-mail do planejador costuma virar vários disparos no RD (um por estado, por exemplo "26/10 - Novidades - MS", "- MT"...).
// Cada disparo é guardado em resultados.envios (pelo id da campanha do RD, sem duplicar ao reimportar) e os totais são a soma deles.
const empresaDe_ = s => /opta/i.test(String(s || '')) ? 'opta' : 'lopes';
const ufDe_ = s => { const L = []; (String(s || '').toUpperCase().match(/\b(MS|MT|RO|AC)\b/g) || []).forEach(function (u) { if (L.indexOf(u) < 0) L.push(u); }); return L.join('/'); };
function dataDoNome_(nome, envio) {
  const m = String(nome || '').match(/(\d{1,2})[\/.](\d{1,2})/), ano = String(envio || '').slice(0, 4) || String(new Date().getFullYear());
  if (m && +m[1] >= 1 && +m[1] <= 31 && +m[2] >= 1 && +m[2] <= 12) return ano + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return '';
}
const difDias_ = (a, b) => Math.abs((new Date(a + 'T12:00:00') - new Date(b + 'T12:00:00')) / 864e5);
function somaEnvios_(L) {
  const t = L.reduce(function (o, e) { o.enviados += e.enviados; o.entregues += e.entregues; o.aberturas += e.aberturas; o.cliques += e.cliques; return o; }, { enviados: 0, entregues: 0, aberturas: 0, cliques: 0 });
  t.taxaAbertura = t.entregues ? Math.round(t.aberturas / t.entregues * 1000) / 10 : 0;
  t.taxaClique = t.entregues ? Math.round(t.cliques / t.entregues * 1000) / 10 : 0;
  return t;
}
function entradaEmails_(j) {
  const itens = Array.isArray(j.itens) ? j.itens.slice(0, 300) : [];
  if (!itens.length) throw new Error('lista "itens" vazia.');
  return comLock_(function () {
    const todos = listar_('emails'), mexidos = {}, soltos = [];
    itens.forEach(function (it) {
      const nome = String(it.nome || it.assunto || '').trim(), envio = String(it.data || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(envio)) { soltos.push((nome || '?') + ' (data inválida)'); return; }
      const alvo = dataDoNome_(nome, envio) || envio, emp = empresaDe_(nome + ' ' + (it.assunto || ''));
      // candidatos: mesma empresa, planejados até 2 dias antes ou depois da data do disparo
      const cand = todos.filter(function (e) { return e.data && (!e.empresa || e.empresa === emp) && Math.min(difDias_(e.data, alvo), difDias_(e.data, envio)) <= 2; });
      let melhor = null, nota = -1;
      cand.forEach(function (e) {
        const p = Math.max(parecido_(nome, e.nome), parecido_(it.assunto, e.assunto), parecido_(nome, e.assunto), parecido_(it.assunto, e.nome));
        const n = p - Math.min(difDias_(e.data, alvo), difDias_(e.data, envio)) * 0.15 + (e.data === alvo ? 0.1 : 0);
        if (n > nota) { nota = n; melhor = e; melhor._p = p; }
      });
      const doDia = cand.filter(function (e) { return e.data === alvo; });
      if ((!melhor || melhor._p < 0.4) && doDia.length === 1) melhor = doDia[0];
      else if (!melhor || melhor._p < 0.4) { soltos.push(nome + ' (' + envio.slice(8, 10) + '/' + envio.slice(5, 7) + ')'); return; }
      const x = mexidos[melhor.id] || (function () { const a = ler_('emails', melhor.id); return (mexidos[melhor.id] = { a: a, d: Object.assign({}, a ? a.dados : {}) }); })();
      const ant = x.d.resultados || {}, L = Array.isArray(ant.envios) ? ant.envios.slice() : [];
      const env = numOk_(it.enviados || it.entregues || 0), ent = numOk_(it.entregues || it.enviados || 0);
      const novo = { id: String(it.id || it.campaign_id || '').slice(0, 30), nome: nome.slice(0, 200), data: envio, uf: ufDe_(nome),
        enviados: env, entregues: ent, aberturas: numOk_(it.aberturas || 0), cliques: numOk_(it.cliques || 0) };
      novo.taxaAbertura = ent ? Math.round(novo.aberturas / ent * 1000) / 10 : 0; novo.taxaClique = ent ? Math.round(novo.cliques / ent * 1000) / 10 : 0;
      if (Array.isArray(it.segmentacoes)) novo.segmentacoes = it.segmentacoes.slice(0, 30).map(function (s) {
        return typeof s === 'object' && s ? { id: String(s.id || '').slice(0, 30), nome: String(s.nome || s.name || '').slice(0, 150) } : { id: '', nome: String(s).slice(0, 150) };
      }).filter(function (s) { return s.nome; });
      const i = L.findIndex(function (e) { return (novo.id && e.id === novo.id) || (!novo.id && e.nome === novo.nome && e.data === novo.data); });
      if (i >= 0) L[i] = novo; else L.push(novo);
      const segs = []; L.forEach(function (e) { (e.segmentacoes || []).forEach(function (s) { if (!segs.some(function (y) { return (y.id && y.id === s.id) || y.nome === s.nome; })) segs.push(s); }); });
      x.d.resultados = Object.assign(somaEnvios_(L), { envios: L.slice(0, 40), nomeRd: L.map(function (e) { return e.nome; }).join(' · ').slice(0, 300), fonte: 'RD Station', em: new Date().toISOString() },
        segs.length ? { segmentacoes: segs } : (ant.segmentacoes ? { segmentacoes: ant.segmentacoes } : {}));
      if (x.d.resultados.entregues > 0) x.d.execucao = 'enviado';
    });
    const ids = Object.keys(mexidos);
    ids.forEach(function (id) { const x = mexidos[id]; x.d.atualizadoEm = x.d.resultados.em; x.d.atualizadoPor = ROTINA_; gravarLinha_('emails', id, x.d, ROTINA_, !x.a, x.a); });
    return 'e-mails: ' + (itens.length - soltos.length) + ' disparo(s) em ' + ids.length + ' e-mail(s) do planejador' + (soltos.length ? '; sem correspondência no planejador: ' + soltos.join('; ') : '');
  });
}
// lista de segmentações do RD Station: substitui a lista usada no formulário de e-mails (documento "lista")
function entradaSegmentacoes_(j) {
  const itens = (Array.isArray(j.itens) ? j.itens : []).slice(0, 500).map(function (x) {
    return { id: String(x.id || '').replace(/[^0-9A-Za-z_-]/g, '').slice(0, 30), nome: String(x.nome || x.name || '').trim().slice(0, 150), padrao: !!(x.padrao || x.standard) };
  }).filter(function (x) { return x.id && x.nome; });
  if (!itens.length) throw new Error('lista "itens" vazia ou sem id/nome.');
  return comLock_(function () {
    const a = ler_('rd_segmentacoes', 'lista');
    const d = { itens: itens, total: itens.length, fonte: 'RD Station', atualizadoEm: new Date().toISOString(), atualizadoPor: ROTINA_ };
    gravarLinha_('rd_segmentacoes', 'lista', d, ROTINA_, !a, a);
    return 'segmentações do RD: ' + itens.length;
  });
}
/** Executada pelo gatilho de hora em hora (e pode ser rodada à mão pelo editor). */
function importarEntrada() {
  const raiz = pastaEntrada_(), ok = subpasta_(raiz, 'processados'), ruim = subpasta_(raiz, 'com erro'), it = raiz.getFiles(), out = [];
  while (it.hasNext()) {
    const f = it.next();
    if (!/\.json$/i.test(f.getName())) continue;
    let msg, deu = true;
    try {
      const j = JSON.parse(f.getBlob().getDataAsString('UTF-8'));
      if (j.tipo === 'redes_mensal') msg = entradaRedes_(j);
      else if (j.tipo === 'emails_resultados') msg = entradaEmails_(j);
      else if (j.tipo === 'rd_segmentacoes') msg = entradaSegmentacoes_(j);
      else throw new Error('tipo desconhecido: ' + j.tipo);
    } catch (e) { deu = false; msg = 'ERRO: ' + (e && e.message ? e.message : e); }
    f.setDescription(msg.slice(0, 1000));
    f.moveTo(deu ? ok : ruim);
    log_(ROTINA_, deu ? 'importar' : 'importar com erro', 'entrada', f.getId(), (f.getName() + ' · ' + msg).slice(0, 300));
    out.push(f.getName() + ' → ' + msg);
  }
  return out.length ? out.join('\n') : 'nenhum arquivo novo';
}
/** Rode UMA vez pelo editor (Executar → instalarGatilhos). O Google vai pedir para autorizar os gatilhos automáticos. */
function instalarGatilhos() {
  soEditor_();
  pastaEntrada_();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'importarEntrada') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('importarEntrada').timeBased().everyHours(1).create();
  return 'gatilho criado: importarEntrada de hora em hora · pasta de entrada: ' + pastaEntrada_().getUrl();
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


/* Conserta a planilha uma vez: ids que viraram data voltam a ser texto (AAAA-MM-DD) e
   registros repetidos são juntados (vale a última versão gravada). Rode pelo editor: corrigirPlanilha */
function corrigirPlanilha() {
  soEditor_(); limparCache();
  const rel = [];
  comLock_(function () {
    COLECOES.forEach(function (nome) {
      const t = linhas_(nome); if (!t.rows.length) return;
      const sh = t.sh, grupos = {}, ordem = [], apagar = []; let datas = 0;
      t.rows.forEach(function (r, i) { if (r[0] === '') return; const id = idCel_(r[0]); if (!grupos[id]) { grupos[id] = []; ordem.push(id); } grupos[id].push(i); });
      ordem.forEach(function (id) {
        const g = grupos[id], ult = g[g.length - 1], v = t.rows[ult][0];
        if (g.length > 1) {                       // junta os campos de todas as cópias, da mais antiga para a mais nova
          const junto = {}; g.forEach(function (i) { Object.assign(junto, json_(t.rows[i])); });
          const js = JSON.stringify(junto), partes = []; for (let k = 0; k < js.length; k += CHUNK) partes.push(js.slice(k, k + CHUNK));
          const b = t.rows[ult], r = [id, partes[0] || '{}', b[2], b[3], b[4]].concat(partes.slice(1)); while (r.length < b.length) r.push('');
          const rg = sh.getRange(ult + 2, 1, 1, r.length); rg.setNumberFormat('@'); rg.setValues([r]);
          g.slice(0, -1).forEach(function (i) { apagar.push(i + 2); });
          if (v instanceof Date || typeof v === 'number') datas++;
        } else if (v instanceof Date || typeof v === 'number') { const c = sh.getRange(ult + 2, 1); c.setNumberFormat('@'); c.setValue(id); datas++; }
      });
      apagar.sort(function (a, b) { return b - a; }).forEach(function (n) { sh.deleteRow(n); });
      sh.getRange(1, 1, sh.getMaxRows(), 1).setNumberFormat('@');
      if (datas || apagar.length) rel.push(nome + ': ' + datas + ' id(s) corrigido(s), ' + apagar.length + ' cópia(s) removida(s)');
    });
  });
  const msg = rel.length ? rel.join('\n') : 'Nada para corrigir.';
  Logger.log(msg); return msg;
}
