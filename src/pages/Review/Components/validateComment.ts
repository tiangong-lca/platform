import { showValidationIssueModal } from '@/components/ValidationIssueModal';
import { normalizeLifeCycleModelSdkValidationDetails } from '@/pages/LifeCycleModels/sdkValidation';
import { normalizeProcessSdkValidationDetails } from '@/pages/Processes/sdkValidation';
import { buildValidationIssues, type refDataType } from '@/pages/Utils/review';
import { getSdkSuggestedFixMessage } from '@/pages/Utils/validation/messages';
import {
  prepareReviewCommentApproval,
  ReviewPayloadValidationError,
  type ReviewDatasetKind,
} from '@/services/comments/reviewPayload';
import type { RuntimeIntlShapeLike } from '@/services/general/runtimeLocale';

export function validateCommentApproval(
  json: unknown,
  datasetKind: ReviewDatasetKind,
  rootRef: refDataType,
  intl: RuntimeIntlShapeLike,
  showFields: (
    tabName: string,
    fields: Array<{ name: Array<string | number>; errors: string[] }>,
  ) => void,
): { valid: true; json: any } | { valid: false } {
  try {
    return { valid: true, json: prepareReviewCommentApproval(json, datasetKind) };
  } catch (error) {
    if (!(error instanceof ReviewPayloadValidationError)) throw error;
    const rawDetails =
      datasetKind === 'process'
        ? normalizeProcessSdkValidationDetails(error.issues, { processDataSet: json })
        : normalizeLifeCycleModelSdkValidationDetails(error.issues, {
            lifeCycleModelDataSet: json,
          });
    const details = rawDetails.map((detail) => ({
      ...detail,
      tabName: detail.fieldPath.includes('complianceDeclarations')
        ? 'complianceDeclarations'
        : 'validation',
    }));
    const fields = details.map((detail) => ({
      name: detail.fieldPath
        .split('.')
        .map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment)),
      errors: [getSdkSuggestedFixMessage(intl, detail)],
    }));
    showFields(details[0].tabName, fields);
    showValidationIssueModal({
      intl,
      issues: buildValidationIssues({
        rootRef,
        datasetSdkValid: false,
        sdkInvalidDetails: details,
        actionFrom: 'review',
      }).map((issue) => ({ ...issue, link: '' })),
      onNavigate: ({ tabName }) => showFields(tabName!, fields),
      title: {
        id: 'pages.validationIssues.modal.reviewTitle',
        defaultMessage: 'Review submission blocked',
      },
    });
    return { valid: false };
  }
}
