# Conciliação de Corretores SUSEP

Confere uma carteira inteira de corretores contra a base pública da SUSEP e aponta quem está com registro **suspenso**, **cancelado** ou **inexistente**.

Roda dentro do Google Sheets, via Apps Script. Sem servidor, sem instalação, sem custo.

---

## O problema

Seguradoras pagam comissão a centenas ou milhares de corretores. A SUSEP publica a situação cadastral de cada um — mas só via consulta individual, um CNPJ por vez, no site.

Conferir uma carteira de 3.000 parceiros manualmente levaria semanas. Então, na prática, quase ninguém confere. O resultado é que corretor com registro cancelado continua recebendo comissão até alguém tropeçar no problema.

Esta ferramenta faz a conferência inteira em minutos.

## O que ela devolve

Para cada CNPJ da sua planilha:

| Campo | Descrição |
|---|---|
| `status_susep` | OK, NAO ENCONTRADO ou ERRO DE CONEXAO |
| `certidao` | Link direto para a certidão oficial do corretor |
| `nome_susep` | Razão social conforme registrada |
| `situacao` | Ativo, Suspenso ou Cancelado |
| `recadastrado` | Se migrou para o sistema pós-MP 905/2019 |
| `anoCadastro` | Ano do registro, derivado do protocolo |
| `protocolo` | Número do protocolo SUSEP |
| `Danos`, `Pessoas`, `Microsseguros`, `Capitalizacao`, `Previdencia` | Produtos que o corretor está autorizado a comercializar |
| `alerta` | Motivo pelo qual a linha exige atenção |

Linhas com problema são pintadas automaticamente: **vermelho** para grave (cancelado, suspenso, sem registro) e **amarelo** para atenção (não recadastrado, sem produtos declarados).

## Instalação

1. Crie uma planilha no Google Sheets com uma aba chamada `Carteira`
2. Coloque os CNPJs na **coluna A**, a partir da linha 2
3. Vá em **Extensões → Apps Script**
4. Apague o conteúdo de `Code.gs` e cole o conteúdo de [`susep_conciliacao_sheets.gs`](susep_conciliacao_sheets.gs)
5. Salve e volte à planilha
6. Recarregue a página — vai aparecer um menu **SUSEP** na barra superior

Na primeira execução o Google pede autorização. É esperado: o script precisa de permissão para ler a planilha e fazer chamadas externas.

> **Formate a coluna A como Texto** antes de colar os CNPJs (Formatar → Número → Texto simples). Sem isso o Sheets converte para número e come os zeros à esquerda. O script corrige isso automaticamente, mas é melhor não deixar acontecer.

## Uso

O menu **SUSEP** traz:

- **Conciliar linhas em branco** — consulta só o que ainda não foi preenchido. Use para retomar uma execução interrompida ou para adicionar corretores novos.
- **Reconsultar TUDO** — atualiza a carteira inteira. Use na verificação periódica.
- **Agendar atualização semanal** — toda segunda-feira às 6h a planilha se atualiza sozinha, sem ninguém abrir nada.
- **Testar códigos de situação** — utilitário de diagnóstico, veja abaixo.

## Como funciona

A página pública da SUSEP é uma aplicação JavaScript: o HTML vem vazio e os dados chegam por uma chamada JSON. O script conversa diretamente com esse endpoint, sem raspar HTML.

```
GET https://www2.susep.gov.br/safe/corretoresapig/dadospublicos/pesquisar
    ?situacao=101&situacoes=101&page=1&cpfCnpj=00000000000000
```

O parâmetro `situacoes` filtra por situação cadastral: `101` ativo, `102` suspenso, `103` cancelado.

A consulta é feita em cascata: o lote inteiro vai primeiro para os ativos; só quem não aparece é reconsultado nos suspensos, e depois nos cancelados. Como a maioria da carteira costuma estar ativa, o custo médio fica perto de uma requisição por corretor.

