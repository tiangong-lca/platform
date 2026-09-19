import { waitFor } from '@testing-library/react';

const LEGACY_STORAGE_KEY = 'tg_tidas_package_task_center_v1';
const DEFAULT_OWNER_ID = 'user-a';
const storageKeyForOwner = (ownerId: string) =>
  `${LEGACY_STORAGE_KEY}:user:${encodeURIComponent(ownerId)}`;
const STORAGE_KEY = storageKeyForOwner(DEFAULT_OWNER_ID);

const mockQueueExportTidasPackageApi = jest.fn();
const mockQueueImportTidasPackageApi = jest.fn();
const mockGetTidasPackageJobApi = jest.fn();
const mockDownloadReadyTidasPackageExportApi = jest.fn();
const mockRequestWorkerJobsApi = jest.fn();

jest.mock('@/services/general/api', () => ({
  queueImportTidasPackageApi: (...args: any[]) => mockQueueImportTidasPackageApi(...args),
  queueExportTidasPackageApi: (...args: any[]) => mockQueueExportTidasPackageApi(...args),
  getTidasPackageJobApi: (...args: any[]) => mockGetTidasPackageJobApi(...args),
  downloadReadyTidasPackageExportApi: (...args: any[]) =>
    mockDownloadReadyTidasPackageExportApi(...args),
}));

jest.mock('@/services/workerJobs/api', () => ({
  __esModule: true,
  requestWorkerJobsApi: (...args: any[]) => mockRequestWorkerJobsApi(...args),
}));

function loadUnboundTaskCenterModule() {
  let loaded: any;
  jest.isolateModules(() => {
    loaded = require('@/services/tidasPackage/taskCenter');
  });
  return loaded as typeof import('@/services/tidasPackage/taskCenter');
}

