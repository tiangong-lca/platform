import type { LifeCycleModel } from '@tiangong-lca/tidas-sdk/types';
import type { LangTextValue, VersionedDataRow } from '../general/data';
import type { ProcessExchangeData, ProcessTable } from '../processes/data';
import type { CalculationIssue } from './matrixCalculation/types';

export type LifeCycleModelTable = VersionedDataRow & {
  name: string;
  generalComment: string;
  classification: string;
};

export type Up2DownEdge = {
  id: string; //upstreamId + '->' + downstreamId + ':' + dependence
  flowUUID: string;
  flowIsRef: boolean;
  upstreamId: string;
  upstreamNodeId?: string;
  downstreamId: string;
  downstreamNodeId?: string;
  dependence?: string;
  mainDependence?: string;
  mainScalingFactor?: number;
  mainOutputFlowUUID: string;
  mainInputFlowUUID: string;
  downScalingFactor?: number;
  upScalingFactor?: number;
  scalingFactor?: number;
  exchangeAmount?: number;
  unbalancedAmount?: number;
  isBalanced?: boolean;
  isCycle?: boolean;
};

export type LifeCycleModelDataSetObjectKeys = Exclude<
  {
    [
      K in keyof LifeCycleModel['lifeCycleModelDataSet']
    ]: LifeCycleModel['lifeCycleModelDataSet'][K] extends object | undefined ? K : never;
  }[keyof LifeCycleModel['lifeCycleModelDataSet']],
  undefined | 'common:other'
>;

export type FormLifeCycleModel = Pick<
  LifeCycleModel['lifeCycleModelDataSet'],
  LifeCycleModelDataSetObjectKeys
>;

type DeepPartial<T> =
  T extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T;

export type LifeCycleModelFormData = DeepPartial<FormLifeCycleModel> & {
  [key: string]: unknown;
};

export type LifeCycleModelFormState = LifeCycleModelFormData & {
  id?: string;
  version?: string;
};

export type LifeCycleModelPortGroup = 'groupInput' | 'groupOutput';

export type LifeCycleModelPortData = {
  textLang?: LangTextValue;
  flowId?: string;
  flowVersion?: string;
  quantitativeReference?: boolean;
  allocations?: ProcessExchangeData['allocations'];
  [key: string]: unknown;
};

