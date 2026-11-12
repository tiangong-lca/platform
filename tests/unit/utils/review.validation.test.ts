import {
  buildValidationIssues,
  checkReferences,
  collectValidationIssueRefTabNames,
  dealModel,
  dealProcress,
  enrichValidationIssuesWithOwner,
  getDatasetDetailAbsoluteUrl,
  getDatasetDetailPath,
  getDatasetPath,
  mapValidationIssuesToRefCheckData,
  normalizeSdkValidationResult,
  validateDatasetRuleVerification,
  validateDatasetWithSdk,
} from '@/pages/Utils/review';
import { getAppOrigin } from '@/utils/appUrl';
import modelFixture from '../../data-workflows/fixtures/data/lifeCycleModels/002_check_data_success.json';

const mockCreateContact = jest.fn();
const mockCreateFlow = jest.fn();
const mockCreateFlowProperty = jest.fn();
const mockCreateLifeCycleModel = jest.fn();
const mockCreateProcess = jest.fn();
const mockCreateSource = jest.fn();
const mockCreateUnitGroup = jest.fn();
const mockGetRefData = jest.fn();
const mockGetRefDataByIds = jest.fn();
const mockGetReviewsOfData = jest.fn();
const mockUpdateDateToReviewState = jest.fn();

jest.mock('@tiangong-lca/tidas-sdk/core', () => ({
  __esModule: true,
  createContact: (...args: any[]) => mockCreateContact(...args),
  createFlow: (...args: any[]) => mockCreateFlow(...args),
  createFlowProperty: (...args: any[]) => mockCreateFlowProperty(...args),
  createLifeCycleModel: (...args: any[]) => mockCreateLifeCycleModel(...args),
  createProcess: (...args: any[]) => mockCreateProcess(...args),
  createSource: (...args: any[]) => mockCreateSource(...args),
  createUnitGroup: (...args: any[]) => mockCreateUnitGroup(...args),
}));

jest.mock('@/services/general/api', () => ({
  __esModule: true,
  getRefData: (...args: any[]) => mockGetRefData(...args),
  getRefDataByIds: (...args: any[]) => mockGetRefDataByIds(...args),
  getReviewsOfData: (...args: any[]) => mockGetReviewsOfData(...args),
  updateDateToReviewState: (...args: any[]) => mockUpdateDateToReviewState(...args),
}));

jest.mock('@/services/lifeCycleModels/api', () => ({
  __esModule: true,
  getLifeCycleModelDetail: jest.fn(),
}));

jest.mock('@/services/reviews/api', () => ({
  __esModule: true,
  addReviewsApi: jest.fn(),
  getRejectReviewsByProcess: jest.fn(),
}));

jest.mock('@/services/comments/api', () => ({
  __esModule: true,
  getRejectedCommentsByReviewIds: jest.fn(),
}));

jest.mock('@/services/sources/api', () => ({
  __esModule: true,
  getSourcesByIdsAndVersions: jest.fn(),
}));

jest.mock('@/services/teams/api', () => ({
  __esModule: true,
  getTeamMessageApi: jest.fn(),
}));

jest.mock('@/services/users/api', () => ({
  __esModule: true,
  getUserId: jest.fn(),
  getUsersByIds: jest.fn(),
}));

const { getUserId: mockGetUserId, getUsersByIds: mockGetUsersByIds } = jest.requireMock(
  '@/services/users/api',
) as {
  getUserId: jest.Mock;
  getUsersByIds: jest.Mock;
};

const { getLifeCycleModelDetail: mockGetLifeCycleModelDetail } = jest.requireMock(
  '@/services/lifeCycleModels/api',
) as {
  getLifeCycleModelDetail: jest.Mock;
};

const makeSdkFactory = (result: any) =>
  jest.fn(() => ({ validateEnhanced: jest.fn(() => result) }));

