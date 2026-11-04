import { createHash, webcrypto } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { TextEncoder, TextDecoder } from 'node:util';
import * as owner from '../../../../vendor/study-contract/v6/index.mjs';
import { readMethodFacts, readMethodEvidence, readMethodReport } from '@/services/study/method';
import worker from '../../../fixtures/study-method/worker.json';
import storedFixture from '@/standalone/studyReport/methodProtocol.fixture.json';
import provenance from '../../../fixtures/study-method/provenance.json';
const mockMethod = jest.fn();
jest.mock('@/services/study/api', () => ({
  ...jest.requireActual('@/services/study/api'),
  readMethodArtifact: async (
    studyId: string,
    artifactRef: unknown,
    decode: (bytes: Uint8Array) => Promise<unknown>,
  ) => {
    const data = await mockMethod({ operation: 'artifact.read', studyId, artifactRef });
    return decode(Uint8Array.from(atob(data.bytes), (c) => c.charCodeAt(0)));
  },
}));
beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  Object.defineProperty(globalThis, 'TextEncoder', { value: TextEncoder, configurable: true });
  Object.defineProperty(globalThis, 'TextDecoder', { value: TextDecoder, configurable: true });
});
beforeEach(() => mockMethod.mockReset());
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
function provide(bytes: Uint8Array) {
  mockMethod.mockImplementation(async (q) => ({
    type: 'artifact',
    studyId: q.studyId,
    artifactRef: q.artifactRef,
    encoding: 'base64',
    bytes: Buffer.from(bytes).toString('base64'),
  }));
}

it('retains exact synthetic owner fixture bytes and reads bound assessment facts', async () => {
  for (const file of provenance.files) {
    const bytes = fs.readFileSync(path.resolve('tests/fixtures/study-method', file.path));
    expect(bytes.length).toBe(file.bytes);
    expect(sha(bytes)).toBe(file.sha256);
  }
  const bytes = fs.readFileSync(path.resolve('tests/fixtures/study-method/facts.json'));
  provide(bytes);
  const result = await readMethodFacts(worker.record as never);
  expect(result.factCatalog).toHaveLength(58);
  expect(result.requirements).toHaveLength(20);
  expect(result.categories).toHaveLength(25);
  expect(result.pefConformityQualified).toBe(false);
  expect(mockMethod).toHaveBeenCalledWith({
    operation: 'artifact.read',
    studyId: worker.record.studyId,
    artifactRef: worker.record.factsRef,
  });
  bytes[20] ^= 1;
  provide(bytes);
  await expect(readMethodFacts(worker.record as never)).rejects.toThrow();
});

it('reads exact evidence without treating recorded_unverified as approval', async () => {
  const content = {
    schemaVersion: 'lca.study-method-evidence.v1',
    requirementId: 'PEF-01',
    declaredKind: 'sourceRecord',
    title: 'Recorded source',
    statement: 'Declared without approval',
    citations: [],
  };
  const bytes = owner.canonicalBytes(content);
  const record = {
    schemaVersion: 'lca.study-method-evidence-record.v1',
    evidenceId: worker.record.assessmentId,
    studyId: worker.record.studyId,
    requirementId: content.requirementId,
    declaredKind: content.declaredKind,
    artifactRef: {
      type: 'methodEvidence',
      id: worker.record.assessmentId,
      contentHash: sha(bytes),
      digestScope: 'artifact_bytes_sha256',
      byteSize: bytes.length,
      mediaType: 'application/json',
      schemaVersion: content.schemaVersion,
    },
    recordedAt: '2026-11-04T01:00:00Z',
    status: 'recorded_unverified',
  };
  provide(bytes);
  expect(await readMethodEvidence(record as never)).toEqual(content);
  await expect(
    readMethodEvidence({ ...record, requirementId: 'PEF-02' } as never),
  ).rejects.toThrow();
});

it('reopens the complete exact stored draft and rejects changed byte identity', async () => {
  const stored = storedFixture.stored,
    bytes = owner.canonicalBytes(stored);
  const record = {
    reportRevisionId: stored.reportRevisionId,
    studyId: stored.studyId,
    parentReportRevisionId: null,
    authorId: 'author',
    revision: 1,
    status: 'draft',
    contentHash: sha(bytes),
    runIds: stored.runIds,
    methodAssessmentIds: stored.methodAssessmentIds,
    factsRefs: stored.factsRefs,
    contentRef: {
      type: 'reportContent',
      id: 'stored-content',
      contentHash: sha(bytes),
      digestScope: 'artifact_bytes_sha256',
      byteSize: bytes.length,
      mediaType: 'application/json',
      schemaVersion: stored.schemaVersion,
    },
    templateId: stored.templateId,
    finalization: {
      status: 'not_finalized',
      profileId: 'lca.study-report-unreviewed.v1',
      reviewRequirement: 'none',
      finalizedAt: null,
      reviewIds: [],
    },
    validitySnapshot: { status: 'current', checkedAt: '2026-11-04T01:00:00Z', reasonCodes: [] },
  };
  provide(bytes);
  expect((await readMethodReport(record as never)).content).toEqual(stored.content);
  await expect(
    readMethodReport({
      ...record,
      contentRef: { ...record.contentRef, contentHash: 'f'.repeat(64) },
      contentHash: 'f'.repeat(64),
    } as never),
  ).rejects.toThrow();
});
