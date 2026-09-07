# API pública de corretores da SUSEP

Documentação obtida por engenharia reversa da consulta pública em
`https://www2.susep.gov.br/safe/Corretores/pesquisa`.

**A SUSEP não publica contrato para esta API.** Tudo abaixo foi observado
empiricamente e pode mudar sem aviso. Onde a informação é inferida e não
verificada, isso está marcado.

Última verificação: agosto de 2026.

---

## Contexto

A página de consulta é uma aplicação JavaScript de página única. O HTML
servido vem praticamente vazio; os dados chegam por uma chamada assíncrona
a um endpoint JSON. Raspar o HTML não funciona — e não é necessário, já que
o endpoint é aberto.

Não há autenticação, token, cookie de sessão nem captcha. É o mesmo endpoint
que o front-end público consome.

## Endpoint de pesquisa

```
GET https://www2.susep.gov.br/safe/corretoresapig/dadospublicos/pesquisar
```

### Parâmetros

| Parâmetro | Obrigatório | Descrição |
|---|---|---|
| `situacao` | sim | Enviado sempre como `101` pelo front-end. Não parece filtrar nada — ver nota abaixo. |
| `situacoes` | sim | O filtro real de situação cadastral. Ver tabela de códigos. |
| `page` | sim | Número da página, começando em `1`. |
| `cpfCnpj` | não | Filtra por documento. Aceita apenas dígitos, sem pontuação. |
| `nome` | não | Filtra por nome/razão social. Busca textual. |

**Sobre `situacao` vs `situacoes`:** o front-end envia os dois com o mesmo
valor. Em testes, alterar `situacoes` muda o resultado e alterar `situacao`
não. A hipótese é que `situacao` seja resíduo de uma versão anterior da API.
As requisições deste projeto mantêm `situacao=101` fixo por segurança.

**Sobre o tamanho de página:** o retorno inclui um campo `tamanhoPagina`
com valor `25`. Nenhum parâmetro testado conseguiu alterá-lo —
`pageSize`, `size`, `limit`, `tamanho`, `perPage`, `qtdPorPagina`,
`itensPorPagina`, `tamanhoPagina`, `registrosPorPagina`, `rows` e `take`
foram todos ignorados. O tamanho parece fixo no servidor.

### Códigos de situação

| Código | Situação |
|---|---|
| `101` | Ativo |
| `102` | Suspenso |
| `103` | Cancelado |

Códigos fora dessa faixa não foram mapeados. Se você suspeitar que existem
outros (por exemplo "em análise" ou "aguardando documentação"), vale varrer
a faixa 100–110 e observar o campo `totalRegistros` de cada resposta.

### Nomes de parâmetro testados para busca por documento

Só `cpfCnpj` funciona. A API é case-insensitive nos nomes de parâmetro,
então `cpfcnpj` também é aceito.

| Testado | Resultado |
|---|---|
| `cpfCnpj` | filtra corretamente |
| `cpfcnpj` | filtra corretamente |
| `documento`, `cnpj`, `cpf`, `nomeCpfCnpj`, `termo`, `filtro`, `pesquisa`, `texto`, `busca`, `q` | ignorados — devolvem a base inteira |
| `nome` | é um filtro válido, mas para busca textual por razão social |

## Formato da resposta

```json
{
  "retorno": {
    "paginaAtual": 1,
    "tamanhoPagina": 25,
    "totalRegistros": 150396,
    "registros": [
      {
        "corretorId": "a26b255e-879a-495b-72a8-08d833daf380",
        "cpfCnpj": "38502704000135",
        "protocolo": "202097658",
        "nome": "  ACR ASSESS COML JURIDICA E CORRETORA DE SEGUROS LTDA",
        "recadastrado": true,
        "situacao": "Ativo",
        "produtos": "Microsseguros, Seguros de Pessoas, Planos de Capitalização, Seguros de Danos, Planos de Previdência Complementar"
      }
    ]
  },
  "mensagem": null,
  "validacoes": [],
  "protocolo": "262d535d-016c-42f9-8bf4-fff7759aab8c"
}
```

### Campos

| Campo | Tipo | Observações |
|---|---|---|
| `corretorId` | UUID | Identificador estável. Serve de chave para deduplicação e para montar o link da certidão. |
| `cpfCnpj` | string | Somente dígitos, sem pontuação. 11 para PF, 14 para PJ. Sujeito a perda de zeros à esquerda se tratado como número. |
| `protocolo` | string | 9 dígitos. Os dois primeiros parecem indicar o ano — ver abaixo. |
| `nome` | string | **Vem com espaços à esquerda e à direita.** Aplique trim. |
| `recadastrado` | boolean | Se o corretor migrou para o sistema pós-MP 905/2019. |
| `situacao` | string | `Ativo`, `Suspenso`, `Cancelado`. |
| `produtos` | string ou null | Lista separada por vírgula. **A ordem varia entre registros** — não confie na posição. Pode vir `null`. |