describe('review helper coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRefData.mockReset();
    mockGetRefDataByIds.mockReset();
    mockGetReviewsOfData.mockReset();
    mockUpdateDateToReviewState.mockReset();
    mockGetUserId.mockReset();
    mockGetUsersByIds.mockReset();
    mockGetLifeCycleModelDetail.mockReset();
    mockGetUserId.mockResolvedValue('user-1');

    mockCreateContact.mockImplementation(makeSdkFactory({ success: true }));
    mockCreateSource.mockImplementation(makeSdkFactory({ success: true }));
    mockCreateUnitGroup.mockImplementation(makeSdkFactory({ success: true }));
    mockCreateFlowProperty.mockImplementation(makeSdkFactory({ success: true }));
    mockCreateFlow.mockImplementation(makeSdkFactory({ success: true }));
    mockCreateProcess.mockImplementation(makeSdkFactory({ success: true }));
    mockCreateLifeCycleModel.mockImplementation(makeSdkFactory({ success: true }));
  });

  it('builds dataset paths, detail paths, and detail urls for known and unknown dataset types', () => {
    const ref = {
      '@type': 'process data set',
      '@refObjectId': 'process-1',
      '@version': '01.00.000',
    } as const;

    expect(getDatasetDetailPath(ref)).toBe(
      '/mydata/processes?id=process-1&version=01.00.000&required=1',
    );
    expect(getDatasetPath(ref)).toBe('/mydata/processes?id=process-1&version=01.00.000');
    expect(getDatasetPath(ref, { required: true })).toBe(
      '/mydata/processes?id=process-1&version=01.00.000&required=1',
    );
    expect(getDatasetDetailAbsoluteUrl(ref, 'https://demo.example')).toBe(
      'https://demo.example/#/mydata/processes?id=process-1&version=01.00.000&required=1',
    );
    expect(getDatasetDetailAbsoluteUrl(ref)).toBe(
      'http://localhost:8000/#/mydata/processes?id=process-1&version=01.00.000&required=1',
    );

    expect(getDatasetDetailAbsoluteUrl(ref, getAppOrigin(null))).toBe(
      'https://lca.tiangong.earth/#/mydata/processes?id=process-1&version=01.00.000&required=1',
    );

    const unknownRef = {
      '@type': 'unknown data set',
      '@refObjectId': 'missing',
      '@version': '00.00.000',
    } as any;

    expect(getDatasetDetailPath(unknownRef)).toBeNull();
    expect(getDatasetPath(unknownRef)).toBeNull();
    expect(getDatasetDetailAbsoluteUrl(unknownRef)).toBe('');
  });

  it('maps combined validation issues into ref-check data flags', () => {
    const mapped = mapValidationIssuesToRefCheckData([
      {
        code: 'ruleVerificationFailed',
        ref: {
          '@type': 'process data set',
          '@refObjectId': 'process-1',
          '@version': '01.00.000',
        },
        link: '/a',
      },
      {
        code: 'nonExistentRef',
        ref: {
          '@type': 'process data set',
          '@refObjectId': 'process-1',
          '@version': '01.00.000',
        },
        link: '/a',
      },
      {
        code: 'underReview',
        ref: {
          '@type': 'process data set',
          '@refObjectId': 'process-1',
          '@version': '01.00.000',
        },
        link: '/a',
      },
      {
        code: 'versionUnderReview',
        ref: {
          '@type': 'flow data set',
          '@refObjectId': 'flow-1',
          '@version': '01.00.000',
        },
        link: '/b',
        underReviewVersion: '02.00.000',
      },
      {
        code: 'versionIsInTg',
        ref: {
          '@type': 'flow data set',
          '@refObjectId': 'flow-1',
          '@version': '01.00.000',
        },
        link: '/b',
      },
    ]);

    expect(mapped).toEqual([
      {
        id: 'process-1',
        version: '01.00.000',
        ruleVerification: false,
        nonExistent: true,
        stateCode: 20,
        versionUnderReview: true,
        underReviewVersion: '01.00.000',
      },
      {
        id: 'flow-1',
        version: '01.00.000',
        ruleVerification: true,
        nonExistent: false,
        versionUnderReview: true,
        underReviewVersion: '02.00.000',
        versionIsInTg: true,
      },
    ]);
  });

  it('builds deduplicated validation issues while ignoring under-review version differences', () => {
    const rootRef = {
      '@type': 'lifeCycleModel data set',
      '@refObjectId': 'model-1',
      '@version': '01.00.000',
    } as const;

    const issues = buildValidationIssues({
      actionFrom: 'review',
      datasetSdkValid: false,
      sdkInvalidDetails: [
        {
          key: 'sdk-detail-1',
          tabName: 'validation',
          fieldKey: 'generalComment',
          fieldLabel: 'Comment',
          fieldPath: 'process.validation.generalComment',
          reasonMessage: 'Text length 520 exceeds maximum 500',
        },
      ],
      sdkInvalidTabNames: ['validation', 'validation', 'compliance'],
      nonExistentRef: [
        {
          '@type': 'source data set',
          '@refObjectId': 'source-1',
          '@version': '01.00.000',
        },
      ],
      problemNodes: [
        {
          '@type': 'process data set',
          '@refObjectId': 'process-1',
          '@version': '01.00.000',
          ruleVerification: true,
          nonExistent: false,
          versionUnderReview: true,
          underReviewVersion: '01.00.000',
        },
        {
          '@type': 'process data set',
          '@refObjectId': 'process-2',
          '@version': '01.00.000',
          ruleVerification: true,
          nonExistent: false,
          versionUnderReview: true,
          underReviewVersion: '02.00.000',
        },
        {
          '@type': 'flow data set',
          '@refObjectId': 'flow-1',
          '@version': '01.00.000',
          ruleVerification: true,
          nonExistent: false,
          versionIsInTg: true,
        },
      ],
      rootRef,
      unRuleVerification: [
        {
          '@type': 'process data set',
          '@refObjectId': 'process-3',
          '@version': '01.00.000',
        },
        {
          '@type': 'process data set',
          '@refObjectId': 'process-3',
          '@version': '01.00.000',
        },
      ],
    });

    expect(issues).toEqual([
      {
        code: 'sdkInvalid',
        link: 'http://localhost:8000/#/mydata/models?id=model-1&version=01.00.000&required=1',
        ref: rootRef,
        sdkDetails: [
          {
            key: 'sdk-detail-1',
            tabName: 'validation',
            fieldKey: 'generalComment',
            fieldLabel: 'Comment',
            fieldPath: 'process.validation.generalComment',
            reasonMessage: 'Text length 520 exceeds maximum 500',
          },
        ],
        tabNames: ['validation', 'compliance'],
      },
      {
        code: 'ruleVerificationFailed',
        link: 'http://localhost:8000/#/mydata/processes?id=process-3&version=01.00.000&required=1',
        ref: {
          '@type': 'process data set',
          '@refObjectId': 'process-3',
          '@version': '01.00.000',
        },
      },
      {
        code: 'nonExistentRef',
        link: 'http://localhost:8000/#/mydata/sources?id=source-1&version=01.00.000&required=1',
        ref: {
          '@type': 'source data set',
          '@refObjectId': 'source-1',
          '@version': '01.00.000',
        },
      },
      {
        code: 'versionIsInTg',
        link: 'http://localhost:8000/#/mydata/flows?id=flow-1&version=01.00.000&required=1',
        ref: {
          '@type': 'flow data set',
          '@refObjectId': 'flow-1',
          '@version': '01.00.000',
        },
      },
    ]);
  });

  it('builds validation issues with default optional arrays when only sdk validity is provided', () => {
    expect(
      buildValidationIssues({
        datasetSdkValid: true,
        rootRef: {
          '@type': 'contact data set',
          '@refObjectId': 'contact-1',
          '@version': '01.00.000',
        },
      }),
    ).toEqual([]);
  });

  it('adds resolved tab names to reference validation issues', () => {
    const rootRef = {
      '@type': 'process data set',
      '@refObjectId': 'process-root',
      '@version': '01.00.000',
    } as const;
    const sourceRef = {
      '@type': 'source data set',
      '@refObjectId': 'source-1',
      '@version': '01.00.000',
    } as const;
    const flowRef = {
      '@type': 'flow data set',
      '@refObjectId': 'flow-1',
      '@version': '01.00.000',
    } as const;

    const issues = buildValidationIssues({
      actionFrom: 'review',
      datasetSdkValid: true,
      getRefTabNames: (ref) => {
        if (ref['@refObjectId'] === 'source-1') {
          return ['modellingAndValidation', 'modellingAndValidation'];
        }

        if (ref['@refObjectId'] === 'flow-1') {
          return 'exchanges';
        }

        return undefined;
      },
      nonExistentRef: [sourceRef],
      problemNodes: [
        {
          ...flowRef,
          ruleVerification: true,
          nonExistent: false,
          versionUnderReview: true,
          underReviewVersion: '01.00.000',
        },
      ],
      rootRef,
      unRuleVerification: [flowRef],
    });

    expect(issues).toEqual([
      expect.objectContaining({
        code: 'ruleVerificationFailed',
        ref: flowRef,
        tabName: 'exchanges',
        tabNames: ['exchanges'],
      }),
      expect.objectContaining({
        code: 'nonExistentRef',
        ref: sourceRef,
        tabName: 'modellingAndValidation',
        tabNames: ['modellingAndValidation'],
      }),
    ]);
  });

  it('keeps the exact root blocker while allowing exact references and other versions', () => {
    const rootRef = {
      '@type': 'process data set',
      '@refObjectId': 'process-root',
      '@version': '01.00.000',
    } as const;

    expect(
      buildValidationIssues({
        actionFrom: 'review',
        datasetSdkValid: true,
        problemNodes: [
          {
            ...rootRef,
            ruleVerification: true,
            nonExistent: false,
            versionUnderReview: true,
            underReviewVersion: '01.00.000',
          },
          {
            '@type': 'contact data set',
            '@refObjectId': 'contact-exact',
            '@version': '01.00.000',
            ruleVerification: true,
            nonExistent: false,
            versionUnderReview: true,
            underReviewVersion: '01.00.000',
          },
          {
            '@type': 'source data set',
            '@refObjectId': 'source-conflict',
            '@version': '01.00.000',
            ruleVerification: true,
            nonExistent: false,
            versionUnderReview: true,
            underReviewVersion: '02.00.000',
          },
        ],
        rootRef,
      }),
    ).toEqual([
      expect.objectContaining({
        code: 'underReview',
        ref: rootRef,
      }),
    ]);
  });

  it('collects unique validation tab names by reference key', () => {
    const firstRef = {
      '@type': 'source data set',
      '@refObjectId': 'source-1',
      '@version': '01.00.000',
      tabName: 'administrativeInformation',
    };
    const duplicateRef = {
      ...firstRef,
      tabName: 'administrativeInformation',
    };
    const secondTabRef = {
      ...firstRef,
      tabName: 'sourceInformation',
    };
    const emptyTabRef = {
      '@type': 'contact data set',
      '@refObjectId': 'contact-1',
      '@version': '01.00.000',
      tabName: '',
    };

    const result = collectValidationIssueRefTabNames({
      refs: [firstRef, duplicateRef, secondTabRef, emptyTabRef],
      resolveTabName: (ref) => ref.tabName,
    });

    expect(result.tabNames).toEqual(['administrativeInformation', 'sourceInformation']);
    expect(
      result.getRefTabNames({
        '@type': 'source data set',
        '@refObjectId': 'source-1',
        '@version': '01.00.000',
      }),
    ).toEqual(['administrativeInformation', 'sourceInformation']);
    expect(
      result.getRefTabNames({
        '@type': 'contact data set',
        '@refObjectId': 'contact-1',
        '@version': '01.00.000',
      }),
    ).toBeUndefined();
  });

  it('suppresses the root rule-verification issue when sdk invalid already covers the same dataset', () => {
    const rootRef = {
      '@type': 'process data set',
      '@refObjectId': 'process-root',
      '@version': '01.00.000',
    } as const;

    expect(
      buildValidationIssues({
        datasetSdkValid: false,
        rootRef,
        sdkInvalidTabNames: ['processInformation'],
        unRuleVerification: [
          rootRef,
          {
            '@type': 'process data set',
            '@refObjectId': 'process-child',
            '@version': '02.00.000',
          },
        ],
      }),
    ).toEqual([
      {
        code: 'sdkInvalid',
        link: 'http://localhost:8000/#/mydata/processes?id=process-root&version=01.00.000&required=1',
        ref: rootRef,
        sdkDetails: [],
        tabNames: ['processInformation'],
      },
      {
        code: 'ruleVerificationFailed',
        link: 'http://localhost:8000/#/mydata/processes?id=process-child&version=02.00.000&required=1',
        ref: {
          '@type': 'process data set',
          '@refObjectId': 'process-child',
          '@version': '02.00.000',
        },
      },
    ]);
  });

  it('returns the same empty issue list when owner enrichment receives no issues', async () => {
    const issues: any[] = [];

    await expect(enrichValidationIssuesWithOwner(issues)).resolves.toBe(issues);
    expect(mockGetRefData).not.toHaveBeenCalled();
    expect(mockGetUserId).not.toHaveBeenCalled();
    expect(mockGetUsersByIds).not.toHaveBeenCalled();
  });

  it('enriches validation issues with owner names while deduplicating ref lookups', async () => {
    mockGetRefData.mockImplementation(
      async (id: string, version: string, table: string, teamId: string, options: any) => {
        expect(version).toBe('01.00.000');
        expect(teamId).toBe('');
        expect(options).toEqual({ fallbackToLatest: false });

        if (id === 'process-1' && table === 'processes') {
          return { data: { userId: 'user-1' }, success: true };
        }

        if (id === 'process-2' && table === 'processes') {
          return { data: { userId: 'user-2' }, success: true };
        }

        if (id === 'process-3' && table === 'processes') {
          return { data: null, success: false };
        }

        return { data: null, success: false };
      },
    );
    mockGetUsersByIds.mockResolvedValue([
      {
        id: 'user-1',
        raw_user_meta_data: {
          display_name: 'Alice',
        },
      },
      {
        id: 'user-2',
        email: 'bob@example.com',
      },
    ]);

    const issues = [
      {
        code: 'ruleVerificationFailed',
        link: '/a',
        ref: {
          '@type': 'process data set',
          '@refObjectId': 'process-1',
          '@version': '01.00.000',
        },
      },
      {
        code: 'nonExistentRef',
        link: '/a',
        ref: {
          '@type': 'process data set',
          '@refObjectId': 'process-1',
          '@version': '01.00.000',
        },
      },
      {
        code: 'ruleVerificationFailed',
        link: '/b',
        ownerName: 'Provided owner',
        ref: {
          '@type': 'process data set',
          '@refObjectId': 'process-provided',
          '@version': '01.00.000',
        },
      },
      {
        code: 'ruleVerificationFailed',
        link: '/c',
        ref: {
          '@type': 'process data set',
          '@refObjectId': 'process-2',
          '@version': '01.00.000',
        },
      },
      {
        code: 'ruleVerificationFailed',
        link: '/d',
        ref: {
          '@type': 'process data set',
          '@refObjectId': 'process-3',
          '@version': '01.00.000',
        },
      },
      {
        code: 'ruleVerificationFailed',
        link: '/e',
        ref: {
          '@type': 'mystery data set',
          '@refObjectId': 'unknown-1',
          '@version': '01.00.000',
        },
      },
    ] as any[];

    await expect(enrichValidationIssuesWithOwner(issues)).resolves.toEqual([
      {
        code: 'ruleVerificationFailed',
        link: '/a',
        isOwnedByCurrentUser: true,
        ownerName: 'Alice',
        ownerUserId: 'user-1',
        ref: {
          '@type': 'process data set',
          '@refObjectId': 'process-1',
          '@version': '01.00.000',
        },
      },
      {
        code: 'nonExistentRef',
        link: '/a',
        isOwnedByCurrentUser: true,
        ownerName: 'Alice',
        ownerUserId: 'user-1',
        ref: {
          '@type': 'process data set',
          '@refObjectId': 'process-1',
          '@version': '01.00.000',
        },
      },
      {
        code: 'ruleVerificationFailed',
        link: '/b',
        ownerName: 'Provided owner',
        ref: {
          '@type': 'process data set',
          '@refObjectId': 'process-provided',
          '@version': '01.00.000',
        },
      },
      {
        code: 'ruleVerificationFailed',
        link: '/c',
        isOwnedByCurrentUser: false,
        ownerName: 'bob@example.com',
        ownerUserId: 'user-2',
        ref: {
          '@type': 'process data set',
          '@refObjectId': 'process-2',
          '@version': '01.00.000',
        },
      },
      {
        code: 'ruleVerificationFailed',
        link: '/d',
        ownerName: '-',
        ref: {
          '@type': 'process data set',
          '@refObjectId': 'process-3',
          '@version': '01.00.000',
        },
      },
      {
        code: 'ruleVerificationFailed',
        link: '/e',
        ownerName: '-',
        ref: {
          '@type': 'mystery data set',
          '@refObjectId': 'unknown-1',
          '@version': '01.00.000',
        },
      },
    ]);
    expect(mockGetRefData).toHaveBeenCalledTimes(3);
    expect(mockGetUsersByIds).toHaveBeenCalledWith(['user-1', 'user-2']);
  });

  it('keeps provided owner names when the current user id is blank and no owner ids need resolving', async () => {
    mockGetUserId.mockResolvedValue('   ');

    const issues = [
      {
        code: 'ruleVerificationFailed',
        link: '/provided',
        ownerName: ' Provided owner ',
        ref: {
          '@type': 'process data set',
          '@refObjectId': 'process-provided-only',
          '@version': '01.00.000',
        },
      },
    ] as any[];

    await expect(enrichValidationIssuesWithOwner(issues)).resolves.toEqual([
      {
        code: 'ruleVerificationFailed',
        link: '/provided',
        ownerName: 'Provided owner',
        ref: {
          '@type': 'process data set',
          '@refObjectId': 'process-provided-only',
          '@version': '01.00.000',
        },
      },
    ]);
    expect(mockGetRefData).not.toHaveBeenCalled();
    expect(mockGetUsersByIds).not.toHaveBeenCalled();
  });

  it('falls back to a dash when resolved owner profiles have no usable display fields', async () => {
    mockGetRefData.mockResolvedValue({
      data: { userId: 'user-blank' },
      success: true,
    });
    mockGetUsersByIds.mockResolvedValue([
      {
        id: 'user-blank',
        display_name: '   ',
        email: '   ',
        raw_user_meta_data: {
          display_name: '',
          email: '   ',
        },
      },
    ]);

    const issues = [
      {
        code: 'ruleVerificationFailed',
        link: '/blank-owner',
        ref: {
          '@type': 'process data set',
          '@refObjectId': 'process-blank-owner',
          '@version': '01.00.000',
        },
      },
    ] as any[];

    await expect(enrichValidationIssuesWithOwner(issues)).resolves.toEqual([
      {
        code: 'ruleVerificationFailed',
        isOwnedByCurrentUser: false,
        link: '/blank-owner',
        ownerName: '-',
        ownerUserId: 'user-blank',
        ref: {
          '@type': 'process data set',
          '@refObjectId': 'process-blank-owner',
          '@version': '01.00.000',
        },
      },
    ]);
    expect(mockGetUsersByIds).toHaveBeenCalledWith(['user-blank']);
  });

  it('falls back to a dash when owner ids resolve but the user lookup returns no profiles', async () => {
    mockGetRefData.mockResolvedValue({
      data: { userId: 'user-missing' },
      success: true,
    });
    mockGetUsersByIds.mockResolvedValue(undefined);

    const issues = [
      {
        code: 'ruleVerificationFailed',
        link: '/missing-owner-profile',
        ref: {
          '@type': 'process data set',
          '@refObjectId': 'process-missing-owner-profile',
          '@version': '01.00.000',
        },
      },
    ] as any[];

    await expect(enrichValidationIssuesWithOwner(issues)).resolves.toEqual([
      {
        code: 'ruleVerificationFailed',
        isOwnedByCurrentUser: false,
        link: '/missing-owner-profile',
        ownerName: '-',
        ownerUserId: 'user-missing',
        ref: {
          '@type': 'process data set',
          '@refObjectId': 'process-missing-owner-profile',
          '@version': '01.00.000',
        },
      },
    ]);
    expect(mockGetUsersByIds).toHaveBeenCalledWith(['user-missing']);
  });

  it('validates each dataset type through the sdk and filters process/model validation and compliance issues', () => {
    const sdkIssue = (path: PropertyKey[] | string) => ({ path });

    mockCreateContact.mockImplementation(
      makeSdkFactory({
        success: false,
        error: { issues: [sdkIssue(['contact'])] },
      }),
    );
    mockCreateSource.mockImplementation(
      makeSdkFactory({
        success: false,
        error: { issues: [sdkIssue(['source'])] },
      }),
    );
    mockCreateUnitGroup.mockImplementation(
      makeSdkFactory({
        success: false,
        error: { issues: [sdkIssue(['unitgroup'])] },
      }),
    );
    mockCreateFlowProperty.mockImplementation(
      makeSdkFactory({
        success: false,
        error: { issues: [sdkIssue(['flowProperty'])] },
      }),
    );
    mockCreateFlow.mockImplementation(
      makeSdkFactory({
        success: false,
        error: { issues: [sdkIssue(['flow'])] },
      }),
    );
    mockCreateProcess.mockImplementation(
      makeSdkFactory({
        success: false,
        error: {
          issues: [
            sdkIssue('processDataSet.modellingAndValidation.validation.review'),
            sdkIssue('processDataSet.modellingAndValidation.complianceDeclarations.compliance'),
            sdkIssue(['processInformation']),
            sdkIssue(['common:reviewCompliance']),
          ],
        },
      }),
    );
    mockCreateLifeCycleModel.mockImplementation(
      makeSdkFactory({
        success: false,
        error: {
          issues: [
            sdkIssue('lifeCycleModelDataSet.modellingAndValidation.validation.review'),
            sdkIssue([
              'lifeCycleModelDataSet',
              'modellingAndValidation',
              'dataSourcesTreatmentEtc',
            ]),
          ],
        },
      }),
    );

    expect(validateDatasetWithSdk('contact data set', { id: 'contact' })).toEqual({
      success: false,
      issues: [expect.objectContaining({ path: ['contact'] })],
    });
    expect(validateDatasetWithSdk('source data set', { id: 'source' })).toEqual({
      success: false,
      issues: [expect.objectContaining({ path: ['source'] })],
    });
    expect(validateDatasetWithSdk('unit group data set', { id: 'unitgroup' })).toEqual({
      success: false,
      issues: [expect.objectContaining({ path: ['unitgroup'] })],
    });
    expect(validateDatasetWithSdk('flow property data set', { id: 'flowproperty' })).toEqual({
      success: false,
      issues: [expect.objectContaining({ path: ['flowProperty'] })],
    });
    expect(validateDatasetWithSdk('flow data set', { id: 'flow' })).toEqual({
      success: false,
      issues: [expect.objectContaining({ path: ['flow'] })],
    });
    expect(validateDatasetWithSdk('process data set', { id: 'process' })).toEqual({
      success: false,
      issues: [
        expect.objectContaining({ path: ['processInformation'] }),
        expect.objectContaining({ path: ['common:reviewCompliance'] }),
      ],
    });
    expect(validateDatasetWithSdk('lifeCycleModel data set', { id: 'model' })).toEqual({
      success: false,
      issues: [
        expect.objectContaining({
          path: ['lifeCycleModelDataSet', 'modellingAndValidation', 'dataSourcesTreatmentEtc'],
        }),
      ],
    });
    expect(validateDatasetWithSdk('unknown data set' as any, { id: 'unknown' })).toEqual({
      success: true,
      issues: [],
    });
    expect(validateDatasetWithSdk('contact data set', null)).toEqual({
      success: false,
      issues: [],
    });
  });

  it('treats process/model sdk issues as successful when only review tabs fail', () => {
    mockCreateProcess.mockImplementation(
      makeSdkFactory({
        success: false,
        error: {
          issues: [
            { path: [0, 'processDataSet.modellingAndValidation.validation.review'] },
            {
              path: [
                { ignored: true },
                'processDataSet.modellingAndValidation.complianceDeclarations.compliance',
              ],
            },
          ],
        },
      }),
    );
    mockCreateLifeCycleModel.mockImplementation(
      makeSdkFactory({
        success: false,
        error: {
          issues: [
            { path: [0, 'lifeCycleModelDataSet.modellingAndValidation.validation.review'] },
            {
              path: [
                { ignored: true },
                'lifeCycleModelDataSet.modellingAndValidation.complianceDeclarations.compliance',
              ],
            },
          ],
        },
      }),
    );

    expect(validateDatasetWithSdk('process data set', { id: 'process' })).toEqual({
      success: true,
      issues: [],
    });
    expect(validateDatasetWithSdk('lifeCycleModel data set', { id: 'model' })).toEqual({
      success: true,
      issues: [],
    });
  });

  it.each([undefined, {}, [], [{}]])(
    'accepts author-complete lifecycle models with empty reviewer metadata through the installed SDK: %j',
    (complianceDeclarations) => {
      const installedSdk = jest.requireActual(
        `${process.cwd()}/node_modules/@tiangong-lca/tidas-sdk/dist/core/index.js`,
      );
      mockCreateLifeCycleModel.mockImplementation(installedSdk.createLifeCycleModel);
      const input = JSON.parse(JSON.stringify(modelFixture.payload.parent.jsonOrdered));
      const information = input.lifeCycleModelDataSet.lifeCycleModelInformation;
      information.dataSetInformation['common:UUID'] = '11111111-1111-4111-8111-111111111111';
      information.quantitativeReference.referenceToReferenceProcess = 0;
      information.technology.processes.processInstance.referenceToProcess = {
        ...information.technology.processes.processInstance.referenceToProcess,
        '@refObjectId': '22222222-2222-4222-8222-222222222222',
        '@version': '01.00.000',
      };
      input.lifeCycleModelDataSet.modellingAndValidation = { complianceDeclarations };
      const original = JSON.stringify(input);

      // Bind the regression to the actual SDK parent-path error, outside the default SDK mapper.
      const raw = installedSdk.createLifeCycleModel(JSON.parse(original)).validateEnhanced();
      expect(raw.validationIssues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ['lifeCycleModelDataSet', 'modellingAndValidation', 'complianceDeclarations'],
          }),
        ]),
      );
      expect(validateDatasetWithSdk('lifeCycleModel data set', input)).toEqual({
        success: true,
        issues: [],
      });
      expect(JSON.stringify(input)).toBe(original);

      delete information.dataSetInformation.name.baseName;
      expect(validateDatasetWithSdk('lifeCycleModel data set', input)).toEqual({
        success: false,
        issues: expect.arrayContaining([
          expect.objectContaining({
            path: [
              'lifeCycleModelDataSet',
              'lifeCycleModelInformation',
              'dataSetInformation',
              'name',
              'baseName',
            ],
          }),
        ]),
      });
    },
  );

  it.each(['process', 'lifeCycleModel'])(
    'filters %s compliance parent and array errors without suppressing other modelling errors',
    (kind) => {
      const factory = kind === 'process' ? mockCreateProcess : mockCreateLifeCycleModel;
      const root = `${kind}DataSet`;
      factory.mockImplementation(
        makeSdkFactory({
          success: false,
          error: {
            issues: [
              { path: [root, 'modellingAndValidation', 'complianceDeclarations'] },
              { path: [root, 'modellingAndValidation', 'complianceDeclarations', 0] },
              { path: `${root}.modellingAndValidation.complianceDeclarations[0]` },
              { path: [root, 'modellingAndValidation', 'dataSourcesTreatmentEtc'] },
            ],
          },
        }),
      );
      expect(validateDatasetWithSdk(`${kind} data set`, {})).toEqual({
        success: false,
        issues: [
          expect.objectContaining({
            path: [root, 'modellingAndValidation', 'dataSourcesTreatmentEtc'],
          }),
        ],
      });
    },
  );

  it('keeps process/model sdk errors for compliance child fields when the compliance field itself is not in the path', () => {
    mockCreateProcess.mockImplementation(
      makeSdkFactory({
        success: false,
        error: {
          issues: [{ path: ['common:approvalOfOverallCompliance'] }],
        },
      }),
    );
    mockCreateLifeCycleModel.mockImplementation(
      makeSdkFactory({
        success: false,
        error: {
          issues: [{ path: ['common:reviewCompliance'] }],
        },
      }),
    );

    expect(validateDatasetWithSdk('process data set', { id: 'process' })).toEqual({
      success: false,
      issues: [expect.objectContaining({ path: ['common:approvalOfOverallCompliance'] })],
    });
    expect(validateDatasetWithSdk('lifeCycleModel data set', { id: 'model' })).toEqual({
      success: false,
      issues: [expect.objectContaining({ path: ['common:reviewCompliance'] })],
    });
  });

  it.each(
    (['process', 'lifeCycleModel'] as const).flatMap((kind) =>
      ['validation', 'complianceDeclarations', 'compliance'].map((field) => ({ kind, field })),
    ),
  )('retains $kind errors for $field outside its reviewer-owned subtrees', ({ kind, field }) => {
    const root = `${kind}DataSet`;
    const otherRoot = kind === 'process' ? 'lifeCycleModelDataSet' : 'processDataSet';
    const information = kind === 'process' ? 'processInformation' : 'lifeCycleModelInformation';
    const authorPaths: Array<PropertyKey[] | string> = [
      [field],
      [root, field],
      ['modellingAndValidation', field],
      [root, information, field],
      [root, 'administrativeInformation', field],
      [root, 'modellingAndValidation', 'dataSourcesTreatmentEtc', field],
      [root, information, 'modellingAndValidation', field],
      [otherRoot, 'modellingAndValidation', field],
      [root, 'modellingAndValidationExtra', field],
      `${root}.${information}.${field}`,
      `${root}/modellingAndValidation/dataSourcesTreatmentEtc/${field}`,
    ];
    if (field === 'compliance') {
      // The schema places compliance inside complianceDeclarations, not directly here.
      authorPaths.push([root, 'modellingAndValidation', field]);
    }
    const authorIssues = authorPaths.map((path) => ({
      path,
      message: `Retain error at ${Array.isArray(path) ? path.join('.') : path}`,
    }));
    const factory = kind === 'process' ? mockCreateProcess : mockCreateLifeCycleModel;
    factory.mockImplementation(
      makeSdkFactory({
        success: false,
        error: {
          issues: [
            { path: [root, 'modellingAndValidation', 'validation', 'review'] },
            { path: [root, 'modellingAndValidation', 'complianceDeclarations'] },
            ...authorIssues,
          ],
        },
      }),
    );

    const result = validateDatasetWithSdk(`${kind} data set`, {});
    expect(result.success).toBe(false);
    expect(result.issues.map((issue) => issue.message)).toEqual(
      authorIssues.map((issue) => issue.message),
    );
  });

  it('keeps process/model sdk issues when their path is undefined', () => {
    mockCreateProcess.mockImplementation(
      makeSdkFactory({
        success: false,
        error: {
          issues: [{ path: undefined }],
        },
      }),
    );
    mockCreateLifeCycleModel.mockImplementation(
      makeSdkFactory({
        success: false,
        error: {
          issues: [{ path: undefined }],
        },
      }),
    );

    expect(validateDatasetWithSdk('process data set', { id: 'process' })).toEqual({
      success: false,
      issues: [expect.objectContaining({ path: [] })],
    });
    expect(validateDatasetWithSdk('lifeCycleModel data set', { id: 'model' })).toEqual({
      success: false,
      issues: [expect.objectContaining({ path: [] })],
    });
  });

  it('returns successful sdk results for process and lifecycle-model datasets', () => {
    expect(validateDatasetWithSdk('process data set', { id: 'process' })).toEqual({
      success: true,
      issues: [],
    });
    expect(validateDatasetWithSdk('lifeCycleModel data set', { id: 'model' })).toEqual({
      success: true,
      issues: [],
    });
  });

  it('preserves missing lifecycle-model process connections during sdk validation', () => {
    const orderedJson = {
      lifeCycleModelDataSet: {
        lifeCycleModelInformation: {
          technology: {
            processes: {
              processInstance: [
                {
                  '@dataSetInternalID': '0',
                  connections: {
                    outputExchange: [],
                  },
                  referenceToProcess: {
                    '@refObjectId': 'process-0',
                  },
                },
                {
                  '@dataSetInternalID': '1',
                  referenceToProcess: {
                    '@refObjectId': 'process-1',
                  },
                },
                {
                  '@dataSetInternalID': '2',
                  referenceToProcess: {
                    '@refObjectId': 'process-2',
                  },
                },
              ],
            },
          },
        },
      },
    };
    const processInstances = orderedJson.lifeCycleModelDataSet.lifeCycleModelInformation.technology
      .processes.processInstance as any[];

    expect(validateDatasetWithSdk('lifeCycleModel data set', orderedJson)).toEqual({
      success: true,
      issues: [],
    });
    const sdkInput = mockCreateLifeCycleModel.mock.calls[0][0];
    const sdkProcessInstances = sdkInput.lifeCycleModelDataSet.lifeCycleModelInformation.technology
      .processes.processInstance as any[];

    expect(sdkProcessInstances[0].connections).toEqual({
      outputExchange: [],
    });
    expect(sdkProcessInstances[1].connections).toBeUndefined();
    expect(sdkProcessInstances[2].connections).toBeUndefined();
    expect(processInstances[0].connections).toEqual({
      outputExchange: [],
    });
    expect(processInstances[1].connections).toBeUndefined();
    expect(processInstances[2].connections).toBeUndefined();
  });

  it('falls back to an empty sdk issue list when validation fails without structured issues', () => {
    mockCreateContact.mockImplementation(
      makeSdkFactory({
        success: false,
      }),
    );

    expect(validateDatasetWithSdk('contact data set', { id: 'contact' })).toEqual({
      success: false,
      issues: [],
    });
  });

  it('prefers normalized sdk validation issues over raw zod issues when available', () => {
    mockCreateProcess.mockImplementation(
      makeSdkFactory({
        success: false,
        error: {
          issues: [
            {
              code: 'custom',
              message:
                "@xml:lang values starting with 'zh' must include at least one Chinese character",
              path: [
                'processDataSet',
                'processInformation',
                'time',
                'common:timeRepresentativenessDescription',
                1,
                '#text',
              ],
            },
          ],
        },
        validationIssues: [
          {
            code: 'localized_text_zh_must_include_chinese_character',
            message:
              "@xml:lang values starting with 'zh' must include at least one Chinese character",
            path: [
              'processDataSet',
              'processInformation',
              'time',
              'common:timeRepresentativenessDescription',
              1,
              '#text',
            ],
            rawCode: 'custom',
            severity: 'error',
          },
        ],
      }),
    );

    expect(validateDatasetWithSdk('process data set', { id: 'process' })).toEqual({
      success: false,
      issues: [
        expect.objectContaining({
          code: 'localized_text_zh_must_include_chinese_character',
          rawCode: 'custom',
          severity: 'error',
        }),
      ],
    });
  });

  it('normalizes legacy sdk issue codes, params, and path shapes when validationIssues are absent', () => {
    mockCreateProcess.mockImplementation(
      makeSdkFactory({
        success: false,
        error: {
          issues: [
            {
              code: 'invalid_type',
              expected: 'object',
              input: undefined,
              message: 'Required object missing',
              path: 'processDataSet.processInformation.time.common:referenceYear',
            },
            {
              code: 'invalid_type',
              expected: 'number',
              input: null,
              message: 'Wrong type',
              path: ['processDataSet', 'processInformation', 'time', 'common:referenceYear'],
            },
            {
              code: 'too_big',
              exact: false,
              inclusive: true,
              input: 'abcd',
              maximum: 3,
              message: 'Too long',
              origin: 'string',
              path: ['processDataSet', 'processInformation', 'dataSetInformation', '@uuid'],
            },
            {
              code: 'too_big',
              exact: false,
              inclusive: true,
              input: [1, 2, 3],
              maximum: 2,
              message: 'Too many',
              origin: 'array',
              path: ['processDataSet', 'processInformation', 'time', 'common:other'],
            },
            {
              code: 'too_big',
              exact: false,
              inclusive: true,
              input: 12,
              maximum: 10,
              message: 'Too large',
              origin: 'number',
              path: ['processDataSet', 'processInformation', 'time', 'common:number'],
            },
            {
              code: 'too_small',
              exact: false,
              inclusive: true,
              input: 'ab',
              message: 'Too short',
              minimum: 3,
              origin: 'string',
              path: ['processDataSet', 'processInformation', 'time', 'common:label'],
            },
            {
              code: 'too_small',
              exact: false,
              inclusive: true,
              input: [1],
              message: 'Too few',
              minimum: 2,
              origin: 'array',
              path: ['processDataSet', 'processInformation', 'time', 'common:list'],
            },
            {
              code: 'too_small',
              exact: false,
              inclusive: true,
              input: 1,
              message: 'Too small',
              minimum: 2,
              origin: 'bigint',
              path: ['processDataSet', 'processInformation', 'time', 'common:value'],
            },
            {
              code: 'invalid_format',
              format: 'uuid',
              message: 'Bad format',
              path: ['processDataSet', 'processInformation', 'dataSetInformation', '@uuid'],
            },
            {
              code: 'invalid_value',
              message: 'Bad value',
              path: ['processDataSet', 'processInformation', 'quantitativeReference', '@type'],
              values: ['A', 'B'],
            },
            {
              code: 'unrecognized_keys',
              keys: ['foo', 'bar'],
              message: 'Unknown keys',
              path: ['processDataSet', 'processInformation'],
            },
            {
              code: 'invalid_union',
              input: undefined,
              message: 'Missing union value',
              path: [
                'processDataSet',
                'modellingAndValidation',
                'LCIMethodAndAllocation',
                'typeOfDataSet',
              ],
            },
            {
              code: 'custom',
              message: 'Custom validation failed',
              path: ['processDataSet', 'processInformation', 'time', 'common:custom'],
            },
            {
              code: 'brand_new_code',
              message: 'Unknown validation failed',
              path: undefined,
            },
          ],
        },
      }),
    );

    expect(validateDatasetWithSdk('process data set', { id: 'process' })).toEqual({
      success: false,
      issues: [
        expect.objectContaining({
          code: 'required_missing',
          params: { expected: 'object' },
          path: ['processDataSet.processInformation.time.common:referenceYear'],
          rawCode: 'invalid_type',
        }),
        expect.objectContaining({
          code: 'invalid_type',
          params: { expected: 'number', received: 'null' },
        }),
        expect.objectContaining({
          code: 'string_too_long',
          params: expect.objectContaining({
            actualLength: 4,
            maximum: 3,
            origin: 'string',
          }),
        }),
        expect.objectContaining({
          code: 'array_too_large',
          params: expect.objectContaining({
            actualLength: 3,
            maximum: 2,
            origin: 'array',
          }),
        }),
        expect.objectContaining({
          code: 'number_too_large',
          params: expect.objectContaining({
            actual: 12,
            maximum: 10,
            origin: 'number',
          }),
        }),
        expect.objectContaining({
          code: 'string_too_short',
          params: expect.objectContaining({
            actualLength: 2,
            minimum: 3,
            origin: 'string',
          }),
        }),
        expect.objectContaining({
          code: 'array_too_small',
          params: expect.objectContaining({
            actualLength: 1,
            minimum: 2,
            origin: 'array',
          }),
        }),
        expect.objectContaining({
          code: 'number_too_small',
          params: expect.objectContaining({
            actual: 1,
            minimum: 2,
            origin: 'bigint',
          }),
        }),
        expect.objectContaining({
          code: 'invalid_format',
          params: { format: 'uuid' },
        }),
        expect.objectContaining({
          code: 'invalid_value',
          params: { allowedValues: 'A, B' },
        }),
        expect.objectContaining({
          code: 'unrecognized_keys',
          params: { keys: 'foo, bar' },
        }),
        expect.objectContaining({
          code: 'required_missing',
          rawCode: 'invalid_union',
        }),
        expect.objectContaining({
          code: 'custom',
          rawCode: 'custom',
        }),
        expect.objectContaining({
          code: 'unknown',
          path: [],
          rawCode: 'brand_new_code',
        }),
      ],
    });
  });

  it('merges structured validationIssues with raw zod issues and normalizes missing paths', () => {
    mockCreateProcess.mockImplementation(
      makeSdkFactory({
        success: false,
        error: {
          issues: [
            {
              code: 'invalid_type',
              expected: 'string',
              input: undefined,
              path: ['processDataSet', 'processInformation', 'time', 'common:referenceYear'],
            },
            {
              code: 'too_small',
              inclusive: true,
              input: 1890,
              minimum: 1900,
              origin: 'number',
              path: ['processDataSet', 'processInformation', 'time', 'common:referenceYear'],
            },
          ],
        },
        validationIssues: [
          {
            code: 'required_missing',
            message: 'Required value is missing',
            path: 'processDataSet.processInformation.time.common:referenceYear',
          },
          {
            code: 'number_too_small',
            message: 'Year is too small',
          },
        ],
      }),
    );

    expect(validateDatasetWithSdk('process data set', { id: 'process' })).toEqual({
      success: false,
      issues: [
        expect.objectContaining({
          code: 'required_missing',
          expected: 'string',
          input: undefined,
          path: ['processDataSet.processInformation.time.common:referenceYear'],
          rawCode: 'invalid_type',
        }),
        expect.objectContaining({
          code: 'number_too_small',
          inclusive: true,
          minimum: 1900,
          origin: 'number',
          path: ['processDataSet', 'processInformation', 'time', 'common:referenceYear'],
          rawCode: 'too_small',
        }),
      ],
    });
  });

  it('normalizes legacy array inputs and unknown size origins', () => {
    mockCreateProcess.mockImplementation(
      makeSdkFactory({
        success: false,
        error: {
          issues: [
            {
              code: 'invalid_type',
              expected: 'object',
              input: [],
              message: 'Expected object but received array',
              path: ['processDataSet', 'processInformation', 'time', 'common:list'],
            },
            {
              code: 'too_big',
              exact: false,
              inclusive: true,
              input: [1, 2, 3],
              maximum: 1,
              message: 'Too big',
              origin: 'set',
              path: ['processDataSet', 'processInformation', 'time', 'common:customSet'],
            },
            {
              code: 'too_small',
              exact: false,
              inclusive: true,
              input: [],
              minimum: 1,
              message: 'Too small',
              origin: 'map',
              path: ['processDataSet', 'processInformation', 'time', 'common:customMap'],
            },
          ],
        },
      }),
    );

    expect(validateDatasetWithSdk('process data set', { id: 'process' })).toEqual({
      success: false,
      issues: [
        expect.objectContaining({
          code: 'invalid_type',
          params: {
            expected: 'object',
            received: 'array',
          },
        }),
        expect.objectContaining({
          code: 'unknown',
          rawCode: 'too_big',
        }),
        expect.objectContaining({
          code: 'unknown',
          rawCode: 'too_small',
        }),
      ],
    });
  });

  it('covers sparse normalization fallbacks for legacy and structured sdk results', () => {
    expect(
      normalizeSdkValidationResult({
        success: false,
        error: {
          issues: [
            {
              code: 'invalid_union',
              input: 0,
              message: 'Union mismatch',
              path: ['processDataSet', 'processInformation', 'time', 'common:union'],
            },
            {
              code: 'too_big',
              input: 2n,
              maximum: 1,
              message: 'Bigint too large',
              origin: 'bigint',
              path: ['processDataSet', 'processInformation', 'time', 'common:big'],
            },
            {
              code: 'too_small',
              input: 1n,
              minimum: 2,
              message: 'Bigint too small',
              origin: 'bigint',
              path: ['processDataSet', 'processInformation', 'time', 'common:smallBig'],
            },
            {
              code: 'invalid_format',
              message: 'Format missing',
              path: ['processDataSet', 'processInformation', 'time', 'common:format'],
            },
            {
              code: 'invalid_value',
              message: 'Values missing',
              values: 'broken',
              path: ['processDataSet', 'processInformation', 'time', 'common:value'],
            },
            {
              code: 'unrecognized_keys',
              keys: [],
              message: 'Keys missing',
              path: ['processDataSet', 'processInformation', 'time', 'common:keys'],
            },
          ],
        },
      }),
    ).toEqual({
      success: false,
      issues: [
        expect.objectContaining({
          code: 'invalid_union',
          rawCode: 'invalid_union',
        }),
        expect.objectContaining({
          code: 'number_too_large',
          params: expect.objectContaining({
            actual: 2,
            maximum: 1,
            origin: 'bigint',
          }),
        }),
        expect.objectContaining({
          code: 'number_too_small',
          params: expect.objectContaining({
            actual: 1,
            minimum: 2,
            origin: 'bigint',
          }),
        }),
        expect.objectContaining({
          code: 'invalid_format',
          params: undefined,
        }),
        expect.objectContaining({
          code: 'invalid_value',
          params: undefined,
        }),
        expect.objectContaining({
          code: 'unrecognized_keys',
          params: undefined,
        }),
      ],
    });

    expect(
      normalizeSdkValidationResult({
        success: false,
        error: {
          issues: [
            {
              code: 'invalid_type',
              expected: 'string',
              input: 'raw-string',
              path: ['processDataSet', 'processInformation', 'time', 'common:referenceYear'],
            },
          ],
        },
        validationIssues: [
          {
            message: 'Structured fallback',
            path: undefined,
          },
        ],
      }),
    ).toEqual({
      success: false,
      issues: [
        expect.objectContaining({
          code: 'invalid_type',
          expected: 'string',
          input: 'raw-string',
          path: ['processDataSet', 'processInformation', 'time', 'common:referenceYear'],
          rawCode: 'invalid_type',
          severity: 'error',
        }),
      ],
    });

    expect(
      normalizeSdkValidationResult({
        success: false,
        error: {
          issues: null,
        },
      }),
    ).toEqual({
      success: false,
      issues: [],
    });
  });

  it('normalizes legacy object inputs and filters validation-only sdk issues from string paths while keeping undefined paths', () => {
    expect(
      normalizeSdkValidationResult({
        success: false,
        error: {
          issues: [
            {
              code: 'invalid_type',
              expected: 'string',
              input: {
                raw: true,
              },
              message: 'Object received',
              path: ['processDataSet', 'processInformation', 'time', 'common:objectType'],
            },
          ],
        },
      }),
    ).toEqual({
      success: false,
      issues: [
        expect.objectContaining({
          code: 'invalid_type',
          params: {
            expected: 'string',
            received: 'object',
          },
        }),
      ],
    });

    mockCreateProcess.mockImplementation(
      makeSdkFactory({
        success: false,
        validationIssues: [
          {
            code: 'invalid_type',
            message: 'Review path should be filtered',
            path: 'processDataSet.modellingAndValidation.validation.review',
          },
          {
            code: 'invalid_type',
            message: 'Keep undefined path issue',
            path: undefined,
          },
        ],
      }),
    );

    expect(validateDatasetWithSdk('process data set', { id: 'process' })).toEqual({
      success: false,
      issues: [
        expect.objectContaining({
          code: 'invalid_type',
          message: 'Keep undefined path issue',
          path: [],
        }),
      ],
    });
  });

  it('handles unknown dataset types and datasets without a resolvable root ref during rule verification', async () => {
    await expect(
      validateDatasetRuleVerification('unknown data set' as any, { foo: 'bar' }),
    ).resolves.toEqual({
      datasetSdkValid: true,
      datasetSdkIssues: [],
      nonExistentRef: [],
      ruleVerification: true,
      unRuleVerification: [],
    });

    await expect(
      validateDatasetRuleVerification('contact data set', {
        contactDataSet: {
          contactInformation: {
            dataSetInformation: {},
          },
          administrativeInformation: {
            publicationAndOwnership: {},
          },
        },
      }),
    ).resolves.toEqual({
      datasetSdkValid: true,
      datasetSdkIssues: [],
      nonExistentRef: [],
      ruleVerification: true,
      unRuleVerification: [],
    });
  });

  it('filters out root self references while preserving other refs during rule verification', async () => {
    mockGetRefData.mockResolvedValue({
      success: true,
      data: {
        id: 'contact-2',
        stateCode: 100,
        ruleVerification: true,
        json: {},
      },
    });

    const orderedJson = {
      contactDataSet: {
        contactInformation: {
          dataSetInformation: {
            'common:UUID': 'contact-1',
            ownership: {
              '@type': 'contact data set',
              '@refObjectId': 'contact-1',
              '@version': '01.00.000',
            },
            reviewer: {
              '@type': 'contact data set',
              '@refObjectId': 'contact-2',
              '@version': '01.00.000',
            },
          },
        },
        administrativeInformation: {
          publicationAndOwnership: {
            'common:dataSetVersion': '01.00.000',
          },
        },
      },
    };

    await expect(validateDatasetRuleVerification('contact data set', orderedJson)).resolves.toEqual(
      {
        datasetSdkValid: true,
        datasetSdkIssues: [],
        nonExistentRef: [],
        ruleVerification: true,
        unRuleVerification: [],
      },
    );

    expect(mockGetRefData).toHaveBeenCalledTimes(1);
    expect(mockGetRefData).toHaveBeenCalledWith('contact-2', '01.00.000', 'contacts', '', {
      fallbackToLatest: false,
    });
  });

  it('skips refs that directly match rootRef before querying details in checkReferences', async () => {
    mockGetRefData.mockResolvedValue({
      success: true,
      data: {
        id: 'contact-2',
        stateCode: 100,
        ruleVerification: true,
        json: {},
      },
    });

    const rootRef = {
      '@type': 'contact data set',
      '@refObjectId': 'contact-1',
      '@version': '01.00.000',
    } as const;

    await expect(
      checkReferences(
        [
          rootRef,
          {
            '@type': 'contact data set',
            '@refObjectId': 'contact-2',
            '@version': '01.00.000',
          },
        ],
        new Map<string, any>(),
        '',
        [],
        [],
        [],
        [],
        undefined,
        undefined,
        {
          exactVersion: true,
          rootRef,
        },
      ),
    ).resolves.toBeUndefined();

    expect(mockGetRefData).toHaveBeenCalledTimes(1);
    expect(mockGetRefData).toHaveBeenCalledWith('contact-2', '01.00.000', 'contacts', '', {
      fallbackToLatest: false,
    });
    expect(mockGetLifeCycleModelDetail).not.toHaveBeenCalled();
  });

  it('does not re-add the current lifecycle model to unRuleVerification through same-model process recursion', async () => {
    mockGetRefData.mockResolvedValue({
      success: true,
      data: {
        id: 'process-1',
        stateCode: 10,
        ruleVerification: true,
        json: {},
      },
    });
    mockGetLifeCycleModelDetail.mockResolvedValue({
      success: true,
      data: {
        id: 'model-1',
        version: '01.00.000',
        stateCode: 10,
        ruleVerification: false,
        json: {
          lifeCycleModelDataSet: {
            lifeCycleModelInformation: {
              dataSetInformation: {
                'common:UUID': 'model-1',
              },
              technology: {
                processes: {
                  processInstance: [
                    {
                      referenceToProcess: {
                        '@type': 'process data set',
                        '@refObjectId': 'process-1',
                        '@version': '01.00.000',
                      },
                    },
                  ],
                },
              },
            },
            administrativeInformation: {
              publicationAndOwnership: {
                'common:dataSetVersion': '01.00.000',
              },
            },
          },
        },
      },
    });

    const orderedJson = {
      lifeCycleModelDataSet: {
        lifeCycleModelInformation: {
          dataSetInformation: {
            'common:UUID': 'model-1',
          },
          technology: {
            processes: {
              processInstance: [
                {
                  referenceToProcess: {
                    '@type': 'process data set',
                    '@refObjectId': 'process-1',
                    '@version': '01.00.000',
                  },
                },
              ],
            },
          },
        },
        administrativeInformation: {
          publicationAndOwnership: {
            'common:dataSetVersion': '01.00.000',
          },
        },
      },
    };

    await expect(
      validateDatasetRuleVerification('lifeCycleModel data set', orderedJson),
    ).resolves.toEqual({
      datasetSdkValid: true,
      datasetSdkIssues: [],
      nonExistentRef: [],
      ruleVerification: true,
      unRuleVerification: [],
    });

    expect(mockGetRefData).toHaveBeenCalledWith('process-1', '01.00.000', 'processes', '', {
      fallbackToLatest: false,
    });
    expect(mockGetLifeCycleModelDetail).toHaveBeenCalledWith('process-1', '01.00.000');
  });

  it('categorises missing process/model details and can skip rule-verification flags', () => {
    const unReview: any[] = [];
    const underReview: any[] = [];
    const unRuleVerification: any[] = [];
    const nonExistentRef: any[] = [];

    dealProcress(undefined, unReview, underReview, unRuleVerification, nonExistentRef);
    dealProcress(
      {
        id: 'process-1',
        version: '01.00.000',
        stateCode: 10,
        ruleVerification: false,
      },
      unReview,
      underReview,
      unRuleVerification,
      nonExistentRef,
      {
        includeRuleVerification: false,
      },
    );

    dealModel(
      {
        id: 'model-1',
        version: '01.00.000',
        stateCode: 10,
        ruleVerification: false,
      },
      unReview,
      underReview,
      unRuleVerification,
      nonExistentRef,
      {
        includeRuleVerification: false,
      },
    );

    expect(nonExistentRef).toEqual([
      {
        '@type': 'process data set',
        '@refObjectId': '',
        '@version': '',
      },
    ]);
    expect(unReview).toEqual([
      {
        '@type': 'process data set',
        '@refObjectId': 'process-1',
        '@version': '01.00.000',
      },
      {
        '@type': 'lifeCycleModel data set',
        '@refObjectId': 'model-1',
        '@version': '01.00.000',
      },
    ]);
    expect(underReview).toEqual([]);
    expect(unRuleVerification).toEqual([]);
  });
});
