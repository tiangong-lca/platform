// @ts-nocheck
import {
  ConcurrencyController,
  ReffPath,
  checkData,
  checkReferences,
  checkRequiredFields,
  checkReviewReport,
  checkVersions,
  dealModel,
  dealProcress,
  getAllRefObj,
  getErrRefTab,
  getRefTableName,
  getRejectedComments,
  mergeCommentsToData,
  submitDatasetReview,
  validateDatasetRuleVerification,
  validateDatasetWithSdk,
} from '@/pages/Utils/review';

const mockCreateContact = jest.fn(() => ({
  validateEnhanced: () => ({
    success: true,
  }),
}));
const mockCreateFlow = jest.fn(() => ({
  validateEnhanced: () => ({
    success: true,
  }),
}));
const mockCreateFlowProperty = jest.fn(() => ({
  validateEnhanced: () => ({
    success: true,
  }),
}));
const mockCreateLifeCycleModel = jest.fn(() => ({
  validateEnhanced: () => ({
    success: true,
  }),
}));
const mockCreateProcess = jest.fn(() => ({
  validateEnhanced: () => ({
    success: true,
  }),
}));
const mockCreateSource = jest.fn(() => ({
  validateEnhanced: () => ({
    success: true,
  }),
}));
const mockCreateUnitGroup = jest.fn(() => ({
  validateEnhanced: () => ({
    success: true,
  }),
}));

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

const mockGetRefData = jest.fn();
const mockGetRefDataByIds = jest.fn();
const mockUpdateStateCodeApi = jest.fn();

jest.mock('@/services/general/api', () => ({
  __esModule: true,
  getRefData: (...args: any[]) => mockGetRefData(...args),
  getRefDataByIds: (...args: any[]) => mockGetRefDataByIds(...args),
  updateStateCodeApi: (...args: any[]) => mockUpdateStateCodeApi(...args),
}));

const mockGetLifeCycleModelDetail = jest.fn();

jest.mock('@/services/lifeCycleModels/api', () => ({
  __esModule: true,
  getLifeCycleModelDetail: (...args: any[]) => mockGetLifeCycleModelDetail(...args),
}));

const mockGetRejectReviewsByProcess = jest.fn();
const mockSubmitDatasetReviewApi = jest.fn();

jest.mock('@/services/reviews/api', () => ({
  __esModule: true,
  getRejectReviewsByProcess: (...args: any[]) => mockGetRejectReviewsByProcess(...args),
  submitDatasetReviewApi: (...args: any[]) => mockSubmitDatasetReviewApi(...args),
}));

const mockGetRejectedCommentsByReviewIds = jest.fn();

jest.mock('@/services/comments/api', () => ({
  __esModule: true,
  getRejectedCommentsByReviewIds: (...args: any[]) => mockGetRejectedCommentsByReviewIds(...args),
}));

const mockGetSourcesByIdsAndVersions = jest.fn();

jest.mock('@/services/sources/api', () => ({
  __esModule: true,
  getSourcesByIdsAndVersions: (...args: any[]) => mockGetSourcesByIdsAndVersions(...args),
}));