export type LifeCycleModelPortItem = {
  id: string;
  args?: { x?: number | string; y?: number };
  attrs?: {
    text?: {
      text?: string;
      title?: string;
      cursor?: string;
      fill?: string;
      'font-weight'?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  group: LifeCycleModelPortGroup | string;
  data?: LifeCycleModelPortData;
  [key: string]: unknown;
};

export type LifeCycleModelNodeData = {
  id?: string;
  version?: string;
  index?: string;
  label?: unknown;
  shortDescription?: unknown;
  quantitativeReference?: '0' | '1';
  targetAmount?: string | number;
  originalAmount?: string | number;
  scalingFactor?: string | number;
  [key: string]: unknown;
};

export type LifeCycleModelGraphNode = {
  id?: string;
  shape?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  size?: { width: number; height: number };
  attrs?: Record<string, unknown>;
  data?: LifeCycleModelNodeData;
  ports?: {
    groups?: Record<string, unknown>;
    items?: LifeCycleModelPortItem[];
  };
  tools?: Array<{ id?: string; [key: string]: unknown } | string>;
  selected?: boolean;
  [key: string]: unknown;
};

export type LifeCycleModelEdgeConnection = {
  outputExchange?: {
    '@flowUUID'?: string;
    '@version'?: string;
    downstreamProcess?: {
      '@flowUUID'?: string;
      '@id'?: string;
      '@version'?: string;
    };
  };
  isBalanced?: boolean;
  exchangeAmount?: number;
  unbalancedAmount?: number;
  [key: string]: unknown;
};

export type LifeCycleModelEdgeNodeData = {
  sourceNodeID?: string;
  targetNodeID?: string;
  sourceProcessId?: string;
  sourceProcessVersion?: string;
  targetProcessId?: string;
  targetProcessVersion?: string;
  [key: string]: unknown;
};

export type LifeCycleModelEdgeData = {
  connection?: LifeCycleModelEdgeConnection;
  node?: LifeCycleModelEdgeNodeData;
  [key: string]: unknown;
};

export type LifeCycleModelGraphEdge = {
  id?: string;
  source?: {
    cell?: string;
    port?: string;
    [key: string]: unknown;
  };
  target?: {
    cell?: string;
    port?: string;
    [key: string]: unknown;
  };
  attrs?: Record<string, unknown>;
  labels?: unknown[];
  data?: LifeCycleModelEdgeData;
  selected?: boolean;
  [key: string]: unknown;
};

export type LifeCycleModelGraphData = {
  nodes: LifeCycleModelGraphNode[];
  edges: LifeCycleModelGraphEdge[];
};

export type LifeCycleModelEditorFormState = LifeCycleModelFormState & {
  model?: LifeCycleModelGraphData;
};

export type LifeCycleModelValidationIssue = {
  path: PropertyKey[];
};

export type LifeCycleModelCheckContext = 'review' | 'checkData';

export type LifeCycleModelCheckResult<TRefData = unknown> = {
  checkResult: boolean;
  unReview: TRefData[];
  problemNodes?: TRefData[];
};

export type LifeCycleModelValidationSnapshot = {
  modelId: string;
  version: string;
  payload: LifeCycleModelEditorFormState;
};

export type LifeCycleModelSaveAttemptResult = {
  saveSucceeded: boolean;
  validationSnapshot: LifeCycleModelValidationSnapshot;
};

export type LifeCycleModelCheckDataOptions = {
  silent?: boolean;
  validationSnapshot?: LifeCycleModelValidationSnapshot;
};

export type LifeCycleModelToolbarEditInfoHandle<TRefData = unknown> = {
  submitReview: (unReview: TRefData[]) => Promise<boolean>;
  handleCheckData: (
    from: LifeCycleModelCheckContext,
    nodes: LifeCycleModelGraphNode[],
    edges: LifeCycleModelGraphEdge[],
    options?: LifeCycleModelCheckDataOptions,
  ) => Promise<LifeCycleModelCheckResult<TRefData>>;
  updateReferenceDescription: (formData: LifeCycleModelFormState) => Promise<void>;
};

export type LifeCycleModelSubModel = {
  id: string;
  version?: string;
  type?: 'primary' | 'secondary' | string;
  [key: string]: unknown;
};

export const SINGLE_PRIMARY_RESULT_POLICY = 'single-primary-v1' as const;

export type LifeCycleModelJsonTg = {
  resultPolicy?: typeof SINGLE_PRIMARY_RESULT_POLICY;
  xflow?: {
    nodes?: LifeCycleModelGraphNode[];
    edges?: LifeCycleModelGraphEdge[];
  };
  submodels?: LifeCycleModelSubModel[];
  [key: string]: unknown;
};

export type LifeCycleModelDetailData = {
  id: string;
  version: string;
  json: { lifeCycleModelDataSet?: FormLifeCycleModel };
  json_tg?: LifeCycleModelJsonTg;
  stateCode: number;
  ruleVerification: boolean;
  teamId?: string;
  bundleRevision?: string;
};

export type LifeCycleModelDetailResponse =
  | {
      data: LifeCycleModelDetailData;
      success: true;
    }
  | {
      data: object;
      success: false;
    };

export type LifeCycleModelImportData = Array<{
  lifeCycleModelDataSet?: FormLifeCycleModel;
  json_tg?: LifeCycleModelJsonTg;
  [key: string]: unknown;
}>;

export type LifeCycleModelProcessInstance = Pick<ProcessTable, 'id' | 'version'> & {
  modelId?: string;
  userId?: string;
};

export type LifeCycleModelTargetAmount = {
  targetAmount?: string | number;
  originalAmount?: string | number;
  scalingFactor?: string | number;
};

export type LifeCycleModelSelectedPortPayload = {
  selectedRowData: ProcessExchangeData[];
};

export type LifeCycleModelThemeToken = {
  colorPrimary: string;
  colorTextDescription: string;
  colorText: string;
  colorBgBase: string;
};

export type LifeCycleModelProcessMutation =
  | {
      op: 'create';
      id: string;
      modelId: string;
      jsonOrdered: unknown;
      ruleVerification: boolean;
    }
  | {
      op: 'update';
      id: string;
      version: string;
      modelId: string;
      jsonOrdered: unknown;
      ruleVerification: boolean;
    }
  | {
      op: 'delete';
      id: string;
      version: string;
    };

export type LifeCycleModelPersistencePlan = {
  mode: 'create' | 'update';
  modelId: string;
  version?: string;
  allocateVersion?: boolean;
  sourceVersion?: string;
  parent: {
    jsonOrdered: unknown;
    jsonTg: LifeCycleModelJsonTg;
    ruleVerification: boolean;
  };
  processMutations: LifeCycleModelProcessMutation[];
};

export type LifeCycleModelMutationRecord = {
  id: string;
  version: string;
  json?: { lifeCycleModelDataSet?: FormLifeCycleModel } | null;
  json_tg?: LifeCycleModelJsonTg | null;
  ruleVerification?: boolean;
};

export type LifeCycleModelLangNormalizationMetadata = {
  normalizedJsonOrdered?: any;
  langSupplementedPlaceholderPaths?: string[];
  langTranslatedPaths?: string[];
};

/**
 * zh-CN: 浏览器本地矩阵计算的附加信息（内部运行时类型，不进入持久化 schema）。
 * en-US: Additions from the local matrix calculation (internal runtime types,
 * not persisted).
 */
export type LifeCycleModelCalculationMetadata = {
  calculationIssues?: Array<{
    code: string;
    allocationReason?: CalculationIssue['allocationReason'];
    instanceIndex?: string;
    nodeId?: string;
    flowId?: string;
    exchangeInternalId?: string;
    edgeId?: string;
  }>;
  calculationNotice?: 'LCIA_INCOMPLETE';
};

export type ModelBundleOperation = {
  modelId: string;
  version: string;
  operationId: string;
};

export type LifeCycleModelMutationResult =
  | ({
      ok: true;
      modelId: string;
      version: string;
      lifecycleModel?: LifeCycleModelMutationRecord;
      bundleRevision?: string;
      warnings?: string[];
    } & LifeCycleModelLangNormalizationMetadata &
      LifeCycleModelCalculationMetadata)
  | ({
      ok: false;
      code: string;
      message: string;
      details?: unknown;
      pendingBundleOperation?: ModelBundleOperation;
    } & LifeCycleModelLangNormalizationMetadata &
      LifeCycleModelCalculationMetadata);
