export type ProcessSite = { status: 'verified'; code: string } | { status: 'needs_review' };

type SiteEvidence = {
  descriptionOfRestrictions?: unknown;
  referenceToReferenceFlow?: unknown;
  exchanges?: unknown;
  technologyDescription?: unknown;
};

const siteCodePattern = /\b([ZD])\s*(\d{1,3})\b/gi;

function textNodes(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(textNodes);
  }
  if (value && typeof value === 'object' && '#text' in value) {
    return textNodes(value['#text']);
  }
  return [];
}

function codesInText(value: unknown, requireFactoryContext: boolean): Map<string, string> {
  const codes = new Map<string, string>();
  for (const text of textNodes(value)) {
    for (const match of text.matchAll(siteCodePattern)) {
      const number = Number(match[2]);
      if (!number) {
        continue;
      }
      const code = `${match[1].toUpperCase()}${number}`;
      const displayCode = `${match[1].toUpperCase()}${match[2]}`;
      if (requireFactoryContext) {
        const before = text.slice(Math.max(0, match.index - 25), match.index);
        const after = text.slice(match.index + match[0].length, match.index + match[0].length + 60);
        const factoryBefore =
          /(?:\b(?:factory|plant|steelworks)\b|钢铁企业|工厂|厂)\s*(?:code|代码|编号|#|no\.?)?\s*$/i.test(
            before,
          );
        const factoryAfter =
          /^\s*(?:工厂|厂|钢铁企业|\b(?:factory|plant|steelworks)\b)/i.test(after) ||
          /^(?:为|是)(?:中国)?(?:匿名)?钢铁企业/.test(after) ||
          /^\s+is\s+an?\s+(?:anonymous\s+)?(?:Chinese\s+)?steelworks\b/i.test(after);
        if (!factoryBefore && !factoryAfter) {
          continue;
        }
      }
      if (!codes.has(code)) {
        codes.set(code, displayCode);
      }
    }
  }
  return codes;
}

export function deriveProcessSite(evidence: SiteEvidence): ProcessSite | undefined {
  const geographyCodes = codesInText(evidence.descriptionOfRestrictions, true);
  if (geographyCodes.size === 0) {
    return undefined;
  }
  if (geographyCodes.size !== 1) {
    return { status: 'needs_review' };
  }

  const [geographyCode, displayCode] = geographyCodes.entries().next().value as [string, string];
  const referenceId =
    typeof evidence.referenceToReferenceFlow === 'string' ||
    typeof evidence.referenceToReferenceFlow === 'number'
      ? String(evidence.referenceToReferenceFlow).trim()
      : '';
  const exchanges = Array.isArray(evidence.exchanges)
    ? evidence.exchanges
    : evidence.exchanges && typeof evidence.exchanges === 'object'
      ? [evidence.exchanges]
      : [];
  const referenceExchanges = exchanges.filter(
    (exchange) =>
      exchange &&
      typeof exchange === 'object' &&
      String(exchange['@dataSetInternalID'] ?? '').trim() === referenceId,
  );
  if (!referenceId || referenceExchanges.length !== 1) {
    return { status: 'needs_review' };
  }

  const referenceExchange = referenceExchanges[0];
  if (String(referenceExchange.exchangeDirection ?? '').toLowerCase() !== 'output') {
    return { status: 'needs_review' };
  }
  const referenceComments = textNodes(referenceExchange.generalComment);
  if (
    referenceComments.some(
      (comment) =>
        /\b(?:not|never)\s+(?:[\w-]+\s+){0,5}(?:measured|verified|confirmed|observed)\b/i.test(
          comment,
        ) || /(?:非|未).{0,24}(?:实测|核实|确认)/.test(comment),
    )
  ) {
    return { status: 'needs_review' };
  }
  const referenceCodes = codesInText(referenceExchange.generalComment, false);
  if (referenceCodes.size !== 1 || !referenceCodes.has(geographyCode)) {
    return { status: 'needs_review' };
  }

  // Technology text can veto a label, but cannot supply one in place of geography evidence.
  const technologyCodes = codesInText(evidence.technologyDescription, false);
  if ([...technologyCodes.keys()].some((code) => code !== geographyCode)) {
    return { status: 'needs_review' };
  }

  return { status: 'verified', code: displayCode };
}

export function processSiteFromRow(row: any): ProcessSite | undefined {
  const process = row?.json?.processDataSet;
  if (process) {
    const information = process.processInformation;
    return deriveProcessSite({
      descriptionOfRestrictions:
        information?.geography?.locationOfOperationSupplyOrProduction?.descriptionOfRestrictions,
      referenceToReferenceFlow: information?.quantitativeReference?.referenceToReferenceFlow,
      exchanges: process.exchanges?.exchange,
      technologyDescription: [
        information?.technology?.technologyDescriptionAndIncludedProcesses,
        information?.technology?.technologicalApplicability,
      ],
    });
  }
  return deriveProcessSite({
    descriptionOfRestrictions: row?.descriptionOfRestrictions,
    referenceToReferenceFlow: row?.referenceToReferenceFlow,
    exchanges: row?.exchange,
    technologyDescription: [
      row?.technologyDescriptionAndIncludedProcesses,
      row?.technologicalApplicability,
    ],
  });
}
