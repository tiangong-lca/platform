import staticCacheManifestJson from '../../../public/lciamethods/cache_manifest.json';
import staticMethodListJson from '../../../public/lciamethods/list.json';
import type {
  LcaCalculationEvidence,
  LcaCalculationEvidenceV1,
  LcaCalculationEvidenceV2,
  LcaUncharacterizedEvidenceArtifactBase,
  LcaUncharacterizedEvidenceArtifactV1,
  LcaUncharacterizedEvidenceArtifactV2,
  LciaCalculationStatus,
  LciaCoverageCounts,
  LciaMethodCoverageRow,
  LciaMethodFactorCoverageMatrix,
  LciaStaticCacheBundleManifest,
  LciaStaticCacheMethod,
  LciaStaticCalculationReport,
  LciaUncharacterizedExchange,
  LciaUncharacterizedReason,
} from './data';

export const STATIC_LCIA_CACHE_MANIFEST = staticCacheManifestJson as LciaStaticCacheBundleManifest;
export const STATIC_LCIA_METHOD_LIST = staticMethodListJson;
export const STATIC_LCIA_CACHE_MANIFEST_PATH = 'lciamethods/cache_manifest.json' as const;
export const STATIC_LCIA_CACHE_MANIFEST_SHA256 =
  'e9b4e7f9a5125bb921efbffba9a4b50711f9ea982e22b500f35211884a0479c5';

export function resolveReviewedLciaMethodIdentity(
  methodOrLocatorId: unknown,
  version?: unknown,
): LciaStaticCacheMethod | null {
  if (typeof methodOrLocatorId !== 'string' || !methodOrLocatorId.trim()) {
    return null;
  }
  const normalizedId = methodOrLocatorId.trim();
  const normalizedVersion = typeof version === 'string' ? version.trim() : '';
  const candidates = STATIC_LCIA_CACHE_MANIFEST.methods.filter(
    (method) => method.method_id === normalizedId || method.artifact_locator_id === normalizedId,
  );
  if (normalizedVersion) {
    return candidates.find((method) => method.method_version === normalizedVersion) ?? null;
  }
  return candidates.length === 1 ? candidates[0] : null;
}

export function toCanonicalLciaMethodId(methodOrLocatorId: unknown, version?: unknown): string {
  const normalizedId = typeof methodOrLocatorId === 'string' ? methodOrLocatorId.trim() : '';
  return resolveReviewedLciaMethodIdentity(normalizedId, version)?.method_id ?? normalizedId;
}

export function toLciaArtifactLocatorId(methodOrLocatorId: unknown, version?: unknown): string {
  const normalizedId = typeof methodOrLocatorId === 'string' ? methodOrLocatorId.trim() : '';
  return (
    resolveReviewedLciaMethodIdentity(normalizedId, version)?.artifact_locator_id ?? normalizedId
  );
}

export const LCIA_EVIDENCE_EXTENSION_NAMESPACE =
  'https://lca.tiangong.earth/ILCD/Extensions/LCIACalculationEvidence/2026';
export const LCIA_EVIDENCE_EXTENSION_KEY = 'tg:lciaCalculationEvidence';

const SHA256_RE = /^[0-9a-f]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonnegativeInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function normalizeSha256(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return SHA256_RE.test(normalized) ? normalized : null;
}

function canonicalJsonValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJsonValue).join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJsonValue(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function canonicalJson(value: unknown): string {
  if (value === undefined) {
    throw new Error('Cannot canonicalize undefined LCIA evidence');
  }
  return canonicalJsonValue(value);
}

export async function computeLciaSha256(value: string | ArrayBuffer): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle?.digest) {
    throw new Error('SHA-256 digest is unavailable in this browser');
  }
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const digest = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function normalizeCounts(value: unknown): LciaCoverageCounts | null {
  if (!isRecord(value)) {
    return null;
  }
  const counts = {
    matched: nonnegativeInteger(value.matched),
    unmatched: nonnegativeInteger(value.unmatched),
    invalid: nonnegativeInteger(value.invalid),
    unsupported_direction: nonnegativeInteger(value.unsupported_direction),
  };
  return Object.values(counts).some((count) => count === null)
    ? null
    : (counts as LciaCoverageCounts);
}