As chamadas usam `UrlFetchApp.fetchAll`, que executa em paralelo. Leitura e escrita na planilha são feitas em bloco, não célula a célula — no Apps Script, o acesso à planilha custa mais caro que a rede.

### Limite de tempo

O Apps Script interrompe execuções longas em 6 minutos. O script monitora o relógio, para aos 5, agenda a continuação para um minuto depois e sai. Você pode fechar a planilha: ela termina sozinha.

## Por que "não encontrado" importa

É o achado mais valioso do relatório, não um erro.

O script varre as três situações. Um CNPJ que não aparece em nenhuma delas significa uma de três coisas:

- o corretor nunca teve registro na SUSEP
- o CNPJ está errado na sua base
- o registro existe sob uma situação que o script ainda não conhece

Rode **Testar códigos de situação** para descartar a terceira hipótese. Ele varre os códigos de 100 a 110 e mostra quantos registros existem em cada um. Se aparecer algum código legítimo além dos três conhecidos, acrescente-o ao `CFG.SITUACOES` no topo do script.

## Limitações conhecidas

- **Só CNPJ.** Corretores pessoa física não são tratados nesta versão. CPFs na coluna A serão consultados como CNPJ e voltarão como não encontrados.
- **A `safra` é inferida.** Os dois primeiros dígitos do protocolo parecem indicar o ano do registro (`202097658` → 2020). O padrão foi validado em amostra, não em documentação oficial. Registros muito antigos podem não seguir a regra.
- **A cota gratuita do Apps Script** é de 20.000 chamadas externas por dia. Uma carteira de 5.000 corretores consome bem menos que isso com a cascata otimizada, mas várias reconsultas completas no mesmo dia podem esbarrar no limite.
- **Endpoint não documentado.** A API é pública e sem autenticação, mas a SUSEP não publica contrato para ela. Mudanças de estrutura quebram o script sem aviso.

## Caminho oficial

A SUSEP disponibiliza um endpoint que retorna a base completa de corretores em um único arquivo, mediante credencial:

```
https://www2.susep.gov.br/safe/corretoresapig/seguradoras/baixarArquivo
```

O acesso é voltado a seguradoras e exige cliente autorizado, com autenticação JWT. O contato para solicitação é `cgraj.rj@susep.gov.br`.

**Se você tem ou pode obter essa credencial, use-a.** Este projeto existe para quem ainda não tem.

## Dados pessoais e uso responsável

O registro de corretores é informação pública, mas isso não suspende a LGPD.

- Corretores **pessoa jurídica** estão fora do alcance da lei — a LGPD protege pessoa natural.
- Corretores **pessoa física** são titulares de dados. Se você tratar esses registros, precisa de base legal (normalmente legítimo interesse, art. 7º IX), finalidade declarada e canal de oposição.
- O caráter público do dado **não** autoriza qualquer uso. A ANPD já se manifestou nesse sentido.

Para uma seguradora verificando a habilitação dos próprios parceiros, o legítimo interesse é sólido — há inclusive dever regulatório de fazê-lo. Para prospecção comercial, a conversa é outra.

**Nunca versione a planilha preenchida.** O `.gitignore` deste repositório já bloqueia os formatos de saída. Dado de carteira em repositório público é o cenário que gera problema de verdade, e o histórico do Git não esquece.

## Sobre o volume de requisições

O script pausa entre rodadas e usa lotes moderados. Isso não é só educação: é o que mantém a consulta pública funcionando para todo mundo e evita que seu IP seja bloqueado.

Se for aumentar o paralelismo, aumente devagar e observe. Um scraper agressivo contra uma consulta pública de autarquia derruba o serviço para terceiros.

## Licença

MIT. Veja [LICENSE](LICENSE).

Este projeto não tem vínculo com a SUSEP. Os dados são de responsabilidade da autarquia e devem ser confirmados na fonte oficial antes de qualquer decisão com efeito jurídico ou contratual.