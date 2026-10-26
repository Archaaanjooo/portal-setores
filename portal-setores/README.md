# Portal dos Setores (versão local)

Cópia do Portal dos Setores que roda fora do claude.ai, direto no navegador.

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `index.html` | O portal (telas, planilhas, pastas, conversas, avisos etc.) |
| `js/claude-shim.js` | Substitui os recursos que o claude.ai fornecia (banco de dados, usuário, anexos, downloads, assistente) |
| `js/dados-iniciais.js` | Setores, pastas e atividades exportados do claude.ai em 26/10/2026. Usado só na primeira abertura |

## Como abrir

Dê dois cliques em `index.html` (use Chrome ou Edge). Na primeira vez o portal pergunta o seu nome.

## O que funciona

- Setores, pastas, pastas compartilhadas, documentos, planilhas com fórmulas, indicadores
- Anexos (guardados no navegador), downloads em Excel/CSV/MD
- Avisos, notificações, conversas, busca geral, setores fixados, ajustes, modo escuro
- Assistente Claude, **se** você configurar uma chave da API da Anthropic (veja abaixo)

## O que muda em relação ao claude.ai

- **Os dados ficam só neste navegador, neste computador.** Outra pessoa não vê o que você faz (não há servidor). Para usar em equipe será preciso um banco de dados online (ex.: Supabase).
- **Login:** existe um único usuário local, com você como administrador.
- **SharePoint:** não funciona nesta versão (dependia do conector do claude.ai).
- **Anexos antigos** do claude.ai não vieram junto; só os criados aqui.

## Ferramentas no console do navegador (tecla F12, aba Console)

```js
portalLocal.exportarDados()            // baixa um backup .json de todos os dados
portalLocal.importarDados(textoJson)   // restaura um backup
portalLocal.renomearUsuario('Seu nome')
portalLocal.configurarClaude('sk-ant-...', 'claude-sonnet-4-5') // liga o assistente
portalLocal.removerClaude()
portalLocal.apagarTudo()
```

**Atenção com a chave da API:** ela fica salva no navegador. Use só no seu computador e nunca envie o projeto com a chave para o Git.

## Salvar uma nova versão no Git

```bash
git add .
git commit -m "Descreva o que mudou"
git push            # só se você tiver ligado o projeto ao GitHub
```
