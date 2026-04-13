# Referência de Comandos do GSD

Este documento descreve os comandos principais do REDPILL em Português.  
Para detalhes completos de flags avançadas e mudanças recentes, consulte também a [versão em inglês](../COMMANDS.md).

---

## Fluxo Principal

| Comando | Finalidade | Quando usar |
|---------|------------|-------------|
| `/redpill:new-project` | Inicialização completa: perguntas, pesquisa, requisitos e roadmap | Início de projeto |
| `/redpill:discuss-phase [N]` | Captura decisões de implementação | Antes do planejamento |
| `/redpill:ui-phase [N]` | Gera contrato de UI (`UI-SPEC.md`) | Fases com frontend |
| `/redpill:plan-phase [N]` | Pesquisa + planejamento + verificação | Antes de executar uma fase |
| `/redpill:execute-phase <N>` | Executa planos em ondas paralelas | Após planejamento aprovado |
| `/redpill:verify-work [N]` | UAT manual com diagnóstico automático | Após execução |
| `/redpill:ship [N]` | Cria PR da fase validada | Ao concluir a fase |
| `/redpill:next` | Detecta e executa o próximo passo lógico | Qualquer momento |
| `/redpill:fast <texto>` | Tarefa curta sem planejamento completo | Ajustes triviais |

## Navegação e Sessão

| Comando | Finalidade |
|---------|------------|
| `/redpill:progress` | Mostra status atual e próximos passos |
| `/redpill:resume-work` | Retoma contexto da sessão anterior |
| `/redpill:pause-work` | Salva handoff estruturado |
| `/redpill:session-report` | Gera resumo da sessão |
| `/redpill:help` | Lista comandos e uso |
| `/redpill:update` | Atualiza o REDPILL |

## Gestão de Fases

| Comando | Finalidade |
|---------|------------|
| `/redpill:add-phase` | Adiciona fase no roadmap |
| `/redpill:insert-phase [N]` | Insere trabalho urgente entre fases |
| `/redpill:remove-phase [N]` | Remove fase futura e reenumera |
| `/redpill:list-phase-assumptions [N]` | Mostra abordagem assumida pelo Claude |
| `/redpill:plan-milestone-gaps` | Cria fases para fechar lacunas de auditoria |

## Brownfield e Utilidades

| Comando | Finalidade |
|---------|------------|
| `/redpill:map-codebase` | Mapeia base existente antes de novo projeto |
| `/redpill:quick` | Tarefas ad-hoc com garantias do REDPILL |
| `/redpill:debug [desc]` | Debug sistemático com estado persistente |
| `/redpill:forensics` | Diagnóstico de falhas no workflow |
| `/redpill:settings` | Configuração de agentes, perfil e toggles |
| `/redpill:set-profile <perfil>` | Troca rápida de perfil de modelo |

## Qualidade de Código

| Comando | Finalidade |
|---------|------------|
| `/redpill:review` | Peer review com múltiplas IAs |
| `/redpill:pr-branch` | Cria branch limpa sem commits de planejamento |
| `/redpill:audit-uat` | Audita dívida de validação/UAT |

## Backlog e Threads

| Comando | Finalidade |
|---------|------------|
| `/redpill:add-backlog <desc>` | Adiciona item no backlog (999.x) |
| `/redpill:review-backlog` | Promove, mantém ou remove itens |
| `/redpill:plant-seed <ideia>` | Registra ideia com gatilho futuro |
| `/redpill:thread [nome]` | Gerencia threads persistentes |

---

## Exemplo rápido

```bash
/redpill:new-project
/redpill:discuss-phase 1
/redpill:plan-phase 1
/redpill:execute-phase 1
/redpill:verify-work 1
/redpill:ship 1
```
