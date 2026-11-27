import {
  buildStaticCalculationFailure,
  calculateStaticLcia,
} from '@/services/lciaMethods/calculation';
import type {
  LciaCoverageCounts,
  LciaMethodFactorCoverageMatrix,
  LciaMethodListData,
} from '@/services/lciaMethods/data';
import {
  canonicalJson,
  computeLciaSha256,
  normalizeLcaCalculationEvidence,
  normalizeMethodFactorCoverageMatrix,
  parseStaticLciaReport,
  resolveReviewedLciaMethodIdentity,
  resolveServiceLciaStatus,
  serializeStaticLciaReport,
  STATIC_LCIA_CACHE_MANIFEST,
  STATIC_LCIA_CACHE_MANIFEST_PATH,
  STATIC_LCIA_CACHE_MANIFEST_SHA256,
  toCanonicalLciaMethodId,
  toLciaArtifactLocatorId,
} from '@/services/lciaMethods/evidence';
import { webcrypto } from 'node:crypto';

const manifest = STATIC_LCIA_CACHE_MANIFEST;
const methods = manifest.methods;
const primary = methods[0];
const listData: LciaMethodListData = {
  files: methods.map((method) => ({
    id: method.artifact_locator_id,
    filename: method.artifact_filename,
    version: method.method_version,
    description: [{ '@xml:lang': 'en', '#text': method.method_id }],
  })),
};

const exchange = (overrides: Record<string, unknown> = {}) =>
  ({
    '@dataSetInternalID': 'exchange-1',
    referenceToFlowDataSet: { '@refObjectId': 'flow-1', '@version': '01.00.000' },
    exchangeDirection: 'OUTPUT',
    meanAmount: '3',
    resultingAmount: '3',
    ...overrides,
  }) as any;

const sourceProof = {
  observedListSha256: manifest.files.list.sha256,
  observedFactorSha256: manifest.files.factors.sha256,
};

const emptyCounts = (): LciaCoverageCounts => ({
  matched: 0,
  unmatched: 0,
  invalid: 0,
  unsupported_direction: 0,
});

function completeMatrix(): LciaMethodFactorCoverageMatrix {
  return {
    schema_version: 'lcia.method_factor_coverage.matrix.v1',
    source_snapshot_sha256: manifest.source_snapshot_sha256,
    method_manifest_sha256: manifest.method_manifest_sha256,
    method_identity_manifest_sha256: manifest.method_identity_manifest_sha256,
    factor_manifest_sha256: manifest.factor_manifest_sha256,
    count_unit: 'exchange_method_pair',
    key_dimensions: ['method_id', 'method_version', 'flow_uuid', 'direction'],
    coverage_status: 'complete',
    missing_factor_semantics: 'incomplete_coverage_not_zero',
    counts: { ...emptyCounts(), matched: methods.length },
    by_method: methods.map((method) => ({
      method_id: method.method_id,
      method_version: method.method_version,
      artifact_locator_id: method.artifact_locator_id,
      counts: { ...emptyCounts(), matched: 1 },
    })),
    uncharacterized_evidence: null,
  };
}

