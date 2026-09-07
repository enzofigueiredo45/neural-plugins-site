# Execução do Prompt Master Neural X V3 — 07/09/2026

Este relatório cobre os oito blocos A–H, comparando o prompt com o repositório, produção Vercel, banco Neon, Metricool e perfis públicos. Métricas ou confirmações não observadas foram marcadas como `NA`; nenhuma foi estimada.

Fora do escopo por determinação do proprietário: licenças, planilha/financeiro e pagamentos.

## Resumo executivo

| Gate | Estado binário | Evidência e condição objetiva |
|---|---|---|
| A1 — Vercel → Neon | FECHADO | produção responde com banco saudável; projeto com schema real e branch `production` foram reconciliados sem expor a conexão |
| A2 — Analytics/Search Console/UTM | ABERTO | GA4 recebe eventos e sitemap público responde, mas propriedade, sitemap dentro do Search Console e dimensões UTM não puderam ser confirmados no painel |
| A3 — e-mail transacional durável | ABERTO | outbox, criptografia, deduplicação, retry e worker foram implementados e testados; faltam deploy, `CRON_SECRET`, inbox controlada e fechamento de DNS/DMARC |
| A4 — concorrência PostgreSQL | FECHADO | três cenários executados em branch Neon isolada com os resultados exatos esperados |
| A5 — publicações/UTM/sticker | ABERTO | três agendamentos foram corrigidos e relidos; links de bio não foram validados e o sticker da Story exige ação nativa |
| A6 — Microsoft Clarity | ABERTO | código respeita consentimento, mas produção retorna Project ID vazio e não existe sessão validada sem PII |
| A7 — PR/merge/deploy do baseline anterior | FECHADO | PR #64 foi incorporado e o commit `aa562b6` está `READY` em produção; a nova PR #66 está em rascunho, com preview e checks aprovados, sem merge |

## Bloco A — gates técnicos P0

### A1 — FECHADO

- Ação: comparação segura entre Vercel, Neon e `/api/health`.
- Resultado: somente o projeto `delicate-salad-35514405`, branch `production`, contém o schema real da aplicação; o banco produtivo respondeu `ok`.
- Aceite: atendido sem copiar connection string.
- Próximo passo: manter Preview em branch isolada nas próximas mudanças de banco.

### A2 — ABERTO

| Item | Executado | Falta para fechar |
|---|---|---|
| A2.1 domínio canônico | registro TXT de verificação foi encontrado publicamente | confirmar no Search Console que a propriedade de domínio está verificada e associada ao GA4 |
| A2.2 sitemap | `https://neuralxplugins.com.br/sitemap.xml` responde e lista URLs canônicas | confirmar status sem erros dentro do Search Console após o novo deploy |
| A2.3 UTMs | o front preserva `utm_source`, `utm_medium`, `utm_campaign`, `utm_content` e `utm_term`; link YouTube foi agendado com UTM | abrir exploração/Realtime e comprovar source, medium e campaign preenchidos |

O caminho curto `/gratis` retorna 404 no baseline produtivo atual. A branch desta execução adiciona redirecionamento 308 para `/gratis.html`, preservando query string/UTMs.

### A3 — ABERTO

| Item | Executado | Falta para fechar |
|---|---|---|
| A3.1 DNS | DKIM público encontrado; infraestrutura SPF encontrada; DMARC existe | DMARC está em `p=none`, não `p=quarantine`; validar a política desejada e a entrega real |
| A3.2 outbox | persistência antes do envio, AES-256-GCM, AAD, dedupe, claim concorrente, retry de 30 min, cinco tentativas e `dead_letter` implementados | configurar `CRON_SECRET`, publicar e verificar worker real |
| A3.3 inbox | suíte automatizada cobre envio, retry, adulteração do payload e dead-letter | realizar um envio autorizado para destinatário controlado e conferir linha `sent` |

O Vercel Hobby permite o cron diário configurado às 06:00 UTC, não a execução a cada 5 minutos pedida no prompt. A primeira tentativa é imediata. O runbook está em `docs/auditoria-neural-x/email-outbox-runbook.md`. A produção tinha zero registros na outbox durante a auditoria.

### A4 — FECHADO

