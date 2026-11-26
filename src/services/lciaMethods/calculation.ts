import { findProcessExchangeAmountConflict } from '@tiangong-lca/tidas-sdk/core';
import { toBigNumberOrNaN, toBigNumberOrZero } from '@/services/general/bignumber';
import { CANONICAL_CONTENT_LANGUAGE } from '@/services/general/contentLanguageRegistry';
import type { ProcessExchangeData } from '@/services/processes/data';
import type BigNumber from 'bignumber.js';
import type {
  LciaCoverageCounts,
  LciaFlowFactorMap,
  LciaMethodFactorCoverageMatrix,
  LciaMethodListData,
  LCIAResultTable,
  LciaStaticCacheMethod,
  LciaStaticCalculationReport,
  LciaStaticCalculationResult,
  LciaUncharacterizedExchange,
  LciaUncharacterizedReason,
} from './data';
import { computeLciaSha256, STATIC_LCIA_CACHE_MANIFEST } from './evidence';
import { selectNonregionalFactors } from './nonregional';

type StaticCalculationInput = {
  exchanges: ProcessExchangeData[];
  listData: LciaMethodListData;
  factors: LciaFlowFactorMap;
  observedListSha256?: string;
  observedFactorSha256?: string;
};

const emptyCounts = (): LciaCoverageCounts => ({
  matched: 0,
  unmatched: 0,
  invalid: 0,
  unsupported_direction: 0,
});

const normalizeExchangeFlowRef = (exchange: ProcessExchangeData) =>
  Array.isArray(exchange.referenceToFlowDataSet)
    ? exchange.referenceToFlowDataSet[0]
    : exchange.referenceToFlowDataSet;

function calculationAmountSource(exchange: ProcessExchangeData) {
  return (exchange.resultingAmount !== null && exchange.resultingAmount !== undefined) ||
    exchange.referenceToVariable?.trim()
    ? 'resultingAmount'
    : 'meanAmount';
}

function buildGap(
  method: LciaStaticCacheMethod,
  exchange: ProcessExchangeData,
  exchangeIndex: number,
  reason: LciaUncharacterizedReason,
): LciaUncharacterizedExchange {
  const flowRef = normalizeExchangeFlowRef(exchange);
  return {
    method_id: method.method_id,
    method_version: method.method_version,
    artifact_locator_id: method.artifact_locator_id,
    flow_uuid: String(flowRef?.['@refObjectId'] ?? ''),
    flow_version: String(flowRef?.['@version'] ?? ''),
    direction: String(exchange.exchangeDirection ?? '').toUpperCase(),
    exchange_id: String(exchange['@dataSetInternalID'] ?? `exchange-${exchangeIndex + 1}`),
    amount: String(exchange[calculationAmountSource(exchange)] ?? ''),
    amount_source: calculationAmountSource(exchange),
    resulting_amount:
      exchange.resultingAmount === undefined || exchange.resultingAmount === null
        ? null
        : String(exchange.resultingAmount),
    reason,
  };
}

function buildMethodRows() {
  return STATIC_LCIA_CACHE_MANIFEST.methods.map((method) => ({
    method_id: method.method_id,
    method_version: method.method_version,
    artifact_locator_id: method.artifact_locator_id,
    counts: emptyCounts(),
  }));
}

async function buildMatrix(
  counts: LciaCoverageCounts,
  byMethod: ReturnType<typeof buildMethodRows>,
  gaps: LciaUncharacterizedExchange[],
): Promise<LciaMethodFactorCoverageMatrix> {
  const incomplete = counts.unmatched + counts.invalid + counts.unsupported_direction > 0;
  const jsonl = gaps.length > 0 ? `${gaps.map((gap) => JSON.stringify(gap)).join('\n')}\n` : '';
  let artifact: LciaMethodFactorCoverageMatrix['uncharacterized_evidence'] = null;
  if (jsonl) {
    artifact = {
      artifact_url: 'inline:lcia-calculation-evidence',
      artifact_format: 'lcia-uncharacterized-jsonl:v1',
      artifact_sha256: await computeLciaSha256(jsonl),
      record_count: gaps.length,
    };
  }

  return {
    schema_version: 'lcia.method_factor_coverage.matrix.v1',
    source_snapshot_sha256: STATIC_LCIA_CACHE_MANIFEST.source_snapshot_sha256,
    method_manifest_sha256: STATIC_LCIA_CACHE_MANIFEST.method_manifest_sha256,
    method_identity_manifest_sha256: STATIC_LCIA_CACHE_MANIFEST.method_identity_manifest_sha256,
    factor_manifest_sha256: STATIC_LCIA_CACHE_MANIFEST.factor_manifest_sha256,
    count_unit: 'exchange_method_pair',
    key_dimensions: ['method_id', 'method_version', 'flow_uuid', 'direction'],
    coverage_status: incomplete ? 'incomplete_coverage' : 'complete',
    missing_factor_semantics: 'incomplete_coverage_not_zero',
    counts,
    by_method: byMethod,
    uncharacterized_evidence: artifact,
    ...(gaps.length > 0 ? { uncharacterized_exchanges: gaps } : {}),
  };
}

