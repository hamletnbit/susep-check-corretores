const CFG = {
  ABA: 'Carteira',
  COL_DOC: 1,
  PRIMEIRA_SAIDA: 2,
  LINHA_INICIAL: 2,
  TOTAL_COLUNAS: 15,

  URL: 'https://www2.susep.gov.br/safe/corretoresapig/dadospublicos/pesquisar',
  SITUACOES: [
    { codigo: '101', nome: 'Ativo' },
    { codigo: '102', nome: 'Suspenso' },
    { codigo: '103', nome: 'Cancelado' },
  ],

  LOTE: 40,              // documentos por rodada de fetchAll
  LIMITE_SEGUNDOS: 300,  // para antes dos 6 min e agenda continuação
};

const CORES = {
  CABECALHO: '#dce6f1',
  GRAVE: '#ffc7ce',
  ALERTA: '#ffeb9c',
  LIMPA: '#ffffff',
};

const CABECALHOS = [
  'status_susep', 'corretorId', 'nome_susep', 'situacao', 'recadastrado',
  'anoCadastro', 'protocolo', 'tipo', 'Danos', 'Pessoas', 'Microsseguros',
  'Capitalizacao', 'Previdencia', 'produtos_original', 'alerta',
];


function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('SUSEP')
    .addItem('Conciliar linhas em branco', 'conciliarPendentes')
    .addItem('Reconsultar TUDO', 'conciliarTudo')
    .addSeparator()
    .addItem('Agendar atualização semanal', 'agendarSemanal')
    .addItem('Cancelar agendamentos', 'cancelarAgendamentos')
    .addSeparator()
    .addItem('Testar códigos de situação', 'testarCodigosSituacao')
    .addToUi();
}

function conciliarTudo() { conciliar(true); }
function conciliarPendentes() { conciliar(false); }

function _continuar() {
  limparGatilhosDeContinuacao();
  conciliar(false, true);
}

function conciliar(atualizarTudo, silencioso) {
  const inicio = Date.now();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ws = ss.getSheetByName(CFG.ABA);

  if (!ws) {
    if (!silencioso) {
      SpreadsheetApp.getUi().alert(
        `Não achei a aba "${CFG.ABA}".\nCrie-a com os CPF/CNPJ na coluna A.`
      );
    }
    return;
  }

  const ultima = ws.getLastRow();
  if (ultima < CFG.LINHA_INICIAL) {
    if (!silencioso) SpreadsheetApp.getUi().alert('A coluna A está vazia.');
    return;
  }

  escreverCabecalhos(ws);

  const nLinhas = ultima - CFG.LINHA_INICIAL + 1;

  const docs = ws.getRange(CFG.LINHA_INICIAL, CFG.COL_DOC, nLinhas, 1).getValues();
  const atuais = ws.getRange(CFG.LINHA_INICIAL, CFG.PRIMEIRA_SAIDA, nLinhas, 1).getValues();

  if (atualizarTudo) {
    const faixa = ws.getRange(
      CFG.LINHA_INICIAL, CFG.PRIMEIRA_SAIDA, nLinhas, CFG.TOTAL_COLUNAS
    );
    faixa.clearContent();
    faixa.setBackground(CORES.LIMPA);
    for (let i = 0; i < atuais.length; i++) atuais[i][0] = '';
  }

  const fila = [];
  for (let i = 0; i < nLinhas; i++) {
    if (String(atuais[i][0]).trim() !== '') continue;
    const doc = soDigitos(docs[i][0]);
    if (!doc) continue;
    fila.push({ linha: CFG.LINHA_INICIAL + i, indice: i, doc: doc });
  }

  if (fila.length === 0) {
    if (!silencioso) {
      SpreadsheetApp.getUi().alert(
        'Nada a fazer: todas as linhas já estão preenchidas.\n\n' +
        'Use "Reconsultar TUDO" para atualizar os dados existentes.'
      );
    }
    return;
  }

  const contagem = { Ativo: 0, Suspenso: 0, Cancelado: 0, naoAchado: 0, erro: 0 };
  let processados = 0;
  let interrompido = false;

  for (let p = 0; p < fila.length; p += CFG.LOTE) {

    if ((Date.now() - inicio) / 1000 > CFG.LIMITE_SEGUNDOS) {
      interrompido = true;
      break;
    }

    const lote = fila.slice(p, p + CFG.LOTE);
    const resultados = consultarLote(lote, contagem);

    gravarLote(ws, lote, resultados);

    processados += lote.length;
    SpreadsheetApp.flush();
  }

  if (interrompido) {
    agendarContinuacao();
    if (!silencioso) {
      SpreadsheetApp.getUi().alert(
        `Processados ${processados} de ${fila.length}.\n\n` +
        'Cheguei perto do limite de tempo do Apps Script, então agendei ' +
        'a continuação para daqui a 1 minuto. Pode fechar a planilha: ' +
        'ela continua sozinha.'
      );
    }
    return;
  }

  const segundos = Math.round((Date.now() - inicio) / 1000);

  if (!silencioso) {
    SpreadsheetApp.getUi().alert(
      `Concluído em ${segundos}s.\n\n` +
      `Ativos: ${contagem.Ativo}\n` +
      `SUSPENSOS: ${contagem.Suspenso}\n` +
      `CANCELADOS: ${contagem.Cancelado}\n` +
      `Não encontrados: ${contagem.naoAchado}\n` +
      `Erros de conexão: ${contagem.erro}\n\n` +
      'Filtre a coluna "alerta" para ver os casos que exigem ação.'
    );
  } else {
    Logger.log(`Conciliação concluída: ${JSON.stringify(contagem)}`);
  }
}


