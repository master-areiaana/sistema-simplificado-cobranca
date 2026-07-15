import test from "node:test";
import assert from "node:assert/strict";

import {
  OFFICIAL_IMPORT_COLUMNS,
  buildOfficialTitleKey,
} from "./domain.js";
import {
  parseFINR1253Canonical,
  parseRPT7007Canonical,
} from "./parsers.js";

function assertCanonicalColumns(record) {
  assert.deepEqual(Object.keys(record), OFFICIAL_IMPORT_COLUMNS);
}

test("RPT_7007 produz registro com exatamente as 23 colunas oficiais", () => {
  const [record] = parseRPT7007Canonical([{
    EMPRESA: "01",
    TPTIT: "NF",
    SERTIT: "A",
    NUMTIT: "000123/02",
    CODCLI: "00045",
    NOMCLI: "Cliente Exemplo Ltda",
    VENDEDOR: "Maria",
    DTEMIS: "01/06/2026",
    DTVENC: "10/06/2026",
    VLRTIT: "1.000,00",
    "VLR RECEBIDO": "300,00",
    PORTAD: "BANCO",
    TELEFONE: "(11) 99999-0000",
    CONTATO: "Financeiro",
    CNPJ: "12.345.678/0001-99",
    NFSE: "9001",
  }]);

  assertCanonicalColumns(record);
  assert.equal(record._meta.source_status, "SOMENTE_RPT");
  assert.equal(record._meta.origem_detectada, "RPT_7007_CONS_CAR_EB");
  assert.equal(record["Número Documento"], "000123");
  assert.equal(record["Sequência"], "02");
  assert.equal(record["Valor Total (R$)"], 1000);
  assert.equal(record["Receb. Parcial (R$)"], 300);
  assert.equal(record["Saldo Restante (R$)"], 700);
  assert.equal(record["Total a Receber (R$)"], 700);
  assert.equal(record["Data Emissão"], "2026-06-01");
  assert.equal(record["Data Vencimento"], "2026-06-10");
});

test("RPT_7007 não descarta título com saldo restante zerado", () => {
  const records = parseRPT7007Canonical([{
    TPTIT: "NF",
    NUMTIT: "500",
    CODCLI: "10",
    NOMCLI: "Cliente Quitado",
    VLRTIT: 100,
    "VALOR RECEBIDO": 100,
  }]);

  assert.equal(records.length, 1);
  assert.equal(records[0]["Saldo Restante (R$)"], 0);
  assert.equal(records[0]["Total a Receber (R$)"], 0);
});

test("RPT_7007 mapeia os nomes oficiais da fonte para o modelo canônico", () => {
  const [record] = parseRPT7007Canonical([{
    "Id da Empresa": "02",
    "Tipo Documento": "DUP",
    "Série": "X",
    "Numero Documento": "550",
    "Sequência": "4",
    "Código Cliente": "15",
    "Razão Social": "Cliente Oficial Ltda",
    "Vendedor": "Carlos",
    "Data Emissão": "02/06/2026",
    "Data Vencimento": "20/06/2026",
    "Valor Total": 1000,
    "Desconto": 25,
    "Valor Recebido": 200,
  }]);

  assert.equal(record["Id da Empresa"], "02");
  assert.equal(record["Tipo Documento"], "DUP");
  assert.equal(record["Série"], "X");
  assert.equal(record["Número Documento"], "550");
  assert.equal(record["Sequência"], "4");
  assert.equal(record["Código Cliente"], "15");
  assert.equal(record["Nome Cliente"], "Cliente Oficial Ltda");
  assert.equal(record["Vendedor"], "Carlos");
  assert.equal(record["Valor Total (R$)"], 1000);
  assert.equal(record["Desconto (R$)"], 25);
  assert.equal(record["Receb. Parcial (R$)"], 200);
  assert.equal(record["Saldo Restante (R$)"], 800);
});

test("RPT_7007 prioriza a coluna Saldo sem alterar Valor Total ou Valor Recebido", () => {
  const [record] = parseRPT7007Canonical([{
    "Tipo Documento": "NF",
    "Número Documento": "551",
    "Código Cliente": "16",
    "Nome Cliente": "Cliente com Saldo Auxiliar",
    "Valor Total": 1000,
    "Valor Recebido": 300,
    "Saldo": 699.77,
  }]);

  assert.equal(record["Valor Total (R$)"], 1000);
  assert.equal(record["Receb. Parcial (R$)"], 300);
  assert.equal(record["Saldo Restante (R$)"], 699.77);
  assert.equal(record["Total a Receber (R$)"], 699.77);
});

test("RPT_7007 usa Saldo oficial mesmo quando Valor Recebido não está disponível", () => {
  const [record] = parseRPT7007Canonical([{
    "Tipo Documento": "NF",
    "Número Documento": "552",
    "Código Cliente": "17",
    "Nome Cliente": "Cliente sem Valor Recebido",
    "Valor Total": 1000,
    "Saldo": 650,
  }]);

  assert.equal(record["Valor Total (R$)"], 1000);
  assert.equal(record["Receb. Parcial (R$)"], 0);
  assert.equal(record["Saldo Restante (R$)"], 650);
});

