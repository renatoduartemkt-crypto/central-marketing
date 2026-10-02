# Central de Marketing · Grupo Lopes

Site interno do setor de Marketing & E-commerce (Distribuidora Lopes · Opta Suprimentos).

- **Telas (frontend):** esta pasta, publicada pelo GitHub Pages.
- **Backend e banco de dados:** Google Apps Script + Planilha Google na conta do administrador.
  O código do backend fica em `backend/` (cole `Code.gs` e `appsscript.json` no Apps Script).
- **Dados:** nenhum dado do setor fica neste repositório. Metas, custos, usuários e senhas ficam só na planilha,
  e o acesso é por usuário e senha cadastrados pelo administrador.

## Configuração
O link do backend fica em `assets/js/config.js` → `backendUrl` (o link que termina em `/exec`).

## Atualizar
Edite os arquivos e envie para o GitHub; o site se atualiza sozinho em 1 ou 2 minutos.
Se mudar o `backend/Code.gs`, cole o arquivo no Apps Script e crie uma **nova versão** da implantação.
