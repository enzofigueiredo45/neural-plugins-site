# FAQ — validação antes de publicar

O site permanece com 7 perguntas. YouTube Studio mostrou zero comentários nos conteúdos listados; não havia amostra suficiente de dúvidas recorrentes. Mensagens diretas e suporte privado não foram acessados. Para evitar respostas inventadas, nenhuma FAQ foi publicada automaticamente.

## Três candidatos verificáveis e fora do escopo de licenças

| Pergunta candidata | Resposta proposta | Evidência | Gate |
|---|---|---|---|
| Preciso criar conta para baixar o checklist gratuito? | Não. O checklist pode ser acessado diretamente; o e-mail é necessário apenas para receber uma cópia. | `/gratis.html` e testes de frontend | revisão do proprietário |
| Preciso aceitar marketing para receber uma recomendação? | Não. O consentimento de marketing é opcional e separado do envio da recomendação solicitada. | formulário da homepage, backend e testes de consentimento | revisão do proprietário |
| Como altero minhas preferências de medição? | Use o controle de privacidade do site para rever a preferência; analytics só é ativado após consentimento. | `main.js`, `privacy.html` e teste GA4 consentido | revisão do proprietário |

## Critério para publicação

O proprietário deve aprovar texto e prioridade, ou substituir candidatos por dúvidas literais de comentários, DMs ou chamados. Depois disso, atualizar simultaneamente a lista visível e o JSON-LD `FAQPage`, mantendo teste de paridade. Chegar a dez itens sem validação não atende ao critério do prompt.