describe('review utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRefData.mockReset();
    mockGetRefDataByIds.mockReset();
    mockUpdateStateCodeApi.mockReset();
    mockGetLifeCycleModelDetail.mockReset();
    mockGetRejectReviewsByProcess.mockReset();
    mockSubmitDatasetReviewApi.mockReset();
    mockGetRejectedCommentsByReviewIds.mockReset();
    mockGetSourcesByIdsAndVersions.mockReset();
    mockCreateContact.mockReset();
    mockCreateFlow.mockReset();
    mockCreateFlowProperty.mockReset();
    mockCreateLifeCycleModel.mockReset();
    mockCreateProcess.mockReset();
    mockCreateSource.mockReset();
    mockCreateUnitGroup.mockReset();
    mockCreateContact.mockImplementation(() => ({
      validateEnhanced: () => ({
        success: true,
      }),
    }));
    mockCreateFlow.mockImplementation(() => ({
      validateEnhanced: () => ({
        success: true,
      }),
    }));
    mockCreateFlowProperty.mockImplementation(() => ({
      validateEnhanced: () => ({
        success: true,
      }),
    }));
    mockCreateLifeCycleModel.mockImplementation(() => ({
      validateEnhanced: () => ({
        success: true,
      }),
    }));
    mockCreateProcess.mockImplementation(() => ({
      validateEnhanced: () => ({
        success: true,
      }),
    }));
    mockCreateSource.mockImplementation(() => ({
      validateEnhanced: () => ({
        success: true,
      }),
    }));
    mockCreateUnitGroup.mockImplementation(() => ({
      validateEnhanced: () => ({
        success: true,
      }),
    }));
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('allows an omitted Process report while retaining SDK rejection of a supplied malformed report', () => {
    const reportPath = [
      'processDataSet',
      'modellingAndValidation',
      'validation',
      'review',
      'common:referenceToCompleteReviewReport',
    ];
    mockCreateProcess.mockImplementation(() => ({
      validateEnhanced: () => ({
        success: false,
        error: {
          issues: [
            { code: 'invalid_type', path: reportPath, message: 'Invalid report reference' },
            {
              code: 'invalid_type',
              path: [
                'processDataSet',
                'modellingAndValidation',
                'validation',
                'review',
                'common:reviewDetails',
              ],
              message: 'Other existing review issue',
            },
          ],
        },
      }),
    }));

    const review = { '@type': 'Independent external review' };
    const omitted = { processDataSet: { modellingAndValidation: { validation: { review } } } };
    expect(validateDatasetWithSdk('process data set', omitted)).toEqual({
      success: true,
      issues: [],
    });
    expect(omitted.processDataSet.modellingAndValidation.validation.review).toEqual(review);
    expect(validateDatasetWithSdk('process data set', {})).toEqual({
      success: true,
      issues: [],
    });

    const supplied = {
      processDataSet: {
        modellingAndValidation: {
          validation: {
            review: {
              ...review,
              'common:referenceToCompleteReviewReport': { '@type': 'source data set' },
            },
          },
        },
      },
    };
    const result = validateDatasetWithSdk('process data set', supplied);
    expect(result.success).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].path).toEqual(reportPath);
  });

  it('limits concurrency and resolves tasks in order', async () => {
    const controller = new ConcurrencyController(2);
    const starts: number[] = [];
    const runningCounts: number[] = [];
    let running = 0;
    const gateResolvers: Array<() => void> = [];

    const tasks = Array.from({ length: 4 }, (_, index) =>
      controller.add(async () => {
        starts.push(index);
        running += 1;
        runningCounts.push(running);
        await new Promise<void>((resolve) => {
          gateResolvers.push(() => {
            resolve();
            running -= 1;
          });
        });
        return index;
      }),
    );

    await Promise.resolve();
    expect(starts).toEqual([0, 1]);

    gateResolvers.splice(0, 2).forEach((unlock) => unlock());
    await new Promise((resolve) => {
      process.nextTick(resolve);
    });
    expect(starts).toEqual([0, 1, 2, 3]);
    gateResolvers.splice(0, 2).forEach((unlock) => unlock());
    const results = await Promise.all(tasks);
    expect(results).toEqual([0, 1, 2, 3]);
    expect(Math.max(...runningCounts)).toBeLessThanOrEqual(2);
  });

  it('rejects failed concurrency tasks and drains the queue', async () => {
    const controller = new ConcurrencyController(1);
    const error = new Error('boom');

    const failedTask = controller.add(async () => {
      throw error;
    });
    const successfulTask = controller.add(async () => 'ok');

    await expect(failedTask).rejects.toThrow('boom');
    await expect(successfulTask).resolves.toBe('ok');
    await expect(controller.waitForAll()).resolves.toBeUndefined();
  });

  it('returns correct table names', () => {
    expect(getRefTableName('process data set')).toBe('processes');
    expect(getRefTableName('lifeCycleModel data set')).toBe('lifecyclemodels');
    expect(getRefTableName('unknown')).toBeUndefined();
  });

  it('uses the default concurrency limit when none is provided', async () => {
    const controller = new ConcurrencyController();

    await expect(controller.add(async () => 'default')).resolves.toBe('default');
  });

  it('collects nested references without double counting shared objects', () => {
    const ref = {
      '@refObjectId': 'ref-1',
      '@version': '01.00.000',
      '@type': 'flow data set',
    };
    const result = getAllRefObj({
      top: ref,
      nested: {
        again: ref,
        list: [
          {
            '@refObjectId': 'ref-2',
            '@version': '01.00.000',
            '@type': 'process data set',
          },
        ],
      },
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toBe(ref);
    expect(result[1]).toMatchObject({
      '@refObjectId': 'ref-2',
      '@type': 'process data set',
    });
  });

  it('marks process states correctly', () => {
    const unReview: any[] = [];
    const underReview: any[] = [];
    const unRuleVerification: any[] = [];
    const nonExistent: any[] = [];

    dealProcress(
      {
        id: 'proc-1',
        version: '01',
        stateCode: 10,
        ruleVerification: false,
      },
      unReview,
      underReview,
      unRuleVerification,
      nonExistent,
    );
    expect(unReview).toEqual([
      {
        '@refObjectId': 'proc-1',
        '@version': '01',
        '@type': 'process data set',
      },
    ]);
    expect(unRuleVerification[0]).toMatchObject({
      '@refObjectId': 'proc-1',
    });

    dealProcress(
      {
        id: 'proc-2',
        version: '02',
        stateCode: 50,
        ruleVerification: true,
      },
      unReview,
      underReview,
      unRuleVerification,
      nonExistent,
    );
    expect(underReview).toHaveLength(1);
  });

  it('marks model states correctly', () => {
    const unReview: any[] = [];
    const underReview: any[] = [];
    const unRuleVerification: any[] = [];
    const nonExistent: any[] = [];

    dealModel(
      {
        id: 'model-1',
        version: '01',
        stateCode: 80,
        ruleVerification: false,
      },
      unReview,
      underReview,
      unRuleVerification,
      nonExistent,
    );
    expect(underReview[0]).toMatchObject({
      '@refObjectId': 'model-1',
      '@type': 'lifeCycleModel data set',
    });
    expect(unRuleVerification[0]).toMatchObject({
      '@refObjectId': 'model-1',
    });

    dealModel(undefined, unReview, underReview, unRuleVerification, nonExistent);
    expect(nonExistent[0]['@type']).toBe('lifeCycleModel data set');
  });

  it('marks unreleased lifecycle models as unreviewed', () => {
    const unReview: any[] = [];

    dealModel(
      {
        id: 'model-unreviewed',
        version: '01',
        stateCode: 10,
        ruleVerification: true,
      },
      unReview,
      [],
      [],
      [],
    );

    expect(unReview).toEqual([
      {
        '@type': 'lifeCycleModel data set',
        '@refObjectId': 'model-unreviewed',
        '@version': '01',
      },
    ]);
  });

  it('walks reference graph and categorises states', async () => {
    const unReview: any[] = [];
    const underReview: any[] = [];
    const unRuleVerification: any[] = [];
    const nonExistent: any[] = [];

    mockGetRefData.mockImplementation(async (id: string) => {
      if (id === 'flow-1') {
        return {
          success: true,
          data: {
            id: 'flow-1',
            stateCode: 10,
            ruleVerification: true,
            json: {
              nested: {
                '@refObjectId': 'flow-2',
                '@version': '01',
                '@type': 'flow data set',
              },
            },
          },
        };
      }
      if (id === 'flow-2') {
        return {
          success: true,
          data: {
            id: 'flow-2',
            stateCode: 30,
            ruleVerification: false,
            json: {},
          },
        };
      }
      if (id === 'missing') {
        return { success: false, data: null };
      }
      return { success: true, data: null };
    });
    mockGetLifeCycleModelDetail.mockResolvedValue({ success: false });

    const refs = [
      {
        '@refObjectId': 'flow-1',
        '@version': '01',
        '@type': 'flow data set',
      },
      {
        '@refObjectId': 'missing',
        '@version': '01',
        '@type': 'source data set',
      },
    ];

    await checkReferences(
      refs,
      new Map(),
      'team-1',
      unReview,
      underReview,
      unRuleVerification,
      nonExistent,
    );

    expect(mockGetRefData).toHaveBeenCalledTimes(3);
    expect(unReview).toHaveLength(1);
    expect(underReview).toHaveLength(1);
    expect(unRuleVerification).toHaveLength(1);
    expect(nonExistent).toHaveLength(1);
  });

  it('marks versions under review and in TG on reference path via checkVersions', async () => {
    const path = new ReffPath(
      {
        '@refObjectId': 'proc-1',
        '@version': '01',
        '@type': 'process data set',
      },
      true,
      false,
    );

    const child = new ReffPath(
      {
        '@refObjectId': 'flow-1',
        '@version': '01',
        '@type': 'flow data set',
      },
      true,
      false,
    );

    path.addChild(child);

    mockGetRefDataByIds.mockImplementation(async (ids: string[], tableName: string) => {
      if (tableName === 'processes') {
        return {
          data: [
            {
              id: 'proc-1',
              version: '01',
              state_code: 30,
            },
          ],
        };
      }
      if (tableName === 'flows') {
        return {
          data: [
            {
              id: 'flow-1',
              version: '02',
              state_code: 100,
            },
          ],
        };
      }
      return { data: [] };
    });

    await checkVersions(new Set(['proc-1:01:process data set', 'flow-1:01:flow data set']), path);

    expect(mockGetRefDataByIds).toHaveBeenCalledTimes(2);
    expect(mockGetRefDataByIds).toHaveBeenCalledWith(['proc-1'], 'processes');
    expect(mockGetRefDataByIds).toHaveBeenCalledWith(['flow-1'], 'flows');

    expect((path as any).versionUnderReview).toBe(true);
    expect((path as any).underReviewVersion).toBe('01');
    expect((child as any).versionIsInTg).toBe(true);
  });

  it('does not mark TG versions when current version is empty, equal, or newer', async () => {
    const path = new ReffPath({
      '@refObjectId': 'root',
      '@version': '01',
      '@type': 'process data set',
    });
    const refs = ['', '02', '03'].map(
      (version) =>
        new ReffPath({
          '@refObjectId': 'flow-1',
          '@version': version,
          '@type': 'flow data set',
        }),
    );
    refs.forEach((ref) => path.addChild(ref));

    mockGetRefDataByIds.mockResolvedValue({
      data: [
        {
          id: 'flow-1',
          version: '02',
          state_code: 100,
        },
      ],
    });

    await checkVersions(
      new Set(['flow-1::flow data set', 'flow-1:02:flow data set', 'flow-1:03:flow data set']),
      path,
    );

    refs.forEach((ref) => {
      expect((ref as any).versionIsInTg).toBeUndefined();
    });
  });

  it('skips details that do not match any requested ref id', async () => {
    const path = new ReffPath({
      '@refObjectId': 'root',
      '@version': '01',
      '@type': 'process data set',
    });

    mockGetRefDataByIds.mockResolvedValue({
      data: [
        {
          id: 'other-flow',
          version: '0.0',
          state_code: 100,
        },
      ],
    });

    await checkVersions(new Set(['flow-1:0.0:flow data set']), path);

    expect((path as any).versionIsInTg).toBeUndefined();
  });

  it('uses zero fallbacks when comparing malformed semantic versions', async () => {
    const path = new ReffPath({
      '@refObjectId': 'root',
      '@version': '01',
      '@type': 'process data set',
    });
    const child = new ReffPath({
      '@refObjectId': 'flow-1',
      '@version': '0.a',
      '@type': 'flow data set',
    });
    path.addChild(child);

    mockGetRefDataByIds.mockResolvedValue({
      data: [
        {
          id: 'flow-1',
          version: '0',
          state_code: 100,
        },
      ],
    });

    await checkVersions(new Set(['flow-1:0.a:flow data set']), path);

    expect((child as any).versionIsInTg).toBeUndefined();
  });

  it('checks data wrapper using checkReferences', async () => {
    mockGetRefData.mockImplementation(async (id: string) => {
      if (id === 'flow-3') {
        return {
          success: true,
          data: {
            stateCode: 10,
            ruleVerification: true,
            json: {
              nested: {
                '@refObjectId': 'flow-4',
                '@version': '01',
                '@type': 'flow data set',
              },
            },
          },
        };
      }
      if (id === 'flow-4') {
        return {
          success: true,
          data: {
            stateCode: 30,
            ruleVerification: false,
            json: {},
          },
        };
      }
      return { success: false, data: null };
    });
    mockGetLifeCycleModelDetail.mockResolvedValue({ success: false, data: null });

    const unRuleVerification: any[] = [];
    const nonExistent: any[] = [];
    const path = new ReffPath({
      '@refObjectId': 'root',
      '@version': '01',
      '@type': 'process data set',
    });

    await checkData(
      {
        '@refObjectId': 'flow-3',
        '@version': '01',
        '@type': 'flow data set',
      },
      unRuleVerification,
      nonExistent,
      path,
    );

    expect(mockGetRefData).toHaveBeenCalledWith('flow-3', '01', 'flows', '', {
      fallbackToLatest: false,
    });
    expect(unRuleVerification).toHaveLength(1);
  });

  it('reuses cached references without re-fetching and records cached path nodes', async () => {
    const parentPath = new ReffPath({
      '@refObjectId': 'root',
      '@version': '01',
      '@type': 'process data set',
    });
    const refMaps = new Map([
      [
        'flow-cache:01:flow data set',
        {
          stateCode: 30,
          ruleVerification: false,
        },
      ],
    ]);

    await checkReferences(
      [
        {
          '@refObjectId': 'flow-cache',
          '@version': '01',
          '@type': 'flow data set',
        },
      ],
      refMaps,
      'team-1',
      [],
      [],
      [],
      [],
      parentPath,
    );

    expect(mockGetRefData).not.toHaveBeenCalled();
    expect(parentPath.children).toHaveLength(1);
    expect(parentPath.children[0]).toMatchObject({
      '@refObjectId': 'flow-cache',
      '@version': '01',
    });
  });

  it('checks nested references directly from orderedJson without reloading the root detail', async () => {
    mockGetRefData.mockResolvedValue({
      success: true,
      data: {
        id: 'flow-nested',
        stateCode: 10,
        ruleVerification: true,
        json: {},
      },
    });

    const parentPath = new ReffPath({
      '@refObjectId': 'root-flow',
      '@version': '01',
      '@type': 'flow data set',
    });
    const unRuleVerification: any[] = [];
    const nonExistent: any[] = [];

    await checkData(
      {
        '@refObjectId': 'root-flow',
        '@version': '01',
        '@type': 'flow data set',
      },
      unRuleVerification,
      nonExistent,
      parentPath,
      {
        orderedJson: {
          flowDataSet: {
            administrativeInformation: {
              dataEntryBy: {
                'common:referenceToDataSetFormat': {
                  '@refObjectId': 'flow-nested',
                  '@version': '01',
                  '@type': 'flow data set',
                },
              },
            },
          },
        },
        userTeamId: 'team-1',
      },
    );

    expect(mockGetRefData).toHaveBeenCalledWith('flow-nested', '01', 'flows', 'team-1', {
      fallbackToLatest: false,
    });
    expect(mockGetRefData).not.toHaveBeenCalledWith('root-flow', '01', 'flows', 'team-1', {
      fallbackToLatest: false,
    });
  });

  it('ignores another reviewed version in the recursive ordered-json reference chain', async () => {
    mockGetRefData.mockResolvedValue({
      success: true,
      data: {
        id: 'source-review',
        stateCode: 10,
        ruleVerification: true,
        json: {},
      },
    });
    mockGetRefDataByIds.mockImplementation(async (_ids: string[], tableName: string) => ({
      data:
        tableName === 'sources'
          ? [
              {
                id: 'source-review',
                version: '02',
                state_code: 20,
              },
            ]
          : [],
    }));

    const rootRef = {
      '@refObjectId': 'root-flow',
      '@version': '01',
      '@type': 'flow data set',
    } as const;
    const path = new ReffPath(rootRef);

    await checkData(rootRef, [], [], path, {
      actionFrom: 'review',
      orderedJson: {
        flowDataSet: {
          administrativeInformation: {
            dataEntryBy: {
              'common:referenceToDataSetFormat': {
                '@refObjectId': 'source-review',
                '@version': '01',
                '@type': 'source data set',
              },
            },
          },
        },
      },
    });

    expect(mockGetRefData).toHaveBeenCalledWith('source-review', '01', 'sources', '', {
      fallbackToLatest: true,
    });
    expect(mockGetRefDataByIds).toHaveBeenCalledWith(['source-review'], 'sources');
    expect(path.findProblemNodes('review')).toEqual([
      expect.objectContaining({
        '@refObjectId': 'root-flow',
        ruleVerification: false,
      }),
    ]);
    expect((path.children[0] as any).versionUnderReview).toBeUndefined();
  });

  it('returns early when orderedJson contains no additional references', async () => {
    const parentPath = new ReffPath({
      '@refObjectId': 'root-flow',
      '@version': '01',
      '@type': 'flow data set',
    });

    await checkData(
      {
        '@refObjectId': 'root-flow',
        '@version': '01',
        '@type': 'flow data set',
      },
      [],
      [],
      parentPath,
      {
        orderedJson: {
          flowDataSet: {
            flowInformation: {
              dataSetInformation: {
                'common:UUID': 'root-flow',
              },
            },
          },
        },
      },
    );

    expect(mockGetRefData).not.toHaveBeenCalled();
    expect(parentPath.children).toEqual([]);
  });

  it('expands same-model process references and reuses existing classification buckets', async () => {
    const unReview: any[] = [
      { '@refObjectId': 'proc-same', '@version': '01', '@type': 'process data set' },
    ];
    const underReview: any[] = [
      { '@refObjectId': 'child-under', '@version': '01', '@type': 'flow data set' },
    ];
    const unRuleVerification: any[] = [
      { '@refObjectId': 'proc-same', '@version': '01', '@type': 'process data set' },
    ];

    mockGetRefData.mockImplementation(async (id: string) => {
      if (id === 'proc-same') {
        return {
          success: true,
          data: {
            id: 'proc-same',
            stateCode: 10,
            ruleVerification: false,
            json: {},
          },
        };
      }
      if (id === 'child-under') {
        return {
          success: true,
          data: {
            id: 'child-under',
            stateCode: 30,
            ruleVerification: true,
            json: {},
          },
        };
      }
      return { success: false, data: null };
    });
    mockGetLifeCycleModelDetail.mockResolvedValue({
      success: true,
      data: {
        id: 'model-same',
        version: '01',
        stateCode: 10,
        ruleVerification: false,
        json: {
          child: {
            '@refObjectId': 'child-under',
            '@version': '01',
            '@type': 'flow data set',
          },
        },
      },
    });

    await checkReferences(
      [{ '@refObjectId': 'proc-same', '@version': '01', '@type': 'process data set' }],
      new Map(),
      'team-1',
      unReview,
      underReview,
      unRuleVerification,
      [],
    );

    expect(mockGetLifeCycleModelDetail).toHaveBeenCalledWith('proc-same', '01');
    expect(unReview).toEqual(
      expect.arrayContaining([
        { '@refObjectId': 'proc-same', '@version': '01', '@type': 'process data set' },
        {
          '@refObjectId': 'model-same',
          '@version': '01',
          '@type': 'lifeCycleModel data set',
        },
      ]),
    );
    expect(unRuleVerification).toEqual(
      expect.arrayContaining([
        { '@refObjectId': 'proc-same', '@version': '01', '@type': 'process data set' },
        {
          '@refObjectId': 'model-same',
          '@version': '01',
          '@type': 'lifeCycleModel data set',
        },
      ]),
    );
    expect(underReview).toEqual([
      { '@refObjectId': 'child-under', '@version': '01', '@type': 'flow data set' },
    ]);
  });

  it('avoids duplicating existing unresolved references and attaches missing refs to the path', async () => {
    const rootPath = new ReffPath({
      '@refObjectId': 'root',
      '@version': '01',
      '@type': 'process data set',
    });
    const duplicateRef = {
      '@refObjectId': 'dup-flow',
      '@version': '01',
      '@type': 'flow data set',
    };
    const missingRef = {
      '@refObjectId': 'missing-flow',
      '@version': '01',
      '@type': 'flow data set',
    };

    mockGetRefData.mockImplementation(async (id: string) => {
      if (id === 'dup-flow') {
        return {
          success: true,
          data: {
            id,
            stateCode: 10,
            ruleVerification: false,
            json: {},
          },
        };
      }
      return { success: false, data: null };
    });
    mockGetLifeCycleModelDetail.mockResolvedValue({ success: false, data: null });

    const unReview = [duplicateRef];
    const underReview: any[] = [];
    const unRuleVerification = [duplicateRef];
    const nonExistentRef = [missingRef];

    await checkReferences(
      [duplicateRef, missingRef],
      new Map(),
      'team-1',
      unReview,
      underReview,
      unRuleVerification,
      nonExistentRef,
      rootPath,
    );

    expect(unReview).toHaveLength(1);
    expect(unRuleVerification).toHaveLength(1);
    expect(nonExistentRef).toHaveLength(1);
    expect(rootPath.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ '@refObjectId': 'dup-flow' }),
        expect.objectContaining({ '@refObjectId': 'missing-flow', nonExistent: true }),
      ]),
    );
  });

  it('deduplicates existing under-review references', async () => {
    const ref = {
      '@refObjectId': 'under-review-flow',
      '@version': '01',
      '@type': 'flow data set',
    };

    mockGetRefData.mockResolvedValue({
      success: true,
      data: {
        id: 'under-review-flow',
        stateCode: 30,
        ruleVerification: true,
        json: {},
      },
    });
    mockGetLifeCycleModelDetail.mockResolvedValue({ success: false, data: null });

    const underReview = [ref];

    await checkReferences([ref], new Map(), 'team-1', [], underReview, [], []);

    expect(underReview).toEqual([ref]);
  });

  it('does not persist workflow version-state failures into rule verification', async () => {
    mockGetRefData.mockResolvedValue({
      success: true,
      data: {
        id: 'contact-2',
        stateCode: 30,
        ruleVerification: true,
        json: {},
      },
    });

    const result = await validateDatasetRuleVerification('contact data set', {
      contactDataSet: {
        contactInformation: {
          dataSetInformation: {
            'common:UUID': 'contact-1',
          },
        },
        administrativeInformation: {
          publicationAndOwnership: {
            'common:dataSetVersion': '01.00.000',
            'common:referenceToOwnershipOfDataSet': {
              '@refObjectId': 'contact-2',
              '@type': 'contact data set',
              '@version': '01.00.000',
            },
          },
        },
      },
    });

    expect(result.ruleVerification).toBe(true);
    expect(result.datasetSdkValid).toBe(true);
    expect(result.unRuleVerification).toEqual([]);
    expect(result.nonExistentRef).toEqual([]);
    expect(mockGetRefData).toHaveBeenCalledWith('contact-2', '01.00.000', 'contacts', '', {
      fallbackToLatest: false,
    });
  });

  it('does not let sdk validation mutate the original ordered json', async () => {
    mockCreateContact.mockImplementation((input: any) => ({
      validateEnhanced: () => {
        input.contactDataSet.contactInformation.dataSetInformation['common:name'] = [];
        input.contactDataSet.contactInformation.dataSetInformation['common:synonyms'] = [];
        input.contactDataSet.contactInformation.dataSetInformation['common:generalComment'] = [];
        return {
          success: true,
        };
      },
    }));

    const orderedJson = {
      contactDataSet: {
        contactInformation: {
          dataSetInformation: {
            'common:UUID': 'contact-1',
            'common:shortName': {
              '#text': 'Test Contact',
              '@xml:lang': 'en',
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

    const before = JSON.parse(JSON.stringify(orderedJson));

    const sdkResult = validateDatasetWithSdk('contact data set', orderedJson);
    const ruleResult = await validateDatasetRuleVerification('contact data set', orderedJson);

    expect(sdkResult.success).toBe(true);
    expect(ruleResult.ruleVerification).toBe(true);
    expect(orderedJson).toEqual(before);
    expect(
      Object.prototype.hasOwnProperty.call(
        orderedJson.contactDataSet.contactInformation.dataSetInformation,
        'common:name',
      ),
    ).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(
        orderedJson.contactDataSet.contactInformation.dataSetInformation,
        'common:synonyms',
      ),
    ).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(
        orderedJson.contactDataSet.contactInformation.dataSetInformation,
        'common:generalComment',
      ),
    ).toBe(false);
  });

  it('validates required fields and returns unique tab names', () => {
    const requiredFields = {
      'modellingAndValidation.validation.review': 'validation',
      'modellingAndValidation.complianceDeclarations.compliance': 'complianceDeclarations',
      'common:classification.common:class': 'classification',
    };
    const formData = {
      modellingAndValidation: {
        validation: {
          review: [
            {
              '@type': 'type',
              'common:scope': [{ '@name': 'scope', 'common:method': { '@name': 'method' } }],
              'common:reviewDetails': ['detail'],
            },
          ],
        },
        complianceDeclarations: {
          compliance: [
            {
              foo: 'bar',
              'common:referenceToComplianceSystem': {
                '@refObjectId': 'sys',
              },
            },
          ],
        },
      },
      'common:classification': {
        'common:class': {
          id: ['', ''],
        },
      },
    };

    const result = checkRequiredFields(requiredFields, formData);

    expect(result.checkResult).toBe(false);
    expect(result.errTabNames).toEqual(['classification']);
  });

  it('flags missing validation and compliance payloads', () => {
    const result = checkRequiredFields(
      {
        'modellingAndValidation.validation.review': 'validation',
        'modellingAndValidation.complianceDeclarations.compliance': 'complianceDeclarations',
      },
      { modellingAndValidation: {} },
    );

    expect(result).toEqual({
      checkResult: false,
      errTabNames: ['validation', 'complianceDeclarations'],
    });
  });

  it('flags malformed validation rows', () => {
    const result = checkRequiredFields(
      {
        'modellingAndValidation.validation.review': 'validation',
      },
      {
        modellingAndValidation: {
          validation: {
            review: [
              {
                '@type': 'type',
                'common:scope': [{ '@name': 'scope', 'common:method': {} }],
                'common:reviewDetails': [],
              },
            ],
          },
        },
      },
    );

    expect(result).toEqual({
      checkResult: false,
      errTabNames: ['validation'],
    });
  });

  it('flags malformed compliance rows across null, missing-ref, and null-value cases', () => {
    const nullItemResult = checkRequiredFields(
      {
        'modellingAndValidation.complianceDeclarations.compliance': 'complianceDeclarations',
      },
      {
        modellingAndValidation: {
          complianceDeclarations: {
            compliance: [null],
          },
        },
      },
    );
    const missingRefResult = checkRequiredFields(
      {
        'modellingAndValidation.complianceDeclarations.compliance': 'complianceDeclarations',
      },
      {
        modellingAndValidation: {
          complianceDeclarations: {
            compliance: [
              {
                'common:referenceToComplianceSystem': {},
              },
            ],
          },
        },
      },
    );
    const nullValueResult = checkRequiredFields(
      {
        'modellingAndValidation.complianceDeclarations.compliance': 'complianceDeclarations',
      },
      {
        modellingAndValidation: {
          complianceDeclarations: {
            compliance: [
              {
                foo: null,
                'common:referenceToComplianceSystem': {
                  '@refObjectId': 'ref-1',
                },
              },
            ],
          },
        },
      },
    );

    expect(nullItemResult.errTabNames).toEqual(['complianceDeclarations']);
    expect(missingRefResult.errTabNames).toEqual(['complianceDeclarations']);
    expect(nullValueResult.errTabNames).toEqual(['complianceDeclarations']);
  });

  it('flags empty forms and generic missing, array, and object fields', () => {
    expect(checkRequiredFields({ foo: 'fooTab' }, {})).toEqual({
      checkResult: false,
      errTabNames: [],
    });

    expect(
      checkRequiredFields(
        {
          foo: 'fooTab',
          bar: 'barTab',
          baz: 'bazTab',
          qux: 'quxTab',
          'nested.value': 'nestedTab',
        },
        {
          bar: [],
          baz: {},
          qux: { a: null },
          nested: {},
        } as any,
      ),
    ).toEqual({
      checkResult: false,
      errTabNames: ['fooTab', 'barTab', 'bazTab', 'quxTab', 'nestedTab'],
    });

    expect(checkRequiredFields({ 'nested.value': 'nestedTab' }, 'text' as any)).toEqual({
      checkResult: false,
      errTabNames: ['nestedTab'],
    });
  });

  it('falls back to empty tab labels when required field metadata is missing', () => {
    expect(
      checkRequiredFields(
        {
          'common:classification.common:class': undefined,
          foo: undefined,
          bar: undefined,
          baz: undefined,
          qux: undefined,
        },
        {
          'common:classification': {
            'common:class': {},
          },
          bar: [],
          baz: {},
          qux: { a: undefined },
        } as any,
      ),
    ).toEqual({
      checkResult: true,
      errTabNames: [],
    });

    expect(
      checkRequiredFields(
        {
          foo: 'fooTab',
          'common:classification.common:class': undefined,
        },
        {
          foo: 'present',
        } as any,
      ),
    ).toEqual({
      checkResult: true,
      errTabNames: [],
    });
  });

  it('locates tab for erroneous reference', () => {
    const ref = {
      '@refObjectId': 'ref-10',
      '@version': '01',
      '@type': 'source data set',
    };
    const data = {
      modellingAndValidation: {
        complianceDeclarations: {
          compliance: [ref],
        },
      },
    };

    expect(getErrRefTab(ref, data)).toBe('modellingAndValidation');
  });

  it('returns null for empty refs and handles circular objects', () => {
    const circular: any = { foo: {} };
    circular.foo.self = circular.foo;

    expect(getErrRefTab(null as any, circular)).toBeNull();
    expect(
      getErrRefTab(
        {
          '@refObjectId': 'missing',
          '@version': '01',
          '@type': 'source data set',
        },
        circular,
      ),
    ).toBeNull();
    expect(
      getErrRefTab(
        {
          '@refObjectId': 'foo',
          '@version': '01',
          '@type': 'source data set',
        },
        {
          '@refObjectId': 'foo',
          '@version': '01',
          '@type': 'source data set',
        },
      ),
    ).toBeNull();
  });

  it('collects problem nodes from reference path', () => {
    const parent = new ReffPath(
      {
        '@refObjectId': 'parent',
        '@version': '01',
        '@type': 'flow data set',
      },
      true,
      false,
    );
    const child = new ReffPath(
      {
        '@refObjectId': 'child',
        '@version': '01',
        '@type': 'flow data set',
      },
      false,
      false,
    );
    parent.addChild(child);

    expect(parent.findProblemNodes()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ '@refObjectId': 'child' }),
        expect.objectContaining({ '@refObjectId': 'parent' }),
      ]),
    );
  });

  it('ignores another under-review version in review mode', () => {
    const parent = new ReffPath(
      {
        '@refObjectId': 'parent',
        '@version': '01',
        '@type': 'flow data set',
      },
      true,
      false,
    );
    const child = new ReffPath(
      {
        '@refObjectId': 'child',
        '@version': '01',
        '@type': 'flow data set',
      },
      true,
      false,
    );
    parent.addChild(child);

    parent.set(
      {
        '@refObjectId': 'child',
        '@version': '01',
        '@type': 'flow data set',
      },
      'versionUnderReview',
      true,
    );
    parent.set(
      {
        '@refObjectId': 'child',
        '@version': '01',
        '@type': 'flow data set',
      },
      'underReviewVersion',
      '02',
    );

    expect(parent.findProblemNodes('review')).toEqual([]);
  });

  it('allows the exact referenced version to remain under review during root submission', () => {
    const root = new ReffPath(
      {
        '@refObjectId': 'root-process',
        '@version': '01',
        '@type': 'process data set',
      },
      true,
      false,
    );
    const referencedContact = new ReffPath(
      {
        '@refObjectId': 'contact-under-review',
        '@version': '01',
        '@type': 'contact data set',
      },
      true,
      false,
    );
    root.addChild(referencedContact);
    root.set(
      {
        '@refObjectId': 'contact-under-review',
        '@version': '01',
        '@type': 'contact data set',
      },
      'versionUnderReview',
      true,
    );
    root.set(
      {
        '@refObjectId': 'contact-under-review',
        '@version': '01',
        '@type': 'contact data set',
      },
      'underReviewVersion',
      '01',
    );

    expect(root.findProblemNodes('review')).toEqual([]);
  });

  it('keeps the root dataset itself blocked when its exact version is under review', () => {
    const root = new ReffPath(
      {
        '@refObjectId': 'root-process',
        '@version': '01',
        '@type': 'process data set',
      },
      true,
      false,
    );
    root.set(
      {
        '@refObjectId': 'root-process',
        '@version': '01',
        '@type': 'process data set',
      },
      'versionUnderReview',
      true,
    );
    root.set(
      {
        '@refObjectId': 'root-process',
        '@version': '01',
        '@type': 'process data set',
      },
      'underReviewVersion',
      '01',
    );

    expect(root.findProblemNodes('review')).toEqual([
      expect.objectContaining({
        '@refObjectId': 'root-process',
        underReviewVersion: '01',
        versionUnderReview: true,
      }),
    ]);
  });

  it('returns false when setting a ref that does not exist in the path', () => {
    const parent = new ReffPath({
      '@refObjectId': 'parent',
      '@version': '01',
      '@type': 'flow data set',
    });

    expect(() =>
      parent.set(
        {
          '@refObjectId': 'missing',
          '@version': '01',
          '@type': 'flow data set',
        },
        'versionUnderReview',
        true,
      ),
    ).not.toThrow();
    expect((parent as any).versionUnderReview).toBeUndefined();
  });

  it('avoids infinite recursion when set and findProblemNodes encounter cycles', () => {
    const parent = new ReffPath({
      '@refObjectId': 'parent',
      '@version': '01',
      '@type': 'flow data set',
    });
    const child = new ReffPath(
      {
        '@refObjectId': 'child',
        '@version': '01',
        '@type': 'flow data set',
      },
      false,
      false,
    );

    parent.addChild(child);
    child.addChild(parent);

    expect(() =>
      parent.set(
        {
          '@refObjectId': 'missing',
          '@version': '01',
          '@type': 'flow data set',
        },
        'versionUnderReview',
        true,
      ),
    ).not.toThrow();
    expect(parent.findProblemNodes()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ '@refObjectId': 'child' }),
        expect.objectContaining({ '@refObjectId': 'parent' }),
      ]),
    );
  });

  it('ignores workflow-only version issues during checkData scans', () => {
    const parent = new ReffPath(
      {
        '@refObjectId': 'parent',
        '@version': '01',
        '@type': 'flow data set',
      },
      true,
      false,
    );
    const child = new ReffPath(
      {
        '@refObjectId': 'child',
        '@version': '01',
        '@type': 'flow data set',
      },
      true,
      false,
    );
    parent.addChild(child);
    parent.set(
      {
        '@refObjectId': 'child',
        '@version': '01',
        '@type': 'flow data set',
      },
      'versionUnderReview',
      true,
    );
    parent.set(
      {
        '@refObjectId': 'child',
        '@version': '01',
        '@type': 'flow data set',
      },
      'underReviewVersion',
      '02',
    );
    parent.set(
      {
        '@refObjectId': 'child',
        '@version': '01',
        '@type': 'flow data set',
      },
      'versionIsInTg',
      true,
    );

    expect(parent.findProblemNodes()).toEqual([]);
  });

  it('includes workflow-only version issues during review scans', () => {
    const parent = new ReffPath(
      {
        '@refObjectId': 'parent',
        '@version': '01',
        '@type': 'flow data set',
      },
      true,
      false,
    );
    const child = new ReffPath(
      {
        '@refObjectId': 'child',
        '@version': '01',
        '@type': 'flow data set',
      },
      true,
      false,
    );
    parent.addChild(child);
    parent.set(
      {
        '@refObjectId': 'child',
        '@version': '01',
        '@type': 'flow data set',
      },
      'versionUnderReview',
      true,
    );
    parent.set(
      {
        '@refObjectId': 'child',
        '@version': '01',
        '@type': 'flow data set',
      },
      'underReviewVersion',
      '02',
    );
    parent.set(
      {
        '@refObjectId': 'child',
        '@version': '01',
        '@type': 'flow data set',
      },
      'versionIsInTg',
      true,
    );

    expect(parent.findProblemNodes('review')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          '@refObjectId': 'child',
          versionUnderReview: true,
          underReviewVersion: '02',
          versionIsInTg: true,
        }),
        expect.objectContaining({ '@refObjectId': 'parent' }),
      ]),
    );
  });

  it('forwards dataset review submission to the dedicated review command API', async () => {
    mockSubmitDatasetReviewApi.mockResolvedValue({ data: [{ review: { id: 'review-1' } }] });

    const result = await submitDatasetReview(
      'processes',
      '11111111-1111-4111-8111-111111111111',
      '01.00.000',
    );

    expect(mockSubmitDatasetReviewApi).toHaveBeenCalledWith(
      'processes',
      '11111111-1111-4111-8111-111111111111',
      '01.00.000',
    );
    expect(result).toEqual({ data: [{ review: { id: 'review-1' } }] });
  });

  it('returns references that remain under review when checking reports', async () => {
    mockGetSourcesByIdsAndVersions.mockResolvedValue({
      data: [
        { id: 'report-1', version: '01', state_code: 30 },
        { id: 'report-2', version: '01', state_code: 100 },
      ],
    });

    const result = await checkReviewReport([
      {
        'common:referenceToCompleteReviewReport': {
          '@refObjectId': 'report-1',
          '@version': '01',
        },
      },
      {
        'common:referenceToCompleteReviewReport': {
          '@refObjectId': 'report-2',
          '@version': '01',
        },
      },
    ]);

    expect(mockGetSourcesByIdsAndVersions).toHaveBeenCalledWith([
      { id: 'report-1', version: '01' },
      { id: 'report-2', version: '01' },
    ]);
    expect(result).toEqual([
      {
        id: 'report-1',
        version: '01',
        stateCode: 30,
      },
    ]);
  });

  it('handles single review reports and empty review reports', async () => {
    mockGetSourcesByIdsAndVersions.mockResolvedValue({
      data: [{ id: 'report-single', version: '02', state_code: 40 }],
    });

    await expect(
      checkReviewReport({
        'common:referenceToCompleteReviewReport': {
          '@refObjectId': 'report-single',
          '@version': '02',
        },
      }),
    ).resolves.toEqual([{ id: 'report-single', version: '02', stateCode: 40 }]);

    await expect(checkReviewReport({ foo: 'bar' })).resolves.toEqual([]);
  });

  it('returns rejected comments for rejected process reviews', async () => {
    mockGetRejectReviewsByProcess.mockResolvedValue({
      data: [{ id: 'review-1' }, { id: 'review-2' }],
      error: null,
    });
    mockGetRejectedCommentsByReviewIds.mockResolvedValue({
      data: [{ json: { foo: 'bar' } }, { json: { baz: 'qux' } }],
      error: null,
    });

    const result = await getRejectedComments('process-1', '1.0.0');

    expect(mockGetRejectReviewsByProcess).toHaveBeenCalledWith('process-1', '1.0.0');
    expect(mockGetRejectedCommentsByReviewIds).toHaveBeenCalledWith(['review-1', 'review-2']);
    expect(result).toEqual([{ foo: 'bar' }, { baz: 'qux' }]);
  });

  it('returns empty rejected comments when inputs or downstream responses are invalid', async () => {
    await expect(getRejectedComments('', '1.0.0')).resolves.toEqual([]);

    mockGetRejectReviewsByProcess.mockResolvedValue({
      data: null,
      error: new Error('review failed'),
    });
    await expect(getRejectedComments('process-1', '1.0.0')).resolves.toEqual([]);

    mockGetRejectReviewsByProcess.mockResolvedValue({
      data: [{ id: 'review-1' }],
      error: null,
    });
    mockGetRejectedCommentsByReviewIds.mockResolvedValue({
      data: null,
      error: new Error('comments failed'),
    });
    await expect(getRejectedComments('process-1', '1.0.0')).resolves.toEqual([]);
  });

  it('merges rejected comments back into modellingAndValidation arrays and scalars', () => {
    const data: any = {
      modellingAndValidation: {
        validation: {
          review: [{ id: 'existing-review' }],
        },
        complianceDeclarations: {
          compliance: { id: 'existing-compliance' },
        },
      },
    };

    mergeCommentsToData(
      [
        {
          modellingAndValidation: {
            validation: {
              review: [{ id: 'new-review' }],
              summary: { id: 'summary-1' },
            },
            complianceDeclarations: {
              compliance: [{ id: 'new-compliance' }],
            },
          },
        },
      ] as any,
      data,
    );

    expect(data.modellingAndValidation.validation.review).toEqual([
      { id: 'existing-review' },
      { id: 'new-review' },
    ]);
    expect(data.modellingAndValidation.validation.summary).toEqual({ id: 'summary-1' });
    expect(data.modellingAndValidation.complianceDeclarations.compliance).toEqual([
      { id: 'new-compliance' },
    ]);
  });

  it('creates missing validation and compliance buckets and merges scalar values into arrays', () => {
    const data: any = {
      modellingAndValidation: {
        validation: {
          summary: [{ id: 'existing-summary' }],
          status: 'existing-status',
        },
        complianceDeclarations: {
          status: [{ id: 'existing-compliance-status' }],
          owner: 'existing-owner',
        },
      },
    };

    mergeCommentsToData(
      [
        {
          modellingAndValidation: {
            validation: {
              review: [{ id: 'review-1' }],
              summary: { id: 'new-summary' },
              status: 'new-status',
            },
            complianceDeclarations: {
              compliance: [{ id: 'compliance-1' }],
              status: { id: 'new-compliance-status' },
              owner: 'new-owner',
            },
          },
        },
      ] as any,
      data,
    );

    expect(data.modellingAndValidation.validation.review).toEqual([{ id: 'review-1' }]);
    expect(data.modellingAndValidation.validation.summary).toEqual([
      { id: 'existing-summary' },
      { id: 'new-summary' },
    ]);
    expect(data.modellingAndValidation.validation.status).toEqual([
      'existing-status',
      'new-status',
    ]);
    expect(data.modellingAndValidation.complianceDeclarations.compliance).toEqual([
      { id: 'compliance-1' },
    ]);
    expect(data.modellingAndValidation.complianceDeclarations.status).toEqual([
      { id: 'existing-compliance-status' },
      { id: 'new-compliance-status' },
    ]);
    expect(data.modellingAndValidation.complianceDeclarations.owner).toEqual([
      'existing-owner',
      'new-owner',
    ]);
  });

  it('copies missing validation and compliance sections directly', () => {
    const data: any = {};

    mergeCommentsToData(
      [
        {
          modellingAndValidation: {
            validation: {
              review: [{ id: 'review-2' }],
            },
            complianceDeclarations: {
              compliance: [{ id: 'compliance-2' }],
            },
          },
        },
      ] as any,
      data,
    );

    expect(data.modellingAndValidation.validation).toEqual({
      review: [{ id: 'review-2' }],
    });
    expect(data.modellingAndValidation.complianceDeclarations).toEqual({
      compliance: [{ id: 'compliance-2' }],
    });
  });

  it('assigns missing scalar compliance fields without wrapping them', () => {
    const data: any = {
      modellingAndValidation: {
        complianceDeclarations: {},
      },
    };

    mergeCommentsToData(
      [
        {
          modellingAndValidation: {
            complianceDeclarations: {
              reviewer: 'reviewer-1',
            },
          },
        },
      ] as any,
      data,
    );

    expect(data.modellingAndValidation.complianceDeclarations.reviewer).toBe('reviewer-1');
  });

  it('ignores comments without modellingAndValidation payloads', () => {
    const data: any = {};

    expect(() => mergeCommentsToData([{} as any], data)).not.toThrow();
    expect(data).toEqual({ modellingAndValidation: {} });
  });

  it('skips lifecycle model process refs when resolving error tabs', () => {
    const ref = {
      '@refObjectId': 'process-1',
      '@version': '01',
      '@type': 'process data set',
    };
    const data = {
      lifeCycleModelInformation: {
        technology: {
          processes: [ref],
        },
      },
    };

    expect(getErrRefTab(ref, data)).toBeNull();
  });
});
