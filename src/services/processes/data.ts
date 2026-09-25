import type { LangTextValue, ReferenceItem, VersionedDataRow } from '@/services/general/data';
import type { CommonOther, Process } from '@tiangong-lca/tidas-sdk/types';
import type { ProcessSite } from './siteLabel';

export type ProcessTable = VersionedDataRow & {
  key: string;
  lang: string;
  name: string;
  generalComment: string;
  classification: string;
  referenceYear: string;
  location: string;
  site?: ProcessSite;
  modelId: string;
  modelVersion?: string | null;
  typeOfDataSet: string;
  isPublished?: boolean;
};

export const toProcessModelVersionField = (
  modelVersion: string | null | undefined,
): Pick<ProcessTable, 'modelVersion'> => (modelVersion === undefined ? {} : { modelVersion });

export const resolveProcessModelVersion = (
  process: Pick<ProcessTable, 'version' | 'modelVersion'>,
): string => process.modelVersion?.trim() || process.version;

export type ProcessImportItem = {
  processDataSet: Process['processDataSet'];
};

export type ProcessImportData = ProcessImportItem[];

export type ProcessRefUnitDisplay = {
  name?: LangTextValue;
  refUnitName?: string;
  refUnitGeneralComment?: LangTextValue;
  [key: string]: unknown;
};

type ProcessExchangeAllocation = {
  '@internalReferenceToCoProduct'?: string | number;
  '@allocatedFraction'?: string | number;
};

export const getFirstProcessExchangeAllocation = (
  allocation?: ProcessExchangeAllocation | ProcessExchangeAllocation[],
) => (Array.isArray(allocation) ? allocation[0] : allocation);

export type ProcessExchangeData = {
  '@dataSetInternalID'?: string;
  referenceToFlowDataSet?: ReferenceItem | ReferenceItem[];
  location?: string;
  functionType?: string;
  exchangeDirection?: string;
  referenceToVariable?: string;
  meanAmount?: string | number;
  resultingAmount?: string | number;
  minimumAmount?: string | number;
  maximumAmount?: string | number;
  uncertaintyDistributionType?: string;
  relativeStandardDeviation95In?: string | number;
  allocations?: {
    allocation?: ProcessExchangeAllocation | ProcessExchangeAllocation[];
  };
  dataSourceType?: string;
  dataDerivationTypeStatus?: string;
  referencesToDataSource?: {
    referenceToDataSource?: ReferenceItem | ReferenceItem[];
    'common:other'?: string | CommonOther;
  };
  generalComment?: LangTextValue;
  quantitativeReference?: boolean;
  functionalUnitOrOther?: LangTextValue;
  [key: string]: unknown;
};

export type ProcessExchangeTable = {
  key: string;
  dataSetInternalID: string;
  exchangeDirection: string;
  referenceToFlowDataSetId: string;
  referenceToFlowDataSetVersion: string;
  referenceToFlowDataSet: string;
  classification: string;
  meanAmount: string;
  resultingAmount: string;
  uncertaintyDistributionType: string;
  dataDerivationTypeStatus: string;
  generalComment: string;
  quantitativeReference: boolean;
  functionalUnitOrOther?: string;
  refUnitRes?: ProcessRefUnitDisplay;
  stateCode?: number;
  typeOfDataSet?: string;
};

export type ProcessReviewScopeMethod = {
  '@name'?: string;
};

export type ProcessReviewScopeItem = {
  '@name'?: string;
  'common:method'?: ProcessReviewScopeMethod | ProcessReviewScopeMethod[];
};

export type ProcessReviewDataQualityIndicatorItem = {
  '@name'?: string;
  '@value'?: string;
};

export type ProcessReviewItem = {
  '@type'?: string;
  'common:scope'?: ProcessReviewScopeItem | ProcessReviewScopeItem[];
  'common:dataQualityIndicators'?: {
    'common:dataQualityIndicator'?:
      ProcessReviewDataQualityIndicatorItem | ProcessReviewDataQualityIndicatorItem[];
  };
  'common:reviewDetails'?: LangTextValue;
  'common:referenceToNameOfReviewerAndInstitution'?: ReferenceItem | ReferenceItem[];
  'common:otherReviewDetails'?: LangTextValue;
  'common:referenceToCompleteReviewReport'?: ReferenceItem | ReferenceItem[];
};

export type ProcessComplianceItem = {
  'common:referenceToComplianceSystem'?: ReferenceItem | ReferenceItem[];
  'common:approvalOfOverallCompliance'?: string;
  'common:nomenclatureCompliance'?: string;
  'common:methodologicalCompliance'?: string;
  'common:reviewCompliance'?: string;
  'common:documentationCompliance'?: string;
  'common:qualityCompliance'?: string;
};

export type ProcessReviewLog = {
  user?: {
    display_name?: string;
    name?: string;
  };
  time?: string;
  action?: string;
};

export type ProcessReviewRecord = {
  id: string;
  json?: {
    logs?: ProcessReviewLog[];
  };
};

export type ProcessDetailData = {
  id?: string;
  version?: string;
  json?: { processDataSet?: Process['processDataSet'] };
  modifiedAt?: string | Date;
  stateCode?: number;
  ruleVerification?: boolean;
  teamId?: string;
  reviews?: ProcessReviewRecord[] | null;
};

export type ProcessDetailResponse = {
  data?: ProcessDetailData | null;
  success?: boolean;
};

export type ProcessDetailByVersionItem = {
  id: string;
  version: string;
  json?: {
    processDataSet?: Process['processDataSet'];
  };
  modified_at?: string;
  state_code?: number;
};

export type ProcessDetailByVersionResponse = {
  data: ProcessDetailByVersionItem[];
  success: boolean;
};

export type ProcessDataSetObjectKeys = Exclude<
  {
    [K in keyof Process['processDataSet']]: Process['processDataSet'][K] extends object | undefined
      ? K
      : never;
  }[keyof Process['processDataSet']],
  undefined | 'common:other'
>;

export type FormProcess = Pick<Process['processDataSet'], ProcessDataSetObjectKeys>;

export type ProcessFormState = FormProcess & {
  id?: string;
  stateCode?: number;
  ruleVerification?: boolean;
};
