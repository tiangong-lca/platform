import type { RefCheckType } from '@/contexts/refCheckContext';
import { getRejectedCommentsByReviewIds } from '@/services/comments/api';
import { getRefData, getRefDataByIds } from '@/services/general/api';
import { getLifeCycleModelDetail } from '@/services/lifeCycleModels/api';
import { FormProcess } from '@/services/processes/data';
import {
  getRejectReviewsByProcess,
  submitDatasetReviewApi,
  type ReviewSubmitDatasetTable,
} from '@/services/reviews/api';
import { getSourcesByIdsAndVersions } from '@/services/sources/api';
import { getUserId, getUsersByIds } from '@/services/users/api';
import { buildExternalUrl } from '@/utils/appUrl';
import {
  createContact as createTidasContact,
  createFlow as createTidasFlow,
  createFlowProperty as createTidasFlowProperty,
  createLifeCycleModel as createTidasLifeCycleModel,
  createProcess as createTidasProcess,
  createSource as createTidasSource,
  createUnitGroup as createTidasUnitGroup,
} from '@tiangong-lca/tidas-sdk/core';

export class ConcurrencyController {
  private maxConcurrency: number;
  private running: number = 0;
  private queue: (() => Promise<any>)[] = [];

  constructor(maxConcurrency: number = 5) {
    this.maxConcurrency = maxConcurrency;
  }

  async add<T>(task: () => Promise<T>): Promise<T> {
    let outerResolve!: (value: T | PromiseLike<T>) => void;
    let outerReject!: (reason?: any) => void;

    const promise = new Promise<T>((resolve, reject) => {
      outerResolve = resolve;
      outerReject = reject;
    });

    const wrappedTask = async () => {
      try {
        const result = await task();
        outerResolve(result);
      } catch (error) {
        outerReject(error);
      } finally {
        this.running--;
        this.processQueue();
      }
    };
    this.queue.push(wrappedTask);
    this.processQueue();
    return promise;
  }

  private processQueue() {
    while (this.running < this.maxConcurrency && this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        this.running++;
        task();
      }
    }
  }

  async waitForAll(): Promise<void> {
    while (this.running > 0 || this.queue.length > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), 10);
      });
    }
  }
}

function get(obj: any, path: string, defaultValue?: any): any {
  if (!obj || typeof obj !== 'object') {
    return defaultValue;
  }

  const keys = path.split('.');
  let result = obj;

  for (const key of keys) {
    if (result === null || result === undefined || typeof result !== 'object' || !(key in result)) {
      return defaultValue;
    }
    result = result[key];
  }

  return result;
}

export type refDataType = {
  '@type': string;
  '@refObjectId': string;
  '@version': string;
};

type ReffPathNode = {
  '@refObjectId': string;
  '@version': string;
  '@type': string;
  ruleVerification: boolean;
  nonExistent: boolean;
  underReviewVersion?: string;
  versionIsInTg?: boolean;
  versionUnderReview?: boolean;
};

export type ProblemNode = ReffPathNode;

type SdkValidationIssue = {
  code?: string;
  errors?: unknown;
  exact?: boolean;
  expected?: string;
  format?: string;
  input?: unknown;
  inclusive?: boolean;
  keys?: string[];
  maximum?: number;
  message?: string;
  minimum?: number;
  origin?: string;
  params?: ValidationIssueMessageValues;
  path: PropertyKey[];
  rawCode?: string;
  severity?: 'error' | 'warning' | 'info';
  values?: unknown[];
};

type SdkValidationResult = {
  success: boolean;
  issues: SdkValidationIssue[];
};

export type ValidationIssueCode =
  | 'sdkInvalid'
  | 'ruleVerificationFailed'
  | 'nonExistentRef'
  | 'underReview'
  | 'versionUnderReview'
  | 'versionIsInTg';

export type ValidationIssue = {
  code: ValidationIssueCode;
  ref: refDataType;
  link: string;
  ownerName?: string;
  ownerUserId?: string;
  isOwnedByCurrentUser?: boolean;
  tabName?: string | null;
  tabNames?: string[];
  underReviewVersion?: string;
  sdkDetails?: ValidationIssueSdkDetail[];
};

export type ValidationIssueMessageValue = string | number | boolean | null | undefined;

export type ValidationIssueMessageValues = Record<string, ValidationIssueMessageValue>;

export type ValidationIssueSdkDetail = {
  actual?: number | string;
  exchangeDirection?: string;
  exchangeFlowId?: string;
  exchangeFlowLabel?: string;
  exchangeIndex?: number;
  exchangeInternalId?: string;
  fieldKey?: string;
  fieldLabel: string;
  fieldPath: string;
  formName?: Array<string | number>;
  key: string;
  limit?: number | string;
  presentation?: 'field' | 'section' | 'highlight-only';
  processInstanceInternalId?: string;
  processInstanceLabel?: string;
  rawCode?: string;
  reasonMessage: string;
  suggestedFix?: string;
  tabName?: string;
  validationCode?: string;
  validationParams?: ValidationIssueMessageValues;
};

const getValidationIssueRefKey = (ref: refDataType) =>
  `${ref['@type']}:${ref['@refObjectId']}:${ref['@version']}`;

export const collectValidationIssueRefTabNames = <T extends refDataType>({
  refs,
  resolveTabName,
}: {
  refs: T[];
  resolveTabName: (ref: T) => string | null | undefined;
}) => {
  const tabNames: string[] = [];
  const tabNamesByRefKey = new Map<string, string[]>();

  refs.forEach((ref) => {
    const tabName = resolveTabName(ref);

    if (!tabName) {
      return;
    }

    if (!tabNames.includes(tabName)) {
      tabNames.push(tabName);
    }

    const key = getValidationIssueRefKey(ref);
    const refTabNames = tabNamesByRefKey.get(key) ?? [];
    if (!refTabNames.includes(tabName)) {
      tabNamesByRefKey.set(key, [...refTabNames, tabName]);
    }
  });

  return {
    getRefTabNames: (ref: refDataType) => tabNamesByRefKey.get(getValidationIssueRefKey(ref)),
    tabNames,
  };
};

const getValidationIssueOwnerName = (user?: {
  display_name?: string | null;
  email?: string | null;
  raw_user_meta_data?: {
    display_name?: string | null;
    email?: string | null;
  } | null;
}) => {
  const candidates = [
    user?.display_name,
    user?.raw_user_meta_data?.display_name,
    user?.email,
    user?.raw_user_meta_data?.email,
  ];

  return candidates.find((value) => typeof value === 'string' && value.trim()) ?? '-';
};

const tableDict = {
  'contact data set': 'contacts',
  'source data set': 'sources',
  'unit group data set': 'unitgroups',
  'flow property data set': 'flowproperties',
  'flow data set': 'flows',
  'process data set': 'processes',
  'lifeCycleModel data set': 'lifecyclemodels',
};