Em `test-concorrencia-20260907-v3`, criada a partir de `production`:

- cadastro duplicado: 10 operações simultâneas → 1 aceita e 9 rejeitadas pela unicidade de e-mail;
- token de uso único: 5 consumidores simultâneos → 1 consumo e 4 sem linha;
- outbox: 3 inserts simultâneos com a mesma chave → 1 linha final.

O relatório técnico está em `docs/auditoria-neural-x/concorrencia-neon.md`. A branch temporária ainda existe porque sua exclusão é destrutiva e requer autorização explícita.

### A5 — ABERTO

- Instagram carousel de 08/09, 10:00 BRT: CTA `↗ Link na bio` salvo e relido.
- Instagram Reel + TikTok de 09/09, 10:00 BRT: CTA salvo e relido; um agendamento compartilhado não aceita uma legenda/UTM diferente por plataforma.
- YouTube Short de 09/09, 16:00 BRT: descrição recebeu URL clicável com `utm_source=youtube`, `utm_medium=social` e `utm_campaign=set26_organico`.
- Instagram Story de 09/09, 18:00 BRT: mídia preservada; sticker não pode ser adicionado pelo Metricool.

Para fechar: validar/alterar nativamente os links de bio de Instagram e TikTok e adicionar/testar na Story o sticker para `/gratis.html?utm_source=instagram&utm_medium=story&utm_campaign=set26_story`.

### A6 — ABERTO

O site já carrega Clarity somente após consentimento. A configuração pública produtiva devolve Project ID vazio. Para fechar: configurar o ID em Production e Preview, publicar, aceitar cookies em sessão de teste, confirmar gravação e revisar mascaramento de nome, e-mail e outros campos pessoais.

### A7 — FECHADO

O trabalho anterior foi publicado pela PR #64 e o baseline `aa562b6` está `READY` na Vercel. Esta execução abriu a PR [#66](https://github.com/enzofigueiredo45/neural-plugins-site/pull/66) em modo rascunho. CI e CodeQL concluíram com sucesso e o preview Vercel ficou `READY`; o conteúdo não será incorporado à produção sem confirmação imediatamente antes do merge.

## Bloco B — performance e validação

### B1 — ABERTO

| Item | Ação executada | Estado do aceite |
|---|---|---|
| B1.1 imagens | 23 imagens Neural DSP passaram de 4.264.238 para 285.138 bytes (−93,3%); outras três imagens principais receberam WebP; referências e metadados foram atualizados | aguarda publicação e três medições PSI |
| B1.2 bloqueadores | Google Fonts externo removido; pilha de fonte de sistema preservada; scripts já usam módulo/defer implícito | aguarda waterfall pós-deploy |
| B1.3 cache | `immutable` anual não foi aplicado a arquivos sem hash, evitando cache antigo permanente | revisar novamente após versionamento de assets |
| B1.4 GitHub | issue #65 criada com baseline e critérios; implementação publicada na PR #66 | PR ainda não incorporada |

Baseline que não deve ser confundido com resultado novo: home LCP 4,0 s; `/gratis.html` 2,6 s; produto 3,7 s. Critério só fecha com home/produto ≤2,5 s e landing ≤2,0 s medidos após o deploy.

### B2 — ABERTO

Os três FAQs candidatos foram adicionados simultaneamente à interface e ao JSON-LD na branch, com teste de paridade. A landing gratuita também recebeu três FAQs factuais sobre o checklist. Falta publicar e confirmar a leitura do schema no Search Console.

### B3 — ABERTO

O roteiro existe, mas não há cinco participantes nem respostas literais. Para fechar: realizar cinco entrevistas com público elegível e cinco testes de cinco segundos; só então alterar a proposta de valor a partir dos dados.

## Bloco C — perfis sociais

Todos os itens C permanecem `ABERTO`, pois não houve acesso autorizado aos editores nativos dos perfis e não seria correto declarar configuração observando apenas páginas públicas.

### C1 — Instagram — ABERTO