function normalizeArtifact<TArtifact extends LcaUncharacterizedEvidenceArtifactBase>(
  value: unknown,
  artifactFormat: TArtifact['artifact_format'],
): TArtifact | null {
  if (!isRecord(value)) {
    return null;
  }
  const sha256 = normalizeSha256(value.artifact_sha256);
  const recordCount = nonnegativeInteger(value.record_count);
  if (
    typeof value.artifact_url !== 'string' ||
    !value.artifact_url.trim() ||
    value.artifact_format !== artifactFormat ||
    !sha256 ||
    recordCount === null ||
    recordCount === 0
  ) {
    return null;
  }
  return {
    artifact_url: value.artifact_url.trim(),
    artifact_format: artifactFormat,
    artifact_sha256: sha256,
    record_count: recordCount,
  } as unknown as TArtifact;
}

function normalizeCoverageSummary(
  raw: unknown,
): LcaCalculationEvidenceV1['lcia_factor_coverage'] | null {
  const coverage = isRecord(raw) ? raw : null;
  const counts = normalizeCounts(coverage?.counts);
  const coverageStatus = coverage?.coverage_status;
  const incompleteCount = counts
    ? counts.unmatched + counts.invalid + counts.unsupported_direction
    : -1;
  const incompleteCountIsSafe = Number.isSafeInteger(incompleteCount);
  const artifact =
    coverage?.uncharacterized_evidence === null
      ? null
      : normalizeArtifact<LcaUncharacterizedEvidenceArtifactV1>(
          coverage?.uncharacterized_evidence,
          'lcia-uncharacterized-jsonl:v1',
        );
  if (
    !coverage ||
    coverage.schema_version !== 'lcia.factor_coverage.v1' ||
    (coverageStatus !== 'complete' && coverageStatus !== 'incomplete_coverage') ||
    coverage.missing_factor_semantics !== 'incomplete_coverage_not_zero' ||
    !counts ||
    !incompleteCountIsSafe ||
    (incompleteCount === 0 && (coverageStatus !== 'complete' || artifact !== null)) ||
    (incompleteCount > 0 &&
      (coverageStatus !== 'incomplete_coverage' ||
        !artifact ||
        artifact.record_count !== incompleteCount))
  ) {
    return null;
  }
  return {
    schema_version: 'lcia.factor_coverage.v1' as const,
    coverage_status: coverageStatus as 'complete' | 'incomplete_coverage',
    missing_factor_semantics: 'incomplete_coverage_not_zero' as const,
    counts,
    uncharacterized_evidence: artifact,
  };
}

function normalizeLcaCalculationEvidenceV1(
  raw: Record<string, unknown>,
): LcaCalculationEvidenceV1 | null {
  if (raw.schema_version !== 'lca.calculation_evidence.v1') {
    return null;
  }
  const scopeManifestSha256 = normalizeSha256(raw.scope_manifest_sha256);
  const source = isRecord(raw.lcia_method_factor_source) ? raw.lcia_method_factor_source : null;
  const coverage = normalizeCoverageSummary(raw.lcia_factor_coverage);
  const sourceSnapshotSha256 = normalizeSha256(source?.source_snapshot_sha256);
  const methodManifestSha256 = normalizeSha256(source?.method_manifest_sha256);
  const factorManifestSha256 = normalizeSha256(source?.factor_manifest_sha256);
  if (
    !scopeManifestSha256 ||
    !source ||
    source.schema_version !== 'lca.method_factor_source.snapshot.v1' ||
    (source.source_kind !== 'database' && source.source_kind !== 'static_cache_bundle') ||
    (source.source_kind === 'database' && source.relation !== 'public.lciamethods') ||
    !sourceSnapshotSha256 ||
    !methodManifestSha256 ||
    !factorManifestSha256 ||
    !coverage
  ) {
    return null;
  }

  return {
    schema_version: 'lca.calculation_evidence.v1' as const,
    scope_manifest_sha256: scopeManifestSha256,
    lcia_method_factor_source: {
      schema_version: 'lca.method_factor_source.snapshot.v1' as const,
      source_kind: source.source_kind as 'database' | 'static_cache_bundle',
      ...(source.source_kind === 'database' ? { relation: 'public.lciamethods' as const } : {}),
      source_snapshot_sha256: sourceSnapshotSha256,
      method_manifest_sha256: methodManifestSha256,
      factor_manifest_sha256: factorManifestSha256,
    },
    lcia_factor_coverage: coverage,
  };
}

