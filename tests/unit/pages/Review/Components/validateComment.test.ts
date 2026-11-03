jest.mock('@/services/comments/reviewPayload', () => ({
  ...jest.requireActual('@/services/comments/reviewPayload'),
}));

import { validateCommentApproval } from '@/pages/Review/Components/validateComment';
import { showValidationIssueModal } from '@/components/ValidationIssueModal';

jest.mock('@/components/ValidationIssueModal', () => ({ showValidationIssueModal: jest.fn() }));
const intl = {
  locale: 'en-US',
  formatMessage: ({ defaultMessage, id }: any) => defaultMessage ?? id,
};
const showFields = jest.fn();
const rootRef = {
  '@type': 'process data set',
  '@refObjectId': '11111111-1111-4111-8111-111111111111',
  '@version': '01.00.000',
};

it('returns normalized metadata when approval is valid', () => {
  expect(
    validateCommentApproval(
      {
        modellingAndValidation: {
          validation: {
            review: {
              '@type': 'Not reviewed',
              'common:referenceToCompleteReviewReport': { 'common:shortDescription': [] },
            },
          },
        },
      },
      'process',
      rootRef,
      intl,
      showFields,
    ),
  ).toEqual({
    valid: true,
    json: { modellingAndValidation: { validation: { review: { '@type': 'Not reviewed' } } } },
  });
  expect(showValidationIssueModal).not.toHaveBeenCalled();
});

it.each(['process', 'lifeCycleModel'] as const)(
  'shows actionable %s field details for invalid report references',
  (kind) => {
    const json = {
      modellingAndValidation: {
        validation: {
          review: {
            '@type': 'Not reviewed',
            'common:referenceToCompleteReviewReport': {
              'common:shortDescription': { '@xml:lang': 'en', '#text': 'Select a source' },
            },
          },
        },
      },
    };
    expect(validateCommentApproval(json, kind, rootRef, intl, showFields)).toEqual({
      valid: false,
    });
    expect(showFields).toHaveBeenCalledWith(
      'validation',
      expect.arrayContaining([
        expect.objectContaining({
          name: expect.arrayContaining(['modellingAndValidation', 'validation']),
          errors: expect.any(Array),
        }),
      ]),
    );
    expect(showValidationIssueModal).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.objectContaining({ id: 'pages.validationIssues.modal.reviewTitle' }),
        issues: [
          expect.objectContaining({
            code: 'sdkInvalid',
            sdkDetails: expect.arrayContaining([
              expect.objectContaining({
                fieldPath: expect.stringContaining('referenceToCompleteReviewReport'),
              }),
            ]),
          }),
        ],
      }),
    );
  },
);

it('propagates an unexpected validation failure to the form error handler', () => {
  const service = require('@/services/comments/reviewPayload');
  const prepare = jest.spyOn(service, 'prepareReviewCommentApproval').mockImplementationOnce(() => {
    throw new Error('validation unavailable');
  });
  try {
    expect(() => validateCommentApproval({}, 'process', rootRef, intl, showFields)).toThrow(
      'validation unavailable',
    );
    expect(showValidationIssueModal).not.toHaveBeenCalled();
  } finally {
    prepare.mockRestore();
  }
});

it('routes compliance errors within the current form instead of linking to a dataset editor', () => {
  expect(
    validateCommentApproval(
      {
        modellingAndValidation: {
          complianceDeclarations: {
            compliance: [{ 'common:approvalOfOverallCompliance': '错误' }],
          },
        },
      },
      'process',
      rootRef,
      intl,
      showFields,
    ),
  ).toEqual({ valid: false });
  const config = (showValidationIssueModal as jest.Mock).mock.calls[0][0];
  expect(config.issues[0].link).toBe('');
  config.onNavigate({ tabName: 'complianceDeclarations' });
  expect(showFields).toHaveBeenLastCalledWith(
    'complianceDeclarations',
    expect.arrayContaining([expect.objectContaining({ name: expect.arrayContaining([0]) })]),
  );
});