const datasetRouteDict = {
  'contact data set': '/mydata/contacts',
  'source data set': '/mydata/sources',
  'unit group data set': '/mydata/unitgroups',
  'flow property data set': '/mydata/flowproperties',
  'flow data set': '/mydata/flows',
  'process data set': '/mydata/processes',
  'lifeCycleModel data set': '/mydata/models',
};

export const getRefTableName = (type: string) => {
  return tableDict[type as keyof typeof tableDict] ?? undefined;
};

const isSameRef = (
  leftRef?: Partial<refDataType> | null,
  rightRef?: Partial<refDataType> | null,
): boolean => {
  return (
    leftRef?.['@type'] === rightRef?.['@type'] &&
    leftRef?.['@refObjectId'] === rightRef?.['@refObjectId'] &&
    leftRef?.['@version'] === rightRef?.['@version']
  );
};

const isAllowedExactUnderReviewReference = (
  actionFrom: 'checkData' | 'review',
  ref: Pick<ReffPathNode, '@refObjectId' | '@type' | '@version' | 'underReviewVersion'>,
  rootRef: refDataType,
) =>
  actionFrom === 'review' && !isSameRef(ref, rootRef) && ref.underReviewVersion === ref['@version'];

const getDatasetRootRef = (
  datasetType: refDataType['@type'],
  orderedJson: any,
): refDataType | null => {
  const datasetRootMap: Record<
    refDataType['@type'],
    {
      datasetKey: string;
      infoKey: string;
    }
  > = {
    'contact data set': {
      datasetKey: 'contactDataSet',
      infoKey: 'contactInformation',
    },
    'source data set': {
      datasetKey: 'sourceDataSet',
      infoKey: 'sourceInformation',
    },
    'unit group data set': {
      datasetKey: 'unitGroupDataSet',
      infoKey: 'unitGroupInformation',
    },
    'flow property data set': {
      datasetKey: 'flowPropertyDataSet',
      infoKey: 'flowPropertiesInformation',
    },
    'flow data set': {
      datasetKey: 'flowDataSet',
      infoKey: 'flowInformation',
    },
    'process data set': {
      datasetKey: 'processDataSet',
      infoKey: 'processInformation',
    },
    'lifeCycleModel data set': {
      datasetKey: 'lifeCycleModelDataSet',
      infoKey: 'lifeCycleModelInformation',
    },
  };

  const rootConfig = datasetRootMap[datasetType];

  if (!rootConfig) {
    return null;
  }

  const dataset = orderedJson?.[rootConfig.datasetKey];
  const refObjectId = dataset?.[rootConfig.infoKey]?.dataSetInformation?.['common:UUID'];
  const version =
    dataset?.administrativeInformation?.publicationAndOwnership?.['common:dataSetVersion'];

  if (!refObjectId || !version) {
    return null;
  }

  return {
    '@type': datasetType,
    '@refObjectId': refObjectId,
    '@version': version,
  };
};

const filterOutRootSelfReferences = (refs: refDataType[], rootRef?: refDataType | null) => {
  if (!rootRef) {
    return refs;
  }

  return refs.filter((ref) => !isSameRef(ref, rootRef));
};

export const getDatasetDetailPath = (ref: refDataType) => {
  const route = datasetRouteDict[ref['@type'] as keyof typeof datasetRouteDict];
  if (!route) {
    return null;
  }
  const searchParams = new URLSearchParams({
    id: ref['@refObjectId'],
    version: ref['@version'],
    required: '1',
  });
  return `${route}?${searchParams.toString()}`;
};

export const getDatasetPath = (
  ref: refDataType,
  options?: {
    required?: boolean;
  },
) => {
  const route = datasetRouteDict[ref['@type'] as keyof typeof datasetRouteDict];
  if (!route) {
    return null;
  }
  const searchParams = new URLSearchParams({
    id: ref['@refObjectId'],
    version: ref['@version'],
  });
  if (options?.required) {
    searchParams.set('required', '1');
  }
  return `${route}?${searchParams.toString()}`;
};

export const getDatasetDetailAbsoluteUrl = (ref: refDataType, origin?: string) => {
  const path = getDatasetPath(ref, { required: true });
  if (!path) {
    return '';
  }
  return buildExternalUrl(path, origin);
};

const getIssueKey = (code: ValidationIssueCode, ref: refDataType) =>
  `${code}:${ref['@type']}:${ref['@refObjectId']}:${ref['@version']}`;

const pushValidationIssue = (
  issues: ValidationIssue[],
  issueKeys: Set<string>,
  issue: ValidationIssue,
) => {
  const key = getIssueKey(issue.code, issue.ref);
  if (issueKeys.has(key)) {
    return;
  }
  issueKeys.add(key);
  issues.push(issue);
};

type ValidationIssueRefTabNamesResolver = (
  ref: refDataType,
) => string | string[] | null | undefined;

const getValidationIssueRefTabProps = (
  ref: refDataType,
  getRefTabNames?: ValidationIssueRefTabNamesResolver,
): Pick<ValidationIssue, 'tabName' | 'tabNames'> => {
  const rawTabNames = getRefTabNames?.(ref);
  const tabNames = (Array.isArray(rawTabNames) ? rawTabNames : [rawTabNames])
    .map((tabName) => (typeof tabName === 'string' ? tabName.trim() : ''))
    .filter(
      (tabName, index, allTabNames) => tabName.length > 0 && allTabNames.indexOf(tabName) === index,
    );

  if (tabNames.length === 0) {
    return {};
  }

  return {
    tabName: tabNames[0],
    tabNames,
  };
};

export const mapValidationIssuesToRefCheckData = (issues: ValidationIssue[]): RefCheckType[] => {
  const issueMap = new Map<string, RefCheckType>();

  issues.forEach((issue) => {
    const key = getValidationIssueRefKey(issue.ref);
    const current =
      issueMap.get(key) ??
      ({
        id: issue.ref['@refObjectId'],
        version: issue.ref['@version'],
        ruleVerification: true,
        nonExistent: false,
      } satisfies RefCheckType);

    if (issue.code === 'ruleVerificationFailed') {
      current.ruleVerification = false;
    } else if (issue.code === 'nonExistentRef') {
      current.nonExistent = true;
    } else if (issue.code === 'underReview') {
      current.stateCode = 20;
      current.versionUnderReview = true;
      current.underReviewVersion = issue.underReviewVersion ?? issue.ref['@version'];
    } else if (issue.code === 'versionUnderReview') {
      current.versionUnderReview = true;
      current.underReviewVersion = issue.underReviewVersion;
    } else if (issue.code === 'versionIsInTg') {
      current.versionIsInTg = true;
    }

    issueMap.set(key, current);
  });

  return Array.from(issueMap.values());
};

