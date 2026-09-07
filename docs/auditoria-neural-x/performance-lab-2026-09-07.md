# PageSpeed Insights Mobile — baseline de laboratório

Coleta executada em 07/09/2026, por volta de 16:34–16:35 BRT, no PageSpeed Insights com Lighthouse 13.4.1, Moto G Power emulado e rede 4G lenta. Nenhuma das três URLs possuía dados de campo suficientes.

| URL | Performance | LCP | CLS | TBT | INP de campo | Estado do LCP |
|---|---:|---:|---:|---:|---|---|
| `/` | 81 | 4,0 s | 0,00 | 0 ms | NA | acima da meta de 2,5 s |
| `/gratis.html` | 93 | 2,6 s | 0,05 | 0 ms | NA | 0,1 s acima da meta |
| `/produto-neural-x.html` | 85 | 3,7 s | 0,02 | 0 ms | NA | acima da meta de 2,5 s |

## Maior gargalo observado

A homepage teve o pior LCP. O relatório estimou 1.320 ms de economia em recursos que bloqueiam renderização e 762 KiB na entrega de imagens. Na página do produto, o maior alerta de bytes foi política de cache, com economia estimada de 4.525 KiB, além de 650 KiB em imagens.

## Implementação preparada

- 23 imagens do catálogo Neural DSP foram convertidas para WebP: de 4.264.238 bytes para 285.138 bytes, redução de 93,3% nesse conjunto;
- imagens principais do FL Studio, REAPER e pôster do vídeo também receberam variantes WebP;
- referências visíveis, dados estruturados, catálogo e sitemap passaram a usar as variantes modernas;
- a imagem LCP mantém dimensões explícitas e `fetchpriority="high"`; imagens fora da dobra continuam com carregamento tardio;
- o carregamento externo bloqueante do Google Fonts foi removido e o site usa a pilha de fontes de sistema já definida no CSS;
- não foi aplicado `immutable` indiscriminadamente: os arquivos não possuem hash de conteúdo no nome e uma política anual imutável poderia manter uma versão antiga após atualização.

## Issue publicada

A issue [#65 — reduzir LCP mobile](https://github.com/enzofigueiredo45/neural-plugins-site/issues/65) registra baseline, tarefas e critérios de aceite.

## Critério ainda aberto

As metas de LCP só podem ser aceitas depois de publicar a implementação e repetir três medições comparáveis no PageSpeed Insights. Os números desta página continuam sendo o baseline anterior à mudança, não uma estimativa do resultado novo.