function listMatchesManifest(listData: LciaMethodListData): boolean {
  if (
    !Array.isArray(listData.files) ||
    listData.files.length !== STATIC_LCIA_CACHE_MANIFEST.methods.length
  ) {
    return false;
  }
  const listed = new Map(listData.files.map((method) => [method.id, method]));
  return STATIC_LCIA_CACHE_MANIFEST.methods.every((method) => {
    const entry = listed.get(method.artifact_locator_id);
    return entry?.version === method.method_version && entry?.filename === method.artifact_filename;
  });
}

function buildSource(
  observedListSha256?: string,
  observedFactorSha256?: string,
): LciaStaticCalculationReport['source'] {
  return {
    schema_version: 'lcia.method_factor_source.static_cache_bundle.v1',
    source_kind: 'static_cache_bundle',
    bundle_version: STATIC_LCIA_CACHE_MANIFEST.bundle_version,
    source_snapshot_sha256: STATIC_LCIA_CACHE_MANIFEST.source_snapshot_sha256,
    method_manifest_sha256: STATIC_LCIA_CACHE_MANIFEST.method_manifest_sha256,
    method_identity_manifest_sha256: STATIC_LCIA_CACHE_MANIFEST.method_identity_manifest_sha256,
    factor_manifest_sha256: STATIC_LCIA_CACHE_MANIFEST.factor_manifest_sha256,
    observed_list_sha256: observedListSha256 ?? null,
    observed_factor_sha256: observedFactorSha256 ?? null,
  };
}

async function buildStaticNoResult(
  exchanges: ProcessExchangeData[],
  status: 'calculation_failure' | 'method_source_drift',
  failureReason: string,
  observed?: { listSha256?: string; factorSha256?: string },
): Promise<LciaStaticCalculationResult> {
  const byMethod = buildMethodRows();
  const gaps: LciaUncharacterizedExchange[] = [];
  for (const [exchangeIndex, exchange] of exchanges.entries()) {
    for (const [methodIndex, method] of STATIC_LCIA_CACHE_MANIFEST.methods.entries()) {
      byMethod[methodIndex].counts.invalid += 1;
      gaps.push(buildGap(method, exchange, exchangeIndex, status));
    }
  }
  const counts = {
    matched: 0,
    unmatched: 0,
    invalid: gaps.length,
    unsupported_direction: 0,
  };
  let matrix: LciaMethodFactorCoverageMatrix;
  try {
    matrix = await buildMatrix(counts, byMethod, gaps);
  } catch {
    matrix = {
      schema_version: 'lcia.method_factor_coverage.matrix.v1',
      source_snapshot_sha256: STATIC_LCIA_CACHE_MANIFEST.source_snapshot_sha256,
      method_manifest_sha256: STATIC_LCIA_CACHE_MANIFEST.method_manifest_sha256,
      method_identity_manifest_sha256: STATIC_LCIA_CACHE_MANIFEST.method_identity_manifest_sha256,
      factor_manifest_sha256: STATIC_LCIA_CACHE_MANIFEST.factor_manifest_sha256,
      count_unit: 'exchange_method_pair',
      key_dimensions: ['method_id', 'method_version', 'flow_uuid', 'direction'],
      coverage_status: 'incomplete_coverage',
      missing_factor_semantics: 'incomplete_coverage_not_zero',
      counts,
      by_method: byMethod,
      uncharacterized_evidence: null,
      // buildMatrix can throw only while hashing a non-empty gap list.
      uncharacterized_exchanges: gaps,
    };
  }
  return {
    results: [],
    report: {
      schema_version: 'lcia.frontend_calculation_report.v1',
      calculation_status: status,
      source: buildSource(observed?.listSha256, observed?.factorSha256),
      method_factor_coverage: matrix,
      failure_reason: failureReason,
    },
  };
}