export const enrichValidationIssuesWithOwner = async (issues: ValidationIssue[]) => {
  if (issues.length === 0) {
    return issues;
  }

  const currentUserId = await getUserId();
  const normalizedCurrentUserId =
    typeof currentUserId === 'string' && currentUserId.trim() ? currentUserId.trim() : undefined;

  const ownerNameByRefKey = new Map<string, string>();
  const ownerUserIdByRefKey = new Map<string, string>();

  issues.forEach((issue) => {
    const refKey = getValidationIssueRefKey(issue.ref);
    const normalizedOwnerName = issue.ownerName?.trim();

    if (normalizedOwnerName) {
      ownerNameByRefKey.set(refKey, normalizedOwnerName);
    }
  });

  const uniqueRefs = issues.reduce<Map<string, refDataType>>((accumulator, issue) => {
    const refKey = getValidationIssueRefKey(issue.ref);

    if (!accumulator.has(refKey) && !ownerNameByRefKey.has(refKey)) {
      accumulator.set(refKey, issue.ref);
    }

    return accumulator;
  }, new Map<string, refDataType>());

  if (uniqueRefs.size > 0) {
    const controller = new ConcurrencyController(5);

    uniqueRefs.forEach((ref, refKey) => {
      controller.add(async () => {
        const tableName = getRefTableName(ref['@type']);

        if (!tableName) {
          ownerNameByRefKey.set(refKey, '-');
          return;
        }

        const result = await getRefData(ref['@refObjectId'], ref['@version'], tableName, '', {
          fallbackToLatest: false,
        });
        const ownerUserId = result?.data?.userId;

        if (typeof ownerUserId === 'string' && ownerUserId.trim()) {
          ownerUserIdByRefKey.set(refKey, ownerUserId);
          return;
        }

        ownerNameByRefKey.set(refKey, '-');
      });
    });

    await controller.waitForAll();
  }

  const ownerUserIds = Array.from(new Set(ownerUserIdByRefKey.values()));
  const users = ownerUserIds.length > 0 ? await getUsersByIds(ownerUserIds) : [];
  const userNameById = new Map<string, string>();

  (users ?? []).forEach((user: any) => {
    if (typeof user?.id === 'string' && user.id.trim()) {
      userNameById.set(user.id, getValidationIssueOwnerName(user));
    }
  });

  return issues.map((issue) => {
    const refKey = getValidationIssueRefKey(issue.ref);
    const ownerUserId = issue.ownerUserId?.trim() || ownerUserIdByRefKey.get(refKey);
    const ownerName =
      ownerNameByRefKey.get(refKey) ?? userNameById.get(ownerUserId as string) ?? '-';
    const isOwnedByCurrentUser =
      ownerUserId && normalizedCurrentUserId
        ? ownerUserId === normalizedCurrentUserId
        : issue.isOwnedByCurrentUser;

    if (
      issue.ownerName === ownerName &&
      issue.ownerUserId === ownerUserId &&
      issue.isOwnedByCurrentUser === isOwnedByCurrentUser
    ) {
      return issue;
    }

    const enrichedIssue: ValidationIssue = {
      ...issue,
      ownerName,
    };

    if (ownerUserId) {
      enrichedIssue.ownerUserId = ownerUserId;
    }

    if (typeof isOwnedByCurrentUser === 'boolean') {
      enrichedIssue.isOwnedByCurrentUser = isOwnedByCurrentUser;
    }

    return enrichedIssue;
  });
};

export const normalizeSdkValidationResult = (result: any): SdkValidationResult => {
  const normalizePath = (path?: PropertyKey[] | string) =>
    Array.isArray(path) ? path : typeof path === 'string' ? [path] : [];

  const getSdkInputType = (input: unknown) => {
    if (input === null) {
      return 'null';
    }

    if (Array.isArray(input)) {
      return 'array';
    }

    return typeof input;
  };

  const getLegacyTooBigCode = (issue: Partial<SdkValidationIssue>) => {
    if (issue.origin === 'string') {
      return 'string_too_long';
    }

    if (issue.origin === 'array') {
      return 'array_too_large';
    }

    if (issue.origin === 'number' || issue.origin === 'bigint') {
      return 'number_too_large';
    }

    return 'unknown';
  };

  const getLegacyTooSmallCode = (issue: Partial<SdkValidationIssue>) => {
    if (issue.origin === 'string') {
      return 'string_too_short';
    }

    if (issue.origin === 'array') {
      return 'array_too_small';
    }

    if (issue.origin === 'number' || issue.origin === 'bigint') {
      return 'number_too_small';
    }

    return 'unknown';
  };

  const getLegacyIssueCode = (issue: Partial<SdkValidationIssue>) => {
    switch (issue.code) {
      case 'invalid_type':
        return issue.input === undefined ? 'required_missing' : 'invalid_type';
      case 'too_big':
        return getLegacyTooBigCode(issue);
      case 'too_small':
        return getLegacyTooSmallCode(issue);
      case 'invalid_format':
        return 'invalid_format';
      case 'invalid_value':
        return 'invalid_value';
      case 'unrecognized_keys':
        return 'unrecognized_keys';
      case 'invalid_union':
        return issue.input === undefined ? 'required_missing' : 'invalid_union';
      case 'custom':
        return 'custom';
      default:
        return 'unknown';
    }
  };

  const getLegacyIssueParams = (issue: Partial<SdkValidationIssue>, code: string) => {
    switch (code) {
      case 'required_missing':
        return issue.expected
          ? {
              expected: issue.expected,
            }
          : undefined;
      case 'invalid_type':
        return {
          expected: issue.expected,
          received: getSdkInputType(issue.input),
        };
      case 'string_too_long':
      case 'array_too_large':
      case 'number_too_large': {
        const params: ValidationIssueMessageValues = {
          exact: issue.exact,
          inclusive: issue.inclusive,
          maximum: issue.maximum,
          origin: issue.origin,
        };

        if (issue.origin === 'string' && typeof issue.input === 'string') {
          params.actualLength = issue.input.length;
        } else if (issue.origin === 'array' && Array.isArray(issue.input)) {
          params.actualLength = issue.input.length;
        } else if (
          (issue.origin === 'number' || issue.origin === 'bigint') &&
          (typeof issue.input === 'number' || typeof issue.input === 'bigint')
        ) {
          params.actual = Number(issue.input);
        }

        return params;
      }
      case 'string_too_short':
      case 'array_too_small':
      case 'number_too_small': {
        const params: ValidationIssueMessageValues = {
          exact: issue.exact,
          inclusive: issue.inclusive,
          minimum: issue.minimum,
          origin: issue.origin,
        };

        if (issue.origin === 'string' && typeof issue.input === 'string') {
          params.actualLength = issue.input.length;
        } else if (issue.origin === 'array' && Array.isArray(issue.input)) {
          params.actualLength = issue.input.length;
        } else if (
          (issue.origin === 'number' || issue.origin === 'bigint') &&
          (typeof issue.input === 'number' || typeof issue.input === 'bigint')
        ) {
          params.actual = Number(issue.input);
        }

        return params;
      }
      case 'invalid_format':
        return issue.format
          ? {
              format: issue.format,
            }
          : undefined;
      case 'invalid_value':
        return Array.isArray(issue.values)
          ? {
              allowedValues: issue.values.join(', '),
            }
          : undefined;
      case 'unrecognized_keys':
        return Array.isArray(issue.keys) && issue.keys.length > 0
          ? {
              keys: issue.keys.join(', '),
            }
          : undefined;
      default:
        return undefined;
    }
  };

  const normalizeLegacyIssue = (
    issue: Partial<SdkValidationIssue> & { path?: PropertyKey[] | string },
  ): SdkValidationIssue => {
    const code = getLegacyIssueCode(issue);

    return {
      ...issue,
      code,
      message: issue.message,
      params: getLegacyIssueParams(issue, code),
      path: normalizePath(issue.path),
      rawCode: issue.code,
      severity: 'error',
    };
  };

  if (result.success) {
    return {
      success: true,
      issues: [],
    };
  }

  const rawIssues = Array.isArray(result.error?.issues) ? result.error.issues : [];

  return {
    success: false,
    issues: Array.isArray(result.validationIssues)
      ? result.validationIssues.map(
          (
            issue: Partial<SdkValidationIssue> & { path?: PropertyKey[] | string },
            index: number,
          ) => {
            const rawIssue = rawIssues[index] as Partial<SdkValidationIssue> | undefined;

            return {
              ...rawIssue,
              ...issue,
              code: issue.code ?? rawIssue?.code,
              errors: issue.errors ?? rawIssue?.errors,
              exact: issue.exact ?? rawIssue?.exact,
              expected: issue.expected ?? rawIssue?.expected,
              format: issue.format ?? rawIssue?.format,
              inclusive: issue.inclusive ?? rawIssue?.inclusive,
              input: issue.input ?? rawIssue?.input,
              keys: issue.keys ?? rawIssue?.keys,
              maximum: issue.maximum ?? rawIssue?.maximum,
              minimum: issue.minimum ?? rawIssue?.minimum,
              origin: issue.origin ?? rawIssue?.origin,
              path: normalizePath(issue.path ?? rawIssue?.path),
              rawCode: issue.rawCode ?? rawIssue?.code,
              severity: issue.severity ?? 'error',
              values: issue.values ?? rawIssue?.values,
            };
          },
        )
      : Array.isArray(result.error?.issues)
        ? result.error.issues.map(normalizeLegacyIssue)
        : [],
  };
};

