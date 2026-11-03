import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { useStudyWrite, WriteState } from '@/pages/Study/shared';
import { StudyRequestError } from '@/services/study/errors';

const mockRead = jest.fn(),
  mockRecover = jest.fn(),
  mockRetire = jest.fn(),
  mockSubscribe = jest.fn();
jest.mock('@/services/study/api', () => ({
  StudyRequestError: jest.requireActual('@/services/study/errors').StudyRequestError,
  readPendingStudyWrite: (...args: unknown[]) => mockRead(...args),
  recoverPendingStudyWrite: (...args: unknown[]) => mockRecover(...args),
  retirePendingStudyWrite: (...args: unknown[]) => mockRetire(...args),
  subscribePendingStudyWrites: (...args: unknown[]) => mockSubscribe(...args),
  subscribeStudyIdentityChange: () => () => {},
}));
jest.mock('@umijs/max', () => ({
  useIntl: () => ({ formatMessage: ({ id }: { id: string }) => id }),
  useModel: () => ({ initialState: { currentUser: { userid: 'actor-a' } } }),
}));
const deferred = <T,>() => {
  let resolve!: (value: T) => void, reject!: (value: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const pending = {
  pending: true,
  raw: '{"requestId":"original-request","idempotencyKey":"original-key"}',
  canRetire: true,
};
beforeEach(() => {
  jest.clearAllMocks();
  mockRead.mockResolvedValue({ pending: false, raw: null });
  mockSubscribe.mockReturnValue(jest.fn());
});

it('blocks new writes until initial journal inspection finishes, then requires explicit user action', async () => {
  const load = deferred<{ pending: boolean; raw: null }>();
  mockRead.mockReturnValue(load.promise);
  const refresh = jest.fn(),
    command = jest.fn().mockResolvedValue(undefined);
  const hook = renderHook(() => useStudyWrite(refresh, 'study:study-a'));
  act(() => hook.result.current.run(command));
  expect(command).not.toHaveBeenCalled();
  expect(hook.result.current.busy).toBe(true);
  await act(async () => load.resolve({ pending: false, raw: null }));
  expect(command).not.toHaveBeenCalled();
  await act(async () => hook.result.current.run(command));
  expect(command).toHaveBeenCalledTimes(1);
  expect(mockRead).toHaveBeenCalledWith('study:study-a');
});

it('retires only the explicitly rejected workflow, preserves its receipt and permits a later explicit fresh command', async () => {
  let state: any = pending,
    changed = () => {};
  mockRead.mockImplementation(async () => state);
  mockSubscribe.mockImplementation((listener) => {
    changed = listener;
    return jest.fn();
  });
  const receipt = {
    type: 'localRetirement',
    workflow: 'report:report-a',
    auditId: 'retained-audit',
    idempotencyKey: 'original-key',
  };
  mockRetire.mockImplementation(async () => {
    state = { pending: false, raw: null };
    changed();
    return receipt;
  });
  const refresh = jest.fn(),
    command = jest.fn().mockResolvedValue(undefined);
  const hook = renderHook(() => useStudyWrite(refresh, 'report:report-a'));
  await waitFor(() => expect(hook.result.current.canRetire).toBe(true));
  act(() => hook.result.current.run(command));
  expect(command).not.toHaveBeenCalled();
  const view = render(<WriteState write={hook.result.current} />);
  expect(screen.getByText('pages.study.retirementNote')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'pages.study.retireRejected' }));
  await waitFor(() => expect(hook.result.current.recovered).toEqual(receipt));
  expect(mockRetire).toHaveBeenCalledWith('report:report-a');
  expect(mockRecover).not.toHaveBeenCalled();
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(command).not.toHaveBeenCalled();
  view.rerender(<WriteState write={hook.result.current} />);
  expect(screen.getByText(/retained-audit/)).toBeInTheDocument();
  await act(async () => hook.result.current.run(command));
  expect(command).toHaveBeenCalledTimes(1);
});

it('does not start retirement while another retirement or recovery is executing', async () => {
  mockRead.mockResolvedValue(pending);
  const result = deferred<unknown>();
  mockRetire.mockReturnValue(result.promise);
  const hook = renderHook(() => useStudyWrite(jest.fn(), 'report:report-a'));
  await waitFor(() => expect(hook.result.current.canRetire).toBe(true));
  act(() => {
    hook.result.current.retire();
    hook.result.current.retire();
    hook.result.current.retry();
  });
  expect(mockRetire).toHaveBeenCalledTimes(1);
  expect(mockRecover).not.toHaveBeenCalled();
  expect(hook.result.current.busy).toBe(true);
  await act(async () => result.resolve({ type: 'localRetirement' }));
});

