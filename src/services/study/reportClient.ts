import { review, type ReviewRequest } from './api';
import type { ReportApi } from './links';
import { StudyRequestError } from './errors';

/** Family selection is explicit; no rejected request is retried through another codec. */
export const reportClient = (api: ReportApi) => {
  if (api !== 'v4' && api !== 'v5') throw new StudyRequestError('UNSUPPORTED_SCHEMA', false);
  return (body: ReviewRequest, workflow?: string) =>
    api === 'v5'
      ? review(body, workflow, 'v5')
      : workflow === undefined
        ? review(body)
        : review(body, workflow);
};