const cloneSdkValidationInput = <T,>(orderedJson: T): T => {
  return JSON.parse(JSON.stringify(orderedJson)) as T;
};

const normalizeSdkIssuePathSegments = (path: PropertyKey[] | string | undefined): string[] => {
  const rawSegments = ([] as PropertyKey[]).concat(path as any);

  return rawSegments
    .flatMap((segment) => {
      if (typeof segment !== 'string') {
        return [];
      }

      return segment
        .split(/[.[\]/]+/)
        .map((part) => part.trim())
        .filter(Boolean);
    })
    .map((segment) => segment.toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter(Boolean);
};

const isValidationOrComplianceSdkIssue = (issue: SdkValidationIssue): boolean => {
  return normalizeSdkIssuePathSegments(issue?.path as PropertyKey[] | string | undefined).some(
    (segment) => {
      return segment === 'validation' || segment === 'compliance';
    },
  );
};

const filterValidationOrComplianceSdkIssues = (
  issues: SdkValidationIssue[],
): SdkValidationIssue[] => {
  return issues.filter((issue) => !isValidationOrComplianceSdkIssue(issue));
};

const filterProcessValidationIssues = (
  issues: SdkValidationIssue[],
  orderedJson: unknown,
): SdkValidationIssue[] => {
  return issues.filter((issue) => {
    if (!isValidationOrComplianceSdkIssue(issue)) return true;

    const reportIndex = issue.path.indexOf('common:referenceToCompleteReviewReport');
    if (reportIndex < 0) return false;

    // Published SDK 0.2.0 still requires this field. Suppress only its
    // missing-field issue; a supplied (even malformed) reference stays strict.
    const reportPath = issue.path.slice(0, reportIndex + 1);
    return (
      reportPath.reduce<unknown>((value, segment) => {
        if (value === null || value === undefined || typeof value !== 'object') return undefined;
        return (value as Record<PropertyKey, unknown>)[segment];
      }, orderedJson) !== undefined
    );
  });
};

export const validateDatasetWithSdk = (
  datasetType: refDataType['@type'],
  orderedJson: any,
): SdkValidationResult => {
  if (!orderedJson) {
    return {
      success: false,
      issues: [],
    };
  }

  const sdkValidationInput = cloneSdkValidationInput(orderedJson);

  switch (datasetType) {
    case 'contact data set':
      return normalizeSdkValidationResult(
        createTidasContact(sdkValidationInput).validateEnhanced(),
      );
    case 'source data set':
      return normalizeSdkValidationResult(createTidasSource(sdkValidationInput).validateEnhanced());
    case 'unit group data set':
      return normalizeSdkValidationResult(
        createTidasUnitGroup(sdkValidationInput).validateEnhanced(),
      );
    case 'flow property data set':
      return normalizeSdkValidationResult(
        createTidasFlowProperty(sdkValidationInput).validateEnhanced(),
      );
    case 'flow data set':
      return normalizeSdkValidationResult(createTidasFlow(sdkValidationInput).validateEnhanced());
    case 'process data set': {
      const result = normalizeSdkValidationResult(
        createTidasProcess(sdkValidationInput).validateEnhanced(),
      );
      if (result.success) {
        return result;
      }

      const filteredIssues = filterProcessValidationIssues(result.issues, sdkValidationInput);
      return {
        success: filteredIssues.length === 0,
        issues: filteredIssues,
      };
    }
    case 'lifeCycleModel data set': {
      const result = normalizeSdkValidationResult(
        createTidasLifeCycleModel(sdkValidationInput).validateEnhanced(),
      );
      if (result.success) {
        return result;
      }
      const filteredIssues = filterValidationOrComplianceSdkIssues(result.issues);
      return {
        success: filteredIssues.length === 0,
        issues: filteredIssues,
      };
    }
    default:
      return {
        success: true,
        issues: [],
      };
  }
};

export const buildValidationIssues = ({
  rootRef,
  datasetSdkValid,
  getRefTabNames,
  sdkInvalidTabNames = [],
  sdkInvalidDetails = [],
  nonExistentRef = [],
  problemNodes = [],
  actionFrom = 'checkData',
  unRuleVerification = [],
}: {
  actionFrom?: 'checkData' | 'review';
  datasetSdkValid: boolean;
  getRefTabNames?: ValidationIssueRefTabNamesResolver;
  sdkInvalidDetails?: ValidationIssueSdkDetail[];
  sdkInvalidTabNames?: string[];
  nonExistentRef?: refDataType[];
  problemNodes?: Array<
    ProblemNode & {
      underReviewVersion?: string;
      versionIsInTg?: boolean;
      versionUnderReview?: boolean;
    }
  >;
  rootRef: refDataType;
  unRuleVerification?: refDataType[];
}) => {
  const issues: ValidationIssue[] = [];
  const issueKeys = new Set<string>();

  if (!datasetSdkValid) {
    pushValidationIssue(issues, issueKeys, {
      code: 'sdkInvalid',
      link: getDatasetDetailAbsoluteUrl(rootRef),
      ref: rootRef,
      sdkDetails: sdkInvalidDetails,
      tabNames: sdkInvalidTabNames.filter(
        (tabName, index) => sdkInvalidTabNames.indexOf(tabName) === index,
      ),
    });
  }

  unRuleVerification.forEach((ref) => {
    if (!datasetSdkValid && isSameRef(ref, rootRef)) {
      return;
    }

    pushValidationIssue(issues, issueKeys, {
      code: 'ruleVerificationFailed',
      link: getDatasetDetailAbsoluteUrl(ref),
      ref,
      ...getValidationIssueRefTabProps(ref, getRefTabNames),
    });
  });

  nonExistentRef.forEach((ref) => {
    pushValidationIssue(issues, issueKeys, {
      code: 'nonExistentRef',
      link: getDatasetDetailAbsoluteUrl(ref),
      ref,
      ...getValidationIssueRefTabProps(ref, getRefTabNames),
    });
  });

  problemNodes.forEach((node) => {
    const ref = {
      '@refObjectId': node['@refObjectId'],
      '@type': node['@type'],
      '@version': node['@version'],
    } satisfies refDataType;

    if (node.versionIsInTg) {
      pushValidationIssue(issues, issueKeys, {
        code: 'versionIsInTg',
        link: getDatasetDetailAbsoluteUrl(ref),
        ref,
        ...getValidationIssueRefTabProps(ref, getRefTabNames),
      });
      return;
    }

    if (node.versionUnderReview) {
      if (node.underReviewVersion !== node['@version']) {
        return;
      }

      if (isAllowedExactUnderReviewReference(actionFrom, node, rootRef)) {
        return;
      }

      pushValidationIssue(issues, issueKeys, {
        code: 'underReview',
        link: getDatasetDetailAbsoluteUrl(ref),
        ref,
        underReviewVersion: node.underReviewVersion,
        ...getValidationIssueRefTabProps(ref, getRefTabNames),
      });
    }
  });

  return issues;
};

export const getAllRefObj = (obj: any): any[] => {
  const result: any[] = [];
  const visited = new WeakSet();

  const traverse = (current: any) => {
    if (!current || typeof current !== 'object') return;

    // Prevent circular references
    if (visited.has(current)) return;
    visited.add(current);

    if (
      '@refObjectId' in current &&
      current['@refObjectId'] &&
      current['@version'] &&
      current['@type']
    ) {
      const tableName = getRefTableName(current['@type']);
      if (tableName !== undefined) {
        result.push(current);
      }
    }

    if (Array.isArray(current)) {
      current.forEach((item) => traverse(item));
    } else if (typeof current === 'object') {
      Object.values(current).forEach((value) => traverse(value));
    }
  };

  traverse(obj);
  return result;
};

export class ReffPath {
  '@refObjectId': string;
  '@version': string;
  '@type': string;
  versionUnderReview?: boolean;
  underReviewVersion?: string;
  versionIsInTg?: boolean;
  children: ReffPath[] = [];
  ruleVerification: boolean;
  nonExistent: boolean;

  constructor(ref: refDataType, ruleVerification: boolean = false, nonExistent: boolean = false) {
    this['@refObjectId'] = ref['@refObjectId'];
    this['@version'] = ref['@version'];
    this['@type'] = ref['@type'];
    this.ruleVerification = ruleVerification;
    this.nonExistent = nonExistent;
  }

  addChild(child: ReffPath) {
    this.children.push(child);
  }

  set(ref: refDataType, key: string, value: any): void {
    const visited = new Set<ReffPath>();

    const traverse = (node: ReffPath): boolean => {
      if (visited.has(node)) return false;
      visited.add(node);

      if (
        node['@refObjectId'] === ref['@refObjectId'] &&
        node['@version'] === ref['@version'] &&
        node['@type'] === ref['@type']
      ) {
        (node as any)[key] = value;
        return true;
      }

      for (const child of node.children) {
        if (traverse(child)) {
          return true;
        }
      }

      return false;
    };

    traverse(this);
  }

  findProblemNodes(actionFrom: 'checkData' | 'review' = 'checkData'): ReffPathNode[] {
    const result: ReffPath[] = [];
    const visited = new Set<ReffPath>();
    const uniqueKeys = new Set<string>();

    const getUniqueKey = (node: ReffPath) =>
      `${node['@type']}_${node['@refObjectId']}_${node['@version']}`;

    const traverse = (node: ReffPath, parentPath: ReffPath[] = []) => {
      if (visited.has(node)) return;
      visited.add(node);

      let isProblemNode = node.ruleVerification === false || node.nonExistent === true;

      if (actionFrom === 'review') {
        const exactVersionUnderReview =
          node.versionUnderReview === true && node.underReviewVersion === node['@version'];
        const exactUnderReviewReferenceAllowed =
          exactVersionUnderReview && isAllowedExactUnderReviewReference(actionFrom, node, this);
        isProblemNode =
          isProblemNode ||
          node?.versionIsInTg === true ||
          (exactVersionUnderReview && !exactUnderReviewReferenceAllowed);
      }

      if (isProblemNode) {
        const nodeKey = getUniqueKey(node);
        if (!uniqueKeys.has(nodeKey)) {
          result.push(node);
          uniqueKeys.add(nodeKey);
        }

        parentPath.forEach((parent) => {
          const parentKey = getUniqueKey(parent);
          if (!uniqueKeys.has(parentKey)) {
            result.push(parent);
            uniqueKeys.add(parentKey);
          }
        });
      }

      node.children.forEach((child) => {
        traverse(child, [...parentPath, node]);
      });
    };

    traverse(this);
    return result.map(({ ...rest }) => rest);
  }
}
export const dealProcress = (
  processDetail: any,
  unReview: refDataType[],
  underReview: refDataType[],
  unRuleVerification: refDataType[],
  nonExistentRef: refDataType[],
  options: {
    includeRuleVerification?: boolean;
  } = {},
) => {
  if (!processDetail) {
    nonExistentRef.push({
      '@type': 'process data set',
      '@refObjectId': '',
      '@version': '',
    });
    return;
  }
  const procressRef = {
    '@type': 'process data set',
    '@refObjectId': processDetail.id,
    '@version': processDetail.version,
  };
  if (processDetail.stateCode < 20) {
    unReview.push(procressRef);
  }
  if (processDetail.stateCode >= 20 && processDetail.stateCode < 100) {
    underReview.push(procressRef);
  }
  if (
    options.includeRuleVerification !== false &&
    processDetail?.ruleVerification === false &&
    processDetail.stateCode !== 100 &&
    processDetail.stateCode !== 200
  ) {
    unRuleVerification.unshift(procressRef);
  }
};

export const dealModel = (
  modelDetail: any,
  unReview: refDataType[],
  underReview: refDataType[],
  unRuleVerification: refDataType[],
  nonExistentRef: refDataType[],
  options: {
    includeRuleVerification?: boolean;
  } = {},
) => {
  if (!modelDetail) {
    nonExistentRef.push({
      '@type': 'lifeCycleModel data set',
      '@refObjectId': '',
      '@version': '',
    });
    return;
  }

  if (modelDetail?.stateCode < 20) {
    unReview.push({
      '@type': 'lifeCycleModel data set',
      '@refObjectId': modelDetail?.id,
      '@version': modelDetail?.version,
    });
  }
  if (modelDetail?.stateCode >= 20 && modelDetail?.stateCode < 100) {
    underReview.push({
      '@type': 'lifeCycleModel data set',
      '@refObjectId': modelDetail?.id,
      '@version': modelDetail?.version,
    });
  }
  if (
    options.includeRuleVerification !== false &&
    modelDetail?.ruleVerification === false &&
    modelDetail?.stateCode !== 100 &&
    modelDetail?.stateCode !== 200
  ) {
    unRuleVerification.unshift({
      '@type': 'lifeCycleModel data set',
      '@refObjectId': modelDetail?.id,
      '@version': modelDetail?.version,
    });
  }
};

const isCurrentVersionLessThanReleased = (
  currentVersion: string,
  releasedVersion: string,
): boolean => {
  if (!currentVersion || !releasedVersion) {
    return false;
  }

  const parseVersion = (version: string): number[] => {
    return version.split('.').map((part) => parseInt(part, 10) || 0);
  };

  const compareVersions = (v1: number[], v2: number[]): number => {
    for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
      const part1 = v1[i] || 0;
      const part2 = v2[i] || 0;
      if (part1 < part2) return -1;
      if (part1 > part2) return 1;
    }
    return 0;
  };

  const currentParts = parseVersion(currentVersion);
  const releaseParts = parseVersion(releasedVersion);
  return compareVersions(currentParts, releaseParts) < 0;
};

