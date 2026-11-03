import { removeEmptyObjects } from '@/services/general/util';
import { createLifeCycleModel, createProcess } from '@tiangong-lca/tidas-sdk/core';

export type ReviewDatasetKind = 'process' | 'lifeCycleModel';
type ReviewIssue = NonNullable<
  ReturnType<ReturnType<typeof createProcess>['validateEnhanced']>['validationIssues']
>[number];

export class ReviewPayloadValidationError extends Error {
  constructor(public readonly issues: ReviewIssue[]) {
    super('REVIEW_METADATA_INVALID');
    this.name = 'ReviewPayloadValidationError';
  }
}

/** Share ordinary dataset empty-field semantics without translating reviewer-authored text. */
export function normalizeReviewCommentPayload(json: unknown) {
  return removeEmptyObjects(json);
}

/** Validate only the metadata owned by review comments, never the partial dataset envelope. */
export function prepareReviewCommentApproval(
  json: unknown,
  datasetKind: ReviewDatasetKind = 'process',
) {
  const normalized = normalizeReviewCommentPayload(json);
  const root = datasetKind === 'process' ? 'processDataSet' : 'lifeCycleModelDataSet';
  const factory = datasetKind === 'process' ? createProcess : createLifeCycleModel;
  const metadata = normalized?.modellingAndValidation;
  if (metadata === undefined) return normalized;

  const result = factory(
    { [root]: { modellingAndValidation: JSON.parse(JSON.stringify(metadata)) } },
    { mode: 'strict' },
  ).validateEnhanced();
  const rawIssues = result.success ? [] : result.error.issues;
  const issues = result.validationIssues
    .map((issue, index) => ({
      ...rawIssues[index],
      ...issue,
    }))
    .filter(
      (issue) =>
        issue.path[0] === root &&
        issue.path[1] === 'modellingAndValidation' &&
        (issue.path.length === 2 ||
          ((issue.path[2] === 'validation' || issue.path[2] === 'complianceDeclarations') &&
            Object.prototype.hasOwnProperty.call(metadata, issue.path[2]))),
    );
  if (issues.length) throw new ReviewPayloadValidationError(issues);
  // SDK defaults are validation inputs, not replacements for the reviewer's partial payload.
  return normalized;
}
