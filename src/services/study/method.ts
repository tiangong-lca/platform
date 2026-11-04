import * as owner from '../../../vendor/study-contract/v6/index.mjs';
import { readMethodArtifact, type MethodResource, type MethodRequest } from './api';

export type Assessment = MethodResource<'methodAssessment'>['value'];
export type Evidence = MethodResource<'methodEvidence'>['value'];
export type MethodReport = MethodResource<'reportRevision'>['value'];
export type MethodDraft = Extract<MethodRequest, { operation: 'report.create' }>['content'];
export type MethodConfig = Extract<
  MethodRequest,
  { operation: 'method.assessment.request' }
>['config'];
export type MethodFacts = Awaited<ReturnType<typeof owner.parseMethodFactsForAssessment>>;
export const methodConfigHash = owner.methodConfigHash;

/** Owner parsers bind exact bytes, schema and recorded source identity; server owns current access. */
export async function readMethodFacts(assessment: Assessment) {
  return readMethodArtifact(assessment.studyId, assessment.factsRef!, (bytes) =>
    owner.parseMethodFactsForAssessment(bytes, assessment),
  );
}
export async function readMethodEvidence(evidence: Evidence) {
  return readMethodArtifact(evidence.studyId, evidence.artifactRef, (bytes) =>
    owner.parseMethodEvidenceForRecord(bytes, evidence),
  );
}
export async function readMethodReport(report: MethodReport) {
  return readMethodArtifact(report.studyId, report.contentRef, (bytes) =>
    owner.parseMethodReportContentForRevision(bytes, report),
  );
}