function consultarLote(lote, contagem) {

  const resultados = new Array(lote.length).fill(null);
  let pendentes = lote.map((item, i) => i);

  for (const sit of CFG.SITUACOES) {
    if (pendentes.length === 0) break;

    const requisicoes = pendentes.map(i => ({
      url: CFG.URL +
           '?situacao=101' +
           '&situacoes=' + sit.codigo +
           '&page=1' +
           '&cpfCnpj=' + lote[i].doc,
      method: 'get',
      muteHttpExceptions: true,
      headers: { 'Accept': 'application/json' },
    }));

    let respostas;
    try {
      respostas = UrlFetchApp.fetchAll(requisicoes);
    } catch (e) {
      Logger.log('fetchAll falhou: ' + e);
      pendentes.forEach(i => {
        resultados[i] = { erro: true };
        contagem.erro++;
      });
      return resultados;
    }

    const aindaPendentes = [];

    respostas.forEach((resp, k) => {
      const i = pendentes[k];

      if (resp.getResponseCode() !== 200) {
        aindaPendentes.push(i);
        return;
      }

      let reg = null;
      try {
        const json = JSON.parse(resp.getContentText());
        const registros = (json.retorno && json.retorno.registros) || [];
        reg = registros.find(r => soDigitos(r.cpfCnpj) === lote[i].doc) || null;
      } catch (e) {
        Logger.log(`Parse falhou para ${lote[i].doc}: ${e}`);
      }

      if (reg) {
        resultados[i] = { reg: reg, status: sit.nome };
        contagem[sit.nome]++;
      } else {
        aindaPendentes.push(i);
      }
    });

    pendentes = aindaPendentes;
    Utilities.sleep(200);
  }

  pendentes.forEach(i => {
    resultados[i] = { naoAchado: true };
    contagem.naoAchado++;
  });

  return resultados;
}


function gravarLote(ws, lote, resultados) {

  const valores = [];
  const cores = [];

  for (let i = 0; i < lote.length; i++) {
    const r = resultados[i];
    const linha = montarLinha(r);
    valores.push(linha.valores);
    cores.push(new Array(CFG.TOTAL_COLUNAS).fill(linha.cor));
  }

  let bloco = [];
  let blocoCores = [];
  let inicioBloco = lote[0].linha;
  let esperada = inicioBloco;

  const descarregar = () => {
    if (bloco.length === 0) return;
    const faixa = ws.getRange(
      inicioBloco, CFG.PRIMEIRA_SAIDA, bloco.length, CFG.TOTAL_COLUNAS
    );
    faixa.setValues(bloco);
    faixa.setBackgrounds(blocoCores);
    bloco = [];
    blocoCores = [];
  };

  for (let i = 0; i < lote.length; i++) {
    if (lote[i].linha !== esperada) {
      descarregar();
      inicioBloco = lote[i].linha;
      esperada = inicioBloco;
    }
    bloco.push(valores[i]);
    blocoCores.push(cores[i]);
    esperada++;
  }
  descarregar();
}


