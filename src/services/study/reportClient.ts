import { review, type ReviewRequest } from './api';
import type { ReportApi } from './links';
import { StudyRequestError } from './errors';

/** Family selection is explicit; no rejected request is retried through another codec. */
export const reportClient = (api: ReportApi) => {
  if (api !== 'v4' && api !== 'v5' && api !== 'v6')
    throw new StudyRequestError('UNSUPPORTED_SCHEMA', false);
  return (body: ReviewRequest, workflow?: string) =>
    api !== 'v4'
      ? review(body, workflow, api)
      : workflow === undefined
        ? review(body)
        : review(body, workflow);
};
