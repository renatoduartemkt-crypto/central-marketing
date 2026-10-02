/*
 * Configuração da Central de Marketing.
 * A equipe de TI ajusta este arquivo na hospedagem. Veja docs/LEIA-ME-TI.md.
 */
window.APP_CONFIG = {
  nomeSite: "Central de Marketing",
  empresa: "Grupo Lopes",

  // "local": dados salvos no navegador (só para teste/demonstração, cada navegador tem os seus dados).
  // "api":   dados salvos no servidor, compartilhados pela equipe (produção). Exige a API descrita no LEIA-ME-TI.
  modo: "gas",

  // Link /exec do backend (Apps Script publicado como App da Web).
  backendUrl: "https://script.google.com/macros/s/AKfycbyQR0Qy4zD9zqRtBjkKSdM5GwhGA5u-udi9w6tDqC8U_zzBtxL9p1IMm7T2NlnIrn7K-g/exec",

  // Endereço base da API quando modo = "api" (ex.: "/api" ou "https://central.grupolopes.com.br/api").
  apiBase: "/api",

  // Intervalo (ms) para buscar atualizações feitas por outros usuários no modo "api".
  intervaloAtualizacao: 20000,

  // Cadastro: quem ainda não tem conta pode se cadastrar informando Nome e Cargo.
  cadastroAberto: true,

  // Domínios de e-mail aceitos no cadastro. Lista vazia = qualquer domínio.
  // Ex.: ["distribuidoralopes.com.br", "optasuprimentos.com.br", "grupolopes.com.br"]
  dominiosPermitidos: [],

  // E-mails que entram como Administrador (podem cadastrar, editar e remover usuários).
  administradores: ["renatoduarte.mkt@gmail.com"],

  // Modo "api": endereço para sair (encerrar a sessão no servidor/SSO). Vazio = só limpa a sessão local.
  urlSair: ""
};