function montarLinha(r) {

  const vazio = new Array(CFG.TOTAL_COLUNAS).fill('');

  if (!r || r.erro) {
    const v = vazio.slice();
    v[0] = 'ERRO DE CONEXAO';
    v[14] = 'RECONSULTAR';
    return { valores: v, cor: CORES.ALERTA };
  }

  if (r.naoAchado) {
    const v = vazio.slice();
    v[0] = 'NAO ENCONTRADO';
    v[14] = 'SEM REGISTRO NA SUSEP';
    return { valores: v, cor: CORES.GRAVE };
  }

  const reg = r.reg;
  const produtos = reg.produtos || '';
  const protocolo = String(reg.protocolo || '');
  const situacao = (reg.situacao || '').trim() || r.status;

  let anoCadastro = '';
  if (protocolo.length >= 2 && /^\d{2}/.test(protocolo)) {
    anoCadastro = 2000 + parseInt(protocolo.substring(0, 2), 10);
  }

  let alerta = '';
  let grave = false;

  if (r.status === 'Cancelado') {
    alerta = 'REGISTRO CANCELADO';
    grave = true;
  } else if (r.status === 'Suspenso') {
    alerta = 'REGISTRO SUSPENSO';
    grave = true;
  } else if (situacao.toUpperCase() !== 'ATIVO') {
    alerta = 'SITUACAO: ' + situacao.toUpperCase();
    grave = true;
  } else if (reg.recadastrado === false) {
    alerta = 'NAO RECADASTRADO';
  } else if (!produtos.trim()) {
    alerta = 'SEM PRODUTOS DECLARADOS';
  }

  const doc = String(reg.cpfCnpj || '');

  const valores = [
    'OK',
      reg.corretorId
      ? `=HYPERLINK("https://www2.susep.gov.br/safe/menumercado/certidoes/emite_certidoescorretores_2011.asp?id=${reg.corretorId}";"Certidão")`
      : '',
    (reg.nome || '').trim(),
    situacao,
    reg.recadastrado === true ? 'SIM' : (reg.recadastrado === false ? 'NAO' : ''),
    anoCadastro,
    protocolo,                                  // texto, formatado adiante
    doc.length > 11 ? 'PJ' : 'PF',
    temProduto(produtos, 'Seguros de Danos'),
    temProduto(produtos, 'Seguros de Pessoas'),
    temProduto(produtos, 'Microsseguro'),
    temProduto(produtos, 'Capitaliza'),
    temProduto(produtos, 'Previd'),
    produtos,
    alerta,
  ];

  const cor = alerta ? (grave ? CORES.GRAVE : CORES.ALERTA) : CORES.LIMPA;
  return { valores: valores, cor: cor };
}


function escreverCabecalhos(ws) {
  const faixa = ws.getRange(1, CFG.PRIMEIRA_SAIDA, 1, CFG.TOTAL_COLUNAS);
  faixa.setValues([CABECALHOS]);
  faixa.setFontWeight('bold');
  faixa.setBackground(CORES.CABECALHO);

  ws.getRange(2, CFG.PRIMEIRA_SAIDA + 6, ws.getMaxRows() - 1, 1)
    .setNumberFormat('@');

  ws.getRange(2, CFG.COL_DOC, ws.getMaxRows() - 1, 1).setNumberFormat('@');
}


function agendarContinuacao() {
  ScriptApp.newTrigger('_continuar')
    .timeBased()
    .after(60 * 1000)
    .create();
}

function limparGatilhosDeContinuacao() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === '_continuar')
    .forEach(t => ScriptApp.deleteTrigger(t));
}

function agendarSemanal() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === '_semanal')
    .forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('_semanal')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(6)
    .create();

  SpreadsheetApp.getUi().alert(
    'Agendado: toda segunda-feira por volta das 6h a planilha será ' +
    'reconsultada por inteiro, sem você precisar abrir nada.'
  );
}

function _semanal() {
  conciliar(true, true);
}

function cancelarAgendamentos() {
  const n = ScriptApp.getProjectTriggers().length;
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  SpreadsheetApp.getUi().alert(`${n} agendamento(s) cancelado(s).`);
}


function soDigitos(v) {
  const d = String(v == null ? '' : v).replace(/\D/g, '');
  if (!d || d.length > 14) return '';   // vazio ou lixo
  return d.padStart(14, '0');
}

function temProduto(lista, trecho) {
  return (lista || '').toLowerCase().indexOf(trecho.toLowerCase()) >= 0 ? 'SIM' : '';
}
