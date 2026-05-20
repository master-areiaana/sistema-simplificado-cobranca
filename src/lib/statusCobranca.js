// src/lib/statusCobranca.js
// Constantes e helpers centralizados para o refactor "ajuste-carteira-filtros-pagos-assessoria".
// Este arquivo NAO substitui nada existente. Eh um modulo novo que pode ser importado
// gradualmente pelo Dashboard.jsx e pelas tabelas, sem quebrar o que ja funciona.

// =============================================================================
// 1) STATUS PADRONIZADOS
// =============================================================================
// Mantemos os status legados (que ja existem no banco) e adicionamos os novos.
// Nenhum status antigo eh removido para preservar o historico.

export const STATUS_LEGADOS = [
    "Nao Contatado",
      "Em Cobranca",
        "Sem Retorno",
          "Prometeu Pagar",
            "Pago Aguard. Baixa",
              "Em Permuta",
                "Encerrado",
];

export const STATUS_NOVOS = [
    "Promessa Descumprida",
      "Pago",
        "Baixado",
          "Enviado para Conferencia",
            "Enviado para Aprovacao",
              "Enviado para Assessoria",
                "Protesto Solicitado",
                  "Protesto Aprovado",
                    "Protesto Recusado",
];

// Lista completa para uso em selects de status.
export const STATUS_OPC = [...STATUS_LEGADOS, ...STATUS_NOVOS];

// =============================================================================
// 2) GRUPOS DE STATUS POR ABA / CONTEXTO
// =============================================================================
// Use estas listas em vez de hardcodar strings nos componentes.

export const STATUS_PAGOS = ["Pago", "Baixado", "Pago Aguard. Baixa"];
export const STATUS_ENCERRADOS = ["Encerrado"];
export const STATUS_ASSESSORIA = ["Enviado para Assessoria"];
export const STATUS_PROTESTO = [
    "Protesto Solicitado",
      "Protesto Aprovado",
        "Protesto Recusado",
];
export const STATUS_CONFERENCIA = ["Enviado para Conferencia"];
export const STATUS_APROVACAO = ["Enviado para Aprovacao"];
export const STATUS_PROMESSA = ["Prometeu Pagar", "Promessa Descumprida"];

// Carteira Geral = ativos. Nao mostra pagos, encerrados nem assessoria.
export const STATUS_CARTEIRA_GERAL = STATUS_OPC.filter(
  (s) =>
      !STATUS_PAGOS.includes(s) &&
          !STATUS_ENCERRADOS.includes(s) &&
              !STATUS_ASSESSORIA.includes(s)
              );

              // =============================================================================
              // 3) HELPERS DE CLASSIFICACAO
              // =============================================================================
              // IMPORTANTE: o sistema atual tambem usa um campo verif_resp (resposta da
              // verificacao) com valor "Baixado" para marcar titulos baixados. Considere isso
              // ao filtrar os pagos.

              export function isTituloPago(titulo) {
                if (!titulo) return false;
                  if (STATUS_PAGOS.includes(titulo.status)) return true;
                    if (titulo.verif_resp === "Baixado") return true;
                      return false;
                      }

                      export function isTituloEncerrado(titulo) {
                        return !!titulo && STATUS_ENCERRADOS.includes(titulo.status);
                        }

                        export function isTituloAssessoria(titulo) {
                          return !!titulo && STATUS_ASSESSORIA.includes(titulo.status);
                          }

                          // Titulo da Carteira Geral: ativo, em aberto. Exclui pagos, encerrados e assessoria.
                          export function isTituloCarteiraGeral(titulo) {
                            if (!titulo) return false;
                              if (isTituloPago(titulo)) return false;
                                if (isTituloEncerrado(titulo)) return false;
                                  if (isTituloAssessoria(titulo)) return false;
                                    return STATUS_CARTEIRA_GERAL.includes(titulo.status);
                                    }

                                    // =============================================================================
                                    // 4) FAIXAS DE ATRASO
                                    // =============================================================================
                                    // Cada faixa tem id estavel, label exibivel e funcao de teste (atrasoEmDias) => bool.

                                    export const FAIXAS_ATRASO = [
                                        { id: "ate5",    label: "Ate 5 dias",      min: 0,   max: 5   },
                                          { id: "6a10",    label: "6 a 10 dias",     min: 6,   max: 10  },
                                            { id: "11a15",   label: "11 a 15 dias",    min: 11,  max: 15  },
                                              { id: "16a20",   label: "16 a 20 dias",    min: 16,  max: 20  },
                                                { id: "21a30",   label: "21 a 30 dias",    min: 21,  max: 30  },
                                                  { id: "31a60",   label: "31 a 60 dias",    min: 31,  max: 60  },
                                                    { id: "61a90",   label: "61 a 90 dias",    min: 61,  max: 90  },
                                                      { id: "acima90", label: "Acima de 90 dias", min: 91, max: Infinity },
];