function normalizeLcaCalculationEvidenceV2(
  raw: Record<string, unknown>,
): LcaCalculationEvidenceV2 | null {
  if (raw.schema_version !== 'lca.calculation_evidence.v2') return null;
  const scopeManifestSha256 = normalizeSha256(raw.scope_manifest_sha256);
  const source = isRecord(raw.lcia_method_factor_source) ? raw.lcia_method_factor_source : null;
  // The matrix normalizer is declared below so its v1/v2 overloads remain the public contract.
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  const coverage = normalizeMethodFactorCoverageMatrix(raw.lcia_factor_coverage, 'v2');
  const bundleManifestSha256 = normalizeSha256(source?.bundle_manifest_sha256);
  const sourceSnapshotSha256 = normalizeSha256(source?.source_snapshot_sha256);
  const methodManifestSha256 = normalizeSha256(source?.method_manifest_sha256);
  const methodIdentityManifestSha256 = normalizeSha256(source?.method_identity_manifest_sha256);
  const factorManifestSha256 = normalizeSha256(source?.factor_manifest_sha256);
  const methodCount = nonnegativeInteger(source?.method_count);
  if (
    !scopeManifestSha256 ||
    !source ||
    source.schema_version !== 'lca.method_factor_source.snapshot.v2' ||
    source.source_kind !== 'static_cache_bundle' ||
    source.bundle_manifest_path !== STATIC_LCIA_CACHE_MANIFEST_PATH ||
    bundleManifestSha256 !== STATIC_LCIA_CACHE_MANIFEST_SHA256 ||
    source.bundle_version !== STATIC_LCIA_CACHE_MANIFEST.bundle_version ||
    sourceSnapshotSha256 !== STATIC_LCIA_CACHE_MANIFEST.source_snapshot_sha256 ||
    methodManifestSha256 !== STATIC_LCIA_CACHE_MANIFEST.method_manifest_sha256 ||
    methodIdentityManifestSha256 !== STATIC_LCIA_CACHE_MANIFEST.method_identity_manifest_sha256 ||
    factorManifestSha256 !== STATIC_LCIA_CACHE_MANIFEST.factor_manifest_sha256 ||
    methodCount !== STATIC_LCIA_CACHE_MANIFEST.methods.length ||
    !coverage
  ) {
    return null;
  }
  return {
    schema_version: 'lca.calculation_evidence.v2' as const,
    scope_manifest_sha256: scopeManifestSha256,
    lcia_method_factor_source: {
      schema_version: 'lca.method_factor_source.snapshot.v2' as const,
      source_kind: 'static_cache_bundle' as const,
      bundle_manifest_path: STATIC_LCIA_CACHE_MANIFEST_PATH,
      bundle_manifest_sha256: bundleManifestSha256,
      bundle_version: source.bundle_version as string,
      source_snapshot_sha256: sourceSnapshotSha256,
      method_manifest_sha256: methodManifestSha256,
      method_identity_manifest_sha256: methodIdentityManifestSha256,
      factor_manifest_sha256: factorManifestSha256,
      method_count: methodCount,
    },
    lcia_factor_coverage: coverage,
  };
}

export function normalizeLcaCalculationEvidence(raw: unknown): LcaCalculationEvidence | null {
  if (!isRecord(raw)) return null;
  return normalizeLcaCalculationEvidenceV2(raw) ?? normalizeLcaCalculationEvidenceV1(raw);
}

