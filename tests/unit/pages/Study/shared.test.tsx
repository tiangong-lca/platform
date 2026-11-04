import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import {
  QueryState,
  useStudyIdentity,
  useStudyQuery,
  useStudyWrite,
  WriteState,
  ExactRecord,
} from '@/pages/Study/shared';
import { StudyRequestError } from '@/services/study/api';
const mockSubscribe = jest.fn();
const mockPending = jest.fn();
const mockRecover = jest.fn();
jest.mock('@/services/study/api', () => ({
  StudyRequestError: class extends Error {
    code: string;
    retryable: boolean;
    constructor(mockCode: string, mockRetryable: boolean) {
      super(mockCode);
      this.code = mockCode;
      this.retryable = mockRetryable;
    }
  },
  readPendingStudyWrite: () => mockPending(),
  recoverPendingStudyWrite: () => mockRecover(),
  retirePendingStudyWrite: () => Promise.resolve(),
  subscribePendingStudyWrites: () => () => {},
  subscribeStudyIdentityChange: (...args: unknown[]) => mockSubscribe(...args),
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
beforeEach(() => {
  jest.clearAllMocks();
  mockSubscribe.mockReturnValue(jest.fn());
  mockPending.mockResolvedValue({ pending: false, raw: null });
});
it('clears changed identities and ignores stale success/error/unmounted replies', async () => {
  const a = deferred<string>(),
    b = deferred<string>(),
    c = deferred<string>();
  const load = jest
    .fn()
    .mockReturnValueOnce(a.promise)
    .mockReturnValueOnce(b.promise)
    .mockReturnValueOnce(c.promise);
  const { result, rerender, unmount } = renderHook(({ id }) => useStudyQuery(id, load), {
    initialProps: { id: 'a' },
  });
  expect(result.current.loading).toBe(true);
  rerender({ id: 'b' });
  expect(result.current.data).toBeUndefined();
  await act(async () => a.resolve('private-a'));
  expect(result.current.data).toBeUndefined();
  await act(async () => b.resolve('public-b'));
  expect(result.current.data).toBe('public-b');
  act(() => result.current.refresh());
  expect(result.current.data).toBeUndefined();
  await act(async () => c.reject(new Error('failed')));
  expect(result.current.error).toBeInstanceOf(Error);
  const d = deferred<string>();
  load.mockReturnValueOnce(d.promise);
  act(() => result.current.refresh());
  unmount();
  await act(async () => d.resolve('ignored'));
  const e = deferred<string>(),
    f = deferred<string>();
  const other = renderHook(
    ({ id }) => useStudyQuery(id, () => (id === 'e' ? e.promise : f.promise)),
    { initialProps: { id: 'e' } },
  );
  other.rerender({ id: 'f' });
  await act(async () => e.reject('stale'));
  expect(other.result.current.error).toBeUndefined();
  other.unmount();
});
it('uses application admission identity and releases subscriptions', () => {
  const stop = jest.fn();
  let change = () => {};
  mockSubscribe.mockImplementation((listener) => {
    change = listener;
    return stop;
  });
  const { result, unmount } = renderHook(useStudyIdentity);
  expect(result.current).toBe('actor-a:0');
  act(change);
  expect(result.current).toBe('actor-a:1');
  unmount();
  expect(stop).toHaveBeenCalled();
});
it('blocks double clicks and retries the original exact write after an ambiguous result', async () => {
  const first = deferred<void>(),
    success = deferred<void>(),
    refresh = jest.fn();
  const command = jest.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(success.promise);
  const other = jest.fn();
  const { result } = renderHook(() => useStudyWrite(refresh));
  await waitFor(() => expect(result.current.busy).toBe(false));
  act(() => {
    result.current.retry();
    result.current.run(command);
    result.current.run(other);
  });
  expect(command).toHaveBeenCalledTimes(1);
  expect(other).not.toHaveBeenCalled();
  act(() => result.current.retry());
  await act(async () => first.reject(new StudyRequestError('UPSTREAM_UNAVAILABLE', true)));
  expect(result.current.pending).toBe(command);
  act(() => result.current.run(other));
  expect(other).not.toHaveBeenCalled();
  act(() => result.current.retry());
  await act(async () => success.resolve());
  expect(command).toHaveBeenCalledTimes(2);
  expect(result.current.pending).toBeNull();
  expect(refresh).toHaveBeenCalledTimes(1);
});
it('releases determinate denials and retains unknown failures; suppresses post-unmount writes', async () => {
  const refresh = jest.fn(),
    command = jest
      .fn()
      .mockRejectedValueOnce(new StudyRequestError('REVISION_CONFLICT', false))
      .mockRejectedValueOnce(new Error('lost'));
  const hook = renderHook(() => useStudyWrite(refresh));
  await waitFor(() => expect(hook.result.current.busy).toBe(false));
  await act(async () => hook.result.current.run(command));
  expect(hook.result.current.pending).toBeNull();
  await act(async () => hook.result.current.run(command));
  expect(hook.result.current.pending).toBe(command);
  const pending = deferred<void>();
  const other = renderHook(() => useStudyWrite(refresh));
  await waitFor(() => expect(other.result.current.busy).toBe(false));
  act(() => other.result.current.run(() => pending.promise));
  other.unmount();
  await act(async () => pending.resolve());
  expect(refresh).not.toHaveBeenCalled();
  const failed = deferred<void>();
  const final = renderHook(() => useStudyWrite(refresh));
  await waitFor(() => expect(final.result.current.busy).toBe(false));
  act(() => final.result.current.run(() => failed.promise));
  final.unmount();
  await act(async () => failed.reject('ignored'));
  expect(refresh).not.toHaveBeenCalled();
});
it('renders contextual loading, safe errors, original-key retry and exact literal records', async () => {
  const retry = jest.fn();
  const view = render(
    <QueryState loading retry={retry}>
      Hidden
    </QueryState>,
  );
  expect(screen.queryByText('Hidden')).toBeNull();
  view.rerender(
    <QueryState loading={false} error={new StudyRequestError('FORBIDDEN', false)} retry={retry} />,
  );
  expect(screen.getByText('FORBIDDEN')).toBeInTheDocument();
  fireEvent.click(screen.getByText('pages.study.refresh'));
  expect(retry).toHaveBeenCalled();
  view.rerender(<QueryState loading={false} error={new Error('private text')} retry={retry} />);
  expect(screen.getByText('INVALID_RESPONSE')).toBeInTheDocument();
  expect(screen.queryByText('private text')).toBeNull();
  view.rerender(
    <QueryState loading={false} retry={retry}>
      <ExactRecord value={{ text: '<script>literal</script>' }} />
    </QueryState>,
  );
  expect(screen.getByText(/literal/)).toBeInTheDocument();
  expect(document.querySelector('script')).toBeNull();
  view.unmount();
  const Panel = () => {
    const write = useStudyWrite(jest.fn());
    return (
      <>
        <button type='button' onClick={() => write.run(() => Promise.reject(new Error('unknown')))}>
          write
        </button>
        <WriteState write={write} />
      </>
    );
  };
  render(<Panel />);
  await act(async () => {});
  fireEvent.click(screen.getByText('write'));
  await waitFor(() => expect(screen.getByText('pages.study.pending')).toBeInTheDocument());
  expect(screen.getByText('pages.study.retry')).toBeInTheDocument();
});

it('offers persisted exact-key recovery after remount and displays its validated result without automatic replay', async () => {
  mockPending.mockResolvedValue({ pending: true, raw: '{"idempotencyKey":"original-key"}' });
  mockRecover.mockResolvedValue({ type: 'comment', value: { commentId: 'recovered-comment' } });
  const refresh = jest.fn();
  const hook = renderHook(() => useStudyWrite(refresh));
  await waitFor(() => expect(hook.result.current.pending).not.toBeNull());
  expect(mockRecover).not.toHaveBeenCalled();
  const view = render(<WriteState write={hook.result.current} />);
  expect(screen.getByText('pages.study.recoveryIntent')).toBeInTheDocument();
  await act(async () => hook.result.current.retry());
  expect(mockRecover).toHaveBeenCalledTimes(1);
  expect(hook.result.current.recovered).toMatchObject({ type: 'comment' });
  expect(refresh).toHaveBeenCalled();
  view.rerender(<WriteState write={{ ...hook.result.current, error: undefined }} />);
  expect(screen.getByText(/recovered-comment/)).toBeInTheDocument();
  hook.unmount();
  mockPending.mockRejectedValue(new StudyRequestError('RECOVERY_UNAVAILABLE', false));
  const blocked = renderHook(() => useStudyWrite(jest.fn()));
  await waitFor(() =>
    expect(blocked.result.current.error).toMatchObject({ code: 'RECOVERY_UNAVAILABLE' }),
  );
});