export function faixaDoAtraso(atrasoDias) {
  const n = Number(atrasoDias);
    if (!Number.isFinite(n)) return null;
      return FAIXAS_ATRASO.find((f) => n >= f.min && n <= f.max) || null;
      }

      export function matchFaixasAtraso(atrasoDias, faixasSelecionadasIds = []) {
        if (!faixasSelecionadasIds.length) return true; // sem filtro => passa tudo
          const f = faixaDoAtraso(atrasoDias);
            return !!f && faixasSelecionadasIds.includes(f.id);
            }

            // =============================================================================
            // 5) CALCULO DE ATRASO POR CONTEXTO
            // =============================================================================
            // O atraso muda dependendo da aba:
            //  - Carteira Geral / Conferencia / Aprovacao: vencimento -> hoje
            //  - Pagos: vencimento -> data de pagamento/baixa
            //  - Impacto no Caixa: vencimento -> hoje (para classificar criticidade)

            function _toDate(v) {
              if (!v) return null;
                if (v instanceof Date) return v;
                  const d = new Date(v);
                    return isNaN(d.getTime()) ? null : d;
                    }

                    function _diffDiasInteiros(de, ate) {
                      const a = _toDate(de);
                        const b = _toDate(ate);
                          if (!a || !b) return null;
                            const MS = 24 * 60 * 60 * 1000;
                              return Math.floor((b.getTime() - a.getTime()) / MS);
                              }

                              // Atraso ativo: do vencimento ate hoje. Se ainda nao venceu, retorna 0.
                              export function atrasoAtivo(titulo, hojeDate = new Date()) {
                                if (!titulo) return 0;
                                  const d = _diffDiasInteiros(titulo.vencimento, hojeDate);
                                    return d == null ? 0 : Math.max(0, d);
                                    }

                                    // Atraso ate pagamento: vencimento ate data de pagamento/baixa.
                                    // Procura nos campos mais comuns. Ajuste conforme o schema real do Base44.
                                    export function atrasoAtePagamento(titulo) {
                                      if (!titulo) return 0;
                                        const dataPag =
                                            titulo.data_pagamento ||
                                                titulo.data_baixa ||
                                                    titulo.dt_pagto ||
                                                        titulo.data_pag ||
                                                            titulo.dataPagamento ||
                                                                titulo.dataBaixa ||
                                                                    null;
                                                                      if (!dataPag) return null; // sem data de pagamento => indefinido
                                                                        const d = _diffDiasInteiros(titulo.vencimento, dataPag);
                                                                          return d == null ? null : Math.max(0, d);
                                                                          }

                                                                          // =============================================================================
                                                                          // 6) PRODUTIVIDADE: identificacao de contato real e normalizacao de nomes
                                                                          // =============================================================================

                                                                          // Nomes que NAO devem entrar no ranking de produtividade.
                                                                          export const RESPONSAVEIS_AUTOMATICOS = new Set([
                                                                              "sistema",
                                                                                "equipe",
                                                                                  "importacao",
                                                                                    "importacao automatica",
                                                                                      "baixa automatica",
                                                                                        "registro automatico",
                                                                                          "assinatura automatica",
                                                                                            "automatico",
                                                                                              "auto",
]);

