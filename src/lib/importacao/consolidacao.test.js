import test from "node:test";
import assert from "node:assert/strict";

import {
  OFFICIAL_IMPORT_COLUMNS,
  buildOfficialTitleKey,
} from "./domain.js";
import { consolidarFontesImportacao } from "./consolidacao.js";

function title(overrides = {}) {
  return {
    "Id da Empresa": "",
    "Tipo Documento": "NF",
    "Série": "A",
    "Número Documento": "100",
    "Sequência": "1",
    "Código Cliente": "10",
    "Nome Cliente": "Cliente Exemplo",
    "Vendedor": "",
    "Data Emissão": "2026-06-01",
    "Data Vencimento": "2026-06-30",
    "Valor Total (R$)": 1000,
    "Desconto (R$)": 0,
    "Multa (R$)": 0,
    "Juros (R$)": 0,
    "Receb. Parcial (R$)": 300,
    "Saldo Restante (R$)": 700,
    "Total a Receber (R$)": 700,
    "Dias de Atraso": 0,
    "Portador": "",
    "Telefone": "",
    "Contato": "",
    "CPF/CNPJ": "",
    "NF Serviço": "",
    ...overrides,
  };
}

function diagnosticCodes(result) {
  return result.diagnosticos.map(({ code }) => code);
}

test("consolida título existente nas duas fontes em um único registro", () => {
  const result = consolidarFontesImportacao({
    rptItems: [title()],
    finrItems: [title()],
  });

  assert.equal(result.consolidados.length, 1);
  assert.equal(result.consolidados[0]._meta.source_status, "RPT_E_FINR");
  assert.deepEqual(result.consolidados[0]._meta.sources_found, ["RPT_7007", "FINR1253"]);
  assert.equal(result.resumo.emAmbas, 1);
});

test("RPT prioriza e completa Id da Empresa, Vendedor e Desconto", () => {
  const result = consolidarFontesImportacao({
    rptItems: [title({
      "Id da Empresa": "01",
      Vendedor: "Maria",
      "Desconto (R$)": 25,
    })],
    finrItems: [title({
      "Id da Empresa": "99",
      Vendedor: "Outro",
      "Desconto (R$)": 50,
    })],
  });
  const [record] = result.consolidados;

  assert.equal(record["Id da Empresa"], "01");
  assert.equal(record.Vendedor, "Maria");
  assert.equal(record["Desconto (R$)"], 25);
});

test("FINR prioriza e completa CPF/CNPJ, Telefone, Contato, Portador e NF Serviço", () => {
  const result = consolidarFontesImportacao({
    rptItems: [title({
      Portador: "RPT",
      Telefone: "",
    })],
    finrItems: [title({
      "CPF/CNPJ": "12.345.678/0001-99",
      Telefone: "(11) 3333-4444",
      Contato: "Ana",
      Portador: "FINR",
      "NF Serviço": "NF-77",
    })],
  });
  const [record] = result.consolidados;

  assert.equal(record["CPF/CNPJ"], "12.345.678/0001-99");
  assert.equal(record.Telefone, "(11) 3333-4444");
  assert.equal(record.Contato, "Ana");
  assert.equal(record.Portador, "FINR");
  assert.equal(record["NF Serviço"], "NF-77");
});

test("título somente RPT permanece com source_status SOMENTE_RPT", () => {
  const result = consolidarFontesImportacao({ rptItems: [title()] });
  const [record] = result.consolidados;

  assert.equal(record._meta.source_status, "SOMENTE_RPT");
  assert.deepEqual(record._meta.sources_found, ["RPT_7007"]);
  assert.equal(diagnosticCodes(result)[0], "ONLY_IN_RPT");
});

test("título somente FINR permanece com source_status SOMENTE_FINR", () => {
  const result = consolidarFontesImportacao({ finrItems: [title()] });
  const [record] = result.consolidados;

  assert.equal(record._meta.source_status, "SOMENTE_FINR");
  assert.deepEqual(record._meta.sources_found, ["FINR1253"]);
  assert.equal(diagnosticCodes(result)[0], "ONLY_IN_FINR");
});

test("divergência de Valor Total prioriza RPT e gera VALUE_MISMATCH_TOTAL", () => {
  const result = consolidarFontesImportacao({
    rptItems: [title({ "Valor Total (R$)": 1000 })],
    finrItems: [title({ "Valor Total (R$)": 1200 })],
  });
  const [record] = result.consolidados;

  assert.equal(record["Valor Total (R$)"], 1000);
  assert.ok(diagnosticCodes(result).includes("VALUE_MISMATCH_TOTAL"));
  assert.equal(record._meta.finr_raw[0]["Valor Total (R$)"], 1200);
  assert.equal(record._meta.needs_review, true);
});

test("divergência de Receb. Parcial prioriza RPT e gera VALUE_MISMATCH_RECEIVED", () => {
  const result = consolidarFontesImportacao({
    rptItems: [title({ "Receb. Parcial (R$)": 300 })],
    finrItems: [title({ "Receb. Parcial (R$)": 200 })],
  });
  const [record] = result.consolidados;

  assert.equal(record["Receb. Parcial (R$)"], 300);
  assert.ok(diagnosticCodes(result).includes("VALUE_MISMATCH_RECEIVED"));
});

