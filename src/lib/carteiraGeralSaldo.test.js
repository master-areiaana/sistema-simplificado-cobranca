import assert from "node:assert/strict";
import test from "node:test";

import {
  calcularEncargosCarteira,
  dbToItem,
  parseRows1253,
  parseRows7007,
  saldoAbertoTitulo,
} from "./cobranca.js";
import {
  REAL_EB_FINANCIAL_ROWS,
  REAL_FINR_FINANCIAL_ROWS,
} from "./importacao/realImportFinancialFixtures.js";

function money(value) {
  return Number(Number(value || 0).toFixed(2));
}

function realEbRows() {
  return REAL_EB_FINANCIAL_ROWS.map(([total, received, balance], index) => ({
    "Tipo Documento": "FAT",
    "Número Documento": 200000 + index,
    "Sequência": 1,
    "Código Cliente": 300000 + index,
    "Razão Social": `CLIENTE EB ANONIMIZADO ${index + 1}`,
    "Data Vencimento": "30/06/2026",
    "Valor Total": total,
    "Valor Recebido": received,
    Saldo: balance,
  }));
}

function realFinrRows() {
  return [
    ["Tp", "Ser", "Número", "Seq", "NF Serviço", "Operação", "Vencto", "Título", "Acréscimo", "Receb.Prc.", "Calculada", "Receber", "Atraso", "Úteis", "Portador"],
    ["Cliente: 1 - CLIENTE FINR ANONIMIZADO LTDA - CPF/CNPJ: 00.000.000/0001-00"],
    ...REAL_FINR_FINANCIAL_ROWS.map(([original, acrescimo, balance, juros, receber], index) => [
      "FAT", "152", 100000 + index, "1", "", 46042, 46077,
      original, acrescimo, balance, juros, receber, 1, "", "CARTEIRA",
    ]),
  ];
}

function toSupabaseRow(item, index) {
  return {
    id: `titulo-${item.origem}-${index}`,
    source: item.origem,
    client_code: item.nrCli,
    client_name: item.nomeCli,
    doc_type: item.tp,
    serie: item.ser,
    title_number: item.titulo,
    seq: item.seq,
    issue_date: item.emissao,
    due_date: item.vencimento,
    original_value: item.valorOriginal,
    received_value: item.valorRecebido,
    open_value: item.valorEmAberto,
    erp_balance: item.saldoErp,
    active: true,
    current_status: "Não Contatado",
    workflow_status: "normal",
  };
}

test("Carteira Geral usa o Saldo real em todos os títulos EB anonimizados", () => {
  const parsed = parseRows7007(realEbRows());
  assert.equal(parsed.length, REAL_EB_FINANCIAL_ROWS.length);

  parsed.forEach((item, index) => {
    const displayed = dbToItem(toSupabaseRow(item, index));
    const charges = calcularEncargosCarteira(displayed, { multa: 0, juros: 0 });
    const expectedBalance = REAL_EB_FINANCIAL_ROWS[index][2];
    assert.equal(money(charges.base), money(expectedBalance), `saldo EB no índice ${index}`);
  });
});

test("Carteira Geral usa o saldo principal real em todos os títulos FINR anonimizados", () => {
  const parsed = parseRows1253(realFinrRows());
  assert.equal(parsed.length, REAL_FINR_FINANCIAL_ROWS.length);

  parsed.forEach((item, index) => {
    const displayed = dbToItem(toSupabaseRow(item, index));
    const charges = calcularEncargosCarteira(displayed, { multa: 0, juros: 0 });
    const expectedBalance = REAL_FINR_FINANCIAL_ROWS[index][2];
    assert.equal(money(charges.base), money(expectedBalance), `saldo FINR no índice ${index}`);
  });
});

test("caso EB real com pagamento parcial comprova a falha da base antiga", () => {
  const partialIndex = REAL_EB_FINANCIAL_ROWS.findIndex(([total, received, balance]) => (
    received > 0 && money(total) !== money(balance)
  ));
  assert.notEqual(partialIndex, -1);

  const [total, , expectedBalance] = REAL_EB_FINANCIAL_ROWS[partialIndex];
  const parsed = parseRows7007(realEbRows());
  const displayed = dbToItem(toSupabaseRow(parsed[partialIndex], partialIndex));
  const charges = calcularEncargosCarteira(displayed, { multa: 0, juros: 0 });

  assert.equal(money(charges.base), money(expectedBalance));
  assert.equal(money(displayed.valorOriginal), money(total));
  assert.notEqual(money(displayed.valorOriginal), money(expectedBalance));
});

test("saldo explícito zero é preservado e o fallback usa original menos recebido", () => {
  assert.equal(saldoAbertoTitulo({ open_value: 0, original_value: 100, received_value: 20 }), 0);
  assert.equal(saldoAbertoTitulo({ original_value: 100, received_value: 20 }), 80);
});