test("RPT_7007 usa Valor Total menos Valor Recebido quando Saldo está vazio", () => {
  const [record] = parseRPT7007Canonical([{
    "Tipo Documento": "NF",
    "Número Documento": "553",
    "Código Cliente": "18",
    "Nome Cliente": "Cliente com fallback",
    "Valor Total": 1000,
    "Valor Recebido": 300,
    "Saldo": "",
  }]);

  assert.equal(record["Saldo Restante (R$)"], 700);
});

test("RPT_7007 preserva saldo oficial de um centavo", () => {
  const [record] = parseRPT7007Canonical([{
    "Tipo Documento": "NF",
    "Número Documento": "554",
    "Código Cliente": "19",
    "Nome Cliente": "Cliente saldo mínimo",
    "Valor Total": 10,
    "Valor Recebido": 9.99,
    "Saldo em Aberto": 0.01,
  }]);

  assert.equal(record["Saldo Restante (R$)"], 0.01);
  assert.equal(record["Total a Receber (R$)"], 0.01);
});

test("RPT_7007 usa os saldos oficiais dos títulos 6598 e 1627", () => {
  const records = parseRPT7007Canonical([
    {
      "Tipo Documento": "NFe",
      "Número Documento": 6598,
      "Sequência": 1,
      "Código Cliente": 67,
      "Razão Social": "PREMIX CONCRETO LTDA",
      "Valor Total": 46853.53,
      "Valor Recebido": 37694,
      "Saldo": 9159.07,
    },
    {
      "Tipo Documento": "FAT",
      "Número Documento": 1627,
      "Sequência": 1,
      "Código Cliente": 451,
      "Razão Social": "SUPERTEX CONCRETO LTDA",
      "Valor Total": 149894.76,
      "Valor Recebido": 146555,
      "Saldo": 3339.53,
    },
  ]);

  assert.equal(records[0]["Saldo Restante (R$)"], 9159.07);
  assert.equal(records[1]["Saldo Restante (R$)"], 3339.53);
});

test("RPT_7007 calcula encargos usando percentuais informados ao parser", () => {
  const [record] = parseRPT7007Canonical([{
    TPTIT: "NF",
    NUMTIT: "600",
    CODCLI: "20",
    NOMCLI: "Cliente em Atraso",
    VLRTIT: 1000,
    "VALOR RECEBIDO": 300,
    ATRASO: 10,
  }], {
    multaPercent: 2,
    jurosPercent: 1,
  });

  assert.equal(record["Multa (R$)"], 14);
  assert.equal(record["Juros (R$)"], 2.33);
  assert.equal(record["Total a Receber (R$)"], 716.33);
});

test("RPT_7007 aceita datas sem zero à esquerda", () => {
  for (const date of ["1/6/2026", "01/6/2026", "1/06/2026", "01/06/2026"]) {
    const [record] = parseRPT7007Canonical([{
      "Tipo Documento": "NF",
      "Número Documento": `DATA-${date}`,
      "Código Cliente": "30",
      "Nome Cliente": "Cliente Data",
      "Data Emissão": date,
      "Data Vencimento": date,
      "Valor Total": 100,
    }]);

    assert.equal(record["Data Emissão"], "2026-06-01");
    assert.equal(record["Data Vencimento"], "2026-06-01");
  }
});

test("FINR1253 produz registro canônico preservando cliente, contato e valores", () => {
  const rows = [
    ["Relatório FINR1253"],
    ["Tp", "Ser", "Número", "Seq", "NF Serviço", "Operação", "Vencto", "Vlr. Título", "Acréscimo", "Receb.Prc.", "Calculada", "Receber", "Atraso", "Úteis", "Portador"],
    ["Cliente: 000123 - Cliente Financeiro Ltda - CPF/CNPJ: 12.345.678/0001-99"],
    ["FAT", "A", "000987/03", "", "NF-77", "01/06/2026", "15/06/2026", "1.000,00", 0, "300,00", 900, "9.999,00", 10, 8, "CARTEIRA"],
    ["Total Cliente", "", "", "", "", "", "", "", "", "", "", "", "", "", "Tel.: (11) 3333-4444 Contato: Ana"],
  ];

  const [record] = parseFINR1253Canonical(rows);

  assertCanonicalColumns(record);
  assert.equal(record._meta.source_status, "SOMENTE_FINR");
  assert.equal(record._meta.origem_detectada, "FINR1253");
  assert.equal(record["Código Cliente"], "000123");
  assert.equal(record["Nome Cliente"], "Cliente Financeiro Ltda");
  assert.equal(record["CPF/CNPJ"], "12.345.678/0001-99");
  assert.equal(record["Número Documento"], "000987");
  assert.equal(record["Sequência"], "03");
  assert.equal(record["NF Serviço"], "NF-77");
  assert.equal(record["Data Emissão"], "2026-06-01");
  assert.equal(record["Data Vencimento"], "2026-06-15");
  assert.equal(record["Valor Total (R$)"], 1000);
  assert.equal(record["Receb. Parcial (R$)"], 300);
  assert.equal(record["Saldo Restante (R$)"], 700);
  assert.equal(record["Juros (R$)"], 0);
  assert.equal(record["Total a Receber (R$)"], 700);
  assert.equal(record["Telefone"], "(11) 3333-4444");
  assert.equal(record["Contato"], "Ana");
});

