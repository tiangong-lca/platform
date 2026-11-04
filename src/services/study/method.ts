import * as owner from '../../../vendor/study-contract/v6/index.mjs';
import { expectType, method, type MethodResource, type MethodRequest } from './api';

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

async function artifactBytes(
  studyId: string,
  artifactRef: Extract<MethodRequest, { operation: 'artifact.read' }>['artifactRef'],
) {
  const data = expectType(
    await method({ operation: 'artifact.read', studyId, artifactRef }),
    'artifact',
  );
  return Uint8Array.from(atob(data.bytes), (character) => character.charCodeAt(0));
}

/** Owner parsers bind exact bytes, schema and recorded source identity; server owns current access. */
export async function readMethodFacts(assessment: Assessment) {
  return owner.parseMethodFactsForAssessment(
    await artifactBytes(assessment.studyId, assessment.factsRef!),
    assessment,
  );
}
export async function readMethodEvidence(evidence: Evidence) {
  return owner.parseMethodEvidenceForRecord(
    await artifactBytes(evidence.studyId, evidence.artifactRef),
    evidence,
  );
}
export async function readMethodReport(report: MethodReport) {
  return owner.parseMethodReportContentForRevision(
    await artifactBytes(report.studyId, report.contentRef),
    report,
  );
}
