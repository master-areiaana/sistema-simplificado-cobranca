import test from "node:test";
import assert from "node:assert/strict";

import {
  OFFICIAL_IMPORT_COLUMNS,
  buildOfficialTitleKey,
  calculateCharges,
  calculateSaldoRestante,
  getStatusBaixaPorAusencia,
  isImportacaoParcial,
  isTituloElegivelCarteira,
} from "./domain.js";

test("expõe as 23 colunas oficiais na ordem definida", () => {
  assert.equal(OFFICIAL_IMPORT_COLUMNS.length, 23);
  assert.equal(OFFICIAL_IMPORT_COLUMNS[0], "Id da Empresa");
  assert.equal(OFFICIAL_IMPORT_COLUMNS.at(-1), "NF Serviço");
});

test("calcula saldo restante de 1000 com recebimento parcial de 300", () => {
  assert.equal(calculateSaldoRestante({ valorTotal: 1000, recebParcial: 300 }), 700);
});

test("calcula multa de 2%, juros de 1% e atraso de 10 dias", () => {
  assert.deepEqual(
    calculateCharges({
      valorTotal: 1000,
      recebParcial: 300,
      diasAtraso: 10,
      multaPercent: 2,
      jurosPercent: 1,
    }),
    {
      valorTotal: 1000,
      recebParcial: 300,
      saldoRestante: 700,
      multa: 14,
      juros: 2.33,
      totalAReceber: 716.33,
      diasAtraso: 10,
    },
  );
});

test("não calcula multa e juros quando o atraso é zero", () => {
  const result = calculateCharges({
    valorTotal: 1000,
    recebParcial: 300,
    diasAtraso: 0,
    multaPercent: 2,
    jurosPercent: 1,
  });

  assert.equal(result.multa, 0);
  assert.equal(result.juros, 0);
  assert.equal(result.totalAReceber, 700);
});

test("retorna total zerado quando o saldo restante é zero", () => {
  const result = calculateCharges({
    valorTotal: 1000,
    recebParcial: 1000,
    diasAtraso: 10,
    multaPercent: 2,
    jurosPercent: 1,
  });

  assert.equal(result.saldoRestante, 0);
  assert.equal(result.multa, 0);
  assert.equal(result.juros, 0);
  assert.equal(result.totalAReceber, 0);
});

test("título pago não calcula multa ou juros", () => {
  const result = calculateCharges({
    valorTotal: 1000,
    recebParcial: 300,
    diasAtraso: 10,
    multaPercent: 2,
    jurosPercent: 1,
    status: "Pago",
  });

  assert.equal(result.multa, 0);
  assert.equal(result.juros, 0);
  assert.equal(result.totalAReceber, 700);
});

test("título baixado não entra na Carteira Geral", () => {
  assert.equal(
    isTituloElegivelCarteira({
      active: true,
      saldoRestante: 700,
      current_status: "Baixado",
    }),
    false,
  );
});

test("sem_carteira não bloqueia título com saldo em aberto", () => {
  assert.equal(
    isTituloElegivelCarteira({
      active: true,
      saldoRestante: 700,
      workflow_status: "sem_carteira",
    }),
    true,
  );
});

test("considera importação de 60 títulos sobre 500 anteriores como parcial", () => {
  assert.equal(
    isImportacaoParcial({ totalAtivosAnteriores: 500, totalNovaImportacao: 60 }),
    true,
  );
});

test("não considera importação de 490 títulos sobre 500 anteriores como parcial", () => {
  assert.equal(
    isImportacaoParcial({ totalAtivosAnteriores: 500, totalNovaImportacao: 490 }),
    false,
  );
});

test("gera a chave oficial incluindo a origem", () => {
  assert.equal(
    buildOfficialTitleKey({
      "Código Cliente": "123",
      "Tipo Documento": "NF",
      "Número Documento": "456",
      "Sequência": "01",
      "Data Vencimento": "2026-06-30",
      origem: "FINR1253",
    }),
    "FINR1253|123|NF|456|01|2026-06-30",
  );
});

test("não junta o mesmo título de EB e Topcon", () => {
  const base = {
    client_code: "123",
    doc_type: "NF",
    title_number: "456",
    seq: "1",
    due_date: "2026-06-30",
  };

  assert.notEqual(
    buildOfficialTitleKey({ ...base, source: "FINR1253" }),
    buildOfficialTitleKey({ ...base, source: "RPT_7007_CONS_CAR_EB" }),
  );
});

test("normaliza datas equivalentes na chave oficial", () => {
  const base = {
    "Código Cliente": "123",
    "Tipo Documento": "NF",
    "Número Documento": "456",
    "Sequência": "1",
  };

  assert.equal(
    buildOfficialTitleKey({ ...base, "Data Vencimento": "01/06/2026" }),
    buildOfficialTitleKey({ ...base, "Data Vencimento": "1/6/2026" }),
  );
  assert.equal(
    buildOfficialTitleKey({ ...base, "Data Vencimento": "1/6/2026" }),
    buildOfficialTitleKey({ ...base, "Data Vencimento": "2026-06-01" }),
  );
});

test("normaliza sequência embutida no número do título", () => {
  assert.equal(
    buildOfficialTitleKey({
      client_code: "123",
      doc_type: "NF",
      title_number: "10457/1",
      seq: "",
      due_date: "01/06/2026",
    }),
    buildOfficialTitleKey({
      "Código Cliente": "123",
      "Tipo Documento": "NF",
      "Número Documento": "10457",
      "Sequência": "1",
      "Data Vencimento": "2026-06-01",
    }),
  );
});

test("retorna os dados padrão para baixa por ausência", () => {
  assert.deepEqual(getStatusBaixaPorAusencia(), {
    active: false,
    current_status: "Baixado",
    workflow_status: "baixado_importacao",
    current_motive: "Não consta na nova carteira importada",
  });
});