function loadTaskCenterModule(ownerId = DEFAULT_OWNER_ID) {
  const loaded = loadUnboundTaskCenterModule();
  loaded.bindTidasPackageTaskCenterOwner(ownerId);
  return loaded;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('tidasPackage/taskCenter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueueExportTidasPackageApi.mockReset();
    mockQueueImportTidasPackageApi.mockReset();
    mockGetTidasPackageJobApi.mockReset();
    mockDownloadReadyTidasPackageExportApi.mockReset();
    mockRequestWorkerJobsApi.mockReset();
    mockRequestWorkerJobsApi.mockResolvedValue({ data: [], error: null });
    jest.useRealTimers();
    localStorage.clear();
  });

  it('refreshes terminal imports atomically with stable order and backend execution timestamps', async () => {
    const center = loadTaskCenterModule();
    await center.refreshTidasPackageTasksFromWorkerJobs();
    const createdAt = '2026-09-09T10:31:50.000Z';
    const startedAt = '2026-09-09T10:31:52.000Z';
    const finishedAt = '2026-09-09T10:31:55.170Z';
    const rows = ['a', 'b'].map((id) => ({
      id,
      jobKind: 'tidas.import_package',
      subjectId: `package-${id}`,
      status: id === 'a' ? 'completed' : 'failed',
      createdAt,
      startedAt,
      finishedAt,
      updatedAt: finishedAt,
    }));
    const details = createDeferred<any>();
    mockRequestWorkerJobsApi.mockReturnValue(details.promise);
    const changes: string[][] = [];
    center.subscribeTidasPackageTasks(() =>
      changes.push(center.listTidasPackageTasks().map((t) => t.id)),
    );
    mockRequestWorkerJobsApi.mockClear();
    const first = center.refreshTidasPackageTasksFromWorkerJobs();
    const overlapping = center.refreshTidasPackageTasksFromWorkerJobs();
    await flushPromises();
    expect(mockRequestWorkerJobsApi).toHaveBeenCalledTimes(1);
    expect(changes).toEqual([]);
    details.resolve({ data: rows, error: null });
    await Promise.all([first, overlapping]);
    expect(changes).toEqual([['a', 'b']]);

    const snapshot = center.listTidasPackageTasks();
    jest.useFakeTimers().setSystemTime(new Date('2026-09-10T01:33:38.000Z'));
    mockRequestWorkerJobsApi.mockResolvedValue({ data: [...rows].reverse(), error: null });
    await center.refreshTidasPackageTasksFromWorkerJobs();
    expect(center.listTidasPackageTasks()).toEqual(snapshot);
    expect(changes).toEqual([
      ['a', 'b'],
      ['a', 'b'],
    ]);
    expect(snapshot[0]).toMatchObject({ createdAt, updatedAt: finishedAt, startedAt, finishedAt });
    expect(snapshot[1].state).toBe('failed');
    mockRequestWorkerJobsApi.mockResolvedValue({
      data: rows.map((row) => ({ ...row, startedAt: null, finishedAt: 'invalid' })),
      error: null,
    });
    mockGetTidasPackageJobApi.mockResolvedValue({ data: { ok: false } });
    await center.refreshTidasPackageTasksFromWorkerJobs();
    expect(center.listTidasPackageTasks()[0]).toMatchObject({ startedAt, finishedAt });
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.tasks[0]).toMatchObject({ startedAt, finishedAt });
    center.bindTidasPackageTaskCenterOwner(null);
    mockRequestWorkerJobsApi.mockResolvedValue({ data: [], error: null });
    const restored = loadTaskCenterModule();
    expect(restored.listTidasPackageTasks()[0]).toMatchObject({ startedAt, finishedAt });
    restored.bindTidasPackageTaskCenterOwner(null);
    jest.useRealTimers();
  });

  it('stays inert until an authenticated owner is bound and discards legacy global storage', async () => {
    localStorage.setItem(
      LEGACY_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        tasks: [
          {
            id: 'legacy-task',
            state: 'completed',
            phase: 'completed',
            message: 'must not hydrate',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            sequence: 1,
          },
        ],
      }),
    );

    const taskCenter = loadUnboundTaskCenterModule();
    expect(taskCenter.listTidasPackageTasks()).toEqual([]);
    expect(mockRequestWorkerJobsApi).not.toHaveBeenCalled();

    taskCenter.bindTidasPackageTaskCenterOwner(DEFAULT_OWNER_ID);
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
    expect(taskCenter.listTidasPackageTasks()).toEqual([]);
    await waitFor(() => expect(mockRequestWorkerJobsApi).toHaveBeenCalledTimes(1));
  });

  it('rejects invalid owner-bound operations and keeps unbound helpers inert', async () => {
    const taskCenter = loadUnboundTaskCenterModule();

    expect(() => taskCenter.getTidasPackageTaskStorageKey(undefined as any)).toThrow(
      'authenticated user id',
    );
    expect(() => taskCenter.getTidasPackageTaskStorageKey('   ')).toThrow('authenticated user id');
    expect(() => taskCenter.submitTidasPackageExportTask({ scope: 'current_user' })).toThrow(
      'requires an authenticated user',
    );
    await expect(taskCenter.refreshTidasPackageTasksFromWorkerJobs()).resolves.toEqual([]);

    taskCenter.removeTidasPackageTask('missing');
    taskCenter.clearFinishedTidasPackageTasks();
    taskCenter.bindTidasPackageTaskCenterOwner(null);
    taskCenter.bindTidasPackageTaskCenterOwner(DEFAULT_OWNER_ID);
    taskCenter.bindTidasPackageTaskCenterOwner(null);
    taskCenter.bindTidasPackageTaskCenterOwner(null);
    expect(taskCenter.listTidasPackageTasks()).toEqual([]);
  });

  it('absorbs background refresh errors while hydrating an authenticated owner', async () => {
    mockRequestWorkerJobsApi.mockResolvedValueOnce({
      data: null,
      error: { message: 'background refresh failed' },
    });

    const taskCenter = loadTaskCenterModule();
    await flushPromises();

    expect(taskCenter.listTidasPackageTasks()).toEqual([]);
    expect(mockRequestWorkerJobsApi).toHaveBeenCalledTimes(1);
  });

  it('keeps persisted task snapshots isolated when authenticated users switch', async () => {
    const firstQueue = createDeferred<any>();
    mockQueueExportTidasPackageApi
      .mockReturnValueOnce(firstQueue.promise)
      .mockResolvedValueOnce({ data: null, error: new Error('user-b fixture') });

    const taskCenter = loadTaskCenterModule('user-a');
    const userATask = taskCenter.submitTidasPackageExportTask({ scope: 'current_user' });
    expect(JSON.parse(localStorage.getItem(storageKeyForOwner('user-a')) ?? '{}').tasks).toEqual([
      expect.objectContaining({ id: userATask.id }),
    ]);

    taskCenter.bindTidasPackageTaskCenterOwner('user-b');
    expect(taskCenter.listTidasPackageTasks()).toEqual([]);
    const userBTask = taskCenter.submitTidasPackageExportTask({ scope: 'open_data' });
    await waitFor(() => {
      expect(taskCenter.listTidasPackageTasks()).toEqual([
        expect.objectContaining({ id: userBTask.id, state: 'failed' }),
      ]);
    });

    firstQueue.resolve({
      data: {
        ok: true,
        mode: 'queued',
        job_id: 'user-a-job',
        scope: 'current_user',
        root_count: 0,
      },
      error: null,
    });
    await flushPromises();
    expect(taskCenter.listTidasPackageTasks()).toEqual([
      expect.objectContaining({ id: userBTask.id }),
    ]);
    expect(localStorage.getItem(storageKeyForOwner('user-b'))).not.toBeNull();

    taskCenter.bindTidasPackageTaskCenterOwner('user-a');
    expect(taskCenter.listTidasPackageTasks()).toEqual([
      expect.objectContaining({ id: userATask.id, phase: 'submitting' }),
    ]);
  });

  it('ignores a worker refresh that resolves after the authenticated user changes', async () => {
    const userARefresh = createDeferred<any>();
    mockRequestWorkerJobsApi.mockReturnValueOnce(userARefresh.promise).mockResolvedValueOnce({
      data: [
        {
          id: 'user-b-worker-job',
          jobKind: 'tidas.export_package',
          status: 'completed',
          subjectId: 'user-b-package-job',
        },
      ],
      error: null,
    });

    const taskCenter = loadTaskCenterModule('user-a');
    taskCenter.bindTidasPackageTaskCenterOwner('user-b');
    await waitFor(() => {
      expect(taskCenter.listTidasPackageTasks()).toEqual([
        expect.objectContaining({ id: 'user-b-worker-job' }),
      ]);
    });

    userARefresh.resolve({
      data: [
        {
          id: 'user-a-worker-job',
          jobKind: 'tidas.export_package',
          status: 'completed',
          subjectId: 'user-a-package-job',
        },
      ],
      error: null,
    });
    await flushPromises();
    expect(taskCenter.listTidasPackageTasks()).toEqual([
      expect.objectContaining({ id: 'user-b-worker-job' }),
    ]);
  });

  it('ignores a package poll that resolves after the authenticated user changes', async () => {
    const userAPoll = createDeferred<any>();
    mockQueueExportTidasPackageApi.mockResolvedValueOnce({
      data: {
        ok: true,
        mode: 'queued',
        job_id: 'user-a-package-job',
        scope: 'current_user',
        root_count: 0,
      },
      error: null,
    });
    mockGetTidasPackageJobApi.mockReturnValueOnce(userAPoll.promise);

    const taskCenter = loadTaskCenterModule('user-a');
    taskCenter.submitTidasPackageExportTask({ scope: 'current_user' });
    await waitFor(() => expect(mockGetTidasPackageJobApi).toHaveBeenCalledTimes(1));

    taskCenter.bindTidasPackageTaskCenterOwner('user-b');
    userAPoll.resolve({
      data: {
        ok: true,
        status: 'completed',
        job_id: 'user-a-package-job',
        diagnostics: {},
        artifacts_by_kind: {},
      },
      error: null,
    });
    await flushPromises();
    expect(taskCenter.listTidasPackageTasks()).toEqual([]);
  });

  it('ignores queue rejection updates after the authenticated user changes', async () => {
    const queue = createDeferred<any>();
    mockQueueExportTidasPackageApi.mockReturnValueOnce(queue.promise);

    const taskCenter = loadTaskCenterModule('user-a');
    taskCenter.submitTidasPackageExportTask({ scope: 'current_user' });
    taskCenter.bindTidasPackageTaskCenterOwner('user-b');

    queue.reject(new Error('stale queue rejection'));
    await flushPromises();

    expect(taskCenter.listTidasPackageTasks()).toEqual([]);
  });

  it('stops polling after an owner switch or local task removal', async () => {
    jest.useFakeTimers();
    mockQueueExportTidasPackageApi
      .mockResolvedValueOnce({
        data: {
          ok: true,
          mode: 'queued',
          job_id: 'stale-owner-job',
          scope: 'current_user',
          root_count: 0,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          mode: 'queued',
          job_id: 'removed-task-job',
          scope: 'current_user',
          root_count: 0,
        },
        error: null,
      });
    mockGetTidasPackageJobApi.mockResolvedValue({
      data: {
        ok: true,
        status: 'running',
        job_id: 'running-job',
        diagnostics: {},
        artifacts_by_kind: {},
      },
      error: null,
    });

    const taskCenter = loadTaskCenterModule('user-a');
    taskCenter.submitTidasPackageExportTask({ scope: 'current_user' });
    await flushPromises();
    taskCenter.bindTidasPackageTaskCenterOwner('user-b');
    await jest.advanceTimersByTimeAsync(1600);
    expect(taskCenter.listTidasPackageTasks()).toEqual([]);

    const removed = taskCenter.submitTidasPackageExportTask({ scope: 'current_user' });
    await flushPromises();
    taskCenter.removeTidasPackageTask(removed.id);
    await jest.advanceTimersByTimeAsync(1600);
    expect(taskCenter.listTidasPackageTasks()).toEqual([]);
  });

  it('hydrates normalized tasks from storage and resumes running jobs', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        tasks: [
          123,
          {
            id: 'same-id',
            state: 'running',
            phase: 'submitting',
            message: 123,
            createdAt: 'invalid-date',
            updatedAt: 'invalid-date',
            sequence: -9,
            request: {
              scope: 'current_user',
              roots: [{ table: 'flows', id: 'flow-1', version: '01.00.000' }, { table: 1 }],
            },
            jobId: 'job-1',
            rootCount: -5,
          },
          {
            id: 'same-id',
            state: 'running',
            phase: 'queued',
            message: 'second',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            jobId: 'job-2',
            sequence: 8,
            rootCount: 2,
          },
          {
            id: 'ok-completed',
            state: 'completed',
            phase: 'completed',
            message: 'done',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            sequence: 2,
            filename: 'from-storage.zip',
          },
          {
            id: '',
            state: 'running',
            phase: 'submitting',
          },
          {
            id: 'invalid-state',
            state: 'unknown',
            phase: 'submitting',
          },
          {
            id: 'invalid-phase',
            state: 'running',
            phase: 'unknown',
          },
        ],
      }),
    );

    mockGetTidasPackageJobApi.mockResolvedValue({
      data: {
        ok: true,
        status: 'ready',
        job_id: 'job-1',
        scope: 'current_user',
        root_count: 1,
        diagnostics: {},
        artifacts_by_kind: {
          export_zip: { metadata: { filename: 'artifact.zip' } },
        },
      },
      error: null,
    });

    const taskCenter = loadTaskCenterModule();
    await waitFor(() => {
      expect(taskCenter.listTidasPackageTasks().find((item) => item.id === 'same-id')?.state).toBe(
        'completed',
      );
    });

    const hydratedTasks = taskCenter.listTidasPackageTasks();
    expect(hydratedTasks.some((item) => item.id === '')).toBe(false);
    expect(hydratedTasks.find((item) => item.id === 'same-id')?.filename).toBe('artifact.zip');
    expect(mockGetTidasPackageJobApi).toHaveBeenCalledTimes(1);
  });

  it('clears incompatible and expired storage snapshots', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 999, savedAt: new Date().toISOString() }),
    );
    loadTaskCenterModule();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    jest.resetModules();
    mockGetTidasPackageJobApi.mockReset();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        savedAt: new Date(Date.now() - 73 * 60 * 60 * 1000).toISOString(),
        tasks: [],
      }),
    );

    loadTaskCenterModule();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('handles malformed storage payloads, parse errors, and non-browser storage guards', () => {
    localStorage.setItem(STORAGE_KEY, '{bad-json');
    const parseErrorModule = loadTaskCenterModule();
    expect(parseErrorModule.listTidasPackageTasks()).toEqual([]);

    jest.resetModules();
    const localStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: undefined,
    });
    try {
      const noWindowModule = loadTaskCenterModule();
      noWindowModule.submitTidasPackageExportTask({ scope: 'current_user' });
      expect(noWindowModule.listTidasPackageTasks()).toHaveLength(1);
    } finally {
      if (localStorageDescriptor) {
        Object.defineProperty(window, 'localStorage', localStorageDescriptor);
      } else {
        Reflect.deleteProperty(window, 'localStorage');
      }
    }
  });

  it('normalizes storage fallbacks for non-array tasks, invalid savedAt, missing sequence, and non-string scope', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        savedAt: 'not-a-date',
        tasks: {
          ignored: true,
        },
      }),
    );

    const emptyModule = loadTaskCenterModule();
    expect(emptyModule.listTidasPackageTasks()).toEqual([]);

    jest.resetModules();
    jest.useFakeTimers().setSystemTime(new Date('2026-03-21T10:00:00.000Z'));
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        savedAt: 'not-a-date',
        tasks: [
          {
            id: 'normalized-task',
            state: 'completed',
            phase: 'completed',
            message: 'done',
            createdAt: 123,
            updatedAt: '2026-03-21T11:00:00.000Z',
            workerJobId: 'worker-normalized-task',
            jobKind: 'tidas.export_package',
            scope: 123,
            rootCount: 3,
          },
          {
            id: 'normalized-import-task',
            kind: 'tidas_package_import',
            state: 'completed',
            phase: 'completed',
            message: 'import done',
            createdAt: '2026-03-21T10:10:00.000Z',
            updatedAt: '2026-03-21T10:11:00.000Z',
          },
        ],
      }),
    );

    const normalizedModule = loadTaskCenterModule();
    expect(normalizedModule.listTidasPackageTasks()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'normalized-task',
          sequence: 1,
          kind: 'tidas_package_export',
          workerJobId: 'worker-normalized-task',
          jobKind: 'tidas.export_package',
          scope: null,
          createdAt: '2026-03-21T10:00:00.000Z',
          updatedAt: '2026-03-21T11:00:00.000Z',
        }),
        expect.objectContaining({
          id: 'normalized-import-task',
          kind: 'tidas_package_import',
          sequence: 2,
        }),
      ]),
    );
  });

  it('restores string scopes when savedAt is missing from storage', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        tasks: [
          {
            id: 'scoped-task',
            state: 'completed',
            phase: 'completed',
            message: 'done',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            sequence: 3,
            scope: 'open_data',
          },
        ],
      }),
    );

    const taskCenter = loadTaskCenterModule();
    expect(taskCenter.listTidasPackageTasks()).toEqual([
      expect.objectContaining({
        id: 'scoped-task',
        scope: 'open_data',
      }),
    ]);
  });

  it('refreshes export tasks from canonical worker_jobs and preserves package job ids', async () => {
    mockRequestWorkerJobsApi.mockResolvedValue({
      data: [
        {
          id: 'worker-package-export',
          jobKind: 'tidas.export_package',
          status: 'completed',
          subjectType: 'lca_package_job',
          subjectId: 'package-job-1',
          subjectVersion: 'selected_roots',
          result: {
            packageJobId: 'package-job-1',
            packageJobStatus: 'completed',
            artifacts: [
              {
                artifactKind: 'export_zip',
                metadata: { filename: 'worker-export.zip' },
              },
            ],
          },
          createdAt: '2026-03-21T09:00:00.000Z',
          updatedAt: '2026-03-21T09:02:00.000Z',
        },
        {
          id: 'worker-package-import',
          jobKind: 'tidas.import_package',
          status: 'running',
          subjectType: 'lca_package_job',
          subjectId: 'package-import-1',
          createdAt: '2026-03-21T08:50:00.000Z',
          updatedAt: '2026-03-21T08:51:00.000Z',
        },
      ],
      error: null,
    });

    const taskCenter = loadTaskCenterModule();
    await taskCenter.refreshTidasPackageTasksFromWorkerJobs();

    expect(mockRequestWorkerJobsApi).toHaveBeenCalledWith({
      action: 'list',
      subjectType: 'lca_package_job',
      statuses: [
        'queued',
        'running',
        'waiting',
        'completed',
        'blocked',
        'stale',
        'failed',
        'cancelled',
      ],
      limit: 30,
    });
    expect(taskCenter.listTidasPackageTasks()).toEqual([
      expect.objectContaining({
        id: 'worker-package-export',
        workerJobId: 'worker-package-export',
        jobKind: 'tidas.export_package',
        jobId: 'package-job-1',
        state: 'completed',
        phase: 'completed',
        kind: 'tidas_package_export',
        scope: 'selected_roots',
        filename: 'worker-export.zip',
      }),
      expect.objectContaining({
        id: 'worker-package-import',
        workerJobId: 'worker-package-import',
        jobKind: 'tidas.import_package',
        jobId: 'package-import-1',
        state: 'running',
        phase: 'submitting',
        kind: 'tidas_package_import',
        message: 'Import task queued (package-import-1)',
      }),
    ]);
  });

  it('coalesces repeated local submissions that resolve to one canonical backend job', async () => {
    const pendingPoll = createDeferred<any>();
    mockQueueExportTidasPackageApi.mockResolvedValue({
      data: {
        ok: true,
        mode: 'in_progress',
        job_id: 'shared-package-job',
        worker_job_id: 'shared-worker-job',
        scope: 'current_user',
        root_count: 0,
      },
      error: null,
    });
    mockGetTidasPackageJobApi.mockReturnValue(pendingPoll.promise);

    const taskCenter = loadTaskCenterModule();
    const first = taskCenter.submitTidasPackageExportTask({ scope: 'current_user' });
    const second = taskCenter.submitTidasPackageExportTask({ scope: 'current_user' });

    await waitFor(() => {
      expect(taskCenter.listTidasPackageTasks()).toEqual([
        expect.objectContaining({
          id: first.id,
          workerJobId: 'shared-worker-job',
          jobId: 'shared-package-job',
          state: 'running',
        }),
      ]);
    });
    expect(taskCenter.listTidasPackageTasks()[0].id).not.toBe(second.id);
    expect(mockGetTidasPackageJobApi).toHaveBeenCalledTimes(1);
  });

  it('applies a post-coalescing poll rejection to the retained canonical task', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        tasks: [
          {
            id: 'retained-canonical-task',
            sequence: 1,
            kind: 'tidas_package_export',
            request: { scope: 'current_user' },
            state: 'completed',
            phase: 'completed',
            message: 'cached',
            createdAt: '2026-08-10T07:14:41.590Z',
            updatedAt: '2026-08-10T07:14:44.000Z',
            workerJobId: 'coalesced-worker-job',
            jobId: 'coalesced-package-job',
            scope: 'current_user',
            rootCount: 0,
          },
        ],
      }),
    );
    mockQueueExportTidasPackageApi.mockResolvedValue({
      data: {
        ok: true,
        mode: 'cache_hit',
        job_id: 'coalesced-package-job',
        worker_job_id: 'coalesced-worker-job',
        scope: 'current_user',
        root_count: 0,
      },
      error: null,
    });
    mockGetTidasPackageJobApi.mockRejectedValue(new Error('coalesced poll rejected'));

    const taskCenter = loadTaskCenterModule();
    taskCenter.submitTidasPackageExportTask({ scope: 'current_user' });

    await waitFor(() => {
      expect(taskCenter.listTidasPackageTasks()).toEqual([
        expect.objectContaining({
          id: 'retained-canonical-task',
          state: 'failed',
          phase: 'failed',
          error: 'coalesced poll rejected',
        }),
      ]);
    });
  });

  it('collapses persisted aliases and restores canonical Worker timestamps on refresh', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        tasks: [
          {
            id: 'original-local-task',
            sequence: 1,
            kind: 'tidas_package_export',
            request: { scope: 'current_user' },
            state: 'completed',
            phase: 'completed',
            message: 'original',
            createdAt: '2026-08-10T15:14:41.590Z',
            updatedAt: '2026-08-10T15:14:44.000Z',
            workerJobId: 'canonical-worker-job',
            jobId: 'canonical-package-job',
            scope: 'current_user',
            rootCount: 0,
          },
          {
            id: 'later-local-alias',
            sequence: 1,
            kind: 'tidas_package_export',
            request: { scope: 'current_user' },
            state: 'completed',
            phase: 'completed',
            message: 'alias',
            createdAt: '2026-08-10T15:20:00.000Z',
            updatedAt: '2026-08-10T15:20:00.000Z',
            workerJobId: 'canonical-worker-job',
            jobId: 'canonical-package-job',
            scope: 'current_user',
            rootCount: 0,
          },
        ],
      }),
    );
    mockRequestWorkerJobsApi.mockResolvedValue({
      data: [
        {
          id: 'canonical-worker-job',
          jobKind: 'tidas.export_package',
          status: 'completed',
          subjectType: 'lca_package_job',
          subjectId: 'canonical-package-job',
          subjectVersion: 'current_user',
          createdAt: '2026-08-10T15:14:41.590Z',
          updatedAt: '2026-08-10T15:14:44.000Z',
        },
      ],
      error: null,
    });

    const taskCenter = loadTaskCenterModule();
    expect(taskCenter.listTidasPackageTasks()).toHaveLength(1);

    await waitFor(() => {
      expect(taskCenter.listTidasPackageTasks()).toEqual([
        expect.objectContaining({
          id: 'original-local-task',
          workerJobId: 'canonical-worker-job',
          jobId: 'canonical-package-job',
          createdAt: '2026-08-10T15:14:41.590Z',
          updatedAt: '2026-08-10T15:14:44.000Z',
          state: 'completed',
        }),
      ]);
    });
  });

  it('reconciles partial aliases and clamps impossible Worker timestamps', async () => {
    const workerRefresh = createDeferred<any>();
    mockRequestWorkerJobsApi.mockReturnValueOnce(workerRefresh.promise);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        tasks: [
          {
            id: 'later-job-alias',
            sequence: 1,
            kind: 'tidas_package_export',
            request: { scope: 'open_data' },
            state: 'completed',
            phase: 'completed',
            message: 'later job alias',
            createdAt: '2026-08-10T10:05:00.000Z',
            updatedAt: '2026-08-10T10:05:00.000Z',
            jobId: 'shared-package-job',
          },
          {
            id: 'canonical-job-task',
            sequence: 1,
            kind: 'tidas_package_export',
            state: 'completed',
            phase: 'completed',
            message: 'canonical job task',
            createdAt: '2026-08-10T10:00:00.000Z',
            updatedAt: '2026-08-10T10:00:00.000Z',
            workerJobId: 'fallback-worker-job',
            jobId: 'shared-package-job',
            scope: 'current_user',
          },
          {
            id: 'canonical-worker-task',
            sequence: 2,
            kind: 'tidas_package_export',
            state: 'completed',
            phase: 'completed',
            message: 'canonical worker task',
            createdAt: '2026-08-10T11:00:00.000Z',
            updatedAt: '2026-08-10T11:00:00.000Z',
            workerJobId: 'shared-worker-job',
            jobId: 'fallback-package-job',
            scope: 'open_data',
          },
          {
            id: 'later-worker-alias',
            sequence: 3,
            kind: 'tidas_package_export',
            state: 'completed',
            phase: 'completed',
            message: 'later worker alias',
            createdAt: '2026-08-10T11:01:00.000Z',
            updatedAt: '2026-08-10T11:01:00.000Z',
            workerJobId: 'shared-worker-job',
          },
        ],
      }),
    );

    const taskCenter = loadTaskCenterModule();
    expect(taskCenter.listTidasPackageTasks()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'canonical-job-task',
          request: { scope: 'open_data' },
          workerJobId: 'fallback-worker-job',
          jobId: 'shared-package-job',
          scope: 'current_user',
        }),
        expect.objectContaining({
          id: 'canonical-worker-task',
          workerJobId: 'shared-worker-job',
          jobId: 'fallback-package-job',
          scope: 'open_data',
        }),
      ]),
    );

    workerRefresh.resolve({
      data: [
        {
          id: 'shared-worker-job',
          jobKind: 'tidas.export_package',
          status: 'completed',
          subjectType: 'lca_package_job',
          subjectId: 'fallback-package-job',
          createdAt: '2026-08-10T11:00:00.000Z',
          updatedAt: '2026-08-10T10:59:00.000Z',
        },
      ],
      error: null,
    });

    await waitFor(() => {
      expect(
        taskCenter.listTidasPackageTasks().find((item) => item.id === 'canonical-worker-task')
          ?.updatedAt,
      ).toBe('2026-08-10T11:00:00.000Z');
    });
  });

  it('maps canonical export worker_jobs phase and artifact fallback branches', async () => {
    mockRequestWorkerJobsApi.mockResolvedValue({
      data: [
        {
          id: 'worker-package-completed-fallback',
          jobKind: 'tidas.export_package',
          status: 'completed',
          subjectType: 'lca_package_job',
          subjectId: 'package-completed-fallback',
          result: {
            artifacts: [
              {
                artifactKind: 'diagnostic_json',
                metadata: { filename: 'ignored.json' },
              },
            ],
          },
          createdAt: '2026-03-21T09:40:00.000Z',
          updatedAt: '2026-03-21T09:41:00.000Z',
        },
        {
          id: 'worker-package-failed',
          jobKind: 'tidas.export_package',
          status: 'blocked',
          subjectType: 'lca_package_job',
          subjectId: 'package-failed',
          createdAt: '2026-03-21T09:30:00.000Z',
          updatedAt: '2026-03-21T09:31:00.000Z',
        },
        {
          id: 'worker-package-collect',
          jobKind: 'tidas.export_package',
          status: 'running',
          phase: 'collect_refs',
          subjectType: 'lca_package_job',
          subjectId: 'package-collect',
          createdAt: '2026-03-21T09:20:00.000Z',
          updatedAt: '2026-03-21T09:21:00.000Z',
        },
        {
          id: 'worker-package-finalize',
          jobKind: 'tidas.export_package',
          status: 'running',
          phase: 'finalize_zip',
          subjectType: 'lca_package_job',
          subjectId: 'package-finalize',
          createdAt: '2026-03-21T09:10:00.000Z',
          updatedAt: '2026-03-21T09:11:00.000Z',
        },
        {
          id: 'worker-package-queued',
          jobKind: 'tidas.export_package',
          status: 'queued',
          phase: 123,
          subjectType: 'lca_package_job',
          subjectId: 123,
          result: { packageJobId: null },
          createdAt: '2026-03-21T09:00:00.000Z',
          updatedAt: '2026-03-21T09:01:00.000Z',
        },
        {
          id: 'worker-package-submitting',
          jobKind: 'tidas.export_package',
          status: 'running',
          phase: 'unknown-worker-phase',
          subjectType: 'lca_package_job',
          subjectId: 'package-submitting',
          createdAt: '2026-03-21T08:50:00.000Z',
          updatedAt: '2026-03-21T08:51:00.000Z',
        },
        {
          id: 'worker-package-import-completed',
          jobKind: 'tidas.import_package',
          status: 'completed',
          subjectType: 'lca_package_job',
          subjectId: 'package-import-completed',
          createdAt: '2026-03-21T08:40:00.000Z',
          updatedAt: '2026-03-21T08:41:00.000Z',
        },
        {
          id: 'worker-package-import-running',
          jobKind: 'tidas.import_package',
          status: 'running',
          phase: 'import_package',
          subjectType: 'lca_package_job',
          subjectId: 'package-import-running',
          createdAt: '2026-03-21T08:30:00.000Z',
          updatedAt: '2026-03-21T08:31:00.000Z',
        },
        {
          id: 'worker-package-import-failed',
          jobKind: 'tidas.import_package',
          status: 'failed',
          subjectType: 'lca_package_job',
          subjectId: 'package-import-failed',
          errorCode: 'validation_failed',
          errorMessage: 'Validation blocked import',
          createdAt: '2026-03-21T08:20:00.000Z',
          updatedAt: '2026-03-21T08:21:00.000Z',
        },
      ],
      error: null,
    });

    const taskCenter = loadTaskCenterModule();
    await taskCenter.refreshTidasPackageTasksFromWorkerJobs();
    const tasks = taskCenter.listTidasPackageTasks();

    expect(tasks.find((item) => item.id === 'worker-package-completed-fallback')).toMatchObject({
      state: 'completed',
      phase: 'completed',
      filename: undefined,
      message: 'Export package ready (tidas-package.zip)',
    });
    expect(tasks.find((item) => item.id === 'worker-package-failed')).toMatchObject({
      state: 'failed',
      phase: 'failed',
      message: 'Export package failed',
      error: 'blocked',
    });
    expect(tasks.find((item) => item.id === 'worker-package-collect')).toMatchObject({
      state: 'running',
      phase: 'collect_refs',
      message: 'Collecting related datasets',
    });
    expect(tasks.find((item) => item.id === 'worker-package-finalize')).toMatchObject({
      state: 'running',
      phase: 'finalize_zip',
      message: 'Materializing ZIP package',
    });
    expect(tasks.find((item) => item.id === 'worker-package-queued')).toMatchObject({
      state: 'running',
      phase: 'queued',
      jobId: undefined,
      message: 'Export task queued (worker-package-queued)',
    });
    expect(tasks.find((item) => item.id === 'worker-package-submitting')).toMatchObject({
      state: 'running',
      phase: 'submitting',
      message: 'Export task queued (package-submitting)',
    });
    expect(tasks.find((item) => item.id === 'worker-package-import-completed')).toMatchObject({
      kind: 'tidas_package_import',
      state: 'completed',
      phase: 'completed',
      message: 'Import package completed',
    });
    expect(tasks.find((item) => item.id === 'worker-package-import-running')).toMatchObject({
      kind: 'tidas_package_import',
      state: 'running',
      phase: 'import_package',
      message: 'Importing package data',
    });
    expect(tasks.find((item) => item.id === 'worker-package-import-failed')).toMatchObject({
      kind: 'tidas_package_import',
      state: 'failed',
      phase: 'failed',
      message: 'Import package failed',
      error: 'Validation blocked import',
    });
  });

  it('surfaces worker_jobs refresh API errors with explicit and fallback messages', async () => {
    const explicitModule = loadTaskCenterModule();
    await explicitModule.refreshTidasPackageTasksFromWorkerJobs();
    mockRequestWorkerJobsApi.mockResolvedValueOnce({
      data: null,
      error: { message: 'package api down' },
    });
    await expect(explicitModule.refreshTidasPackageTasksFromWorkerJobs()).rejects.toThrow(
      'package api down',
    );

    const fallbackModule = loadTaskCenterModule();
    await fallbackModule.refreshTidasPackageTasksFromWorkerJobs();
    mockRequestWorkerJobsApi.mockResolvedValueOnce({ data: null, error: {} });
    await expect(fallbackModule.refreshTidasPackageTasksFromWorkerJobs()).rejects.toThrow(
      'Failed to refresh TIDAS package worker jobs',
    );
  });

  it('keeps existing export tasks when worker_jobs refresh returns no mappable tasks', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        tasks: [
          {
            id: 'existing-export-task',
            state: 'completed',
            phase: 'completed',
            message: 'existing',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            sequence: 1,
            jobId: 'existing-package-job',
          },
        ],
      }),
    );
    mockRequestWorkerJobsApi
      .mockResolvedValueOnce({
        data: null,
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 'worker-package-maintenance',
            jobKind: 'maintenance.package_gc',
            status: 'running',
            subjectType: 'lca_package_job',
            subjectId: 'package-maintenance',
          },
          {
            jobKind: 'tidas.export_package',
            status: 'running',
            subjectType: 'lca_package_job',
            subjectId: 'package-without-worker-id',
          },
        ],
        error: null,
      });

    const taskCenter = loadTaskCenterModule();
    const refreshed = await taskCenter.refreshTidasPackageTasksFromWorkerJobs();

    expect(refreshed).toEqual([
      expect.objectContaining({
        id: 'existing-export-task',
        message: 'existing',
      }),
    ]);

    const unmappableRefresh = await taskCenter.refreshTidasPackageTasksFromWorkerJobs();
    expect(unmappableRefresh).toEqual(refreshed);
  });

  it('submits queued export tasks and handles collect_refs progress before completion', async () => {
    jest.useFakeTimers();
    mockQueueExportTidasPackageApi.mockResolvedValue({
      data: {
        ok: true,
        mode: 'queued',
        job_id: 'job-progress',
        scope: 'open_data',
        root_count: 1,
      },
      error: null,
    });
    mockGetTidasPackageJobApi
      .mockResolvedValueOnce({
        data: {
          ok: true,
          status: 'running',
          job_id: 'job-progress',
          scope: 'open_data',
          root_count: 1,
          diagnostics: {
            stage: 'collect_refs',
            message: 'Collecting refs',
            processed_items: 1,
            total_items: 3,
          },
          artifacts_by_kind: {},
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          status: 'running',
          job_id: 'job-branches',
          diagnostics: { stage: 'finalize_zip' },
          artifacts_by_kind: {},
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          status: 'completed',
          job_id: 'job-progress',
          scope: 'open_data',
          root_count: 1,
          diagnostics: {},
          artifacts_by_kind: {},
        },
        error: null,
      });

    const taskCenter = loadTaskCenterModule();
    const task = taskCenter.submitTidasPackageExportTask({
      scope: 'open_data',
      roots: [{ table: 'flows', id: 'flow-1', version: '01.00.000' }],
    });

    await flushPromises();
    expect(taskCenter.listTidasPackageTasks()[0].message).toContain('Collecting refs (1/3)');

    await jest.advanceTimersByTimeAsync(3200);
    await waitFor(() => {
      const updated = taskCenter.listTidasPackageTasks().find((item) => item.id === task.id);
      expect(updated?.state).toBe('completed');
      expect(updated?.filename).toBe('flows-package.zip');
    });
  });

  it('handles cache-hit flow, transient poll failures, and eventual completion', async () => {
    jest.useFakeTimers();
    mockQueueExportTidasPackageApi.mockResolvedValue({
      data: {
        ok: true,
        mode: 'cache_hit',
        job_id: 'job-cache-hit',
        scope: 'current_user',
        root_count: 0,
      },
      error: null,
    });
    mockGetTidasPackageJobApi
      .mockResolvedValueOnce({ data: null, error: { message: 'network' } })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          status: 'ready',
          job_id: 'job-cache-hit',
          scope: 'current_user',
          root_count: 0,
          diagnostics: { stage: 'finalize_zip' },
          artifacts_by_kind: {
            export_zip: { metadata: { filename: 'ready.zip' } },
          },
        },
        error: null,
      });

    const taskCenter = loadTaskCenterModule();
    const task = taskCenter.submitTidasPackageExportTask({ scope: 'current_user' });
    await flushPromises();

    let current = taskCenter.listTidasPackageTasks().find((item) => item.id === task.id)!;
    expect(current.message).toContain('retrying (1/5)');

    await jest.advanceTimersByTimeAsync(1600);
    await waitFor(() => {
      current = taskCenter.listTidasPackageTasks().find((item) => item.id === task.id)!;
      expect(current.state).toBe('completed');
      expect(current.filename).toBe('ready.zip');
      expect(current.message).toContain('Export package ready');
    });
  });

  it('fails the task after repeated poll errors and preserves failed metadata precedence', async () => {
    jest.useFakeTimers();
    mockQueueExportTidasPackageApi.mockResolvedValue({
      data: {
        ok: true,
        mode: 'queued',
        job_id: 'job-fail',
        scope: 'current_user',
        root_count: 1,
      },
      error: null,
    });
    for (let index = 0; index < 5; index += 1) {
      mockGetTidasPackageJobApi.mockResolvedValueOnce({
        data: null,
        error: { message: `failure-${index}` },
      });
    }

    const taskCenter = loadTaskCenterModule();
    const task = taskCenter.submitTidasPackageExportTask({ scope: 'current_user' });

    for (let index = 0; index < 5; index += 1) {
      await flushPromises();
      await jest.advanceTimersByTimeAsync(1600);
    }

    await waitFor(() => {
      const failed = taskCenter.listTidasPackageTasks().find((item) => item.id === task.id)!;
      expect(failed.state).toBe('failed');
      expect(failed.error).toBe('failure-4');
    });
  });

  it('handles queue failures and timeout branch', async () => {
    mockQueueExportTidasPackageApi.mockResolvedValueOnce({
      data: null,
      error: new Error('queue failed'),
    });

    const taskCenter = loadTaskCenterModule();
    const queueFailedTask = taskCenter.submitTidasPackageExportTask({ scope: 'current_user' });
    await waitFor(() => {
      const failed = taskCenter
        .listTidasPackageTasks()
        .find((item) => item.id === queueFailedTask.id)!;
      expect(failed.state).toBe('failed');
      expect(failed.error).toBe('queue failed');
    });

    jest.resetModules();
    jest.useFakeTimers();
    mockQueueExportTidasPackageApi.mockResolvedValue({
      data: {
        ok: true,
        mode: 'queued',
        job_id: 'job-timeout',
        scope: 'current_user',
        root_count: 'bad',
      },
      error: null,
    });
    mockGetTidasPackageJobApi.mockResolvedValue({
      data: {
        ok: true,
        status: 'running',
        job_id: 'job-timeout',
        diagnostics: {},
        artifacts_by_kind: {},
      },
      error: null,
    });

    const nowSpy = jest.spyOn(Date, 'now');
    const sequence = [100, 100, 100, 8_000_000_000];
    nowSpy.mockImplementation(() => sequence.shift() ?? 8_000_000_000);

    const timeoutModule = loadTaskCenterModule();
    const timeoutTask = timeoutModule.submitTidasPackageExportTask({ scope: 'current_user' });
    await flushPromises();

    await waitFor(() => {
      const failed = timeoutModule
        .listTidasPackageTasks()
        .find((item) => item.id === timeoutTask.id)!;
      expect(failed.state).toBe('failed');
      expect(failed.error).toBe('tidas_package_export_timeout');
    });
    nowSpy.mockRestore();
  });

  it('uses fallback messages for invalid queue responses and terminal poll failures without error payloads', async () => {
    jest.useFakeTimers();
    mockQueueExportTidasPackageApi
      .mockResolvedValueOnce({
        data: { ok: false },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          mode: 'queued',
          job_id: 'job-no-error',
          scope: 'current_user',
        },
        error: null,
      });
    for (let index = 0; index < 5; index += 1) {
      mockGetTidasPackageJobApi.mockResolvedValueOnce({
        data: { ok: false },
        error: null,
      });
    }

    const taskCenter = loadTaskCenterModule();
    const invalidQueueTask = taskCenter.submitTidasPackageExportTask({ scope: 'current_user' });
    const retryFallbackTask = taskCenter.submitTidasPackageExportTask({ scope: 'current_user' });

    await waitFor(() => {
      const failed = taskCenter
        .listTidasPackageTasks()
        .find((item) => item.id === invalidQueueTask.id)!;
      expect(failed.error).toBe('Export failed');
    });

    for (let index = 0; index < 5; index += 1) {
      await flushPromises();
      await jest.advanceTimersByTimeAsync(1600);
    }

    await waitFor(() => {
      const failed = taskCenter
        .listTidasPackageTasks()
        .find((item) => item.id === retryFallbackTask.id)!;
      expect(failed.error).toBe('Failed to load TIDAS package job status');
      expect(failed.rootCount).toBe(0);
    });
  });

  it('normalizes oversized upload failures reported by the export job', async () => {
    jest.useFakeTimers();
    mockQueueExportTidasPackageApi.mockResolvedValue({
      data: {
        ok: true,
        mode: 'queued',
        job_id: 'job-too-large',
        scope: 'open_data',
        root_count: 0,
      },
      error: null,
    });
    mockGetTidasPackageJobApi.mockResolvedValueOnce({
      data: {
        ok: true,
        status: 'failed',
        job_id: 'job-too-large',
        diagnostics: {
          error:
            'object upload failed status=413 Payload Too Large body=<?xml version="1.0"?><Error><Code>EntityTooLarge</Code><Message>The object exceeded the maximum allowed size</Message></Error>',
        },
        artifacts_by_kind: {},
      },
      error: null,
    });

    const taskCenter = loadTaskCenterModule();
    const task = taskCenter.submitTidasPackageExportTask({ scope: 'open_data' });

    await waitFor(() => {
      const failed = taskCenter.listTidasPackageTasks().find((item) => item.id === task.id)!;
      expect(failed.state).toBe('failed');
      expect(failed.error).toBe(
        'Export package is too large for the current storage upload limit. Try exporting a smaller scope, or ask an administrator to enable large-file upload support.',
      );
    });
  });

  it('normalizes oversized upload failures when they are only present in diagnostics.message', async () => {
    jest.useFakeTimers();
    mockQueueExportTidasPackageApi.mockResolvedValue({
      data: {
        ok: true,
        mode: 'queued',
        job_id: 'job-too-large-message',
        scope: 'open_data',
        root_count: 0,
      },
      error: null,
    });
    mockGetTidasPackageJobApi.mockResolvedValueOnce({
      data: {
        ok: true,
        status: 'failed',
        job_id: 'job-too-large-message',
        diagnostics: {
          message:
            'object upload failed status=413 Payload Too Large body=<?xml version="1.0"?><Error><Code>EntityTooLarge</Code><Message>The object exceeded the maximum allowed size</Message></Error>',
        },
        artifacts_by_kind: {},
      },
      error: null,
    });

    const taskCenter = loadTaskCenterModule();
    const task = taskCenter.submitTidasPackageExportTask({ scope: 'open_data' });

    await waitFor(() => {
      const failed = taskCenter.listTidasPackageTasks().find((item) => item.id === task.id)!;
      expect(failed.state).toBe('failed');
      expect(failed.error).toBe(
        'Export package is too large for the current storage upload limit. Try exporting a smaller scope, or ask an administrator to enable large-file upload support.',
      );
    });
  });

  it('covers additional polling branches for stale/finalize/submitting message paths', async () => {
    jest.useFakeTimers();
    mockQueueExportTidasPackageApi.mockResolvedValue({
      data: {
        ok: true,
        mode: 'queued',
        job_id: 'job-branches',
        scope: 'current_user',
        root_count: 0,
      },
      error: null,
    });
    mockGetTidasPackageJobApi
      .mockResolvedValueOnce({
        data: {
          ok: true,
          status: 'running',
          job_id: 'job-branches',
          diagnostics: { stage: 'collect_refs' },
          artifacts_by_kind: {},
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          status: 'running',
          job_id: 'job-branches',
          diagnostics: {},
          artifacts_by_kind: {},
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          status: 'stale',
          job_id: 'job-branches',
          diagnostics: { error: 'diag-error' },
          artifacts_by_kind: {},
        },
        error: null,
      });

    const taskCenter = loadTaskCenterModule();
    const task = taskCenter.submitTidasPackageExportTask({ scope: 'current_user' });
    await flushPromises();
    expect(taskCenter.listTidasPackageTasks()[0].message).toMatch(
      /Materializing ZIP package|Collecting related datasets/,
    );

    await jest.advanceTimersByTimeAsync(1600);
    expect(taskCenter.listTidasPackageTasks()[0].message).toMatch(
      /Collecting related datasets|Export task running/,
    );

    await jest.advanceTimersByTimeAsync(1600);
    expect(taskCenter.listTidasPackageTasks()[0].message).toContain('Export task running');

    await jest.advanceTimersByTimeAsync(1600);
    await waitFor(() => {
      const failed = taskCenter.listTidasPackageTasks().find((item) => item.id === task.id)!;
      expect(failed.state).toBe('failed');
      expect(failed.error).toBe('diag-error');
    });
  });

  it('keeps diagnostic messages when finalize_zip includes explicit text', async () => {
    jest.useFakeTimers();
    mockQueueExportTidasPackageApi.mockResolvedValue({
      data: {
        ok: true,
        mode: 'queued',
        job_id: 'job-finalize-message',
        scope: 'current_user',
        root_count: 0,
      },
      error: null,
    });
    mockGetTidasPackageJobApi
      .mockResolvedValueOnce({
        data: {
          ok: true,
          status: 'running',
          job_id: 'job-finalize-message',
          diagnostics: { stage: 'finalize_zip', message: 'custom status' },
          artifacts_by_kind: {},
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          status: 'ready',
          job_id: 'job-finalize-message',
          diagnostics: {},
          artifacts_by_kind: {},
        },
        error: null,
      });

    const taskCenter = loadTaskCenterModule();
    taskCenter.submitTidasPackageExportTask({ scope: 'current_user' });
    await flushPromises();
    expect(taskCenter.listTidasPackageTasks()[0].message).toBe('custom status');
  });

  it('prefers request-cache errors and generic failed messages when applying failed job results', async () => {
    jest.useFakeTimers();
    mockQueueExportTidasPackageApi
      .mockResolvedValueOnce({
        data: {
          ok: true,
          mode: 'queued',
          job_id: 'job-request-cache',
          scope: 'current_user',
          root_count: 0,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          mode: 'queued',
          job_id: 'job-generic-failed',
          scope: 'current_user',
          root_count: 0,
        },
        error: null,
      });
    mockGetTidasPackageJobApi
      .mockResolvedValueOnce({
        data: {
          ok: true,
          status: 'failed',
          job_id: 'job-request-cache',
          diagnostics: {},
          request_cache: {
            error_message: 'request-cache-error',
          },
          artifacts_by_kind: {},
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          status: 'failed',
          job_id: 'job-generic-failed',
          diagnostics: {},
          artifacts_by_kind: {},
        },
        error: null,
      });

    const taskCenter = loadTaskCenterModule();
    const requestCacheTask = taskCenter.submitTidasPackageExportTask({ scope: 'current_user' });
    const genericFailedTask = taskCenter.submitTidasPackageExportTask({ scope: 'current_user' });

    await waitFor(() => {
      expect(
        taskCenter.listTidasPackageTasks().find((item) => item.id === requestCacheTask.id)?.error,
      ).toBe('request-cache-error');
      expect(
        taskCenter.listTidasPackageTasks().find((item) => item.id === genericFailedTask.id)?.error,
      ).toBe('TIDAS package export failed');
    });
  });

  it('handles removed tasks during async queue and string-thrown queue failures', async () => {
    let resolveQueue: (value: any) => void = () => {};
    mockQueueExportTidasPackageApi.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveQueue = resolve;
        }),
    );
    mockGetTidasPackageJobApi.mockResolvedValue({
      data: {
        ok: true,
        status: 'ready',
        job_id: 'job-late',
        diagnostics: {},
        artifacts_by_kind: {},
      },
      error: null,
    });

    const taskCenter = loadTaskCenterModule();
    const task = taskCenter.submitTidasPackageExportTask({ scope: 'current_user' });
    taskCenter.removeTidasPackageTask(task.id);
    resolveQueue({
      data: {
        ok: true,
        mode: 'queued',
        job_id: 'job-late',
        scope: 'current_user',
        root_count: 0,
      },
      error: null,
    });
    await flushPromises();
    expect(taskCenter.listTidasPackageTasks()).toEqual([]);

    mockQueueExportTidasPackageApi.mockImplementationOnce(() => {
      throw 'queue-string-error';
    });
    const stringErrorTask = taskCenter.submitTidasPackageExportTask({ scope: 'current_user' });
    await waitFor(() => {
      const failed = taskCenter
        .listTidasPackageTasks()
        .find((item) => item.id === stringErrorTask.id)!;
      expect(failed.error).toBe('queue-string-error');
    });
  });

  it('downloads ready exports and supports list/remove/clear/subscribe helpers', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        tasks: [
          {
            id: 'downloadable',
            state: 'completed',
            phase: 'completed',
            message: 'done',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            sequence: 1,
            jobId: 'job-download',
            filename: 'old.zip',
          },
          {
            id: 'running-task',
            state: 'running',
            phase: 'queued',
            message: 'run',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            sequence: 2,
            jobId: 'job-running',
          },
        ],
      }),
    );

    mockGetTidasPackageJobApi.mockResolvedValue({
      data: {
        ok: true,
        status: 'queued',
        job_id: 'job-running',
        diagnostics: {},
        artifacts_by_kind: {},
      },
      error: null,
    });

    const taskCenter = loadTaskCenterModule();
    const listener = jest.fn();
    const unsubscribe = taskCenter.subscribeTidasPackageTasks(listener);

    mockDownloadReadyTidasPackageExportApi.mockResolvedValueOnce({
      data: { ok: true, filename: 'new.zip', job_id: 'job-download' },
      error: null,
    });
    const payload = await taskCenter.downloadTidasPackageExportTask('downloadable');
    expect(payload.filename).toBe('new.zip');
    expect(
      taskCenter.listTidasPackageTasks().find((item) => item.id === 'downloadable')?.message,
    ).toContain('new.zip');

    mockDownloadReadyTidasPackageExportApi.mockResolvedValueOnce({
      data: { ok: false },
      error: new Error('download failed'),
    });
    await expect(taskCenter.downloadTidasPackageExportTask('downloadable')).rejects.toThrow(
      'download failed',
    );
    mockDownloadReadyTidasPackageExportApi.mockResolvedValueOnce({
      data: { ok: false },
      error: null,
    });
    await expect(taskCenter.downloadTidasPackageExportTask('running-task')).rejects.toThrow(
      'Failed to download TIDAS package',
    );
    await expect(taskCenter.downloadTidasPackageExportTask('missing')).rejects.toThrow(
      'Package export task is missing job information',
    );

    taskCenter.removeTidasPackageTask('downloadable');
    expect(taskCenter.listTidasPackageTasks().some((item) => item.id === 'downloadable')).toBe(
      false,
    );
    taskCenter.clearFinishedTidasPackageTasks();
    expect(taskCenter.listTidasPackageTasks().every((item) => item.state === 'running')).toBe(true);

    expect(listener).toHaveBeenCalled();
    unsubscribe();
    listener.mockClear();
    taskCenter.removeTidasPackageTask('running-task');
    expect(listener).not.toHaveBeenCalled();
  });

  it('returns a completed download without mutating the next authenticated owner', async () => {
    const download = createDeferred<any>();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        tasks: [
          {
            id: 'stale-download-task',
            state: 'completed',
            phase: 'completed',
            message: 'ready',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            sequence: 1,
            jobId: 'stale-download-job',
          },
        ],
      }),
    );
    mockDownloadReadyTidasPackageExportApi.mockReturnValueOnce(download.promise);

    const taskCenter = loadTaskCenterModule();
    const pending = taskCenter.downloadTidasPackageExportTask('stale-download-task');
    taskCenter.bindTidasPackageTaskCenterOwner('user-b');
    download.resolve({
      data: { ok: true, filename: 'stale-owner.zip', job_id: 'stale-download-job' },
      error: null,
    });

    await expect(pending).resolves.toEqual(
      expect.objectContaining({ filename: 'stale-owner.zip' }),
    );
    expect(taskCenter.listTidasPackageTasks()).toEqual([]);
  });

  it('uses the default filename when downloading tasks that never recorded one locally', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        tasks: [
          {
            id: 'download-no-name',
            state: 'completed',
            phase: 'completed',
            message: 'done',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            sequence: 1,
            jobId: 'job-download-no-name',
          },
        ],
      }),
    );

    const taskCenter = loadTaskCenterModule();
    mockDownloadReadyTidasPackageExportApi.mockResolvedValueOnce({
      data: { ok: true, filename: 'downloaded.zip', job_id: 'job-download-no-name' },
      error: null,
    });

    await expect(taskCenter.downloadTidasPackageExportTask('download-no-name')).resolves.toEqual({
      ok: true,
      filename: 'downloaded.zip',
      job_id: 'job-download-no-name',
    });
    expect(mockDownloadReadyTidasPackageExportApi).toHaveBeenCalledWith(
      'job-download-no-name',
      'tidas-package.zip',
    );
  });
  it('rejects import without an owner and propagates admission failure', async () => {
    const center = loadUnboundTaskCenterModule();
    await expect(center.submitTidasPackageImportTask(new File(['zip'], 'a.zip'))).rejects.toThrow(
      'authenticated',
    );
    center.bindTidasPackageTaskCenterOwner('user-a');
    for (const response of [
      { data: null, error: new Error('upload failed') },
      { data: null, error: null },
      { data: { ok: false }, error: null },
    ]) {
      mockQueueImportTidasPackageApi.mockResolvedValueOnce(response);
      await expect(
        center.submitTidasPackageImportTask(new File(['zip'], 'a.zip')),
      ).rejects.toThrow();
    }
    expect(center.listTidasPackageTasks()).toEqual([]);
  });

  it('drops an admission response after the user switches accounts', async () => {
    const center = loadTaskCenterModule();
    const pending = createDeferred<any>();
    mockQueueImportTidasPackageApi.mockReturnValueOnce(pending.promise);
    const submit = center.submitTidasPackageImportTask(new File(['zip'], 'a.zip'));
    center.bindTidasPackageTaskCenterOwner('user-b');
    pending.resolve({ data: { ok: true, job_id: 'old' }, error: null });
    await submit;
    expect(center.listTidasPackageTasks()).toEqual([]);
  });

  it('restores validated partial outcome and rejects invalid persisted counts', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        tasks: [
          {
            id: 'restore-import',
            sequence: 1,
            kind: 'tidas_package_import',
            state: 'completed',
            phase: 'completed',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            importOutcome: 'partial',
            importSummary: {
              imported_count: 2,
              existing_count: -1,
              invalid: '3',
              null_count: null,
            },
          },
        ],
      }),
    );
    const center = loadTaskCenterModule();
    expect(center.listTidasPackageTasks()[0].importSummary).toEqual({ imported_count: 2 });
    expect(center.listTidasPackageTasks()[0].importOutcome).toBe('partial');
  });

  const importRow = (result: any = {}, status = 'completed') => ({
    id: 'import-worker',
    jobKind: 'tidas.import_package',
    subjectId: 'import-job',
    createdAt: '2026-09-18T00:00:00Z',
    updatedAt: '2026-09-18T00:01:00Z',
    status,
    result: { importResult: result },
  });
  const enqueueImport = async (
    center: ReturnType<typeof loadTaskCenterModule>,
    callback?: () => void,
  ) => {
    mockQueueImportTidasPackageApi.mockResolvedValue({
      data: { ok: true, job_id: 'import-job' },
      error: null,
    });
    await center.submitTidasPackageImportTask(new File(['zip'], 'a.zip'), callback);
  };

  it.each([
    ['success', 0, 'completed', 'success'],
    ['success', 1, 'completed', 'partial'],
    ['partial', 1, 'completed', 'partial'],
    ['none', 2, 'failed', 'none'],
    ['interrupted', 1, 'failed', 'interrupted'],
  ])(
    'maps list outcome %s with %s unimported records',
    async (outcome, notImported, state, projected) => {
      const center = loadTaskCenterModule();
      await center.refreshTidasPackageTasksFromWorkerJobs();
      await enqueueImport(center);
      mockRequestWorkerJobsApi.mockResolvedValue({
        data: [
          importRow({
            outcome,
            executionComplete: outcome !== 'interrupted',
            reportAvailable: true,
            detailsAvailable: false,
            summary: {
              root_count: 2,
              imported_count: 1,
              not_imported_count: notImported,
              invalid: -1,
              text: '2',
            },
          }),
        ],
        error: null,
      });
      await center.refreshTidasPackageTasksFromWorkerJobs();
      expect(center.listTidasPackageTasks()[0]).toMatchObject({
        state,
        importOutcome: projected,
        importReportAvailable: true,
        importDetailsAvailable: false,
        rootCount: 2,
        filename: 'a.zip',
        importSummary: { root_count: 2, imported_count: 1, not_imported_count: notImported },
      });
      expect(center.listTidasPackageTasks()[0].importSummary).not.toHaveProperty('invalid');
      expect(mockGetTidasPackageJobApi).not.toHaveBeenCalled();
      center.bindTidasPackageTaskCenterOwner(null);
      mockRequestWorkerJobsApi.mockResolvedValue({ data: [], error: null });
      const restored = loadTaskCenterModule();
      expect(restored.listTidasPackageTasks()[0]).toMatchObject({
        importReportAvailable: true,
        importDetailsAvailable: false,
      });
    },
  );

  it.each([0, 2])(
    'completes rootless whole-package imports with %s inserted records',
    async (inserted) => {
      const center = loadTaskCenterModule();
      await center.refreshTidasPackageTasksFromWorkerJobs();
      await enqueueImport(center);
      mockRequestWorkerJobsApi.mockResolvedValue({
        data: [
          importRow({
            outcome: 'success',
            executionComplete: true,
            summary: {
              total_entries: 2,
              root_count: 0,
              imported_count: inserted,
              existing_count: 2 - inserted,
              not_imported_count: 0,
            },
          }),
        ],
        error: null,
      });
      await center.refreshTidasPackageTasksFromWorkerJobs();
      expect(center.listTidasPackageTasks()[0]).toMatchObject({
        state: 'completed',
        importOutcome: 'success',
        rootCount: 0,
        importSummary: { existing_count: 2 - inserted },
      });
      expect(mockGetTidasPackageJobApi).not.toHaveBeenCalled();
    },
  );

  it('has no import polling or timeout and retains state across list errors and reload', async () => {
    jest.useFakeTimers();
    const center = loadTaskCenterModule();
    await center.refreshTidasPackageTasksFromWorkerJobs();
    await enqueueImport(center);
    await jest.advanceTimersByTimeAsync(3 * 60 * 60 * 1000);
    expect(mockGetTidasPackageJobApi).not.toHaveBeenCalled();
    mockRequestWorkerJobsApi.mockResolvedValue({ data: null, error: new Error('offline') });
    await expect(center.refreshTidasPackageTasksFromWorkerJobs()).rejects.toThrow('offline');
    expect(center.listTidasPackageTasks()[0].state).toBe('running');
    center.bindTidasPackageTaskCenterOwner(null);
    mockRequestWorkerJobsApi.mockResolvedValue({
      data: [importRow({ outcome: 'success', summary: { imported_count: 2 } })],
      error: null,
    });
    const event = jest.fn();
    window.addEventListener('tidas-package-imported', event);
    const restored = loadTaskCenterModule();
    await restored.refreshTidasPackageTasksFromWorkerJobs();
    await restored.refreshTidasPackageTasksFromWorkerJobs();
    expect(event).toHaveBeenCalledTimes(1);
    expect(mockGetTidasPackageJobApi).not.toHaveBeenCalled();
    window.removeEventListener('tidas-package-imported', event);
    jest.useRealTimers();
  });

  it.each([0, 2])('notifies exactly once for newly inserted records (%s)', async (count) => {
    const center = loadTaskCenterModule();
    await center.refreshTidasPackageTasksFromWorkerJobs();
    const callback = jest.fn();
    await enqueueImport(center, callback);
    mockRequestWorkerJobsApi.mockResolvedValue({
      data: [importRow({ outcome: 'success', summary: { imported_count: count } })],
      error: null,
    });
    await center.refreshTidasPackageTasksFromWorkerJobs();
    await center.refreshTidasPackageTasksFromWorkerJobs();
    expect(callback).toHaveBeenCalledTimes(count ? 1 : 0);
  });

  it('ignores in-flight results and callbacks after changing owners', async () => {
    const center = loadTaskCenterModule();
    await center.refreshTidasPackageTasksFromWorkerJobs();
    const callback = jest.fn();
    await enqueueImport(center, callback);
    const pending = createDeferred<any>();
    mockRequestWorkerJobsApi.mockReturnValueOnce(pending.promise);
    const refresh = center.refreshTidasPackageTasksFromWorkerJobs();
    center.bindTidasPackageTaskCenterOwner('user-b');
    pending.resolve({
      data: [importRow({ outcome: 'success', summary: { imported_count: 1 } })],
      error: null,
    });
    await refresh;
    expect(callback).not.toHaveBeenCalled();
    expect(center.listTidasPackageTasks()).toEqual([]);
  });

  it('contains consumer callback errors and refreshes records retained after interruption', async () => {
    const center = loadTaskCenterModule();
    await center.refreshTidasPackageTasksFromWorkerJobs();
    await enqueueImport(center, () => {
      throw new Error('consumer failed');
    });
    mockRequestWorkerJobsApi.mockResolvedValue({
      data: [importRow({ outcome: 'interrupted', summary: { imported_count: 1 } })],
      error: null,
    });
    await expect(center.refreshTidasPackageTasksFromWorkerJobs()).resolves.toHaveLength(1);
    expect(center.listTidasPackageTasks()[0].state).toBe('failed');
  });
  it('accepts incomplete legacy list summaries without requesting individual jobs', async () => {
    const center = loadTaskCenterModule();
    await center.refreshTidasPackageTasksFromWorkerJobs();
    await enqueueImport(center);
    mockRequestWorkerJobsApi.mockResolvedValue({
      data: [importRow({ outcome: 'future', summary: 'invalid' })],
      error: null,
    });
    await center.refreshTidasPackageTasksFromWorkerJobs();
    expect(center.listTidasPackageTasks()[0].importSummary).toEqual({});
    expect(mockGetTidasPackageJobApi).not.toHaveBeenCalled();
  });

  it('handles recovered imports with no domain job id and no inserted count', async () => {
    const center = loadTaskCenterModule();
    await center.refreshTidasPackageTasksFromWorkerJobs();
    const row = { ...importRow({}, 'running'), subjectId: undefined };
    mockRequestWorkerJobsApi.mockResolvedValue({ data: [row], error: null });
    await center.refreshTidasPackageTasksFromWorkerJobs();
    mockRequestWorkerJobsApi.mockResolvedValue({
      data: [{ ...row, status: 'completed' }],
      error: null,
    });
    await center.refreshTidasPackageTasksFromWorkerJobs();
    expect(center.listTidasPackageTasks()).toHaveLength(1);
  });

  it.each(['subscriber', 'event'])(
    'stops old-owner notifications after %s changes the owner',
    async (mode) => {
      const center = loadTaskCenterModule();
      await center.refreshTidasPackageTasksFromWorkerJobs();
      const callback = jest.fn();
      await enqueueImport(center, callback);
      const switchOwner = () => {
        mockRequestWorkerJobsApi.mockResolvedValue({ data: [], error: null });
        center.bindTidasPackageTaskCenterOwner('user-b');
      };
      const unsubscribe =
        mode === 'subscriber'
          ? center.subscribeTidasPackageTasks(() => {
              if (center.listTidasPackageTasks()[0]?.state === 'completed') switchOwner();
            })
          : () => {};
      if (mode === 'event') window.addEventListener('tidas-package-imported', switchOwner);
      mockRequestWorkerJobsApi.mockResolvedValue({
        data: [importRow({ outcome: 'success', summary: { imported_count: 2 } })],
        error: null,
      });
      await center.refreshTidasPackageTasksFromWorkerJobs();
      expect(callback).not.toHaveBeenCalled();
      unsubscribe();
      window.removeEventListener('tidas-package-imported', switchOwner);
    },
  );
});