- Perfil encontrado: `@neural_x_plugins`; nome de usuário proposto no prompt não foi testado quanto à disponibilidade.
- Conta profissional/categoria, contatos, foto, destaques e campo Nome exigem conferência nativa.
- A bio pública já descreve pacotes, demos, tutoriais e suporte, mas o destino do link não foi validado.
- Copy segura sugerida, sem prova inventada: `Plugins, DAWs e ferramentas para músicos 🎸 · Demos, guias e suporte em português · ⬇ Checklist gratuito`.
- Não usar `+X produções`, “profissional” ou “pack gratuito” sem evidência e produto correspondente.

### C2 — TikTok — ABERTO

- Perfil conectado no Metricool: `@neural_x_audio`; quatro seguidores no último dado disponível.
- Tipo Business, categoria, e-mail e elegibilidade do link exigem o app nativo.
- Bio segura sugerida: `Plugins, DAWs e ferramentas para músicos 🎸 · 🎁 Checklist grátis no link ⬇`.
- O prompt afirma regra fixa de 1.000 seguidores para link; isso deve ser conferido no próprio perfil, pois elegibilidade pode variar.

### C3 — YouTube — ABERTO

- Canal conectado e operacional, com quatro inscritos no último dado disponível.
- Nome, handle, país, palavras-chave, banner, links e playlists exigem YouTube Studio.
- Descrição segura sugerida: `Plugins, DAWs e ferramentas para músicos brasileiros. 🎁 Checklist gratuito: https://neuralxplugins.com.br/gratis.html`.
- Não declarar “plugins profissionais”, compatibilidade ou prova social sem fonte.

## Bloco D — vídeos

### D1, D2, D3 e D4 — ABERTOS

Nenhum vídeo foi anexado nesta execução. Assim, não foi possível avaliar gancho, cortes, legendas, zona segura, áudio, codec, thumbnail, títulos ou CTA. Quando os arquivos forem enviados, a revisão será feita vídeo por vídeo.

Algumas frases do prompt são hipóteses, não regras universais: duração “ideal”, horários fixos, vantagem algorítmica e H.265 obrigatório precisam ser tratados como testes por canal. Os roteiros também devem trocar qualquer menção a plugin/pack gratuito pelo checklist real, a menos que um plugin gratuito verdadeiro seja fornecido.

## Bloco E — agendamento

### E1 — ABERTO

Existem quatro publicações para 08–09/09, mas isso não comprova a frequência semanal proposta para Reels, Stories, TikTok, Shorts e long-form. Novos agendamentos dependem dos vídeos.

### E2 — ABERTO

Três agendamentos foram editados e relidos. Faltam CTA na primeira linha quando aplicável, links de bio com UTM por plataforma e sticker nativo testado. O YouTube já possui link direto rastreável.

### E3 — FECHADO

Não foi necessário fallback manual: o Metricool aceitou e preservou os agendamentos. O procedimento manual continua documentado para indisponibilidade ou limite do plano.

## Bloco F — automação de DM

### F1, F2 e F3 — ABERTOS

Não foi conectado ChatbotX/ManyChat porque não há plataforma/autorização disponível nesta execução. O fluxo do prompt não deve ser ativado como está:

- oferece um pack de plugins que não existe na landing atual;
- afirma VST3/AU/AAX sem prova técnica anexada;
- DM por curtida pode não ser suportada pela API/plataforma e pode gerar abordagem não solicitada;
- limites “seguros” fixos de DM não são garantia oficial contra bloqueio;
- “qualquer comentário” é abrangente demais e aumenta risco de spam.

Condição de desbloqueio: escolher a plataforma, confirmar permissões Meta e criar apenas automações suportadas, iniciadas por intenção clara, com opt-out, baixa frequência e copy factual para o checklist.

## Bloco G — conversão

### G1 — ABERTO

A rota curta `/gratis` foi corrigida na branch; o funil real é conteúdo → checklist gratuito → lead opcional → recomendação/produto. A outbox agora é durável no código. Falta deploy e teste ponta a ponta.

### G2 — ABERTO

O envio imediato solicitado pelo usuário está coberto pela outbox, mas a sequência dos dias 2, 5 e 10 não foi ativada. Ela só pode ser enviada a contatos com consentimento de marketing vigente. O conteúdo do prompt contém placeholders, urgência e oferta não comprovada; requer copy e oferta reais antes da automação.

### G3 — ABERTO