export async function buildStaticCalculationFailure(
  exchanges: ProcessExchangeData[],
  failureReason: string,
  observed?: { listSha256?: string; factorSha256?: string },
): Promise<LciaStaticCalculationResult> {
  return await buildStaticNoResult(exchanges, 'calculation_failure', failureReason, observed);
}

export async function calculateStaticLcia(
  input: StaticCalculationInput,
): Promise<LciaStaticCalculationResult> {
  const { exchanges, listData, factors, observedListSha256, observedFactorSha256 } = input;
  const byMethod = buildMethodRows();
  const methodRowById = new Map(byMethod.map((row) => [row.method_id, row]));
  const methodById = new Map(
    STATIC_LCIA_CACHE_MANIFEST.methods.map((method) => [method.method_id, method]),
  );
  const listedByLocator = new Map(
    (Array.isArray(listData.files) ? listData.files : []).map((method) => [method.id, method]),
  );
  const totals = new Map<string, BigNumber>();
  const methodsWithNumericFactors = new Set<string>();
  const gaps: LciaUncharacterizedExchange[] = [];
  const sourceDriftReasons: string[] = [];

  if (!listMatchesManifest(listData)) {
    sourceDriftReasons.push('method_list_manifest_mismatch');
  }
  if (observedListSha256 !== STATIC_LCIA_CACHE_MANIFEST.files.list.sha256) {
    sourceDriftReasons.push('method_list_sha256_mismatch');
  }
  if (observedFactorSha256 !== STATIC_LCIA_CACHE_MANIFEST.files.factors.sha256) {
    sourceDriftReasons.push('factor_map_sha256_mismatch');
  }
  if (sourceDriftReasons.length > 0) {
    return await buildStaticNoResult(
      exchanges,
      'method_source_drift',
      sourceDriftReasons.join(','),
      { listSha256: observedListSha256, factorSha256: observedFactorSha256 },
    );
  }

  for (const [exchangeIndex, exchange] of exchanges.entries()) {
    const flowRef = normalizeExchangeFlowRef(exchange);
    const flowId = String(flowRef?.['@refObjectId'] ?? '').trim();
    const direction = String(exchange.exchangeDirection ?? '')
      .trim()
      .toUpperCase();
    const conflict = findProcessExchangeAmountConflict(exchange);
    if (conflict) {
      return await buildStaticNoResult(
        exchanges,
        'calculation_failure',
        `exchange[${exchangeIndex}].resultingAmount: ${conflict.message}`,
        { listSha256: observedListSha256, factorSha256: observedFactorSha256 },
      );
    }
    const amount = toBigNumberOrNaN(exchange[calculationAmountSource(exchange)]);
    let sharedReason: LciaUncharacterizedReason | null = null;
    let countKey: keyof LciaCoverageCounts | null = null;

    if (!flowId) {
      sharedReason = 'missing_flow_uuid';
      countKey = 'invalid';
    } else if (direction !== 'INPUT' && direction !== 'OUTPUT') {
      sharedReason = 'unsupported_direction';
      countKey = 'unsupported_direction';
    } else if (
      !amount.isFinite() ||
      (exchange.meanAmount !== null &&
        exchange.meanAmount !== undefined &&
        !toBigNumberOrNaN(exchange.meanAmount).isFinite())
    ) {
      sharedReason = 'invalid_exchange_amount';
      countKey = 'invalid';
    }

    if (sharedReason && countKey) {
      for (const method of STATIC_LCIA_CACHE_MANIFEST.methods) {
        methodRowById.get(method.method_id)!.counts[countKey] += 1;
        gaps.push(buildGap(method, exchange, exchangeIndex, sharedReason));
      }
      continue;
    }

    const group = factors[`${flowId}:${direction}`];
    const flowVersion = String(flowRef?.['@version'] ?? '').trim();
    const factorEntries =
      flowVersion && group?.['@version'] === flowVersion && Array.isArray(group.factor)
        ? group.factor
        : [];
    const entriesByMethod = new Map<string, typeof factorEntries>();
    for (const factor of factorEntries) {
      const factorMethodId = String(factor?.key ?? '').trim();
      if (!methodById.has(factorMethodId)) {
        sourceDriftReasons.push(`unknown_factor_method_id:${factorMethodId || '<empty>'}`);
        continue;
      }
      entriesByMethod.set(factorMethodId, [...(entriesByMethod.get(factorMethodId) ?? []), factor]);
    }

    for (const method of STATIC_LCIA_CACHE_MANIFEST.methods) {
      const methodRow = methodRowById.get(method.method_id)!;
      const methodFactors = selectNonregionalFactors(
        method.method_id,
        flowId,
        flowVersion,
        direction,
        entriesByMethod.get(method.method_id) ?? [],
      );
      if (methodFactors === null) {
        sourceDriftReasons.push(
          `nonregional_default_source_mismatch:${method.method_id}:${flowId}:${flowVersion}:${direction}`,
        );
        continue;
      }
      if (methodFactors.length === 0) {
        methodRow.counts.unmatched += 1;
        gaps.push(buildGap(method, exchange, exchangeIndex, 'missing_factor'));
        continue;
      }

      let invalidFactor = false;
      for (const factor of methodFactors) {
        const factorValue = toBigNumberOrNaN(factor.value);
        if (factorValue.isNaN() || !factorValue.isFinite()) {
          invalidFactor = true;
          continue;
        }
        methodsWithNumericFactors.add(method.method_id);
        totals.set(
          method.method_id,
          (totals.get(method.method_id) ?? toBigNumberOrZero(0)).plus(amount.times(factorValue)),
        );
      }
      if (invalidFactor) {
        methodRow.counts.invalid += 1;
        gaps.push(buildGap(method, exchange, exchangeIndex, 'invalid_factor'));
      } else {
        methodRow.counts.matched += 1;
      }
    }
  }

  const counts = byMethod.reduce<LciaCoverageCounts>(
    (sum, method) => ({
      matched: sum.matched + method.counts.matched,
      unmatched: sum.unmatched + method.counts.unmatched,
      invalid: sum.invalid + method.counts.invalid,
      unsupported_direction: sum.unsupported_direction + method.counts.unsupported_direction,
    }),
    emptyCounts(),
  );
  const matrix = await buildMatrix(counts, byMethod, gaps);
  const uniqueDriftReasons = Array.from(new Set(sourceDriftReasons)).sort();
  if (uniqueDriftReasons.length > 0) {
    return await buildStaticNoResult(
      exchanges,
      'method_source_drift',
      uniqueDriftReasons.join(','),
      { listSha256: observedListSha256, factorSha256: observedFactorSha256 },
    );
  }
  const results = STATIC_LCIA_CACHE_MANIFEST.methods.flatMap((method) => {
    const value = totals.get(method.method_id);
    if (
      !methodsWithNumericFactors.has(method.method_id) ||
      !value ||
      value.isNaN() ||
      !value.isFinite()
    ) {
      return [];
    }
    const metadata = listedByLocator.get(method.artifact_locator_id);
    const result: LCIAResultTable = {
      key: method.method_id,
      referenceToLCIAMethodDataSet: {
        '@refObjectId': method.method_id,
        '@type': 'LCIA method data set',
        '@uri': `../lciamethods/${method.artifact_locator_id}.xml`,
        '@version': method.method_version,
        'common:shortDescription': metadata?.description ?? [
          { '@xml:lang': CANONICAL_CONTENT_LANGUAGE, '#text': method.method_id },
        ],
      },
      meanAmount: value.toString(),
    };
    return [result];
  });

  return {
    results,
    report: {
      schema_version: 'lcia.frontend_calculation_report.v1',
      calculation_status: matrix.coverage_status,
      source: buildSource(observedListSha256, observedFactorSha256),
      method_factor_coverage: matrix,
      failure_reason: null,
    },
  };
}