function normalizeMethodCoverageRow(value: unknown): LciaMethodCoverageRow | null {
  if (!isRecord(value)) {
    return null;
  }
  const counts = normalizeCounts(value.counts);
  if (
    typeof value.method_id !== 'string' ||
    !value.method_id.trim() ||
    typeof value.method_version !== 'string' ||
    !value.method_version.trim() ||
    typeof value.artifact_locator_id !== 'string' ||
    !value.artifact_locator_id.trim() ||
    !counts
  ) {
    return null;
  }
  return {
    method_id: value.method_id.trim(),
    method_version: value.method_version.trim(),
    artifact_locator_id: value.artifact_locator_id.trim(),
    counts,
  };
}

const UNCHARACTERIZED_REASONS = new Set<LciaUncharacterizedReason>([
  'missing_flow_uuid',
  'unsupported_direction',
  'invalid_exchange_amount',
  'missing_factor',
  'invalid_factor',
  'calculation_failure',
  'method_source_drift',
]);

function normalizeUncharacterizedExchange(value: unknown): LciaUncharacterizedExchange | null {
  if (!isRecord(value) || !UNCHARACTERIZED_REASONS.has(value.reason as LciaUncharacterizedReason)) {
    return null;
  }
  const requiredStrings = [
    'method_id',
    'method_version',
    'artifact_locator_id',
    'flow_uuid',
    'flow_version',
    'direction',
    'exchange_id',
    'amount',
  ] as const;
  if (requiredStrings.some((key) => typeof value[key] !== 'string')) {
    return null;
  }
  if (
    (value.amount_source !== 'meanAmount' && value.amount_source !== 'resultingAmount') ||
    (value.amount_source === 'resultingAmount' &&
      value.amount !== (value.resulting_amount ?? '')) ||
    (value.resulting_amount !== null && typeof value.resulting_amount !== 'string')
  ) {
    return null;
  }
  return {
    method_id: value.method_id as string,
    method_version: value.method_version as string,
    artifact_locator_id: value.artifact_locator_id as string,
    flow_uuid: value.flow_uuid as string,
    flow_version: value.flow_version as string,
    direction: value.direction as string,
    exchange_id: value.exchange_id as string,
    amount: value.amount as string,
    amount_source: value.amount_source,
    resulting_amount: value.resulting_amount as string | null,
    reason: value.reason as LciaUncharacterizedReason,
  };
}

function sumCoverageRows(rows: LciaMethodCoverageRow[]): LciaCoverageCounts {
  return rows.reduce<LciaCoverageCounts>(
    (sum, row) => ({
      matched: sum.matched + row.counts.matched,
      unmatched: sum.unmatched + row.counts.unmatched,
      invalid: sum.invalid + row.counts.invalid,
      unsupported_direction: sum.unsupported_direction + row.counts.unsupported_direction,
    }),
    { matched: 0, unmatched: 0, invalid: 0, unsupported_direction: 0 },
  );
}

export function normalizeMethodFactorCoverageMatrix(
  raw: unknown,
  artifactVersion: 'v2',
): LciaMethodFactorCoverageMatrix<LcaUncharacterizedEvidenceArtifactV2> | null;
export function normalizeMethodFactorCoverageMatrix(
  raw: unknown,
  artifactVersion?: 'v1',
): LciaMethodFactorCoverageMatrix<LcaUncharacterizedEvidenceArtifactV1> | null;
export function normalizeMethodFactorCoverageMatrix(
  raw: unknown,
  artifactVersion: 'v1' | 'v2' = 'v1',
): LciaMethodFactorCoverageMatrix<
  LcaUncharacterizedEvidenceArtifactV1 | LcaUncharacterizedEvidenceArtifactV2
