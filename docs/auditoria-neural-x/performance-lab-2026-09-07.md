# PageSpeed Insights Mobile — baseline de laboratório

Coleta executada em 07/09/2026, por volta de 16:34–16:35 BRT, no PageSpeed Insights com Lighthouse 13.4.1, Moto G Power emulado e rede 4G lenta. Nenhuma das três URLs possuía dados de campo suficientes.

| URL | Performance | LCP | CLS | TBT | INP de campo | Estado do LCP |
|---|---:|---:|---:|---:|---|---|
| `/` | 81 | 4,0 s | 0,00 | 0 ms | NA | acima da meta de 2,5 s |
| `/gratis.html` | 93 | 2,6 s | 0,05 | 0 ms | NA | 0,1 s acima da meta |
| `/produto-neural-x.html` | 85 | 3,7 s | 0,02 | 0 ms | NA | acima da meta de 2,5 s |

## Maior gargalo observado

A homepage teve o pior LCP. O relatório estimou 1.320 ms de economia em recursos que bloqueiam renderização e 762 KiB na entrega de imagens. Na página do produto, o maior alerta de bytes foi política de cache, com economia estimada de 4.525 KiB, além de 650 KiB em imagens.

## Issue pronta para revisão

**Título:** `perf: reduzir LCP mobile da homepage e página principal de produto`

**Corpo proposto:**

- baseline PSI Mobile 07/09/2026: home LCP 4,0 s; produto LCP 3,7 s; landing gratuita LCP 2,6 s;
- priorizar a imagem LCP e os recursos render-blocking da homepage;
- gerar variante moderna dimensionada da imagem acima da dobra, manter `width`/`height` e `fetchpriority=high`, testar preload somente se a waterfall confirmar benefício;
- revisar cache dos 23 assets e do vídeo de 5 MiB da página do produto;
- aceite: nova coleta comparável em três execuções; sem regressão de CLS, acessibilidade ou qualidade visual.

A issue não foi criada externamente porque isso publica conteúdo no GitHub e exige confirmação no momento da ação.

