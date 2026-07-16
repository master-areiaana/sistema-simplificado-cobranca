import { consolidarFontesImportacao } from "./consolidacao.js";
import { isImportacaoParcial } from "./domain.js";
import {
  parseFINR1253Canonical,
  parseRPT7007Canonical,
} from "./parsers.js";

const PARTIAL_IMPORT_ALERT =
  "Planilha parcial detectada — baixa automática não aplicada.";

export function buildImportPreview({
  rptRows = [],
  finrRows = [],
  totalAtivosAnteriores = 0,
  options = {},
} = {}) {
  const rptItems = parseRPT7007Canonical(rptRows, options);
  const finrItems = parseFINR1253Canonical(finrRows, options);
  const {
    consolidados,
    diagnosticos,
    resumo: consolidationSummary,
  } = consolidarFontesImportacao({
    rptItems,
    finrItems,
    options,
  });
  const importacaoParcial = isImportacaoParcial({
    totalAtivosAnteriores,
    totalNovaImportacao: consolidationSummary.totalConsolidados,
  });
  const alertas = importacaoParcial ? [PARTIAL_IMPORT_ALERT] : [];
  // A cobertura inferior a 70% é um alerta destrutivo, não um erro de leitura:
  // criar/atualizar continua possível; baixas ficam no relatório de órfãos e
  // exigem cobertura segura ou aprovação individual explícita.
  const bloqueios = [];

  return {
    rptItems,
    finrItems,
    consolidados,
    diagnosticos,
    resumo: {
      ...consolidationSummary,
      totalDiagnosticos: diagnosticos.length,
      totalNeedsReview: consolidados.filter((item) => item._meta.needs_review).length,
    },
    seguranca: {
      importacaoParcial,
      podeAplicarBaixaAutomatica: !importacaoParcial,
      bloqueioCobertura: importacaoParcial,
      podeProsseguir: true,
      bloqueios,
      alertas,
    },
  };
}
