import type { LangTextValue } from '../general/data';

export type LCIAResultTable = {
  key: string;
  referenceToLCIAMethodDataSet: {
    '@refObjectId': string;
    '@type': string;
    '@uri': string;
    '@version': string;
    'common:shortDescription': [
      {
        '@xml:lang': string;
        '#text': string;
      },
    ];
  };
  meanAmount: string | number;
  referenceQuantityDesc?: string;
  'common:other'?: Record<string, unknown>;
};

export type LciaMethodListItem = {
  filename?: string;
  id: string;
  version: string;
  description: LCIAResultTable['referenceToLCIAMethodDataSet']['common:shortDescription'];
  referenceQuantity?: {
    'common:shortDescription'?: LangTextValue;
  };
};

export type LciaMethodListData = {
  files: LciaMethodListItem[];
};

export type LciaFlowFactorEntry = {
  key: string;
  value: string | number;
};

export type LciaFlowFactorGroup = {
  '@version'?: string;
  factor?: LciaFlowFactorEntry[];
};

export type LciaFlowFactorMap = Record<string, LciaFlowFactorGroup>;

export type LciaCalculationStatus =
  'complete' | 'incomplete_coverage' | 'calculation_failure' | 'method_source_drift';

export type LciaCoverageCounts = {
  matched: number;
  unmatched: number;
  invalid: number;
  unsupported_direction: number;
};

export type LciaStaticCacheMethod = {
  method_id: string;
  method_version: string;
  artifact_locator_id: string;
  artifact_filename: string;
  factor_entry_count: number;
  unique_flow_direction_key_count: number;
  duplicate_entry_count: number;
};

export type LciaStaticCacheFiles = {
  list: {
    path: 'list.json';
    media_type: 'application/json';
    byte_size: number;
    sha256: string;
  };
  factors: {
    path: 'flow_factors.json.gz';
    media_type: 'application/gzip';
    byte_size: number;
    decompressed_byte_size: number;
    sha256: string;
    decompressed_sha256: string;
    canonical_sha256: string;
  };
};

export type LciaStaticCacheBundleManifest = {
  schema_version: 'lcia.static_cache_bundle.v1';
  source_kind: 'static_cache_bundle';
  bundle_version: string;
  bundle_version_provenance: {
    scheme: 'legacy_frontend_cache_release.v1';
    repository: 'linancn/tiangong-lca-next';
    commit: string;
    path: 'src/components/LCIACacheMonitor/index.tsx';
    value: string;
  };
  source_snapshot_sha256: string;
  method_manifest_sha256: string;
  method_identity_manifest_sha256: string;
  factor_manifest_sha256: string;
  hash_algorithm: 'sha256';
  canonicalization: 'sorted_object_keys_preserve_array_order.v1';
  source_snapshot_hash_input: {
    schema_version: 'lcia.static_cache_bundle.v1';
    source_kind: 'static_cache_bundle';
    bundle_version: string;
    method_manifest_sha256: string;
    method_identity_manifest_sha256: string;
    factor_manifest_sha256: string;
    files: LciaStaticCacheFiles;
  };
  method_membership_status: 'consistent_with_verified_aliases';
  release_ready: boolean;
  files: LciaStaticCacheFiles;
  identity_aliases: Array<{
    method_id: string;
    method_version: string;
    artifact_locator_id: string;
    status: 'verified';
    evidence: {
      repository: string;
      commit: string;
      path: string;
      sha256: string;
      identity_field: string;
    };
  }>;
  methods: LciaStaticCacheMethod[];
  factor_index_summary: {
    schema_version: 'lcia.factor_index_summary.v1';
    flow_direction_key_count: number;
    factor_entry_count: number;
    method_flow_direction_key_count: number;
    duplicate_entry_count: number;
    max_method_count_per_key: number;
    all_methods_key_count: number;
    keys_with_duplicate_method_entries: number;
    method_count_distribution: Array<{
      method_count: number;
      flow_direction_key_count: number;
    }>;
  };
};

export type LciaUncharacterizedReason =
  | 'missing_flow_uuid'
  | 'unsupported_direction'
  | 'invalid_exchange_amount'
  | 'missing_factor'
  | 'invalid_factor'
  | 'calculation_failure'
  | 'method_source_drift';

export type LciaUncharacterizedExchange = {
  method_id: string;
  method_version: string;
  artifact_locator_id: string;
  flow_uuid: string;
  flow_version: string;
  direction: string;
  exchange_id: string;
  amount: string;
  amount_source: 'meanAmount' | 'resultingAmount';
  resulting_amount: string | null;
  reason: LciaUncharacterizedReason;
};