> | null {
  if (
    !isRecord(raw) ||
    (raw.schema_version !== 'lcia.method_factor_coverage.matrix.v1' &&
      !(artifactVersion === 'v2' && raw.schema_version === 'lcia.method_factor_coverage.matrix.v2'))
  ) {
    return null;
  }
  const sourceSnapshotSha256 = normalizeSha256(raw.source_snapshot_sha256);
  const methodManifestSha256 = normalizeSha256(raw.method_manifest_sha256);
  const methodIdentityManifestSha256 = normalizeSha256(raw.method_identity_manifest_sha256);
  const factorManifestSha256 = normalizeSha256(raw.factor_manifest_sha256);
  const counts = normalizeCounts(raw.counts);
  const byMethod = Array.isArray(raw.by_method)
    ? raw.by_method.map(normalizeMethodCoverageRow)
    : [];
  const artifact =
    raw.uncharacterized_evidence === null
      ? null
      : artifactVersion === 'v2'
        ? normalizeArtifact<LcaUncharacterizedEvidenceArtifactV2>(
            raw.uncharacterized_evidence,
            raw.schema_version === 'lcia.method_factor_coverage.matrix.v2'
              ? 'lcia-coverage-replay-snapshot:v1'
              : 'lcia-uncharacterized-jsonl:v2',
          )
        : normalizeArtifact<LcaUncharacterizedEvidenceArtifactV1>(
            raw.uncharacterized_evidence,
            'lcia-uncharacterized-jsonl:v1',
          );
  const incompleteCount = counts
    ? counts.unmatched + counts.invalid + counts.unsupported_direction
    : -1;
  const incompleteCountIsSafe = Number.isSafeInteger(incompleteCount);
  const inlineGaps = Array.isArray(raw.uncharacterized_exchanges)
    ? raw.uncharacterized_exchanges.map(normalizeUncharacterizedExchange)
    : [];
  const expectedMethodKeys = new Set(
    STATIC_LCIA_CACHE_MANIFEST.methods.map(
      (method) => `${method.method_id}:${method.method_version}:${method.artifact_locator_id}`,
    ),
  );
  const actualMethodKeys = new Set(
    byMethod
      .filter((row): row is LciaMethodCoverageRow => row !== null)
      .map((row) => `${row.method_id}:${row.method_version}:${row.artifact_locator_id}`),
  );
  const summedCounts = sumCoverageRows(
    byMethod.filter((row): row is LciaMethodCoverageRow => row !== null),
  );
  const methodPairTotals = byMethod
    .filter((row): row is LciaMethodCoverageRow => row !== null)
    .map((row) => Object.values(row.counts).reduce((sum, count) => sum + count, 0));
  const expectedPairsPerMethod = methodPairTotals[0] ?? -1;
  const globalPairCount = counts
    ? Object.values(counts).reduce((sum, count) => sum + count, 0)
    : -1;
  const normalizedInlineGaps = inlineGaps.filter(
    (gap): gap is LciaUncharacterizedExchange => gap !== null,
  );
  const inlineGapCounts = normalizedInlineGaps.reduce<LciaCoverageCounts>(
    (sum, gap) => {
      if (gap.reason === 'missing_factor') {
        sum.unmatched += 1;
      } else if (gap.reason === 'unsupported_direction') {
        sum.unsupported_direction += 1;
      } else {
        sum.invalid += 1;
      }
      return sum;
    },
    { matched: 0, unmatched: 0, invalid: 0, unsupported_direction: 0 },
  );

  if (
    !sourceSnapshotSha256 ||
    !methodManifestSha256 ||
    methodIdentityManifestSha256 !== STATIC_LCIA_CACHE_MANIFEST.method_identity_manifest_sha256 ||
    !factorManifestSha256 ||
    raw.count_unit !== 'exchange_method_pair' ||
    canonicalJson(raw.key_dimensions) !==
      canonicalJson(['method_id', 'method_version', 'flow_uuid', 'direction']) ||
    (raw.coverage_status !== 'complete' && raw.coverage_status !== 'incomplete_coverage') ||
    raw.missing_factor_semantics !== 'incomplete_coverage_not_zero' ||
    !counts ||
    !incompleteCountIsSafe ||
    byMethod.length === 0 ||
    byMethod.some((row) => row === null) ||
    actualMethodKeys.size !== byMethod.length ||
    actualMethodKeys.size !== expectedMethodKeys.size ||
    Array.from(expectedMethodKeys).some((key) => !actualMethodKeys.has(key)) ||
    canonicalJson(summedCounts) !== canonicalJson(counts) ||
    Object.values(summedCounts).some((count) => !Number.isSafeInteger(count)) ||
    globalPairCount <= 0 ||
    !Number.isSafeInteger(globalPairCount) ||
    expectedPairsPerMethod <= 0 ||
    methodPairTotals.some((total) => !Number.isSafeInteger(total)) ||
    methodPairTotals.some((total) => total !== expectedPairsPerMethod) ||
    !Number.isSafeInteger(expectedPairsPerMethod * expectedMethodKeys.size) ||
    globalPairCount !== expectedPairsPerMethod * expectedMethodKeys.size ||
    (incompleteCount === 0 && raw.coverage_status !== 'complete') ||
    (incompleteCount === 0 && (artifact !== null || inlineGaps.length > 0)) ||
    (incompleteCount > 0 &&
      (raw.coverage_status !== 'incomplete_coverage' ||
        !artifact ||
        artifact.record_count !== incompleteCount)) ||
    (inlineGaps.length > 0 &&
      (inlineGaps.some((gap) => gap === null) ||
        inlineGaps.length !== incompleteCount ||
        normalizedInlineGaps.some(
          (gap) =>
            !expectedMethodKeys.has(
              `${gap.method_id}:${gap.method_version}:${gap.artifact_locator_id}`,
            ) ||
            !gap.exchange_id ||
            (gap.reason !== 'missing_flow_uuid' && !gap.flow_uuid) ||
            (gap.reason !== 'unsupported_direction' &&
              gap.direction !== 'INPUT' &&
              gap.direction !== 'OUTPUT'),
        ) ||
        canonicalJson(inlineGapCounts) !== canonicalJson({ ...counts, matched: 0 })))
  ) {
    return null;
  }

  return {
    schema_version: raw.schema_version,
    source_snapshot_sha256: sourceSnapshotSha256,
    method_manifest_sha256: methodManifestSha256,
    method_identity_manifest_sha256: methodIdentityManifestSha256,
    factor_manifest_sha256: factorManifestSha256,
    count_unit: 'exchange_method_pair',
    key_dimensions: ['method_id', 'method_version', 'flow_uuid', 'direction'],
    coverage_status: raw.coverage_status,
    missing_factor_semantics: 'incomplete_coverage_not_zero',
    counts,
    by_method: byMethod as LciaMethodCoverageRow[],
    uncharacterized_evidence: artifact,
    ...(inlineGaps.length > 0 ? { uncharacterized_exchanges: normalizedInlineGaps } : {}),
  };
}

