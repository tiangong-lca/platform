import {
  reportHref,
  shareHref,
  reportLinkSelection,
  shareLinkSelection,
  reportWorkflow,
} from '@/services/study/links';
import { reportClient } from '@/services/study/reportClient';

const mockReview = jest.fn();
jest.mock('@/services/study/api', () => ({ review: (...args: unknown[]) => mockReview(...args) }));
const hash = 'a'.repeat(64);

beforeEach(() => {
  mockReview.mockReset();
});

it('generates stable explicit V5 links and preserves the old V4 link and workflow format', () => {
  expect(reportHref('report:a', hash)).toBe(`/study-report?id=report%3Aa&hash=${hash}`);
  expect(reportLinkSelection(reportHref('report:a', hash).split('?')[1])).toEqual({
    api: 'v4',
    id: 'report:a',
    hash,
  });
  expect(reportHref('report:a', hash, 'v5')).toBe(`/study-report?id=report%3Aa&hash=${hash}&api=5`);
  expect(reportLinkSelection(reportHref('report:a', hash, 'v5').split('?')[1])).toEqual({
    api: 'v5',
    id: 'report:a',
    hash,
  });
  expect(shareHref('share:a')).toBe('/study-share?id=share%3Aa');
  expect(shareLinkSelection('id=share%3Aa')).toEqual({ api: 'v4', id: 'share:a' });
  expect(shareLinkSelection(shareHref('share:a', 'v5').split('?')[1])).toEqual({
    api: 'v5',
    id: 'share:a',
  });
  expect(reportWorkflow('report', 'id')).toBe('report:id');
  expect(reportWorkflow('share', 'id')).toBe('share:id');
  expect(reportWorkflow('report', 'id', 'v5')).toBe('report5:id');
  expect(reportWorkflow('share', 'id', 'v5')).toBe('share5:id');
});

it.each(['4', '05', '', '6', '5%00', '5&api=5'])(
  'rejects unsupported or ambiguous family selector %s without a fallback',
  (api) => {
    expect(reportLinkSelection(`id=r&hash=${hash}&api=${api}`)).toBeUndefined();
    expect(shareLinkSelection(`id=s&api=${api}`)).toBeUndefined();
  },
);

it('rejects missing, malformed, duplicate and unknown link fields', () => {
  for (const query of [
    '',
    `hash=${hash}`,
    `id=r`,
    `id=r&id=r&hash=${hash}`,
    `id=r&hash=${hash}&hash=${hash}`,
    `id=r&hash=${hash}&api[]=5`,
    `id=%3Cbad%3E&hash=${hash}`,
    `id=r&hash=bad`,
  ])
    expect(reportLinkSelection(query)).toBeUndefined();
  for (const query of [
    '',
    'id=',
    'id=s&id=s',
    'id=%3Cbad%3E',
    'id=s&api[]=5',
    'id=s&hash=unexpected',
  ])
    expect(shareLinkSelection(query)).toBeUndefined();
  expect(() => reportHref('id', hash, 'v9' as never)).toThrow('Unsupported report family');
  expect(() => shareHref('id', 'v9' as never)).toThrow('Unsupported report family');
  expect(() => reportWorkflow('report', 'id', 'v9' as never)).toThrow('Unsupported report family');
});

it('keeps legacy call arity while dispatching V5 once and preserving its rejection', async () => {
  const body = { operation: 'capability.read' as const };
  mockReview.mockResolvedValue({ type: 'capabilities' });
  await reportClient('v4')(body);
  expect(mockReview).toHaveBeenLastCalledWith(body);
  await reportClient('v4')(body, 'report:id');
  expect(mockReview).toHaveBeenLastCalledWith(body, 'report:id');
  mockReview.mockClear();
  const rejection = new Error('V5 unavailable');
  mockReview.mockRejectedValue(rejection);
  await expect(reportClient('v5')(body)).rejects.toBe(rejection);
  expect(mockReview).toHaveBeenCalledTimes(1);
  expect(mockReview).toHaveBeenCalledWith(body, undefined, 'v5');
  expect(() => reportClient('v9' as never)).toThrow('UNSUPPORTED_SCHEMA');
});