test("FINR1253 aceita datas sem zero à esquerda", () => {
  const [record] = parseFINR1253Canonical([
    ["Tp", "Ser", "Número", "Seq", "NF Serviço", "Operação", "Vencto", "Vlr. Título", "", "Receb.Prc.", "", "", "Atraso", "", "Portador"],
    ["Cliente: 40 - Cliente Data FINR - CPF/CNPJ: 40.000.000/0001-40"],
    ["NF", "A", "400", "1", "", "1/6/2026", "1/6/2026", 100, "", 0, "", "", 0, "", "P1"],
  ]);

  assert.equal(record["Data Emissão"], "2026-06-01");
  assert.equal(record["Data Vencimento"], "2026-06-01");
});

test("FINR1253 mantém títulos de clientes consecutivos sem linha de total", () => {
  const rows = [
    ["Cliente: 1 - Cliente Um Ltda - CPF/CNPJ: 11.111.111/0001-11"],
    ["NF", "A", "100", "1", "", "", "01/06/2026", 100, 0, 0, 0, 100, 5, 0, "P1"],
    ["Cliente: 2 - Cliente Dois Ltda - CPF/CNPJ: 22.222.222/0001-22"],
    ["REC", "B", "200", "1", "", "", "02/06/2026", 200, 0, 50, 0, 150, 4, 0, "P2"],
  ];

  const records = parseFINR1253Canonical(rows);

  assert.equal(records.length, 2);
  assert.equal(records[0]["Código Cliente"], "1");
  assert.equal(records[1]["Código Cliente"], "2");
  assert.equal(records[1]["Saldo Restante (R$)"], 150);
});

test("FINR1253 mantém título com valor e saldo restante zerados", () => {
  const rows = [
    ["Tp", "Ser", "Número", "Seq", "NF Serviço", "Operação", "Vencto", "Vlr. Título", "", "Receb. Parcial", "Juros Calculado", "Total a Receber", "Dias Atraso", "", "Portador"],
    ["Cliente: 3 - Cliente Zero Ltda - CPF/CNPJ: 33.333.333/0001-33"],
    ["OUT", "C", "300", "1", "", "01/06/2026", "02/06/2026", 0, "", 0, 800, 900, 0, "", "P3"],
    ["Total Cliente", "", "", "", "", "", "", "", "", "", "", "", "", "", "Telefone: 3333-0000 Contato: Financeiro"],
  ];

  const records = parseFINR1253Canonical(rows);

  assert.equal(records.length, 1);
  assert.equal(records[0]["Tipo Documento"], "OUT");
  assert.equal(records[0]["Valor Total (R$)"], 0);
  assert.equal(records[0]["Saldo Restante (R$)"], 0);
  assert.equal(records[0]["Juros (R$)"], 0);
  assert.equal(records[0]["Total a Receber (R$)"], 0);
  assert.equal(records[0]["Telefone"], "3333-0000");
  assert.equal(records[0]["Contato"], "Financeiro");
});

test("chave oficial funciona nos registros canônicos gerados pelos dois parsers", () => {
  const [rpt] = parseRPT7007Canonical([{
    "Tipo Documento": "NF",
    "Número Documento": "700",
    "Sequência": "1",
    "Código Cliente": "10",
    "Nome Cliente": "Cliente RPT",
    "Data Vencimento": "10/06/2026",
    "Valor Total": 100,
  }]);
  const [finr] = parseFINR1253Canonical([
    ["Tp", "Ser", "Número", "Seq", "NF Serviço", "Operação", "Vencto", "Vlr. Título", "", "Receb.Prc.", "", "", "Atraso", "", "Portador"],
    ["Cliente: 20 - Cliente FINR - CPF/CNPJ: 20.000.000/0001-20"],
    ["REC", "A", "800", "2", "", "01/06/2026", "20/06/2026", 200, "", 0, "", "", 0, "", "P1"],
  ]);

  assert.equal(buildOfficialTitleKey({ ...rpt, source: "RPT_7007_CONS_CAR_EB" }), "RPT_7007_CONS_CAR_EB|10|NF|700|1|2026-06-10");
  assert.equal(buildOfficialTitleKey({ ...finr, source: "FINR1253" }), "FINR1253|20|REC|800|2|2026-06-20");
});
