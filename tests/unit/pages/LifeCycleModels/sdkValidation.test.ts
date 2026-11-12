import {
  getLifeCycleModelSdkIssueTabName,
  lifeCycleModelSdkValidationTestUtils,
  normalizeLifeCycleModelProcessInstanceSdkValidationDetails,
  normalizeLifeCycleModelSdkValidationDetails,
} from '@/pages/LifeCycleModels/sdkValidation';
import { LOCALE_CAPABILITY_MATRIX } from '@/services/general/localeCapabilities';

describe('LifeCycleModels sdkValidation', () => {
  it('keeps ordinary metadata and unknown paths separate from reviewer tabs', () => {
    expect(getLifeCycleModelSdkIssueTabName()).toBeUndefined();
    expect(getLifeCycleModelSdkIssueTabName([0])).toBeUndefined();
    expect(
      getLifeCycleModelSdkIssueTabName(['lifeCycleModelDataSet', 'administrativeInformation']),
    ).toBe('administrativeInformation');
    expect(getLifeCycleModelSdkIssueTabName(['modellingAndValidation'])).toBe(
      'modellingAndValidation',
    );
    expect(getLifeCycleModelSdkIssueTabName(['other', 'complianceDeclarations'])).toBe('other');
  });
  it.each([
    ['validation', [], 'validation'],
    ['validation', ['review', 0, '@type'], 'validation'],
    ['complianceDeclarations', [], 'complianceDeclarations'],
    ['complianceDeclarations', [0, 'compliance', 0], 'complianceDeclarations'],
    ['dataSourcesTreatmentEtc', ['useAdviceForDataSet'], 'modellingAndValidation'],
  ])('maps %s SDK errors to their actual form tab', (section, suffix, tabName) => {
    const details = normalizeLifeCycleModelSdkValidationDetails(
      [
        {
          code: 'required_missing',
          path: ['lifeCycleModelDataSet', 'modellingAndValidation', section, ...suffix],
        },
      ],
      { lifeCycleModelDataSet: {} },
    );
    expect(details).toHaveLength(1);
    expect(details[0].tabName).toBe(tabName);
  });

  const {
    getProcessInstanceDisplayLabel,
    toLocaleLang,
    toProcessInstanceFieldDetail,
    toProcessInstanceList,
  } = lifeCycleModelSdkValidationTestUtils;

  it('covers locale and process-instance helper fallbacks', () => {
    expect(toLocaleLang()).toBe('en');
    LOCALE_CAPABILITY_MATRIX.forEach(({ appLocale, contentLanguage }) => {
      if (!contentLanguage) {
        throw new Error(`Missing content capability for ${appLocale}.`);
      }
      expect(toLocaleLang(appLocale)).toBe(contentLanguage);
    });
    expect(toProcessInstanceList(null)).toEqual([]);
    expect(toProcessInstanceList({ '@dataSetInternalID': 'node-1' })).toEqual([
      { '@dataSetInternalID': 'node-1' },
    ]);

    expect(
      getProcessInstanceDisplayLabel(
        {
          '@dataSetInternalID': 'node-2',
          referenceToProcess: {
            'common:shortDescription': [],
            '@refObjectId': 'process-ref-2',
          },
        },
        'en-US',
      ),
    ).toBe('process-ref-2');
    expect(
      getProcessInstanceDisplayLabel(
        {
          '@dataSetInternalID': 'node-3',
          referenceToProcess: {
            'common:shortDescription': [],
            '@refObjectId': undefined,
          },
        },
        'en-US',
      ),
    ).toBe('node-3');
    expect(
      toProcessInstanceFieldDetail(
        {
          fieldPath: 'lifeCycleModelInformation.technology.processes.processInstance.0',
          formName: ['lifeCycleModelInformation', 'technology', 'processes', 'processInstance', 0],
          key: 'detail-key',
        } as any,
        {
          lifeCycleModelDataSet: {
            lifeCycleModelInformation: {
              technology: {
                processes: {
                  processInstance: [{}],
                },
              },
            },
          },
        },
        'en-US',
      ),
    ).toBeNull();
    expect(
      toProcessInstanceFieldDetail(
        {
          fieldPath:
            'lifeCycleModelInformation.technology.processes.processInstance.0.referenceToProcess.@refObjectId',
          formName: ['lifeCycleModelInformation', 'technology', 'processes', 'processInstance', 0],
          key: 'detail-key',
          rawCode: 'raw_process_instance_code',
        } as any,
        {
          lifeCycleModelDataSet: {
            lifeCycleModelInformation: {
              technology: {
                processes: {
                  processInstance: [
                    {
                      '@dataSetInternalID': 'node-10',
                      referenceToProcess: {
                        '@refObjectId': 'process-ref-10',
                      },
                    },
                  ],
                },
              },
            },
          },
        },
        'en-US',
      ),
    ).toMatchObject({
      fieldPath: 'processInstance[#node-10].referenceToProcess.@refObjectId',
      formName: [],
      key: expect.stringContaining('raw_process_instance_code'),
    });
    expect(
      toProcessInstanceFieldDetail(
        {
          fieldPath: 'lifeCycleModelInformation.technology.processes.processInstance.0',
          formName: ['lifeCycleModelInformation', 'technology', 'processes', 'processInstance', 0],
          key: 'detail-key',
          rawCode: 'raw_process_instance_code',
        } as any,
        {
          lifeCycleModelDataSet: {
            lifeCycleModelInformation: {
              technology: {
                processes: {
                  processInstance: [
                    {
                      '@dataSetInternalID': 'node-11',
                    },
                  ],
                },
              },
            },
          },
        },
        'en-US',
      ),
    ).toMatchObject({
      fieldPath: 'processInstance[#node-11]',
      formName: [],
    });
  });

  it('keeps only metadata issues for the form-level validation list', () => {
    const details = normalizeLifeCycleModelSdkValidationDetails(
      [
        {
          code: 'required_missing',
          path: [
            'lifeCycleModelDataSet',
            'lifeCycleModelInformation',
            'dataSetInformation',
            'common:name',
          ],
        },
        {
          code: 'required_missing',
          path: [
            'lifeCycleModelDataSet',
            'lifeCycleModelInformation',
            'technology',
            'processes',
            'processInstance',
            0,
            'referenceToProcess',
            '@refObjectId',
          ],
        },
      ],
      {
        lifeCycleModelDataSet: {
          lifeCycleModelInformation: {
            dataSetInformation: {
              'common:name': undefined,
            },
            technology: {
              processes: {
                processInstance: [
                  {
                    '@dataSetInternalID': 'node-1',
                  },
                ],
              },
            },
          },
        },
      },
    );

    expect(details).toEqual([
      expect.objectContaining({
        fieldPath: 'lifeCycleModelInformation.dataSetInformation.common:name',
        formName: ['lifeCycleModelInformation', 'dataSetInformation', 'common:name'],
        tabName: 'lifeCycleModelInformation',
      }),
    ]);
  });

  it('accepts metadata issue paths that are already relative to the dataset root', () => {
    const details = normalizeLifeCycleModelSdkValidationDetails(
      [
        {
          code: 'required_missing',
          path: ['modellingAndValidation', 'common:dataSetVersion'],
        },
      ],
      {
        lifeCycleModelDataSet: {
          modellingAndValidation: {
            'common:dataSetVersion': undefined,
          },
        },
      },
    );

    expect(details).toEqual([
      expect.objectContaining({
        fieldPath: 'modellingAndValidation.common:dataSetVersion',
        formName: ['modellingAndValidation', 'common:dataSetVersion'],
        tabName: 'modellingAndValidation',
      }),
    ]);
  });

  it('maps classification existence issues to the classification showValue field', () => {
    const details = normalizeLifeCycleModelSdkValidationDetails(
      [
        {
          code: 'custom',
          message: 'Classification does not exist',
          path: [
            'lifeCycleModelDataSet',
            'lifeCycleModelInformation',
            'dataSetInformation',
            'classificationInformation',
            'common:classification',
            'common:class',
            0,
            '@classId',
          ],
        },
      ],
      {
        lifeCycleModelDataSet: {
          lifeCycleModelInformation: {
            dataSetInformation: {
              classificationInformation: {
                'common:classification': {
                  'common:class': [
                    {
                      '@classId': 'missing-classification',
                    },
                  ],
                },
              },
            },
          },
        },
      },
    );

    expect(details).toEqual([
      expect.objectContaining({
        fieldLabel: 'Classification',
        fieldPath:
          'lifeCycleModelInformation.dataSetInformation.classificationInformation.common:classification.common:class.showValue',
        formName: [
          'lifeCycleModelInformation',
          'dataSetInformation',
          'classificationInformation',
          'common:classification',
          'common:class',
          'showValue',
        ],
        tabName: 'lifeCycleModelInformation',
        validationCode: 'custom',
      }),
    ]);
  });

  it('ignores non-metadata roots when building the form-level validation list', () => {
    expect(
      normalizeLifeCycleModelSdkValidationDetails(
        [
          {
            code: 'required_missing',
            path: ['otherTab', 'common:dataSetVersion'],
          },
        ],
        {
          lifeCycleModelDataSet: {
            otherTab: {
              'common:dataSetVersion': undefined,
            },
          },
        },
      ),
    ).toEqual([]);
  });

  it('maps process-instance issues to graph-node dataset internal ids', () => {
    const details = normalizeLifeCycleModelProcessInstanceSdkValidationDetails(
      [
        {
          code: 'required_missing',
          path: [
            'lifeCycleModelDataSet',
            'lifeCycleModelInformation',
            'technology',
            'processes',
            'processInstance',
            0,
            'referenceToProcess',
            '@refObjectId',
          ],
        },
      ],
      {
        lifeCycleModelDataSet: {
          lifeCycleModelInformation: {
            technology: {
              processes: {
                processInstance: [
                  {
                    '@dataSetInternalID': 'node-1',
                    referenceToProcess: {
                      'common:shortDescription': [
                        {
                          '@xml:lang': 'zh',
                          '#text': '过程一',
                        },
                        {
                          '@xml:lang': 'en',
                          '#text': 'Process One',
                        },
                      ],
                      '@refObjectId': undefined,
                    },
                  },
                ],
              },
            },
          },
        },
      },
      'zh-CN',
    );

    expect(details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldPath: 'processInstance[#node-1].referenceToProcess.@refObjectId',
          formName: ['referenceToProcess', '@refObjectId'],
          presentation: 'highlight-only',
          processInstanceInternalId: 'node-1',
          processInstanceLabel: '过程一',
          tabName: 'lifeCycleModelInformation',
        }),
      ]),
    );
  });

  it('falls back to unknown tab and validation codes when process-instance detail metadata is blank', () => {
    expect(
      toProcessInstanceFieldDetail(
        {
          fieldPath:
            'lifeCycleModelInformation.technology.processes.processInstance.0.referenceToProcess.@refObjectId',
          formName: [
            'lifeCycleModelInformation',
            'technology',
            'processes',
            'processInstance',
            0,
            'referenceToProcess',
            '@refObjectId',
          ],
          key: 'detail-key',
          rawCode: '   ',
          tabName: '   ',
          validationCode: '   ',
        } as any,
        {
          lifeCycleModelDataSet: {
            lifeCycleModelInformation: {
              technology: {
                processes: {
                  processInstance: [
                    {
                      '@dataSetInternalID': 'node-10',
                      referenceToProcess: {
                        '@refObjectId': 'process-ref-10',
                      },
                    },
                  ],
                },
              },
            },
          },
        },
        'en-US',
      ),
    ).toMatchObject({
      fieldPath: 'processInstance[#node-10].referenceToProcess.@refObjectId',
      formName: ['referenceToProcess', '@refObjectId'],
      key: expect.stringContaining(
        'unknown:node-10:processInstance[#node-10].referenceToProcess.@refObjectId:unknown',
      ),
    });
  });

  it('keeps non-indexed process-instance issues as generic fallbacks', () => {
    const details = normalizeLifeCycleModelProcessInstanceSdkValidationDetails(
      [
        {
          code: 'required_missing',
          path: ['lifeCycleModelDataSet', 'processInstance'],
        },
      ],
      {
        lifeCycleModelDataSet: {
          lifeCycleModelInformation: {
            technology: {
              processes: {
                processInstance: [],
              },
            },
          },
        },
      },
    );

    expect(details).toEqual([]);
  });

  it('falls back from localized labels to reference ids and node ids for process instances', () => {
    const refIdDetails = normalizeLifeCycleModelProcessInstanceSdkValidationDetails(
      [
        {
          code: 'required_missing',
          path: [
            'lifeCycleModelDataSet',
            'lifeCycleModelInformation',
            'technology',
            'processes',
            'processInstance',
            0,
            'referenceToProcess',
            '@refObjectId',
          ],
        },
      ],
      {
        lifeCycleModelDataSet: {
          lifeCycleModelInformation: {
            technology: {
              processes: {
                processInstance: [
                  {
                    '@dataSetInternalID': 'node-2',
                    referenceToProcess: {
                      'common:shortDescription': [
                        {
                          '@xml:lang': 'en',
                          '#text': '-',
                        },
                      ],
                      '@refObjectId': 'process-ref-2',
                    },
                  },
                ],
              },
            },
          },
        },
      },
      'en-US',
    );

    const nodeIdDetails = normalizeLifeCycleModelProcessInstanceSdkValidationDetails(
      [
        {
          code: 'required_missing',
          path: [
            'lifeCycleModelDataSet',
            'lifeCycleModelInformation',
            'technology',
            'processes',
            'processInstance',
            0,
            'referenceToProcess',
            '@refObjectId',
          ],
        },
      ],
      {
        lifeCycleModelDataSet: {
          lifeCycleModelInformation: {
            technology: {
              processes: {
                processInstance: [
                  {
                    '@dataSetInternalID': 'node-3',
                    referenceToProcess: {
                      'common:shortDescription': [],
                      '@refObjectId': undefined,
                    },
                  },
                ],
              },
            },
          },
        },
      },
    );

    expect(refIdDetails).toEqual([
      expect.objectContaining({
        processInstanceInternalId: 'node-2',
        processInstanceLabel: 'process-ref-2',
      }),
    ]);
    expect(nodeIdDetails).toEqual([
      expect.objectContaining({
        processInstanceInternalId: 'node-3',
        processInstanceLabel: 'node-3',
      }),
    ]);
  });
});
