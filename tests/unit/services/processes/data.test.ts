import type {
  ProcessComplianceItem,
  ProcessDetailByVersionResponse,
  ProcessDetailResponse,
  ProcessExchangeTable,
  ProcessFormState,
  ProcessReviewDataQualityIndicatorItem,
  ProcessReviewItem,
  ProcessReviewRecord,
  ProcessReviewScopeItem,
  ProcessTable,
} from '@/services/processes/data';
import {
  getFirstProcessExchangeAllocation,
  resolveProcessModelVersion,
  toProcessModelVersionField,
} from '@/services/processes/data';

describe('processes data shapes', () => {
  it('supports process table rows and exchange table rows used by process pages', () => {
    const process: ProcessTable = {
      key: 'proc-1',
      id: 'proc-1',
      version: '01.00.000',
      lang: 'en',
      name: 'Steel production',
      generalComment: 'Primary route',
      classification: 'Materials',
      referenceYear: '2025',
      location: 'CN',
      modifiedAt: new Date('2026-03-13T00:00:00Z'),
      teamId: 'team-1',
      modelId: 'model-1',
      modelVersion: '01.01.021',
      typeOfDataSet: 'Unit process, single operation',
    };
    const exchange: ProcessExchangeTable = {
      key: 'INPUT:flow-1',
      dataSetInternalID: '1',
      exchangeDirection: 'input',
      referenceToFlowDataSetId: 'flow-1',
      referenceToFlowDataSetVersion: '01.00.000',
      referenceToFlowDataSet: 'Iron ore',
      classification: 'Input flow',
      meanAmount: '10',
      resultingAmount: '10',
      uncertaintyDistributionType: 'normal',
      dataDerivationTypeStatus: 'Measured',
      generalComment: 'Measured input',
      quantitativeReference: false,
      functionalUnitOrOther: '1 kg steel',
      stateCode: 20,
      typeOfDataSet: 'Product flow',
    };

    expect(process.typeOfDataSet).toContain('Unit process');
    expect(resolveProcessModelVersion(process)).toBe('01.01.021');
    expect(resolveProcessModelVersion({ ...process, modelVersion: null })).toBe('01.00.000');
    expect(resolveProcessModelVersion({ ...process, modelVersion: '   ' })).toBe('01.00.000');
    expect(resolveProcessModelVersion({ version: '', modelVersion: undefined })).toBe('');
    expect(toProcessModelVersionField(undefined)).toEqual({});
    expect(toProcessModelVersionField(null)).toEqual({ modelVersion: null });
    expect(toProcessModelVersionField('01.01.021')).toEqual({ modelVersion: '01.01.021' });
    expect(exchange.referenceToFlowDataSetId).toBe('flow-1');
    const allocation = {
      '@internalReferenceToCoProduct': '1',
      '@allocatedFraction': '0.5',
    };
    expect(getFirstProcessExchangeAllocation(allocation)).toBe(allocation);
    expect(getFirstProcessExchangeAllocation([allocation])).toBe(allocation);
    expect(getFirstProcessExchangeAllocation()).toBeUndefined();
  });

  it('supports process detail responses with review logs', () => {
    const review: ProcessReviewRecord = {
      id: 'review-1',
      json: {
        logs: [
          {
            user: { display_name: 'Alice', name: 'alice' },
            time: '2026-03-13T10:00:00Z',
            action: 'approved',
          },
        ],
      },
    };
    const response: ProcessDetailResponse = {
      success: true,
      data: {
        id: 'proc-2',
        version: '02.00.000',
        modifiedAt: '2026-03-13T00:00:00Z',
        stateCode: 30,
        ruleVerification: true,
        teamId: 'team-2',
        reviews: [review],
      },
    };

    expect(response.data?.reviews?.[0].json?.logs?.[0].action).toBe('approved');
    expect(response.data?.teamId).toBe('team-2');
  });

  it('supports review and compliance payload fragments used inside process forms', () => {
    const scope: ProcessReviewScopeItem = {
      '@name': 'Goal and scope definition',
      'common:method': [{ '@name': 'Validation of data sources' }],
    };
    const dqi: ProcessReviewDataQualityIndicatorItem = {
      '@name': 'Overall quality',
      '@value': 'Good',
    };
    const review: ProcessReviewItem = {
      '@type': 'Internal',
      'common:scope': [scope],
      'common:dataQualityIndicators': {
        'common:dataQualityIndicator': [dqi],
      },
      'common:reviewDetails': [{ '@xml:lang': 'en', '#text': 'Review details' }],
    };
    const compliance: ProcessComplianceItem = {
      'common:referenceToComplianceSystem': {
        '@refObjectId': 'source-1',
      },
      'common:approvalOfOverallCompliance': 'Fully compliant',
      'common:qualityCompliance': 'Fully compliant',
    };
    const formState: ProcessFormState = {
      id: 'proc-3',
      stateCode: 20,
      ruleVerification: true,
      processInformation: {
        dataSetInformation: {
          'common:UUID': 'proc-3',
        },
      } as any,
      modellingAndValidation: {} as any,
      administrativeInformation: {} as any,
      exchanges: {} as any,
    };

    expect(review['common:scope']).toHaveLength(1);
    expect(
      (review['common:dataQualityIndicators']?.['common:dataQualityIndicator'] as any[])[0][
        '@value'
      ],
    ).toBe('Good');
    expect(compliance['common:approvalOfOverallCompliance']).toBe('Fully compliant');
    expect(formState.id).toBe('proc-3');
  });

  it('supports detail-by-version responses used by version drawers', () => {
    const response: ProcessDetailByVersionResponse = {
      success: true,
      data: [
        {
          id: 'proc-4',
          version: '03.00.000',
          json: {
            processDataSet: {
              processInformation: {
                dataSetInformation: {
                  'common:UUID': 'proc-4',
                },
              },
            } as any,
          },
          modified_at: '2026-03-13T00:00:00Z',
          state_code: 30,
        },
      ],
    };

    expect(response.data[0].state_code).toBe(30);
    expect(
      response.data[0].json?.processDataSet?.processInformation?.dataSetInformation?.[
        'common:UUID'
      ],
    ).toBe('proc-4');
  });
});