A landing verdadeira oferece checklist, acesso imediato sem login, captura apenas e-mail, consentimento opcional e agora três FAQs factuais. Não foram adicionados nome obrigatório, número de downloads, logos de compatibilidade, promessa de instalação em dois minutos ou meta de conversão de 35%, pois não há evidência. Player antes/depois aguarda mídia autorizada.

### G4 — ABERTO

- `page_view`: enviado pela configuração GA4, mas requer confirmação no Realtime;
- `generate_lead`: implementado;
- `file_download`: adicionado junto ao evento interno `checklist_download` nesta branch;
- `view_item`: implementado nas páginas de produto;
- `video_start`: existe para vídeo de produto, mas não há player de áudio na landing.

Para fechar: publicar e executar cada ação em sessão de teste, comprovando os cinco eventos no GA4.

## Bloco H — crescimento orgânico

### H1 — ABERTO

Os quatro conteúdos existentes cobrem comparação/demonstração, mas não formam ainda a proporção semanal 3/2/1. Provas sociais só devem entrar quando houver depoimento autorizado e verificável.

### H2 — ABERTO

As legendas usam termos do nicho e 3–5 hashtags, mas o calendário completo, pesquisa de intenção e desempenho por termo ainda não existem. “Plugin grátis” não deve ser usado para promover o checklist.

### H3 — FECHADO para a atualização do dashboard

Período consultado no Metricool: 09/08–07/09/2026. Dados diários podem ter defasagem de sincronização; foram usados apenas campos não nulos retornados pela fonte.

| KPI observado | Valor confirmado | Observação |
|---|---:|---|
| Instagram seguidores | 26 | último valor não nulo |
| Instagram publicações | 5 | posts + Reels no período |
| Instagram alcance | 3.418 | soma da série retornada |
| Instagram visualizações | 4.179 | inclui dados indicados pela fonte |
| Instagram interações | 44 | posts + Reels |
| TikTok seguidores | 4 | último valor não nulo |
| TikTok vídeos | 4 | período |
| TikTok visualizações | 700 | período |
| TikTok interações | 46 | período |
| YouTube inscritos | 4 | último valor não nulo |
| YouTube vídeos | 4 | período |
| YouTube visualizações | 2.337 | período; substitui o baseline não comprovado de 2.600 do prompt |
| Leads totais / últimos 30 dias | 0 / 0 | contagem agregada no Neon, sem ler dados pessoais |
| Opt-ins de marketing em 30 dias | 0 | contagem agregada |
| Sessões, conversão, DMs e abertura de e-mail | NA | fontes não conectadas/sem eventos suficientes para comprovar |

Metas de 30 e 90 dias do prompt são objetivos, não previsões nem benchmarks validados.

## Verificação de engenharia

- suíte local: 115/115 testes aprovados;
- auditoria de dependências: 0 vulnerabilidades encontradas;
- GitHub CI e CodeQL: aprovados na PR #66;
- Vercel Preview: build em estado `READY`, sem promoção para produção;
- outbox testada sem PII real;
- imagens originais foram preservadas para rollback; somente as variantes WebP passaram a ser referenciadas;
- produção não foi alterada por esta branch durante a elaboração do relatório.

## Próximas três ações nas próximas 24 horas

1. Antes da Story de 09/09: atualizar/testar os links de bio de Instagram e TikTok e adicionar o sticker nativo com UTM.
2. Enviar os vídeos originais para revisão e correção D1–D4; não publicar claims de plugin gratuito, compatibilidade ou prova social sem evidência.
3. Configurar `CRON_SECRET` e Clarity, autorizar um destinatário de inbox e então aprovar o merge/deploy da nova PR para validar outbox, eventos, schema e LCP em produção.

## Pendências que exigem ação humana

- Search Console e exploração UTM no GA4;
- destinatário controlado, política DMARC e variáveis da outbox;
- links/sticker e edição dos perfis nativos;
- Clarity e revisão de PII na gravação;
- cinco entrevistas e testes de cinco segundos;
- vídeos e mídia de antes/depois;
- escolha/autorização de plataforma de DM;
- confirmação imediatamente antes do merge/deploy das mudanças novas;
- autorização para excluir a branch Neon temporária de concorrência.