O `protocolo` de nível superior (fora de `retorno`) é um identificador da
requisição, não do corretor. Não confunda com o `protocolo` de dentro de
cada registro.

### Valores possíveis de `produtos`

- Seguros de Danos
- Seguros de Pessoas
- Microsseguros
- Planos de Capitalização
- Planos de Previdência Complementar

Como a ordem é aleatória e o campo pode ser nulo, o tratamento robusto é
buscar por substring de cada produto em vez de fazer split posicional.
Buscar por trecho sem acento (`Capitaliza`, `Previd`, `Microsseguro`) evita
problemas de codificação.

### Padrão do protocolo — inferido, não documentado

Os dois primeiros dígitos parecem corresponder ao ano do registro:

| Protocolo | Ano inferido |
|---|---|
| `202097658` | 2020 |
| `212113882` | 2021 |
| `232144608` | 2023 |
| `242155377` | 2024 |

Os dígitos seguintes crescem junto com o ano (`2011323` em 2020,
`2163209` em 2024), o que é coerente com um sequencial contínuo.

**Esta é uma hipótese baseada em amostra pequena.** Registros anteriores à
migração de 2020 podem seguir outro formato. Valide o intervalo de anos
derivados antes de confiar no campo.

## Certidão

O `corretorId` permite montar o link direto para a certidão oficial:

```
https://www2.susep.gov.br/safe/menumercado/certidoes/emite_certidoescorretores_2011.asp?id={corretorId}
```

Exemplo:

```
https://www2.susep.gov.br/safe/menumercado/certidoes/emite_certidoescorretores_2011.asp?id=48918832-1206-4547-e482-08d7fcd67690
```

## Volume da base

Observações de agosto de 2026, para calibrar expectativas:

| Filtro | `totalRegistros` |
|---|---|
| Ativos (medição 1) | 149.978 |
| Ativos (medição 2, dia seguinte) | 150.396 |

A variação entre medições próximas sugere que o número oscila conforme o
processamento interno da autarquia, e não apenas por registros novos. Não
use o total como constante.

Com `tamanhoPagina` fixo em 25, varrer a base ativa completa exige cerca de
**6.000 requisições**.

## Endpoint oficial para base completa

A SUSEP disponibiliza um endpoint que retorna todos os corretores em um
único arquivo compactado:

```
GET https://www2.susep.gov.br/safe/corretoresapig/seguradoras/baixarArquivo
```

Não recebe parâmetros. Exige cliente autorizado e autenticação JWT, com
token válido por uma hora. O acesso é voltado a seguradoras; solicitações
podem ser encaminhadas a `cgraj.rj@susep.gov.br`.

**Se você tem ou pode obter essa credencial, use-a.** Uma requisição
autorizada substitui as 6.000 da paginação pública.

## Notas de implementação

**Zeros à esquerda.** CNPJs como `06057223012501` viram `6057223012501` se
passarem por uma célula de planilha formatada como número. Normalize
completando à esquerda até 14 dígitos (ou 11, para CPF) antes de consultar.

**Validação do retorno.** Ao buscar por documento, confirme que o `cpfCnpj`
do registro retornado bate exatamente com o consultado. Isso protege contra
associar o corretor errado caso a API passe a fazer busca parcial.

**Ordenação instável.** A listagem paginada vem ordenada por nome, sem
critério de desempate visível. Em paginação profunda com requisições
concorrentes, registros podem repetir entre páginas. Deduplique por
`corretorId`.

**Volume de requisições.** É uma consulta pública de uma autarquia. Paralelismo
alto rende `ERR_CONNECTION_TIMED_OUT` — provável throttling por IP — e pode
degradar o serviço para terceiros. Duas a quatro requisições simultâneas,
com pausa entre lotes, atravessa a base sem incidente.

## Aspectos legais

O endpoint é público e não protegido por mecanismo de segurança. Ainda
assim:

- Os Termos de Uso do portal são contrato, e vale lê-los antes de automatizar
  em escala.
- Corretores pessoa física são titulares de dados pessoais. O caráter público
  do registro não suspende a LGPD: tratamento exige base legal, finalidade
  declarada e canal de oposição.
- Volume excessivo que degrade um serviço público é problema de outra
  natureza, independentemente da legalidade do acesso.

A Lei de Acesso à Informação (12.527/2011, art. 8º §3º) prevê que o poder
público disponibilize informação em formato aberto e legível por máquina.
Um pedido via Fala.BR solicitando a publicação desta base como dado aberto
é um caminho legítimo e torna esta documentação desnecessária — que seria
o melhor desfecho possível.