export const checkVersions = async (refs: Set<string>, path?: ReffPath) => {
  const refsRecord: Record<string, string[]> = {};

  // { type: { id: Set<version> } }
  const refsMap: Record<string, Record<string, Set<string>>> = {};

  refs.forEach((ref) => {
    const parts = ref.split(':');
    if (parts.length >= 3) {
      const id = parts[0];
      const version = parts[1];
      const type = parts[2];

      if (!refsRecord[type]) {
        refsRecord[type] = [];
      }
      if (!refsRecord[type].includes(id)) {
        refsRecord[type].push(id);
      }

      if (!refsMap[type]) {
        refsMap[type] = {};
      }
      if (!refsMap[type][id]) {
        refsMap[type][id] = new Set();
      }
      refsMap[type][id].add(version);
    }
  });

  for (let tableName of Object.keys(refsRecord)) {
    const { data: details } = await getRefDataByIds(
      refsRecord[tableName],
      getRefTableName(tableName),
    );

    if (details && details.length > 0) {
      details.forEach((detail: any) => {
        const referencedVersions = refsMap[tableName]?.[detail.id] || new Set();

        if (detail.state_code >= 20 && detail.state_code < 100) {
          referencedVersions.forEach((refVersion) => {
            if (path && refVersion === detail.version) {
              path.set(
                {
                  '@type': tableName,
                  '@refObjectId': detail.id,
                  '@version': refVersion,
                },
                'versionUnderReview',
                true,
              );
              path.set(
                {
                  '@type': tableName,
                  '@refObjectId': detail.id,
                  '@version': refVersion,
                },
                'underReviewVersion',
                detail.version,
              );
            }
          });
        }
        if (detail.state_code === 100) {
          referencedVersions.forEach((refVersion) => {
            if (isCurrentVersionLessThanReleased(refVersion, detail.version)) {
              if (path) {
                path.set(
                  {
                    '@type': tableName,
                    '@refObjectId': detail.id,
                    '@version': refVersion,
                  },
                  'versionIsInTg',
                  true,
                );
              }
            }
          });
        }
      });
    }
  }
};