// Normaliza o nome do cobrador para servir de chave de agrupamento.
//  - tira acentos
//  - tira espacos extras
//  - lowercase
// Use o nome normalizado como chave; para exibicao, mantenha o primeiro nome
// "humanamente formatado" encontrado para essa chave.
export function normalizarNomeCobrador(nome) {
  if (nome == null) return "";
    return String(nome)
        .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
                .replace(/\s+/g, " ")
                    .trim()
                        .toLowerCase();
                        }

                        // Title-case simples para exibir nome do cobrador.
                        export function exibirNomeCobrador(nome) {
                          if (!nome) return "";
                            return String(nome)
                                .trim()
                                    .toLowerCase()
                                        .replace(/\b([a-zA-ZAaEeIiOoUuCc])/g, (m) => m.toUpperCase());
                                        }

                                        // Diz se um responsavel deve ser ignorado no ranking.
                                        export function isResponsavelAutomatico(responsavel) {
                                          const k = normalizarNomeCobrador(responsavel);
                                            if (!k) return true;
                                              return RESPONSAVEIS_AUTOMATICOS.has(k);
                                              }

                                              // Diz se um registro de cobranca representa contato real feito por humano.
                                              // Considera contato real quando ha preenchimento manual de pelo menos um destes:
                                              //  - data_promessa
                                              //  - observacao
                                              //  - registro de contato (campo registro_contato ou contato_em)
                                              //  - atualizacao manual (flag manual=true, ou auto=false explicito)
                                              export function isContatoReal(registro) {
                                                if (!registro) return false;
                                                  if (registro.auto === true) return false;
                                                    if (registro.manual === false) return false;
                                                      if (isResponsavelAutomatico(registro.responsavel)) return false;

                                                        const temPromessa = !!(registro.data_promessa || registro.dataPromessa);
                                                          const temObs = !!(registro.observacao && String(registro.observacao).trim());
                                                            const temRegistroContato = !!(
                                                                registro.registro_contato ||
                                                                    registro.contato_em ||
                                                                        registro.data_contato ||
                                                                            registro.dataContato
                                                                              );
                                                                                const flagManual = registro.manual === true;

                                                                                  return temPromessa || temObs || temRegistroContato || flagManual;
                                                                                  }

                                                                                  // =============================================================================
                                                                                  // 7) AGRUPADORES PARA IMPACTO NO CAIXA
                                                                                  // =============================================================================
                                                                                  // Funcoes puras para classificar titulos. Use no PrevisaoFluxo.jsx em vez de
                                                                                  // repetir a logica em varios lugares.

                                                                                  const _LIMITE_CRITICO_DIAS = 90;

                                                                                  function _isMesmoMes(dataA, dataB) {
                                                                                    const a = _toDate(dataA);
                                                                                      const b = _toDate(dataB);
                                                                                        if (!a || !b) return false;
                                                                                          return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
                                                                                          }

                                                                                          export function classificarImpactoCaixa(titulos = [], hoje = new Date()) {
                                                                                            const previsaoFutura = [];
                                                                                              const recuperadoNoMes = [];
                                                                                                const titulosPagos = [];
                                                                                                  const gapNaoProjetado = [];
                                                                                                    const debitosCriticos = [];
                                                                                                      const promessasAtivas = [];
                                                                                                        const promessasDescumpridas = [];
                                                                                                        
                                                                                                          for (const t of titulos) {
                                                                                                              if (!t) continue;
                                                                                                              
                                                                                                                  if (isTituloPago(t)) {
                                                                                                                        titulosPagos.push(t);
                                                                                                                              const dPag =
                                                                                                                                      t.data_pagamento || t.data_baixa || t.dt_pagto || t.data_pag || null;
                                                                                                                                            if (_isMesmoMes(dPag, hoje)) recuperadoNoMes.push(t);
                                                                                                                                                  continue;
                                                                                                                                                      }
                                                                                                                                                      
                                                                                                                                                          if (isTituloEncerrado(t)) continue;
                                                                                                                                                              if (isTituloAssessoria(t)) continue;
                                                                                                                                                              
                                                                                                                                                                  // Em aberto a partir daqui.
                                                                                                                                                                      previsaoFutura.push(t);
                                                                                                                                                                      
                                                                                                                                                                          const atraso = atrasoAtivo(t, hoje);
                                                                                                                                                                              if (atraso > _LIMITE_CRITICO_DIAS) debitosCriticos.push(t);
                                                                                                                                                                              
                                                                                                                                                                                  const temPromessa = !!(t.data_promessa || t.dataPromessa);
                                                                                                                                                                                      if (!temPromessa) {
                                                                                                                                                                                            gapNaoProjetado.push(t);
                                                                                                                                                                                                } else {
                                                                                                                                                                                                      const dPromessa = _toDate(t.data_promessa || t.dataPromessa);
                                                                                                                                                                                                            if (t.status === "Promessa Descumprida") {
                                                                                                                                                                                                                    promessasDescumpridas.push(t);
                                                                                                                                                                                                                          } else if (t.status === "Prometeu Pagar" && dPromessa && dPromessa < hoje) {
                                                                                                                                                                                                                                  promessasDescumpridas.push(t);
                                                                                                                                                                                                                                        } else if (t.status === "Prometeu Pagar") {
                                                                                                                                                                                                                                                promessasAtivas.push(t);
                                                                                                                                                                                                                                                      }
                                                                                                                                                                                                                                                          }
                                                                                                                                                                                                                                                            }
                                                                                                                                                                                                                                                            
                                                                                                                                                                                                                                                              return {
                                                                                                                                                                                                                                                                  previsaoFutura,
                                                                                                                                                                                                                                                                      recuperadoNoMes,
                                                                                                                                                                                                                                                                          titulosPagos,
                                                                                                                                                                                                                                                                              gapNaoProjetado,
                                                                                                                                                                                                                                                                                  debitosCriticos,
                                                                                                                                                                                                                                                                                      promessasAtivas,
                                                                                                                                                                                                                                                                                          promessasDescumpridas,
                                                                                                                                                                                                                                                                                            };
                                                                                                                                                                                                                                                                                            }
                                                                                                                                                                                                                                                                                            
                                                                                                                                                                                                                                                                                            // =============================================================================
                                                                                                                                                                                                                                                                                            // FIM
                                                                                                                                                                                                                                                                                            // =============================================================================
                                                                                                                                                                                                                                                                                            
