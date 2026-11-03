jest.mock('@tiangong-lca/tidas-sdk/core', () => ({
  ...jest.requireActual(`${process.cwd()}/node_modules/@tiangong-lca/tidas-sdk/dist/core/index.js`),
}));

import {
  normalizeReviewCommentPayload,
  prepareReviewCommentApproval,
  ReviewPayloadValidationError,
} from '@/services/comments/reviewPayload';

const reference = {
  '@type': 'contact data set',
  '@refObjectId': '11111111-1111-4111-8111-111111111111',
  '@version': '01.00.000',
  '@uri': '../contacts/11111111-1111-4111-8111-111111111111.xml',
  'common:shortDescription': { '@xml:lang': 'en', '#text': 'Reviewer' },
};
const review = {
  '@type': 'Independent external review',
  'common:scope': {
    '@name': 'Documentation',
    'common:method': { '@name': 'Documentation' },
  },
  'common:reviewDetails': { '@xml:lang': 'en', '#text': 'Reviewed documentation' },
  'common:referenceToNameOfReviewerAndInstitution': reference,
};
const payload = (value: unknown) => ({ modellingAndValidation: { validation: { review: value } } });

it('removes untouched optional report controls without changing review content or the input', () => {
  const input = payload({
    ...review,
    'common:referenceToCompleteReviewReport': { 'common:shortDescription': [] },
  });
  expect(prepareReviewCommentApproval(input)).toEqual(payload(review));
  expect(input.modellingAndValidation.validation.review).toHaveProperty(
    'common:referenceToCompleteReviewReport',
  );
});

it.each(['process', 'lifeCycleModel'] as const)(
  'preserves valid singleton and ordered %s reviews',
  (kind) => {
    for (const reviews of [
      review,
      [review, { ...review, '@type': 'Independent internal review' }],
    ]) {
      expect(prepareReviewCommentApproval(payload(reviews), kind)).toEqual(payload(reviews));
    }
  },
);

it.each([
  {
    ...review,
    'common:scope': { '@name': '单一操作单元过程', 'common:method': { '@name': '数据源验证' } },
  },
  {
    ...review,
    'common:referenceToCompleteReviewReport': {
      'common:shortDescription': {
        '@xml:lang': 'en',
        '#text': 'Report still requires a selection',
      },
    },
  },
])(
  'blocks malformed submitted review metadata instead of dropping meaningful fields',
  (invalid) => {
    expect(() => prepareReviewCommentApproval(payload(invalid))).toThrow(
      ReviewPayloadValidationError,
    );
    expect(normalizeReviewCommentPayload(payload(invalid))).toEqual(payload(invalid));
  },
);

it('leaves incomplete drafts and rejection reasons usable', () => {
  expect(
    normalizeReviewCommentPayload({
      ...payload({ 'common:scope': [{ '@name': 'Documentation' }] }),
      comment: { message: 'Needs revision' },
    }),
  ).toEqual({
    ...payload({ 'common:scope': [{ '@name': 'Documentation' }] }),
    comment: { message: 'Needs revision' },
  });
  expect(prepareReviewCommentApproval({ comment: { message: 'No metadata' } })).toEqual({
    comment: { message: 'No metadata' },
  });
});

it('does not validate fields outside the review comment ownership boundary', () => {
  expect(
    prepareReviewCommentApproval({
      modellingAndValidation: {
        validation: { review },
        LCIMethodAndAllocation: { typeOfDataSet: 'irrelevant' },
      },
    }),
  ).toEqual({
    modellingAndValidation: {
      validation: { review },
      LCIMethodAndAllocation: { typeOfDataSet: 'irrelevant' },
    },
  });
});

it('blocks invalid compliance metadata', () => {
  expect(() =>
    prepareReviewCommentApproval({
      modellingAndValidation: {
        complianceDeclarations: {
          compliance: { 'common:approvalOfOverallCompliance': '完全符合' },
        },
      },
    }),
  ).toThrow(ReviewPayloadValidationError);
});

it('accepts an SDK success envelope without adding defaults to the submitted payload', () => {
  const sdk = require('@tiangong-lca/tidas-sdk/core');
  const create = jest.spyOn(sdk, 'createProcess').mockReturnValueOnce({
    validateEnhanced: () => ({ success: true, validationIssues: [] }),
  });
  try {
    expect(prepareReviewCommentApproval(payload(review))).toEqual(payload(review));
  } finally {
    create.mockRestore();
  }
});