export function resolveServiceLciaStatus(
  evidenceRaw: unknown,
  matrixRaw: unknown,
): {
  status: LciaCalculationStatus;
  evidence: LcaCalculationEvidence | null;
  matrix: LciaMethodFactorCoverageMatrix<
    LcaUncharacterizedEvidenceArtifactV1 | LcaUncharacterizedEvidenceArtifactV2
  > | null;
  reason: string | null;
} {
  const evidence = normalizeLcaCalculationEvidence(evidenceRaw);
  const externalMatrix =
    evidence?.schema_version === 'lca.calculation_evidence.v2'
      ? normalizeMethodFactorCoverageMatrix(matrixRaw, 'v2')
      : normalizeMethodFactorCoverageMatrix(matrixRaw);
  const matrix =
    evidence?.schema_version === 'lca.calculation_evidence.v2'
      ? evidence.lcia_factor_coverage
      : externalMatrix;
  if (!evidence) {
    return {
      status: 'method_source_drift',
      evidence: null,
      matrix,
      reason: 'calculation_evidence_missing_or_invalid',
    };
  }
  if (evidence.schema_version !== 'lca.calculation_evidence.v2') {
    return {
      status: 'method_source_drift',
      evidence,
      matrix,
      reason: 'legacy_calculation_evidence_v1_is_not_method_complete',
    };
  }
  if (
    matrixRaw !== undefined &&
    (!externalMatrix || canonicalJson(externalMatrix) !== canonicalJson(matrix))
  ) {
    return {
      status: 'method_source_drift',
      evidence,
      matrix,
      reason: 'conflicting_parallel_method_coverage_source',
    };
  }
  if (
    !matrix ||
    matrix.source_snapshot_sha256 !== evidence.lcia_method_factor_source.source_snapshot_sha256 ||
    matrix.method_manifest_sha256 !== evidence.lcia_method_factor_source.method_manifest_sha256 ||
    matrix.factor_manifest_sha256 !== evidence.lcia_method_factor_source.factor_manifest_sha256 ||
    matrix.method_identity_manifest_sha256 !==
      evidence.lcia_method_factor_source.method_identity_manifest_sha256
  ) {
    return {
      status: 'method_source_drift',
      evidence,
      matrix,
      reason: 'method_level_coverage_missing_or_source_mismatch',
    };
  }
  return {
    status: matrix.coverage_status === 'complete' ? 'complete' : 'incomplete_coverage',
    evidence,
    matrix,
    reason: null,
  };
}

