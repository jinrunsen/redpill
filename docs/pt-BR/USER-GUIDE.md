# Guia do Usuário do GSD

Referência detalhada de workflows, troubleshooting e configuração. Para setup rápido, veja o [README](../../README.pt-BR.md).

---

## Sumário

- [Fluxo de trabalho](#fluxo-de-trabalho)
- [Contrato de UI](#contrato-de-ui)
- [Backlog e Threads](#backlog-e-threads)
- [Workstreams](#workstreams)
- [Segurança](#segurança)
- [Referência de comandos](#referência-de-comandos)
- [Configuração](#configuração)
- [Exemplos de uso](#exemplos-de-uso)
- [Troubleshooting](#troubleshooting)
- [Recuperação rápida](#recuperação-rápida)

---

## Fluxo de trabalho

Fluxo recomendado por fase:

1. `/redpill:discuss-phase [N]` — trava preferências de implementação
2. `/redpill:ui-phase [N]` — contrato visual para fases frontend
3. `/redpill:plan-phase [N]` — pesquisa + plano + validação
4. `/redpill:execute-phase [N]` — execução em ondas paralelas
5. `/redpill:verify-work [N]` — UAT manual com diagnóstico
6. `/redpill:ship [N]` — cria PR (opcional)

Para iniciar projeto novo:

```bash
/redpill:new-project
```

Para seguir automaticamente o próximo passo:

```bash
/redpill:next
```

### Nyquist Validation

Durante `plan-phase`, o REDPILL pode mapear requisitos para comandos de teste automáticos antes da implementação. Isso gera `{phase}-VALIDATION.md` e aumenta a confiabilidade de verificação pós-execução.

Desativar:

```json
{
  "workflow": {
    "nyquist_validation": false
  }
}
```

### Modo de discussão por suposições

Com `workflow.discuss_mode: "assumptions"`, o REDPILL analisa o código antes de perguntar, apresenta suposições estruturadas e pede apenas correções.

---

## Contrato de UI

### Comandos

| Comando | Descrição |
|---------|-----------|
| `/redpill:ui-phase [N]` | Gera contrato de design `UI-SPEC.md` para a fase |
| `/redpill:ui-review [N]` | Auditoria visual retroativa em 6 pilares |

### Quando usar

- Rode `/redpill:ui-phase` depois de `/redpill:discuss-phase` e antes de `/redpill:plan-phase`.
- Rode `/redpill:ui-review` após execução/validação para avaliar qualidade visual e consistência.

### Configurações relacionadas

| Setting | Padrão | O que controla |
|---------|--------|----------------|
| `workflow.ui_phase` | `true` | Gera contratos de UI para fases frontend |
| `workflow.ui_safety_gate` | `true` | Ativa gate de segurança para componentes de registry |

---

## Backlog e Threads

### Backlog (999.x)

Ideias fora da sequência ativa vão para backlog:

```bash
/redpill:add-backlog "Camada GraphQL"
/redpill:add-backlog "Responsividade mobile"
```

Promover/revisar:

```bash
/redpill:review-backlog
```

### Seeds

Seeds guardam ideias futuras com condição de gatilho:

```bash
/redpill:plant-seed "Adicionar colaboração real-time quando infra de WebSocket estiver pronta"
```

### Threads persistentes

Threads são contexto leve entre sessões:

```bash
/redpill:thread
/redpill:thread fix-deploy-key-auth
/redpill:thread "Investigar timeout TCP"
```

---

## Workstreams

Workstreams permitem trabalho paralelo sem colisão de estado de planejamento.

| Comando | Função |
|---------|--------|
| `/redpill:workstreams create <name>` | Cria workstream isolado |
| `/redpill:workstreams switch <name>` | Troca workstream ativo |
| `/redpill:workstreams list` | Lista workstreams |
| `/redpill:workstreams complete <name>` | Finaliza e arquiva workstream |

`workstreams` compartilham o mesmo código/git, mas isolam artefatos de `.redpill/`.

---

## Segurança

O REDPILL aplica defesa em profundidade:

- prevenção de path traversal em entradas de arquivo
- detecção de prompt injection em texto do usuário
- hooks de proteção para escrita em `.redpill/`
- scanner CI para padrões de injeção em agentes/workflows/comandos

Para arquivos sensíveis, use deny list no Claude Code.

---

## Referência de comandos

### Fluxo principal

| Comando | Quando usar |
|---------|-------------|
| `/redpill:new-project` | Início de projeto |
| `/redpill:discuss-phase [N]` | Definir preferências antes do plano |
| `/redpill:plan-phase [N]` | Criar e validar planos |
| `/redpill:execute-phase [N]` | Executar planos em ondas |
| `/redpill:verify-work [N]` | UAT manual |
| `/redpill:ship [N]` | Gerar PR da fase |
| `/redpill:next` | Próximo passo automático |

### Gestão e utilidades

| Comando | Quando usar |
|---------|-------------|
| `/redpill:progress` | Ver status atual |
| `/redpill:resume-work` | Retomar sessão |
| `/redpill:pause-work` | Pausar com handoff |
| `/redpill:session-report` | Resumo da sessão |
| `/redpill:quick` | Tarefa ad-hoc com garantias REDPILL |
| `/redpill:debug [desc]` | Debug sistemático |
| `/redpill:forensics` | Diagnóstico de workflow quebrado |
| `/redpill:settings` | Ajustar workflow/modelos |
| `/redpill:set-profile <profile>` | Troca rápida de perfil |

Para lista completa e flags avançadas, consulte [Command Reference](../COMMANDS.md).

---

## Configuração

Arquivo de configuração: `.redpill/config.json`

### Núcleo

| Setting | Opções | Padrão |
|---------|--------|--------|
| `mode` | `interactive`, `yolo` | `interactive` |
| `granularity` | `coarse`, `standard`, `fine` | `standard` |
| `model_profile` | `quality`, `balanced`, `budget`, `inherit` | `balanced` |

### Workflow

| Setting | Padrão |
|---------|--------|
| `workflow.research` | `true` |
| `workflow.plan_check` | `true` |
| `workflow.verifier` | `true` |
| `workflow.nyquist_validation` | `true` |
| `workflow.ui_phase` | `true` |
| `workflow.ui_safety_gate` | `true` |

### Perfis de modelo

| Perfil | Uso recomendado |
|--------|------------------|
| `quality` | trabalho crítico, maior qualidade |
| `balanced` | padrão recomendado |
| `budget` | reduzir custo de tokens |
| `inherit` | seguir modelo da sessão/runtime |

Detalhes completos: [Configuration Reference](../CONFIGURATION.md).

---

## Exemplos de uso

### Projeto novo

```bash
claude --dangerously-skip-permissions
/redpill:new-project
/redpill:discuss-phase 1
/redpill:ui-phase 1
/redpill:plan-phase 1
/redpill:execute-phase 1
/redpill:verify-work 1
/redpill:ship 1
```

### Código já existente

```bash
/redpill:map-codebase
/redpill:new-project
```

### Correção rápida

```bash
/redpill:quick
> "Corrigir botão de login no mobile Safari"
```

### Preparação para release

```bash
/redpill:audit-milestone
/redpill:plan-milestone-gaps
/redpill:complete-milestone
```

---

## Troubleshooting

### "Project already initialized"

`.redpill/PROJECT.md` já existe. Apague `.redpill/` se quiser reiniciar do zero.

### Sessão longa degradando contexto

Use `/clear` entre etapas grandes e retome com `/redpill:resume-work` ou `/redpill:progress`.

### Plano desalinhado

Rode `/redpill:discuss-phase [N]` antes do plano e valide suposições com `/redpill:list-phase-assumptions [N]`.

### Execução falhou ou saiu com stubs

Replaneje com escopo menor (tarefas menores por plano).

### Custo alto

Use perfil budget:

```bash
/redpill:set-profile budget
```

### Runtime não-Claude (Codex/OpenCode/Gemini)

Use `resolve_model_ids: "omit"` para deixar o runtime resolver modelos padrão.

---

## Recuperação rápida

| Problema | Solução |
|---------|---------|
| Perdeu contexto | `/redpill:resume-work` ou `/redpill:progress` |
| Fase deu errado | `git revert` + replanejar |
| Precisa alterar escopo | `/redpill:add-phase`, `/redpill:insert-phase`, `/redpill:remove-phase` |
| Bug em workflow | `/redpill:forensics` |
| Correção pontual | `/redpill:quick` |
| Custo alto | `/redpill:set-profile budget` |
| Não sabe próximo passo | `/redpill:next` |

---

## Estrutura de arquivos do projeto

```text
.redpill/
  PROJECT.md
  REQUIREMENTS.md
  ROADMAP.md
  STATE.md
  config.json
  MILESTONES.md
  HANDOFF.json
  research/
  reports/
  todos/
  debug/
  codebase/
  phases/
    XX-phase-name/
      XX-YY-PLAN.md
      XX-YY-SUMMARY.md
      CONTEXT.md
      RESEARCH.md
      VERIFICATION.md
      XX-UI-SPEC.md
      XX-UI-REVIEW.md
  ui-reviews/
```

> [!NOTE]
> Esta é a versão pt-BR do guia para uso diário. Para detalhes técnicos exatos e cobertura completa de parâmetros avançados, consulte também o [guia original em inglês](../USER-GUIDE.md).
