import { deriveProcessSite, processSiteFromRow } from '@/services/processes/siteLabel';

const text = (value: string) => [{ '@xml:lang': 'en', '#text': value }];

const evidence = (
  geography: unknown,
  referenceComment: unknown,
  options: { direction?: string; technology?: unknown; referenceId?: string } = {},
) => ({
  descriptionOfRestrictions: geography,
  referenceToReferenceFlow: options.referenceId ?? '6',
  exchanges: [
    {
      '@dataSetInternalID': '5',
      exchangeDirection: 'Output',
      generalComment: text('Factory Z99'),
    },
    {
      '@dataSetInternalID': '6',
      exchangeDirection: options.direction ?? 'Output',
      generalComment: referenceComment,
    },
  ],
  technologyDescription: options.technology,
});

describe('Process site labels', () => {
  it('shows a geography site only when the reference output confirms its normalized code', () => {
    expect(deriveProcessSite(evidence(text('Z03工厂同一名称的工艺过程'), text('Coke z3')))).toEqual(
      {
        status: 'verified',
        code: 'Z03',
      },
    );
    expect(
      deriveProcessSite(evidence(text('The same-named process in Factory Z17'), text('Z17: 1 t'))),
    ).toEqual({ status: 'verified', code: 'Z17' });
  });

  it('does not assert a geography code that conflicts with the reference output', () => {
    expect(deriveProcessSite(evidence(text('Factory Z13'), text('Coke z12')))).toEqual({
      status: 'needs_review',
    });
    expect(
      deriveProcessSite(
        evidence(text('Factory D01'), text('D01 product'), { technology: text('Factory Z17') }),
      ),
    ).toEqual({ status: 'needs_review' });
    expect(
      deriveProcessSite(
        evidence(text('Factory D01'), text('D01 product'), { technology: text('Process Z17') }),
      ),
    ).toEqual({ status: 'needs_review' });
  });

  it('does not treat a negated code mention as positive reference evidence', () => {
    expect(
      deriveProcessSite(
        evidence(text('Factory Z12'), text('The moisture assumption is not measured for case Z12')),
      ),
    ).toEqual({ status: 'needs_review' });
    expect(deriveProcessSite(evidence(text('Z12工厂'), text('该条件非Z12实测')))).toEqual({
      status: 'needs_review',
    });
  });

  it('marks a site for review when the reference evidence is missing, ambiguous, or not an output', () => {
    expect(deriveProcessSite(evidence(text('Z12 factory'), []))).toEqual({
      status: 'needs_review',
    });
    expect(deriveProcessSite(evidence(text('anonymous steelworks Z12'), []))).toEqual({
      status: 'needs_review',
    });
    expect(deriveProcessSite(evidence(text('steel plant code Z07'), []))).toEqual({
      status: 'needs_review',
    });
    expect(deriveProcessSite(evidence(text('匿名钢铁企业代码Z07'), []))).toEqual({
      status: 'needs_review',
    });
    expect(deriveProcessSite(evidence(text('Z12为中国匿名钢铁企业'), []))).toEqual({
      status: 'needs_review',
    });
    expect(deriveProcessSite(evidence(text('Z12 is an anonymous Chinese steelworks'), []))).toEqual(
      {
        status: 'needs_review',
      },
    );
    expect(deriveProcessSite(evidence(text('Factory Z12'), text('Z12 and Z13')))).toEqual({
      status: 'needs_review',
    });
    expect(
      deriveProcessSite(evidence(text('Factory Z12'), text('Z12'), { direction: 'Input' })),
    ).toEqual({ status: 'needs_review' });
    expect(
      deriveProcessSite(evidence(text('Factory Z12'), text('Z12'), { referenceId: '7' })),
    ).toEqual({ status: 'needs_review' });
  });

  it('omits a site label when geography has no explicit factory code', () => {
    expect(deriveProcessSite(evidence(text('Jiangsu Province'), text('Coke Z3')))).toBeUndefined();
    expect(
      deriveProcessSite(evidence(text('Table Z3, Jiangsu Province'), text('Coke Z3'))),
    ).toBeUndefined();
  });

  it('ignores zero-number placeholders rather than showing or treating them as a second site', () => {
    expect(deriveProcessSite(evidence(text('Factory Z0'), text('Z0 output')))).toBeUndefined();
    expect(
      deriveProcessSite(evidence(text('Factory Z0; Factory Z17'), text('Z17 output'))),
    ).toEqual({ status: 'verified', code: 'Z17' });
  });

  it('treats different geography codes as ambiguous even when one matches the reference', () => {
    expect(
      deriveProcessSite(
        evidence(
          [...text('Factory Z3'), { '@xml:lang': 'zh', '#text': 'Z5工厂' }],
          text('Coke Z3'),
        ),
      ),
    ).toEqual({ status: 'needs_review' });
  });

  it('supports both complete RPC rows and projected list rows', () => {
    const siteEvidence = evidence(text('Factory Z17'), text('Z17 output'));
    const fullRow: any = {
      json: {
        processDataSet: {
          processInformation: {
            geography: {
              locationOfOperationSupplyOrProduction: {
                descriptionOfRestrictions: siteEvidence.descriptionOfRestrictions,
              },
            },
            quantitativeReference: {
              referenceToReferenceFlow: siteEvidence.referenceToReferenceFlow,
            },
          },
          exchanges: { exchange: siteEvidence.exchanges },
        },
      },
    };
    expect(processSiteFromRow(fullRow)).toEqual({ status: 'verified', code: 'Z17' });
    expect(
      processSiteFromRow({
        descriptionOfRestrictions: siteEvidence.descriptionOfRestrictions,
        referenceToReferenceFlow: siteEvidence.referenceToReferenceFlow,
        exchange: siteEvidence.exchanges,
      }),
    ).toEqual({ status: 'verified', code: 'Z17' });

    fullRow.json.processDataSet.processInformation.technology = {
      technologicalApplicability: text('Process D01'),
    };
    expect(processSiteFromRow(fullRow)).toEqual({ status: 'needs_review' });
  });
});