function evidence(matrix: LciaMethodFactorCoverageMatrix<any>) {
  return {
    schema_version: 'lca.calculation_evidence.v2',
    scope_manifest_sha256: 'a'.repeat(64),
    lcia_method_factor_source: {
      schema_version: 'lca.method_factor_source.snapshot.v2',
      source_kind: 'static_cache_bundle',
      bundle_manifest_path: STATIC_LCIA_CACHE_MANIFEST_PATH,
      bundle_manifest_sha256: STATIC_LCIA_CACHE_MANIFEST_SHA256,
      bundle_version: manifest.bundle_version,
      source_snapshot_sha256: manifest.source_snapshot_sha256,
      method_manifest_sha256: manifest.method_manifest_sha256,
      method_identity_manifest_sha256: manifest.method_identity_manifest_sha256,
      factor_manifest_sha256: manifest.factor_manifest_sha256,
      method_count: methods.length,
    },
    lcia_factor_coverage: matrix,
  };
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function incompleteMatrixWithInlineGaps(): LciaMethodFactorCoverageMatrix<any> {
  const matrix = completeMatrix() as LciaMethodFactorCoverageMatrix<any>;
  const gapReasons = ['missing_factor', 'unsupported_direction', 'invalid_factor'] as const;
  matrix.coverage_status = 'incomplete_coverage';
  matrix.counts = {
    matched: methods.length - gapReasons.length,
    unmatched: 1,
    invalid: 1,
    unsupported_direction: 1,
  };
  matrix.by_method = matrix.by_method.map((row, index) => ({
    ...row,
    counts:
      index === 0
        ? { ...emptyCounts(), unmatched: 1 }
        : index === 1
          ? { ...emptyCounts(), unsupported_direction: 1 }
          : index === 2
            ? { ...emptyCounts(), invalid: 1 }
            : { ...emptyCounts(), matched: 1 },
  }));
  matrix.uncharacterized_evidence = {
    artifact_url: 'https://worker.example/gaps.jsonl',
    artifact_format: 'lcia-uncharacterized-jsonl:v1',
    artifact_sha256: 'e'.repeat(64),
    record_count: gapReasons.length,
  };
  matrix.uncharacterized_exchanges = gapReasons.map((reason, index) => ({
    method_id: methods[index].method_id,
    method_version: methods[index].method_version,
    artifact_locator_id: methods[index].artifact_locator_id,
    flow_uuid: 'flow-1',
    flow_version: '01.00.000',
    direction: reason === 'unsupported_direction' ? 'SIDEWAYS' : 'OUTPUT',
    exchange_id: `exchange-${index + 1}`,
    amount: '1',
    amount_source: 'meanAmount',
    resulting_amount: index === 2 ? null : '1',
    reason,
  }));
  return matrix;
}

describe('reviewed LCIA calculation and evidence', () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
  });

  it('maps the reviewed alias in both canonical and published-artifact directions', () => {
    expect(toCanonicalLciaMethodId('9ec743ea-6b00-400d-a53b-61547a3fc03c', '01.01.000')).toBe(
      '503699e0-eca9-4089-8bf8-e0f49c93e578',
    );
    expect(toLciaArtifactLocatorId('503699e0-eca9-4089-8bf8-e0f49c93e578', '01.01.000')).toBe(
      '9ec743ea-6b00-400d-a53b-61547a3fc03c',
    );
    expect(toCanonicalLciaMethodId('unreviewed-method')).toBe('unreviewed-method');
  });

  it('rejects ambiguous identity inputs and canonicalizes deterministic evidence values', async () => {
    expect(resolveReviewedLciaMethodIdentity(undefined)).toBeNull();
    expect(resolveReviewedLciaMethodIdentity('   ')).toBeNull();
    expect(resolveReviewedLciaMethodIdentity(primary.method_id, '99.99.999')).toBeNull();
    expect(resolveReviewedLciaMethodIdentity(primary.method_id)).toEqual(primary);
    expect(toCanonicalLciaMethodId(42)).toBe('');
    expect(toLciaArtifactLocatorId(null)).toBe('');
    expect(canonicalJson({ z: 1, a: [true, null] })).toBe('{"a":[true,null],"z":1}');
    expect(() => canonicalJson(undefined)).toThrow('Cannot canonicalize undefined LCIA evidence');
    await expect(computeLciaSha256('abc')).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    await expect(computeLciaSha256(new TextEncoder().encode('abc').buffer)).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );

    const crypto = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
    await expect(computeLciaSha256('abc')).rejects.toThrow('SHA-256 digest is unavailable');
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: crypto });
  });

  it('normalizes both complete and incomplete legacy evidence variants', () => {
    const completeLegacy: any = {
      schema_version: 'lca.calculation_evidence.v1',
      scope_manifest_sha256: 'A'.repeat(64),
      lcia_method_factor_source: {
        schema_version: 'lca.method_factor_source.snapshot.v1',
        source_kind: 'static_cache_bundle',
        source_snapshot_sha256: 'b'.repeat(64),
        method_manifest_sha256: 'c'.repeat(64),
        factor_manifest_sha256: 'd'.repeat(64),
      },
      lcia_factor_coverage: {
        schema_version: 'lcia.factor_coverage.v1',
        coverage_status: 'complete',
        missing_factor_semantics: 'incomplete_coverage_not_zero',
        counts: emptyCounts(),
        uncharacterized_evidence: null,
      },
    };
    expect(normalizeLcaCalculationEvidence(completeLegacy)).toMatchObject({
      scope_manifest_sha256: 'a'.repeat(64),
      lcia_method_factor_source: { source_kind: 'static_cache_bundle' },
    });

    const incompleteLegacy = clone(completeLegacy);
    incompleteLegacy.lcia_method_factor_source.source_kind = 'database';
    incompleteLegacy.lcia_method_factor_source.relation = 'public.lciamethods';
    incompleteLegacy.lcia_factor_coverage.coverage_status = 'incomplete_coverage';
    incompleteLegacy.lcia_factor_coverage.counts.unmatched = 1;
    incompleteLegacy.lcia_factor_coverage.uncharacterized_evidence = {
      artifact_url: ' https://worker.example/gaps.jsonl ',
      artifact_format: 'lcia-uncharacterized-jsonl:v1',
      artifact_sha256: 'E'.repeat(64),
      record_count: 1,
    };
    expect(normalizeLcaCalculationEvidence(incompleteLegacy)).toMatchObject({
      lcia_method_factor_source: {
        source_kind: 'database',
        relation: 'public.lciamethods',
      },
      lcia_factor_coverage: {
        coverage_status: 'incomplete_coverage',
        uncharacterized_evidence: {
          artifact_url: 'https://worker.example/gaps.jsonl',
          artifact_sha256: 'e'.repeat(64),
        },
      },
    });
  });

  it('fails closed for malformed legacy evidence and artifact fields', () => {
    const base: any = {
      schema_version: 'lca.calculation_evidence.v1',
      scope_manifest_sha256: 'a'.repeat(64),
      lcia_method_factor_source: {
        schema_version: 'lca.method_factor_source.snapshot.v1',
        source_kind: 'database',
        relation: 'public.lciamethods',
        source_snapshot_sha256: 'b'.repeat(64),
        method_manifest_sha256: 'c'.repeat(64),
        factor_manifest_sha256: 'd'.repeat(64),
      },
      lcia_factor_coverage: {
        schema_version: 'lcia.factor_coverage.v1',
        coverage_status: 'incomplete_coverage',
        missing_factor_semantics: 'incomplete_coverage_not_zero',
        counts: { ...emptyCounts(), unmatched: 1 },
        uncharacterized_evidence: {
          artifact_url: 'https://worker.example/gaps.jsonl',
          artifact_format: 'lcia-uncharacterized-jsonl:v1',
          artifact_sha256: 'e'.repeat(64),
          record_count: 1,
        },
      },
    };
    const mutations: Array<(value: any) => void> = [
      (v) => (v.scope_manifest_sha256 = 1),
      (v) => (v.lcia_method_factor_source = null),
      (v) => (v.lcia_method_factor_source.schema_version = 'wrong'),
      (v) => (v.lcia_method_factor_source.source_kind = 'wrong'),
      (v) => (v.lcia_method_factor_source.relation = 'wrong'),
      (v) => (v.lcia_method_factor_source.source_snapshot_sha256 = 'bad'),
      (v) => (v.lcia_method_factor_source.method_manifest_sha256 = 'bad'),
      (v) => (v.lcia_method_factor_source.factor_manifest_sha256 = 'bad'),
      (v) => (v.lcia_factor_coverage = null),
      (v) => (v.lcia_factor_coverage.schema_version = 'wrong'),
      (v) => (v.lcia_factor_coverage.coverage_status = 'wrong'),
      (v) => (v.lcia_factor_coverage.missing_factor_semantics = 'zero'),
      (v) => (v.lcia_factor_coverage.counts = null),
      (v) => (v.lcia_factor_coverage.counts.invalid = -1),
      (v) => (v.lcia_factor_coverage.uncharacterized_evidence = null),
      (v) => (v.lcia_factor_coverage.uncharacterized_evidence = []),
      (v) => (v.lcia_factor_coverage.uncharacterized_evidence.artifact_url = ''),
      (v) => (v.lcia_factor_coverage.uncharacterized_evidence.artifact_format = 'wrong'),
      (v) => (v.lcia_factor_coverage.uncharacterized_evidence.artifact_sha256 = 'bad'),
      (v) => (v.lcia_factor_coverage.uncharacterized_evidence.record_count = 0),
      (v) => (v.lcia_factor_coverage.uncharacterized_evidence.record_count = 2),
    ];
    for (const mutate of mutations) {
      const candidate = clone(base);
      mutate(candidate);
      expect(normalizeLcaCalculationEvidence(candidate)).toBeNull();
    }
    expect(normalizeLcaCalculationEvidence(null)).toBeNull();
    expect(normalizeLcaCalculationEvidence({ schema_version: 'unknown' })).toBeNull();
  });

  it('records a missing variable-dependent effective amount as an invalid quantity', async () => {
    const run = await calculateStaticLcia({
      exchanges: [
        exchange({ meanAmount: '2', resultingAmount: undefined, referenceToVariable: 'factor' }),
      ],
      listData,
      factors: {},
      ...sourceProof,
    });
    expect(run.report.method_factor_coverage.uncharacterized_exchanges?.[0]).toMatchObject({
      amount: '',
      amount_source: 'resultingAmount',
      resulting_amount: null,
      reason: 'invalid_exchange_amount',
    });
  });

  it('rejects unparameterized conflicts and uses the supplied effective amount for a variable', async () => {
    const run = (referenceToVariable?: string) =>
      calculateStaticLcia({
        exchanges: [
          exchange({ meanAmount: '0.306', resultingAmount: '306.0', referenceToVariable }),
        ],
        listData,
        factors: {
          'flow-1:OUTPUT': {
            '@version': '01.00.000',
            factor: [{ key: primary.method_id, value: '2' }],
          },
        },
        ...sourceProof,
      });
    const conflict = await run();
    expect(conflict.results).toEqual([]);
    expect(conflict.report.failure_reason).toContain('exchange[0].resultingAmount');
    const valid = await run('scale');
    expect(valid.results[0].meanAmount).toBe('612');
    expect(valid.report.method_factor_coverage.uncharacterized_exchanges?.[0]).toMatchObject({
      amount: '306.0',
      amount_source: 'resultingAmount',
    });
  });

  it('emits explicit zero and maps locator aliases', async () => {
    const result = await calculateStaticLcia({
      exchanges: [
        exchange(),
        exchange({ '@dataSetInternalID': 'exchange-2', meanAmount: '4', resultingAmount: '4' }),
      ],
      listData,
      factors: {
        'flow-1:OUTPUT': {
          '@version': '01.00.000',
          factor: [{ key: primary.method_id, value: '0' }],
        },
      },
      ...sourceProof,
    });

    expect(result.results).toEqual([
      expect.objectContaining({
        key: primary.method_id,
        meanAmount: '0',
        referenceToLCIAMethodDataSet: expect.objectContaining({
          '@refObjectId': primary.method_id,
          '@uri': `../lciamethods/${primary.artifact_locator_id}.xml`,
        }),
      }),
    ]);
    expect(result.report.calculation_status).toBe('incomplete_coverage');
    expect(result.report.method_factor_coverage.counts.matched).toBe(2);
    expect(result.report.method_factor_coverage.counts.unmatched).toBe((methods.length - 1) * 2);
  });

  it('reports a non-finite unique coefficient without publishing a numeric result', async () => {
    const result = await calculateStaticLcia({
      exchanges: [exchange()],
      listData,
      factors: {
        'flow-1:OUTPUT': {
          '@version': '01.00.000',
          factor: [{ key: primary.method_id, value: 'NaN' }],
        },
      },
      ...sourceProof,
    });
    expect(result.results).toEqual([]);
    expect(result.report.method_factor_coverage.by_method[0].counts.invalid).toBe(1);
  });

  it('rejects unbound duplicate factors instead of summing or deduplicating them', async () => {
    const result = await calculateStaticLcia({
      exchanges: [exchange()],
      listData,
      factors: {
        'flow-1:OUTPUT': {
          '@version': '01.00.000',
          factor: [
            { key: primary.method_id, value: '2' },
            { key: primary.method_id, value: '2' },
          ],
        },
      },
      ...sourceProof,
    });
    expect(result.results).toEqual([]);
    expect(result.report.calculation_status).toBe('method_source_drift');
    expect(result.report.failure_reason).toContain('nonregional_default_source_mismatch');
  });

  it.each([
    [{ referenceToFlowDataSet: undefined }, 'missing_flow_uuid', 'invalid'],
    [{ exchangeDirection: 'SIDEWAYS' }, 'unsupported_direction', 'unsupported_direction'],
    [{ meanAmount: 'Infinity' }, 'invalid_exchange_amount', 'invalid'],
  ])('reports invalid exchange evidence for %s', async (overrides, reason, countKey) => {
    const result = await calculateStaticLcia({
      exchanges: [exchange(overrides as Record<string, unknown>)],
      listData,
      factors: {},
      ...sourceProof,
    });
    expect(result.results).toEqual([]);
    expect(result.report.method_factor_coverage.counts[countKey as 'invalid']).toBe(methods.length);
    expect(result.report.method_factor_coverage.uncharacterized_exchanges?.[0].reason).toBe(reason);
  });

  it('fails closed with no numeric result when reviewed file hashes drift', async () => {
    const result = await calculateStaticLcia({
      exchanges: [exchange()],
      listData,
      factors: {
        'flow-1:OUTPUT': {
          '@version': '01.00.000',
          factor: [{ key: primary.method_id, value: '2' }],
        },
      },
      observedListSha256: '0'.repeat(64),
      observedFactorSha256: manifest.files.factors.sha256,
    });
    expect(result.results).toEqual([]);
    expect(result.report.calculation_status).toBe('method_source_drift');
    expect(result.report.failure_reason).toContain('method_list_sha256_mismatch');
  });

  it('accepts only v2 evidence with the embedded exact 25-method matrix', () => {
    const matrix = completeMatrix();
    expect(resolveServiceLciaStatus(evidence(matrix), undefined)).toMatchObject({
      status: 'complete',
      reason: null,
    });

    const legacy = {
      schema_version: 'lca.calculation_evidence.v1',
      scope_manifest_sha256: 'a'.repeat(64),
      lcia_method_factor_source: {
        schema_version: 'lca.method_factor_source.snapshot.v1',
        source_kind: 'database',
        relation: 'public.lciamethods',
        source_snapshot_sha256: 'b'.repeat(64),
        method_manifest_sha256: 'c'.repeat(64),
        factor_manifest_sha256: 'd'.repeat(64),
      },
      lcia_factor_coverage: {
        schema_version: 'lcia.factor_coverage.v1',
        coverage_status: 'complete',
        missing_factor_semantics: 'incomplete_coverage_not_zero',
        counts: emptyCounts(),
        uncharacterized_evidence: null,
      },
    };
    expect(resolveServiceLciaStatus(legacy, matrix)).toMatchObject({
      status: 'method_source_drift',
      reason: 'legacy_calculation_evidence_v1_is_not_method_complete',
    });
  });

  it('accepts incomplete service v2 evidence only with an external gap artifact v2', () => {
    const matrix = completeMatrix() as LciaMethodFactorCoverageMatrix<any>;
    matrix.coverage_status = 'incomplete_coverage';
    matrix.counts = { ...matrix.counts, matched: methods.length - 1, unmatched: 1 };
    matrix.by_method[0] = {
      ...matrix.by_method[0],
      counts: { ...emptyCounts(), unmatched: 1 },
    };
    matrix.uncharacterized_evidence = {
      artifact_url: 'https://raw-worker-artifacts.example/gaps.jsonl',
      artifact_format: 'lcia-uncharacterized-jsonl:v2',
      artifact_sha256: 'e'.repeat(64),
      record_count: 1,
    };

    expect(resolveServiceLciaStatus(evidence(matrix), undefined)).toMatchObject({
      status: 'incomplete_coverage',
      reason: null,
    });
    matrix.uncharacterized_evidence.artifact_format = 'lcia-uncharacterized-jsonl:v1';
    expect(resolveServiceLciaStatus(evidence(matrix), undefined)).toMatchObject({
      status: 'method_source_drift',
    });
  });

  it('accepts replay coverage without treating a snapshot as a legacy gap file', () => {
    const matrix = completeMatrix() as LciaMethodFactorCoverageMatrix<any>;
    matrix.schema_version = 'lcia.method_factor_coverage.matrix.v2';
    matrix.coverage_status = 'incomplete_coverage';
    matrix.counts = { ...emptyCounts(), matched: methods.length - 1, unmatched: 1 };
    matrix.by_method[0].counts = { ...emptyCounts(), unmatched: 1 };
    matrix.uncharacterized_evidence = {
      artifact_url: 's3://private/release.json.zst',
      artifact_format: 'lcia-coverage-replay-snapshot:v1',
      artifact_sha256: 'e'.repeat(64),
      record_count: 1,
    };
    expect(resolveServiceLciaStatus(evidence(matrix), undefined).status).toBe(
      'incomplete_coverage',
    );
    expect(normalizeMethodFactorCoverageMatrix(matrix)).toBeNull();
    matrix.schema_version = 'lcia.method_factor_coverage.matrix.v1';
    expect(resolveServiceLciaStatus(evidence(matrix), undefined).status).toBe(
      'method_source_drift',
    );
  });

  it('rejects a conflicting parallel matrix and round-trips static report evidence', async () => {
    const matrix = completeMatrix();
    const conflicting = { ...matrix, factor_manifest_sha256: 'f'.repeat(64) };
    expect(resolveServiceLciaStatus(evidence(matrix), conflicting)).toMatchObject({
      status: 'method_source_drift',
      reason: 'conflicting_parallel_method_coverage_source',
    });

    const calculated = await calculateStaticLcia({
      exchanges: [exchange()],
      listData,
      factors: {
        'flow-1:OUTPUT': {
          '@version': '01.00.000',
          factor: methods.map((method) => ({ key: method.method_id, value: '1' })),
        },
      },
      ...sourceProof,
    });
    expect(parseStaticLciaReport(serializeStaticLciaReport(calculated.report))).toEqual(
      calculated.report,
    );
  });

  it('fails closed when the v2 matrix omits its method identity proof', () => {
    const matrix = completeMatrix();
    const withoutIdentity = { ...matrix } as Partial<LciaMethodFactorCoverageMatrix>;
    delete withoutIdentity.method_identity_manifest_sha256;
    expect(
      resolveServiceLciaStatus(
        evidence(withoutIdentity as LciaMethodFactorCoverageMatrix),
        undefined,
      ),
    ).toMatchObject({
      status: 'method_source_drift',
      reason: 'calculation_evidence_missing_or_invalid',
    });
  });

  it('rejects a static report whose matrix hashes drift from its declared source', async () => {
    const calculated = await calculateStaticLcia({
      exchanges: [exchange()],
      listData,
      factors: {
        'flow-1:OUTPUT': {
          '@version': '01.00.000',
          factor: methods.map((method) => ({ key: method.method_id, value: '1' })),
        },
      },
      ...sourceProof,
    });
    calculated.report.method_factor_coverage.source_snapshot_sha256 = 'f'.repeat(64);
    expect(parseStaticLciaReport(serializeStaticLciaReport(calculated.report))).toBeNull();
  });

  it('rejects complete matrices with empty or unequal per-method observation sets', () => {
    const empty = completeMatrix();
    empty.counts = emptyCounts();
    empty.by_method = empty.by_method.map((row) => ({ ...row, counts: emptyCounts() }));
    expect(resolveServiceLciaStatus(evidence(empty), undefined)).toMatchObject({
      status: 'method_source_drift',
    });

    const truncated = completeMatrix();
    truncated.by_method[0] = { ...truncated.by_method[0], counts: emptyCounts() };
    truncated.counts.matched -= 1;
    expect(resolveServiceLciaStatus(evidence(truncated), undefined)).toMatchObject({
      status: 'method_source_drift',
    });
  });

  it('rejects rounded counts outside the JavaScript safe-integer range', () => {
    const unsafe = completeMatrix();
    unsafe.counts.matched = Number.MAX_SAFE_INTEGER + 1;
    expect(resolveServiceLciaStatus(evidence(unsafe), undefined)).toMatchObject({
      status: 'method_source_drift',
      reason: 'calculation_evidence_missing_or_invalid',
    });
  });

  it('normalizes inline gap evidence for every coverage reason bucket', () => {
    const matrix = incompleteMatrixWithInlineGaps();
    expect(normalizeMethodFactorCoverageMatrix(matrix)).toMatchObject({
      coverage_status: 'incomplete_coverage',
      counts: {
        matched: methods.length - 3,
        unmatched: 1,
        invalid: 1,
        unsupported_direction: 1,
      },
      uncharacterized_exchanges: [
        expect.objectContaining({ reason: 'missing_factor' }),
        expect.objectContaining({ reason: 'unsupported_direction' }),
        expect.objectContaining({ reason: 'invalid_factor', resulting_amount: null }),
      ],
    });

    const missingFlow = clone(matrix);
    missingFlow.counts = {
      matched: methods.length - 1,
      unmatched: 0,
      invalid: 1,
      unsupported_direction: 0,
    };
    missingFlow.by_method = missingFlow.by_method.map((row: any, index: number) => ({
      ...row,
      counts: index === 0 ? { ...emptyCounts(), invalid: 1 } : { ...emptyCounts(), matched: 1 },
    }));
    missingFlow.uncharacterized_evidence.record_count = 1;
    missingFlow.uncharacterized_exchanges = [
      {
        ...missingFlow.uncharacterized_exchanges![0],
        flow_uuid: '',
        direction: 'OUTPUT',
        reason: 'missing_flow_uuid',
      },
    ];
    expect(normalizeMethodFactorCoverageMatrix(missingFlow)).not.toBeNull();
  });

  it('rejects each reachable matrix integrity violation independently', () => {
    const complete = completeMatrix() as any;
    const mutations: Array<(value: any) => void> = [
      (v) => (v.source_snapshot_sha256 = 'bad'),
      (v) => (v.method_manifest_sha256 = 'bad'),
      (v) => (v.method_identity_manifest_sha256 = 'bad'),
      (v) => (v.factor_manifest_sha256 = 'bad'),
      (v) => (v.count_unit = 'exchange'),
      (v) => (v.key_dimensions = ['method_id']),
      (v) => (v.coverage_status = 'wrong'),
      (v) => (v.missing_factor_semantics = 'zero'),
      (v) => (v.counts = null),
      (v) => (v.counts.matched = -1),
      (v) => (v.by_method = []),
      (v) => (v.by_method[0] = null),
      (v) => (v.by_method[0].method_id = ''),
      (v) => (v.by_method[0].method_version = 1),
      (v) => (v.by_method[0].artifact_locator_id = ''),
      (v) => (v.by_method[0].counts = null),
      (v) => (v.by_method[1] = clone(v.by_method[0])),
      (v) => v.by_method.pop(),
      (v) => (v.by_method[0].method_id = 'unknown-method'),
      (v) => (v.counts.matched -= 1),
      (v) => {
        v.counts = emptyCounts();
        v.by_method = v.by_method.map((row: any) => ({ ...row, counts: emptyCounts() }));
      },
      (v) => {
        v.coverage_status = 'incomplete_coverage';
      },
      (v) => {
        v.uncharacterized_evidence = {
          artifact_url: 'https://worker.example/gaps.jsonl',
          artifact_format: 'lcia-uncharacterized-jsonl:v1',
          artifact_sha256: 'e'.repeat(64),
          record_count: 1,
        };
      },
      (v) => {
        v.uncharacterized_exchanges = [{}];
      },
    ];
    for (const mutate of mutations) {
      const candidate = clone(complete);
      mutate(candidate);
      expect(normalizeMethodFactorCoverageMatrix(candidate)).toBeNull();
    }
    expect(normalizeMethodFactorCoverageMatrix(null)).toBeNull();
    expect(normalizeMethodFactorCoverageMatrix({ schema_version: 'wrong' })).toBeNull();
    expect(
      normalizeMethodFactorCoverageMatrix({
        ...complete,
        by_method: 'not-an-array',
      }),
    ).toBeNull();
  });

  it('rejects malformed inline gaps and incomplete artifact relationships', () => {
    const base = incompleteMatrixWithInlineGaps() as any;
    const mutations: Array<(value: any) => void> = [
      (v) => (v.coverage_status = 'complete'),
      (v) => (v.uncharacterized_evidence = null),
      (v) => (v.uncharacterized_evidence.record_count = 2),
      (v) => (v.uncharacterized_evidence.artifact_format = 'wrong'),
      (v) => v.uncharacterized_exchanges.pop(),
      (v) => (v.uncharacterized_exchanges[0] = null),
      (v) => (v.uncharacterized_exchanges[0].reason = 'unknown'),
      (v) => (v.uncharacterized_exchanges[0].method_id = 'unknown'),
      (v) => (v.uncharacterized_exchanges[0].exchange_id = ''),
      (v) => (v.uncharacterized_exchanges[0].flow_uuid = ''),
      (v) => (v.uncharacterized_exchanges[0].direction = 'SIDEWAYS'),
      (v) => (v.uncharacterized_exchanges[0].amount_source = 'unknown'),
      (v) =>
        Object.assign(v.uncharacterized_exchanges[0], {
          amount_source: 'resultingAmount',
          amount: '1',
          resulting_amount: null,
        }),
      (v) => (v.uncharacterized_exchanges[0].resulting_amount = 1),
      (v) => (v.uncharacterized_exchanges[0].amount = 1),
      (v) => (v.uncharacterized_exchanges[0].reason = 'invalid_factor'),
    ];
    for (const mutate of mutations) {
      const candidate = clone(base);
      mutate(candidate);
      expect(normalizeMethodFactorCoverageMatrix(candidate)).toBeNull();
    }

    const v2 = clone(base);
    v2.uncharacterized_evidence.artifact_format = 'lcia-uncharacterized-jsonl:v2';
    expect(normalizeMethodFactorCoverageMatrix(v2, 'v2')).not.toBeNull();
  });

  it('rejects every v2 source-contract mismatch and reports normalized matrix source drift', () => {
    const base = evidence(completeMatrix()) as any;
    const mutations: Array<(value: any) => void> = [
      (v) => (v.scope_manifest_sha256 = 'bad'),
      (v) => (v.lcia_method_factor_source = null),
      (v) => (v.lcia_method_factor_source.schema_version = 'wrong'),
      (v) => (v.lcia_method_factor_source.source_kind = 'database'),
      (v) => (v.lcia_method_factor_source.bundle_manifest_path = 'wrong'),
      (v) => (v.lcia_method_factor_source.bundle_manifest_sha256 = 'f'.repeat(64)),
      (v) => (v.lcia_method_factor_source.bundle_version = 'wrong'),
      (v) => (v.lcia_method_factor_source.source_snapshot_sha256 = 'f'.repeat(64)),
      (v) => (v.lcia_method_factor_source.method_manifest_sha256 = 'f'.repeat(64)),
      (v) => (v.lcia_method_factor_source.method_identity_manifest_sha256 = 'f'.repeat(64)),
      (v) => (v.lcia_method_factor_source.factor_manifest_sha256 = 'f'.repeat(64)),
      (v) => (v.lcia_method_factor_source.method_count = methods.length - 1),
      (v) => (v.lcia_factor_coverage = null),
    ];
    for (const mutate of mutations) {
      const candidate = clone(base);
      mutate(candidate);
      expect(normalizeLcaCalculationEvidence(candidate)).toBeNull();
    }

    const mismatchedMatrix = completeMatrix() as any;
    mismatchedMatrix.source_snapshot_sha256 = 'f'.repeat(64);
    expect(resolveServiceLciaStatus(evidence(mismatchedMatrix), undefined)).toMatchObject({
      status: 'method_source_drift',
      reason: 'method_level_coverage_missing_or_source_mismatch',
    });
  });

  it('parses direct, failure, malformed, and missing static report extensions fail-closed', async () => {
    const calculated = await calculateStaticLcia({
      exchanges: [exchange()],
      listData,
      factors: {
        'flow-1:OUTPUT': {
          '@version': '01.00.000',
          factor: methods.map((method) => ({ key: method.method_id, value: '1' })),
        },
      },
      ...sourceProof,
    });
    const direct = JSON.stringify(calculated.report);
    expect(parseStaticLciaReport({ 'tg:lciaCalculationEvidence': direct })).toEqual(
      calculated.report,
    );
    const failed = await buildStaticCalculationFailure([exchange()], 'worker unavailable');
    expect(parseStaticLciaReport(serializeStaticLciaReport(failed.report))).toEqual(failed.report);

    expect(parseStaticLciaReport(null)).toBeNull();
    expect(parseStaticLciaReport({})).toBeNull();
    expect(parseStaticLciaReport({ 'tg:lciaCalculationEvidence': '{' })).toBeNull();
    const missingReason = clone(failed.report) as any;
    missingReason.failure_reason = null;
    expect(parseStaticLciaReport(serializeStaticLciaReport(missingReason))).toBeNull();
    const unknownStatus = clone(failed.report) as any;
    unknownStatus.calculation_status = 'queued';
    expect(parseStaticLciaReport(serializeStaticLciaReport(unknownStatus))).toBeNull();
  });

  it('covers calculation boundary inputs without publishing untrusted numeric output', async () => {
    const inputDirection = await calculateStaticLcia({
      exchanges: [
        exchange({
          exchangeDirection: 'INPUT',
          resultingAmount: undefined,
          '@dataSetInternalID': undefined,
          referenceToFlowDataSet: [{ '@refObjectId': 'flow-1', '@version': '01.00.000' }],
        }),
      ],
      listData: {
        files: listData.files.map((file, index) =>
          index === 0 ? { ...file, description: undefined } : file,
        ),
      } as any,
      factors: {
        'flow-1:INPUT': {
          '@version': '01.00.000',
          factor: [{ key: primary.method_id, value: '2' }],
        },
      },
      ...sourceProof,
    });
    expect(inputDirection.results[0]).toMatchObject({
      referenceToLCIAMethodDataSet: {
        'common:shortDescription': [{ '@xml:lang': 'en', '#text': primary.method_id }],
      },
    });
    expect(
      inputDirection.report.method_factor_coverage.uncharacterized_exchanges?.[0],
    ).toHaveProperty('resulting_amount', null);

    const invalidList = await calculateStaticLcia({
      exchanges: [],
      listData: { files: null as any },
      factors: {},
      ...sourceProof,
    });
    expect(invalidList.report.failure_reason).toContain('method_list_manifest_mismatch');

    for (const key of ['unknown-method', '']) {
      const drift = await calculateStaticLcia({
        exchanges: [exchange()],
        listData,
        factors: { 'flow-1:OUTPUT': { '@version': '01.00.000', factor: [{ key, value: '1' }] } },
        ...sourceProof,
      });
      expect(drift.results).toEqual([]);
      expect(drift.report.failure_reason).toContain(
        key ? `unknown_factor_method_id:${key}` : 'unknown_factor_method_id:<empty>',
      );
    }

    const missingOptionalFields = await calculateStaticLcia({
      exchanges: [
        exchange({
          exchangeDirection: null,
          meanAmount: null,
        }),
      ],
      listData,
      factors: {},
      ...sourceProof,
    });
    expect(missingOptionalFields.report.method_factor_coverage.counts.unsupported_direction).toBe(
      methods.length,
    );

    const noFactorArray = await calculateStaticLcia({
      exchanges: [exchange()],
      listData,
      factors: { 'flow-1:OUTPUT': { '@version': '01.00.000', factor: null as any } },
      ...sourceProof,
    });
    expect(noFactorArray.report.method_factor_coverage.counts.unmatched).toBe(methods.length);

    const nullFactorKey = await calculateStaticLcia({
      exchanges: [exchange()],
      listData,
      factors: {
        'flow-1:OUTPUT': { '@version': '01.00.000', factor: [{ key: null as any, value: '1' }] },
      },
      ...sourceProof,
    });
    expect(nullFactorKey.report.failure_reason).toContain('unknown_factor_method_id:<empty>');

    const factorHashDrift = await calculateStaticLcia({
      exchanges: [],
      listData,
      factors: {},
      observedListSha256: manifest.files.list.sha256,
      observedFactorSha256: 'f'.repeat(64),
    });
    expect(factorHashDrift.report.failure_reason).toBe('factor_map_sha256_mismatch');

    const crypto = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
    const digestFailure = await buildStaticCalculationFailure([exchange()], 'digest unavailable');
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: crypto });
    expect(digestFailure.report.method_factor_coverage).toMatchObject({
      coverage_status: 'incomplete_coverage',
      uncharacterized_evidence: null,
    });
  });
});