export const checkReferences = async (
  refs: any[],
  refMaps: Map<string, any>,
  userTeamId: string,
  unReview: refDataType[],
  underReview: refDataType[],
  unRuleVerification: refDataType[],
  nonExistentRef: refDataType[],
  parentPath?: ReffPath,
  requestKeysSet?: Set<string>,
  options: {
    exactVersion?: boolean;
    rootRef?: refDataType | null;
  } = {},
): Promise<ReffPath | undefined> => {
  let currentPath: ReffPath | undefined;
  const requestKeys = requestKeysSet || new Set<string>();
  const handelSameModelWithProcress = async (ref: refDataType, requestKeys: Set<string>) => {
    if (ref['@type'] === 'process data set') {
      const { data: sameModelWithProcress, success } = await getLifeCycleModelDetail(
        ref['@refObjectId'],
        ref['@version'],
      );
      if (sameModelWithProcress && success) {
        const sameModelRef: refDataType = {
          '@type': 'lifeCycleModel data set',
          '@refObjectId': sameModelWithProcress.id,
          '@version': sameModelWithProcress.version,
        };
        if (isSameRef(sameModelRef, options.rootRef)) {
          return;
        }
        dealModel(sameModelWithProcress, unReview, underReview, unRuleVerification, nonExistentRef);
        const modelRefs = filterOutRootSelfReferences(
          getAllRefObj(sameModelWithProcress),
          options.rootRef,
        );
        await checkReferences(
          modelRefs,
          refMaps,
          userTeamId,
          unReview,
          underReview,
          unRuleVerification,
          nonExistentRef,
          currentPath,
          requestKeys,
          options,
        );
      }
    }
  };

  const processRef = async (ref: any) => {
    if (isSameRef(ref, options.rootRef)) {
      return;
    }
    if (refMaps.has(`${ref['@refObjectId']}:${ref['@version']}:${ref['@type']}`)) {
      const refData = refMaps.get(`${ref['@refObjectId']}:${ref['@version']}:${ref['@type']}`);

      if (refData?.stateCode !== 100 && refData?.stateCode !== 200) {
        const currentPath = new ReffPath(ref, refData?.ruleVerification, false);
        if (parentPath) {
          parentPath.addChild(currentPath);
        }
      }
      await handelSameModelWithProcress(ref, requestKeys);
      return;
    }
    const refResult = await getRefData(
      ref['@refObjectId'],
      ref['@version'],
      getRefTableName(ref['@type']),
      userTeamId,
      {
        fallbackToLatest: options.exactVersion !== true,
      },
    );
    refMaps.set(`${ref['@refObjectId']}:${ref['@version']}:${ref['@type']}`, refResult?.data);

    if (refResult.success && refResult?.data) {
      const refData = refResult?.data;
      if (refData?.stateCode !== 100 && refData?.stateCode !== 200) {
        currentPath = new ReffPath(ref, refData?.ruleVerification, !refResult.success);
        if (parentPath) {
          parentPath.addChild(currentPath);
        }
      }
      if (
        refData?.ruleVerification === false &&
        refData?.stateCode !== 100 &&
        refData?.stateCode !== 200
      ) {
        if (
          !unRuleVerification.find(
            (item) =>
              item['@refObjectId'] === ref['@refObjectId'] && item['@version'] === ref['@version'],
          )
        ) {
          unRuleVerification.push(ref);
        }
      }

      if (refData?.stateCode >= 20 && refData?.stateCode < 100) {
        if (
          !underReview.find(
            (item) =>
              item['@refObjectId'] === ref['@refObjectId'] && item['@version'] === ref['@version'],
          )
        ) {
          underReview.push(ref);
        }
      }

      if (refData?.stateCode < 20) {
        const json = refData?.json;
        if (
          !unReview.find(
            (item) =>
              item['@refObjectId'] === ref['@refObjectId'] && item['@version'] === ref['@version'],
          )
        ) {
          unReview.push(ref);
        }

        const subRefs = filterOutRootSelfReferences(getAllRefObj(json), options.rootRef);
        await checkReferences(
          subRefs,
          refMaps,
          userTeamId,
          unReview,
          underReview,
          unRuleVerification,
          nonExistentRef,
          currentPath,
          requestKeys,
          options,
        );
      }
      await handelSameModelWithProcress(ref, requestKeys);
    } else {
      currentPath = new ReffPath(ref, true, true);
      if (parentPath) {
        parentPath.addChild(currentPath);
      }
      if (
        !nonExistentRef.find(
          (item) =>
            item['@refObjectId'] === ref['@refObjectId'] && item['@version'] === ref['@version'],
        ) &&
        ref['@type'] !== 'lifeCycleModel data set'
      ) {
        nonExistentRef.push(ref);
      }
    }
  };

  const controller = new ConcurrencyController(5);
  for (const ref of refs) {
    const key = `${ref['@refObjectId']}:${ref['@version']}:${ref['@type']}`;
    if (!requestKeys.has(key)) {
      requestKeys.add(key);
      controller.add(() => processRef(ref));
    }
  }

  await controller.waitForAll();
  return parentPath;
};