export function serializeStaticLciaReport(
  report: LciaStaticCalculationReport,
): Record<string, unknown> {
  return {
    '@xmlns:tg': LCIA_EVIDENCE_EXTENSION_NAMESPACE,
    [LCIA_EVIDENCE_EXTENSION_KEY]: {
      '@schemaVersion': report.schema_version,
      '#text': JSON.stringify(report),
    },
  };
}

export function parseStaticLciaReport(raw: unknown): LciaStaticCalculationReport | null {
  if (!isRecord(raw)) {
    return null;
  }
  const extension = raw[LCIA_EVIDENCE_EXTENSION_KEY];
  const text = isRecord(extension) ? extension['#text'] : extension;
  if (typeof text !== 'string') {
    return null;
  }
  try {
    const parsed = JSON.parse(text) as LciaStaticCalculationReport;
    const matrix = normalizeMethodFactorCoverageMatrix(parsed?.method_factor_coverage);
    const source = parsed?.source;
    const trustedStatus =
      parsed?.calculation_status === 'complete' ||
      parsed?.calculation_status === 'incomplete_coverage';
    if (
      parsed?.schema_version !== 'lcia.frontend_calculation_report.v1' ||
      !source ||
      source.schema_version !== 'lcia.method_factor_source.static_cache_bundle.v1' ||
      source.source_kind !== 'static_cache_bundle' ||
      source.bundle_version !== STATIC_LCIA_CACHE_MANIFEST.bundle_version ||
      source.source_snapshot_sha256 !== STATIC_LCIA_CACHE_MANIFEST.source_snapshot_sha256 ||
      source.method_manifest_sha256 !== STATIC_LCIA_CACHE_MANIFEST.method_manifest_sha256 ||
      source.method_identity_manifest_sha256 !==
        STATIC_LCIA_CACHE_MANIFEST.method_identity_manifest_sha256 ||
      source.factor_manifest_sha256 !== STATIC_LCIA_CACHE_MANIFEST.factor_manifest_sha256 ||
      !matrix ||
      matrix.source_snapshot_sha256 !== source.source_snapshot_sha256 ||
      matrix.method_manifest_sha256 !== source.method_manifest_sha256 ||
      matrix.method_identity_manifest_sha256 !== source.method_identity_manifest_sha256 ||
      matrix.factor_manifest_sha256 !== source.factor_manifest_sha256 ||
      (trustedStatus &&
        (source.observed_list_sha256 !== STATIC_LCIA_CACHE_MANIFEST.files.list.sha256 ||
          source.observed_factor_sha256 !== STATIC_LCIA_CACHE_MANIFEST.files.factors.sha256 ||
          parsed.calculation_status !== matrix.coverage_status ||
          parsed.failure_reason !== null)) ||
      (!trustedStatus &&
        parsed.calculation_status !== 'calculation_failure' &&
        parsed.calculation_status !== 'method_source_drift') ||
      (!trustedStatus && !parsed.failure_reason)
    ) {
      return null;
    }
    return { ...parsed, method_factor_coverage: matrix };
  } catch {
    return null;
  }
}