it('retains a rejected workflow when fresh-target retirement is denied and blocks new commands', async () => {
  mockRead.mockResolvedValue(pending);
  mockRetire.mockRejectedValue(new StudyRequestError('AUTH_REQUIRED', false));
  const command = jest.fn(),
    refresh = jest.fn();
  const hook = renderHook(() => useStudyWrite(refresh, 'report:report-a'));
  await waitFor(() => expect(hook.result.current.canRetire).toBe(true));
  await act(async () => hook.result.current.retire());
  expect(hook.result.current.error).toMatchObject({ code: 'AUTH_REQUIRED' });
  expect(hook.result.current.pending).not.toBeNull();
  expect(hook.result.current.journal).toBe(pending.raw);
  act(() => hook.result.current.run(command));
  expect(command).not.toHaveBeenCalled();
  expect(refresh).not.toHaveBeenCalled();
});

it('does not offer or execute retirement for an ambiguous unresolved intent', async () => {
  mockRead.mockResolvedValue({ ...pending, canRetire: false });
  const hook = renderHook(() => useStudyWrite(jest.fn(), 'report:report-a'));
  await waitFor(() => expect(hook.result.current.busy).toBe(false));
  act(() => hook.result.current.retire());
  expect(mockRetire).not.toHaveBeenCalled();
  render(<WriteState write={hook.result.current} />);
  expect(screen.queryByRole('button', { name: 'pages.study.retireRejected' })).toBeNull();
  expect(screen.getByRole('button', { name: 'pages.study.retry' })).toBeInTheDocument();
});

it.each(['resolve', 'reject'] as const)(
  'suppresses journal inspection %s after unmount and releases the subscription',
  async (outcome) => {
    const load = deferred<any>(),
      stop = jest.fn();
    mockRead.mockReturnValue(load.promise);
    mockSubscribe.mockReturnValue(stop);
    const refresh = jest.fn(),
      hook = renderHook(() => useStudyWrite(refresh, 'study:study-a'));
    hook.unmount();
    await act(async () =>
      outcome === 'resolve'
        ? load.resolve(pending)
        : load.reject(new StudyRequestError('RECOVERY_UNAVAILABLE', false)),
    );
    expect(stop).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
    expect(mockRecover).not.toHaveBeenCalled();
    expect(hook.result.current.recovered).toBeUndefined();
  },
);

it('does not hand recovered results to an unmounted route or a later mount', async () => {
  mockRead.mockResolvedValue({ ...pending, canRetire: false });
  const recovered = deferred<unknown>();
  mockRecover.mockReturnValue(recovered.promise);
  const refresh = jest.fn(),
    hook = renderHook(() => useStudyWrite(refresh, 'report:report-a'));
  await waitFor(() => expect(hook.result.current.pending).not.toBeNull());
  act(() => hook.result.current.retry());
  hook.unmount();
  await act(async () =>
    recovered.resolve({ type: 'comment', value: { commentId: 'private-old-result' } }),
  );
  expect(refresh).not.toHaveBeenCalled();
  expect(hook.result.current.recovered).toBeUndefined();
  mockRead.mockResolvedValue({ pending: false, raw: null });
  const next = renderHook(() => useStudyWrite(jest.fn(), 'report:report-b'));
  await waitFor(() => expect(next.result.current.busy).toBe(false));
  expect(next.result.current.recovered).toBeUndefined();
  expect(mockRecover).toHaveBeenCalledTimes(1);
});

it('does not publish a local retirement receipt after its route unmounts', async () => {
  mockRead.mockResolvedValue(pending);
  const retired = deferred<unknown>();
  mockRetire.mockReturnValue(retired.promise);
  const refresh = jest.fn(),
    hook = renderHook(() => useStudyWrite(refresh, 'report:report-a'));
  await waitFor(() => expect(hook.result.current.canRetire).toBe(true));
  act(() => hook.result.current.retire());
  hook.unmount();
  await act(async () => retired.resolve({ type: 'localRetirement', auditId: 'old-audit' }));
  expect(refresh).not.toHaveBeenCalled();
  expect(hook.result.current.recovered).toBeUndefined();
});