export const checkData = async (
  data: refDataType,
  unRuleVerification: refDataType[],
  nonExistentRef: refDataType[],
  pathRef: ReffPath,
  options: {
    actionFrom?: 'checkData' | 'review';
    exactVersion?: boolean;
    orderedJson?: any;
    userTeamId?: string;
  } = {},
) => {
  const actionFrom = options.actionFrom ?? 'checkData';
  const exactVersion = options.exactVersion ?? actionFrom !== 'review';
  const userTeamId = options.userTeamId ?? '';
  const allRefs = new Set<string>();

  if (typeof options.orderedJson !== 'undefined') {
    const refs = filterOutRootSelfReferences(getAllRefObj(options.orderedJson), data);

    if (refs.length > 0) {
      await checkReferences(
        refs,
        new Map<string, any>(),
        userTeamId,
        [],
        [],
        unRuleVerification,
        nonExistentRef,
        pathRef,
        allRefs,
        {
          exactVersion,
          rootRef: data,
        },
      );
    }
  } else {
    const { data: detail } = await getRefData(
      data['@refObjectId'],
      data['@version'],
      getRefTableName(data['@type']),
      userTeamId,
      {
        fallbackToLatest: exactVersion !== true,
      },
    );
    if (detail) {
      const refs = filterOutRootSelfReferences(getAllRefObj(detail?.json), data);
      await checkReferences(
        refs,
        new Map<string, any>(),
        userTeamId,
        [],
        [],
        unRuleVerification,
        nonExistentRef,
        pathRef,
        allRefs,
        {
          exactVersion,
          rootRef: data,
        },
      );
    }
  }

  if (actionFrom === 'review') {
    allRefs.add(`${data['@refObjectId']}:${data['@version']}:${data['@type']}`);
    await checkVersions(allRefs, pathRef);
  }
};

export const validateDatasetRuleVerification = async (
  datasetType: refDataType['@type'],
  orderedJson: any,
  userTeamId: string = '',
) => {
  const sdkValidation = validateDatasetWithSdk(datasetType, orderedJson);
  const unRuleVerification: refDataType[] = [];
  const nonExistentRef: refDataType[] = [];
  const rootRef = getDatasetRootRef(datasetType, orderedJson);
  const refs = filterOutRootSelfReferences(getAllRefObj(orderedJson), rootRef);

  if (refs.length > 0) {
    await checkReferences(
      refs,
      new Map<string, any>(),
      userTeamId,
      [],
      [],
      unRuleVerification,
      nonExistentRef,
      undefined,
      undefined,
      {
        exactVersion: true,
        rootRef,
      },
    );
  }

  return {
    datasetSdkValid: sdkValidation.success,
    datasetSdkIssues: sdkValidation.issues,
    nonExistentRef,
    ruleVerification:
      sdkValidation.success && unRuleVerification.length === 0 && nonExistentRef.length === 0,
    unRuleVerification,
  };
};

export const submitDatasetReview = async (
  table: ReviewSubmitDatasetTable,
  id: string,
  version: string,
) => {
  return submitDatasetReviewApi(table, id, version);
};

const checkValidationFields = (data: any) => {
  if (!data) {
    return { checkResult: false, tabName: 'validation' };
  }
  if (
    data.every(
      (review: any) =>
        review['@type'] &&
        review['common:scope'] &&
        review['common:scope']?.length &&
        review['common:scope'].every(
          (item: any) => item['@name'] && item['common:method'] && item['common:method']['@name'],
        ) &&
        review['common:reviewDetails'] &&
        review['common:reviewDetails']?.length &&
        review['common:reviewDetails'].every((item: any) => item !== undefined),
    )
  ) {
    return { checkResult: true, tabName: null };
  }

  return { checkResult: false, tabName: 'validation' };
};

const checkComplianceFields = (data: any) => {
  if (!data || !data?.length) {
    return { checkResult: false, tabName: 'complianceDeclarations' };
  }

  for (let item of data) {
    if (!item) {
      return { checkResult: false, tabName: 'complianceDeclarations' };
    }
    for (let key of Object.keys(item)) {
      if (key === 'common:referenceToComplianceSystem') {
        if (!item[key]?.['@refObjectId']) {
          return { checkResult: false, tabName: 'complianceDeclarations' };
        }
      }
      if (item[key] === null || item[key] === undefined) {
        return { checkResult: false, tabName: 'complianceDeclarations' };
      }
    }
  }
  return { checkResult: true, tabName: null };
};