export type LciaMethodCoverageRow = {
  method_id: string;
  method_version: string;
  artifact_locator_id: string;
  counts: LciaCoverageCounts;
};

export type LciaMethodFactorCoverageMatrix<
  TArtifact extends LcaUncharacterizedEvidenceArtifactBase = LcaUncharacterizedEvidenceArtifactV1,
> = {
  schema_version: 'lcia.method_factor_coverage.matrix.v1' | 'lcia.method_factor_coverage.matrix.v2';
  source_snapshot_sha256: string;
  method_manifest_sha256: string;
  method_identity_manifest_sha256: string;
  factor_manifest_sha256: string;
  count_unit: 'exchange_method_pair';
  key_dimensions: ['method_id', 'method_version', 'flow_uuid', 'direction'];
  coverage_status: 'complete' | 'incomplete_coverage';
  missing_factor_semantics: 'incomplete_coverage_not_zero';
  counts: LciaCoverageCounts;
  by_method: LciaMethodCoverageRow[];
  uncharacterized_evidence: TArtifact | null;
  uncharacterized_exchanges?: LciaUncharacterizedExchange[];
};

export type LciaStaticCalculationReport = {
  schema_version: 'lcia.frontend_calculation_report.v1';
  calculation_status: LciaCalculationStatus;
  source: {
    schema_version: 'lcia.method_factor_source.static_cache_bundle.v1';
    source_kind: 'static_cache_bundle';
    bundle_version: string;
    source_snapshot_sha256: string;
    method_manifest_sha256: string;
    method_identity_manifest_sha256: string;
    factor_manifest_sha256: string;
    observed_list_sha256: string | null;
    observed_factor_sha256: string | null;
  };
  method_factor_coverage: LciaMethodFactorCoverageMatrix;
  failure_reason: string | null;
};

export type LciaStaticCalculationResult = {
  results: LCIAResultTable[];
  report: LciaStaticCalculationReport;
};

export type LcaDatabaseMethodFactorSource = {
  schema_version: 'lca.method_factor_source.snapshot.v1';
  source_kind: 'database' | 'static_cache_bundle';
  relation?: 'public.lciamethods';
  source_snapshot_sha256: string;
  method_manifest_sha256: string;
  method_identity_manifest_sha256?: string;
  factor_manifest_sha256: string;
};

export type LcaStaticMethodFactorSourceV2 = {
  schema_version: 'lca.method_factor_source.snapshot.v2';
  source_kind: 'static_cache_bundle';
  bundle_manifest_path: 'lciamethods/cache_manifest.json';
  bundle_manifest_sha256: string;
  bundle_version: string;
  source_snapshot_sha256: string;
  method_manifest_sha256: string;
  method_identity_manifest_sha256: string;
  factor_manifest_sha256: string;
  method_count: number;
};

export type LcaUncharacterizedEvidenceArtifactBase = {
  artifact_url: string;
  artifact_format:
    | 'lcia-uncharacterized-jsonl:v1'
    | 'lcia-uncharacterized-jsonl:v2'
    | 'lcia-coverage-replay-snapshot:v1';
  artifact_sha256: string;
  record_count: number;
};

export type LcaUncharacterizedEvidenceArtifactV1 = LcaUncharacterizedEvidenceArtifactBase & {
  artifact_format: 'lcia-uncharacterized-jsonl:v1';
};

export type LcaUncharacterizedEvidenceArtifactV2 = LcaUncharacterizedEvidenceArtifactBase & {
  artifact_format: 'lcia-uncharacterized-jsonl:v2' | 'lcia-coverage-replay-snapshot:v1';
};

export type LcaUncharacterizedEvidenceArtifact = LcaUncharacterizedEvidenceArtifactV1;

export type LcaCalculationEvidenceV1 = {
  schema_version: 'lca.calculation_evidence.v1';
  scope_manifest_sha256: string;
  lcia_method_factor_source: LcaDatabaseMethodFactorSource;
  lcia_factor_coverage: {
    schema_version: 'lcia.factor_coverage.v1';
    coverage_status: 'complete' | 'incomplete_coverage';
    missing_factor_semantics: 'incomplete_coverage_not_zero';
    counts: LciaCoverageCounts;
    uncharacterized_evidence: LcaUncharacterizedEvidenceArtifact | null;
  };
};

export type LcaCalculationEvidenceV2 = {
  schema_version: 'lca.calculation_evidence.v2';
  scope_manifest_sha256: string;
  lcia_method_factor_source: LcaStaticMethodFactorSourceV2;
  lcia_factor_coverage: LciaMethodFactorCoverageMatrix<LcaUncharacterizedEvidenceArtifactV2>;
};

export type LcaCalculationEvidence = LcaCalculationEvidenceV1 | LcaCalculationEvidenceV2;