test("nome diferente escolhe o mais completo e gera CLIENT_NAME_VARIATION", () => {
  const result = consolidarFontesImportacao({
    rptItems: [title({ "Nome Cliente": "Cliente Exemplo" })],
    finrItems: [title({ "Nome Cliente": "Cliente Exemplo Comércio Ltda" })],
  });
  const [record] = result.consolidados;

  assert.equal(record["Nome Cliente"], "Cliente Exemplo Comércio Ltda");
  assert.ok(diagnosticCodes(result).includes("CLIENT_NAME_VARIATION"));
});

test("CPF/CNPJ diferente prioriza FINR, gera CPF_CNPJ_MISMATCH e needs_review", () => {
  const result = consolidarFontesImportacao({
    rptItems: [title({ "CPF/CNPJ": "11.111.111/0001-11" })],
    finrItems: [title({ "CPF/CNPJ": "22.222.222/0001-22" })],
  });
  const [record] = result.consolidados;

  assert.equal(record["CPF/CNPJ"], "22.222.222/0001-22");
  assert.ok(diagnosticCodes(result).includes("CPF_CNPJ_MISMATCH"));
  assert.equal(record._meta.needs_review, true);
});

test("vencimento diferente não une títulos e gera DUE_DATE_MISMATCH", () => {
  const result = consolidarFontesImportacao({
    rptItems: [title({ "Data Vencimento": "2026-06-30" })],
    finrItems: [title({ "Data Vencimento": "2026-07-01" })],
  });

  assert.equal(result.consolidados.length, 2);
  assert.equal(result.resumo.emAmbas, 0);
  assert.ok(diagnosticCodes(result).includes("DUE_DATE_MISMATCH"));
  assert.ok(result.consolidados.every((record) => record._meta.needs_review));
});

test("duplicidade na RPT gera DUPLICATE_KEY_IN_RPT sem perder linhas originais", () => {
  const rptOne = title({ Vendedor: "Maria" });
  const rptTwo = title({ Vendedor: "Carlos" });
  const result = consolidarFontesImportacao({ rptItems: [rptOne, rptTwo] });
  const [record] = result.consolidados;

  assert.ok(diagnosticCodes(result).includes("DUPLICATE_KEY_IN_RPT"));
  assert.equal(record._meta.rpt_raw.length, 2);
  assert.deepEqual(record._meta.rpt_raw, [rptOne, rptTwo]);
  assert.equal(record._meta.needs_review, true);
});

test("duplicidade na FINR gera DUPLICATE_KEY_IN_FINR sem perder linhas originais", () => {
  const finrOne = title({ Contato: "Ana" });
  const finrTwo = title({ Contato: "Carlos" });
  const result = consolidarFontesImportacao({ finrItems: [finrOne, finrTwo] });
  const [record] = result.consolidados;

  assert.ok(diagnosticCodes(result).includes("DUPLICATE_KEY_IN_FINR"));
  assert.equal(record._meta.finr_raw.length, 2);
  assert.deepEqual(record._meta.finr_raw, [finrOne, finrTwo]);
  assert.equal(record._meta.needs_review, true);
});

test("recalcula saldo, multa, juros e total após consolidação", () => {
  const result = consolidarFontesImportacao({
    rptItems: [title({
      "Valor Total (R$)": 1000,
      "Receb. Parcial (R$)": 300,
      "Dias de Atraso": 10,
      "Saldo Restante (R$)": 9999,
      "Multa (R$)": 9999,
      "Juros (R$)": 9999,
      "Total a Receber (R$)": 9999,
    })],
    finrItems: [title()],
    options: {
      multaPercent: 2,
      jurosPercent: 1,
    },
  });
  const [record] = result.consolidados;

  assert.equal(record["Saldo Restante (R$)"], 700);
  assert.equal(record["Multa (R$)"], 14);
  assert.equal(record["Juros (R$)"], 2.33);
  assert.equal(record["Total a Receber (R$)"], 716.33);
});

test("buildOfficialTitleKey continua funcionando no registro consolidado", () => {
  const source = title();
  const result = consolidarFontesImportacao({
    rptItems: [source],
    finrItems: [title()],
  });

  assert.equal(
    buildOfficialTitleKey(result.consolidados[0]),
    buildOfficialTitleKey(source),
  );
});

test("mantém as 23 colunas oficiais separadas dos metadados", () => {
  const result = consolidarFontesImportacao({ rptItems: [title()] });
  const [record] = result.consolidados;

  assert.deepEqual(
    Object.keys(record).filter((key) => key !== "_meta"),
    OFFICIAL_IMPORT_COLUMNS,
  );
  assert.equal(Object.keys(record).length, 24);
});

test("não altera os registros canônicos recebidos", () => {
  const rpt = title({ Vendedor: "" });
  const finr = title({ Vendedor: "Carlos" });
  const rptBefore = structuredClone(rpt);
  const finrBefore = structuredClone(finr);

  consolidarFontesImportacao({
    rptItems: [rpt],
    finrItems: [finr],
  });

  assert.deepEqual(rpt, rptBefore);
  assert.deepEqual(finr, finrBefore);
});