export const checkRequiredFields = (requiredFields: any, formData: any) => {
  const errTabNames: string[] = [];
  const collectedTabNames = new Set<string>();

  if (!formData || Object.keys(formData).length === 0) {
    return { checkResult: false, errTabNames };
  }
  const collectErrTabNames = (tabName: string | null | undefined) => {
    if (tabName && tabName?.length && !collectedTabNames.has(tabName)) {
      errTabNames.push(tabName);
      collectedTabNames.add(tabName);
    }
  };
  for (let field of Object.keys(requiredFields)) {
    const value = get(formData, field);
    if (field === 'modellingAndValidation.validation.review') {
      const { checkResult, tabName } = checkValidationFields(value);
      if (!checkResult) {
        collectErrTabNames(tabName);
        // return { checkResult, tabName };
      }
    }

    if (field === 'modellingAndValidation.complianceDeclarations.compliance') {
      const { checkResult, tabName } = checkComplianceFields(value);
      if (!checkResult) {
        collectErrTabNames(tabName);
        // return { checkResult, tabName };
      }
    }

    if (field.includes('common:classification.common:class')) {
      if (!value || (value?.id ?? []).some((item: any) => !item)) {
        collectErrTabNames(requiredFields[field] ?? '');
        // return { checkResult: false, tabName: requiredFields[field] };
      }
    }
    if (!value) {
      collectErrTabNames(requiredFields[field] ?? '');
      // return { checkResult: false, tabName: requiredFields[field] };
    }

    if (Array.isArray(value) && (value.length === 0 || value.every((item) => !item))) {
      collectErrTabNames(requiredFields[field] ?? '');
      // return { checkResult: false, tabName: requiredFields[field] };
    }

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      if (Object.keys(value).length === 0) {
        collectErrTabNames(requiredFields[field] ?? '');
        // return { checkResult: false, tabName: requiredFields[field] };
      }
      const allPropsEmpty = Object.values(value).every(
        (propValue) => propValue === undefined || propValue === null,
      );
      if (allPropsEmpty) {
        collectErrTabNames(requiredFields[field] ?? '');
        // return { checkResult: false, tabName: requiredFields[field] };
      }
    }
  }

  return { checkResult: errTabNames.length === 0, errTabNames };
};

export function getErrRefTab(ref: refDataType, data: any): string | null {
  if (!data || !ref) {
    return null;
  }

  const visited = new WeakSet();

  const findRefInObject = (obj: any, path: string[] = []): string | null => {
    // technology.processes' is not under any tab
    if (
      !obj ||
      typeof obj !== 'object' ||
      path.join('.').includes('lifeCycleModelInformation.technology.processes')
    ) {
      return null;
    }

    if (visited.has(obj)) {
      return null;
    }
    visited.add(obj);

    if (obj['@refObjectId'] && obj['@version'] && obj['@type']) {
      if (obj['@refObjectId'] === ref['@refObjectId'] && obj['@version'] === ref['@version']) {
        return path[0] || null;
      }
    }

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        if (Array.isArray(value)) {
          for (let i = 0; i < value.length; i++) {
            const result = findRefInObject(value[i], [...path, key]);
            if (result) {
              return result;
            }
          }
        } else if (typeof value === 'object' && value !== null) {
          const result = findRefInObject(value, [...path, key]);
          if (result) {
            return result;
          }
        }
      }
    }

    return null;
  };

  return findRefInObject(data);
}

export async function checkReviewReport(reviews: any) {
  const reportRefs: { id: string; version: string }[] = [];

  if (Array.isArray(reviews)) {
    reviews.forEach((review: any) => {
      const report = review?.['common:referenceToCompleteReviewReport'];
      if (report?.['@refObjectId'] && report?.['@version']) {
        reportRefs.push({
          id: report['@refObjectId'],
          version: report['@version'],
        });
      }
    });
  } else {
    const report = reviews?.['common:referenceToCompleteReviewReport'];
    if (report?.['@refObjectId'] && report?.['@version']) {
      reportRefs.push({
        id: report['@refObjectId'],
        version: report['@version'],
      });
    }
  }

  if (reportRefs.length === 0) {
    return [];
  }

  const sources = await getSourcesByIdsAndVersions(reportRefs);

  const reportUnderReview: any[] = [];
  sources?.data?.forEach((item: any) => {
    if (item.state_code >= 20 && item.state_code < 100) {
      reportUnderReview.push({
        id: item.id,
        version: item.version,
        stateCode: item.state_code,
      });
    }
  });

  return reportUnderReview;
}

export const getRejectedComments = async (processId: string, processVersion: string) => {
  if (!processId || !processVersion) {
    return [];
  }

  const { data: reviewData, error: reviewError } = await getRejectReviewsByProcess(
    processId,
    processVersion,
  );

  if (reviewError || !reviewData || reviewData.length === 0) {
    return [];
  }

  const reviewIds = reviewData.map((review) => review?.id);

  const { data: commentsData, error: commentsError } =
    await getRejectedCommentsByReviewIds(reviewIds);

  if (commentsError || !commentsData || commentsData.length === 0) {
    return [];
  }

  return commentsData.map((e) => e.json);
};

export const mergeCommentsToData = (
  comments: FormProcess['modellingAndValidation'][],
  data: FormProcess,
) => {
  // Merge rejected comments into formData.modellingAndValidation
  if (Array.isArray(comments) && comments.length) {
    data.modellingAndValidation = data.modellingAndValidation || {};
    comments.forEach((r: any) => {
      const mv = r?.modellingAndValidation || {};

      // merge validation
      if (mv.validation) {
        if (!data.modellingAndValidation.validation) {
          data.modellingAndValidation.validation = mv.validation;
        } else {
          Object.keys(mv.validation).forEach((k) => {
            const val = mv.validation[k];
            const target = data.modellingAndValidation.validation as any;
            if (Array.isArray(val)) {
              if (!Array.isArray(target[k])) target[k] = [];
              target[k] = [...target[k], ...val];
            } else {
              if (Array.isArray(target[k])) target[k].push(val);
              else if (target[k] !== undefined) target[k] = [target[k], val];
              else target[k] = val;
            }
          });
        }
      }

      // merge complianceDeclarations
      if (mv.complianceDeclarations) {
        if (!data.modellingAndValidation.complianceDeclarations) {
          data.modellingAndValidation.complianceDeclarations = mv.complianceDeclarations;
        } else {
          Object.keys(mv.complianceDeclarations).forEach((k) => {
            const val = mv.complianceDeclarations[k];
            const target = data.modellingAndValidation.complianceDeclarations as any;
            if (Array.isArray(val)) {
              if (!Array.isArray(target[k])) target[k] = [];
              target[k] = [...target[k], ...val];
            } else {
              if (Array.isArray(target[k])) target[k].push(val);
              else if (target[k] !== undefined) target[k] = [target[k], val];
              else target[k] = val;
            }
          });
        }
      }
    });
  }
};
