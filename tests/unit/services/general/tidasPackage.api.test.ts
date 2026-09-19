import {
  attachStateCodesToRows,
  downloadReadyTidasPackageExportApi,
  enqueueImportTidasPackageApi,
  exportTidasPackageApi,
  getTidasPackageJobApi,
  importTidasPackageApi,
  queueImportTidasPackageApi,
  prepareImportTidasPackageUploadApi,
  queueExportTidasPackageApi,
  resolveFunctionInvokeError,
} from '@/services/general/api';
import { FunctionRegion } from '@supabase/supabase-js';

const mockFrom = jest.fn();
const mockAuthGetSession = jest.fn();
const mockFunctionsInvoke = jest.fn();
const mockStorageFrom = jest.fn();
const mockUploadToSignedUrl = jest.fn();
const mockGetLocale = jest.fn(() => 'en-US');
const originalSupabaseUrl = process.env.SUPABASE_URL;

jest.mock('@/services/supabase', () => ({
  __esModule: true,
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    auth: {
      getSession: (...args: any[]) => mockAuthGetSession(...args),
    },
    functions: {
      invoke: (...args: any[]) => mockFunctionsInvoke(...args),
    },
    storage: {
      from: (...args: any[]) => mockStorageFrom(...args),
    },
  },
}));

jest.mock('antd', () => ({
  __esModule: true,
  message: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

jest.mock('umi', () => ({
  __esModule: true,
  getLocale: () => mockGetLocale(),
}));

jest.mock('@/services/classifications/api', () => ({
  __esModule: true,
  getILCDClassification: jest.fn(),
  getILCDFlowCategorizationAll: jest.fn(),
}));

jest.mock('@/services/locations/api', () => ({
  __esModule: true,
  getILCDLocationByValues: jest.fn(),
}));

jest.mock('@/services/flows/util', () => ({
  __esModule: true,
  genFlowName: jest.fn(() => 'flow-name'),
}));

jest.mock('@/services/processes/util', () => ({
  __esModule: true,
  genProcessName: jest.fn(() => 'process-name'),
}));

jest.mock('@/services/general/util', () => ({
  __esModule: true,
  classificationToString: jest.fn(() => 'classification'),
  genClassificationZH: jest.fn(() => []),
  getLangText: jest.fn(() => '-'),
  getLangValidationErrorMessage: jest.fn(() => ''),
  jsonToList: jest.fn((value: any) => (Array.isArray(value) ? value : value ? [value] : [])),
  normalizeLangPayloadBeforeSave: jest.fn((value: any) => value),
}));

const createQueryBuilder = <T>(resolvedValue: T) => {
  const builder: any = {
    select: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    then: (resolve: any, reject?: any) => Promise.resolve(resolvedValue).then(resolve, reject),
  };
  return builder;
};

const makeSession = (token = 'token-123') => ({
  data: {
    session: {
      access_token: token,
    },
  },
});

const makeJobResponse = (overrides: Record<string, any> = {}) => ({
  ok: true,
  job_id: 'job-1',
  job_type: 'export_package',
  status: 'completed',
  scope: 'current_user',
  root_count: 1,
  request_key: null,
  timestamps: {
    created_at: null,
    started_at: null,
    finished_at: null,
    updated_at: null,
  },
  payload: {},
  diagnostics: {},
  artifacts: [],
  artifacts_by_kind: {},
  request_cache: null,
  ...overrides,
});

const makeDownloadHooks = () => {
  const originalCreateElement = document.createElement.bind(document);
  const link = originalCreateElement('a');
  const clickSpy = jest.spyOn(link, 'click').mockImplementation(() => undefined);
  const createElementSpy = jest.spyOn(document, 'createElement').mockImplementation(((
    tagName: string,
  ) => {
    if (tagName === 'a') {
      return link;
    }
    return originalCreateElement(tagName as keyof HTMLElementTagNameMap);
  }) as any);
  const createObjectURLSpy = jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:download');
  const revokeObjectURLSpy = jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

  return {
    clickSpy,
    createElementSpy,
    createObjectURLSpy,
    link,
    revokeObjectURLSpy,
  };
};

const createZipFile = (content = 'package', name = 'package.zip') => {
  const file = new File([content], name, { type: 'application/zip' });
  Object.defineProperty(file, 'arrayBuffer', {
    configurable: true,
    value: async () => new TextEncoder().encode(content).buffer,
  });
  return file;
};

describe('general/api TIDAS package helpers', () => {
  const mockFetch = jest.fn();
  const mockDigest = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    delete process.env.SUPABASE_URL;

    mockFrom.mockReset();
    mockAuthGetSession.mockReset();
    mockFunctionsInvoke.mockReset();
    mockStorageFrom.mockReset();
    mockUploadToSignedUrl.mockReset();
    mockFetch.mockReset();
    mockDigest.mockReset();

    mockAuthGetSession.mockResolvedValue(makeSession());
    mockStorageFrom.mockReturnValue({
      uploadToSignedUrl: mockUploadToSignedUrl,
    });
    mockUploadToSignedUrl.mockResolvedValue({ error: null });
    mockGetLocale.mockReturnValue('en-US');

    Object.defineProperty(global, 'fetch', {
      configurable: true,
      value: mockFetch,
      writable: true,
    });

    Object.defineProperty(global, 'crypto', {
      configurable: true,
      value: {
        subtle: {
          digest: mockDigest,
        },
      },
      writable: true,
    });

    if (!URL.createObjectURL) {
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: () => 'blob:download',
        writable: true,
      });
    }

    if (!URL.revokeObjectURL) {
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: () => undefined,
        writable: true,
      });
    }
  });

  afterAll(() => {
    if (typeof originalSupabaseUrl === 'string') {
      process.env.SUPABASE_URL = originalSupabaseUrl;
      return;
    }

    delete process.env.SUPABASE_URL;
  });

  it('returns unauthorized when queueing an export without a session', async () => {
    mockAuthGetSession.mockResolvedValueOnce({ data: { session: null } });

    const result = await queueExportTidasPackageApi({ scope: 'current_user' });

    expect(result.data).toBeNull();
    expect(result.error).toEqual(new Error('Unauthorized'));
    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
  });

  it('uses an empty bearer token when the TIDAS edge-function session has no access token', async () => {
    mockAuthGetSession.mockResolvedValueOnce({
      data: {
        session: {},
      },
    });
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: {
        ok: true,
        job_id: 'job-empty-token',
        mode: 'queued',
        scope: 'current_user',
        root_count: 0,
      },
      error: null,
    });

    await queueExportTidasPackageApi();

    expect(mockFunctionsInvoke).toHaveBeenCalledWith('export_tidas_package', {
      body: {},
      headers: {
        Authorization: 'Bearer ',
      },
      region: FunctionRegion.UsEast1,
    });
  });

  it('parses edge-function error payloads and falls back cleanly when parsing fails', async () => {
    const errorWithPayload = {
      message: 'invoke failed',
      context: {
        json: jest.fn().mockResolvedValue({ ok: false, code: 'FAILED', message: 'broken export' }),
      },
    };

    mockFunctionsInvoke
      .mockResolvedValueOnce({ data: null, error: errorWithPayload })
      .mockResolvedValueOnce({
        data: null,
        error: {
          message: 'prepare failed',
          context: {
            json: jest.fn().mockRejectedValue(new Error('bad json')),
          },
        },
      })
      .mockResolvedValueOnce({
        data: null,
        error: {
          message: 'enqueue failed',
        },
      });

    const queued = await queueExportTidasPackageApi({ scope: 'current_user' });
    const prepared = await prepareImportTidasPackageUploadApi({
      filename: 'test.zip',
      byte_size: 10,
      content_type: 'application/zip',
    });
    const enqueued = await enqueueImportTidasPackageApi({
      job_id: 'job-1',
      source_artifact_id: 'artifact-1',
      artifact_sha256: 'hash',
      artifact_byte_size: 10,
      filename: 'test.zip',
      content_type: 'application/zip',
    });

    expect(queued).toEqual({
      data: { ok: false, code: 'FAILED', message: 'broken export' },
      error: errorWithPayload,
    });
    expect(prepared).toEqual({
      data: null,
      error: expect.objectContaining({ message: 'prepare failed' }),
    });
    expect(enqueued).toEqual({
      data: null,
      error: expect.objectContaining({ message: 'enqueue failed' }),
    });
  });

  it('loads job status and rejects missing job ids', async () => {
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: { ok: true, job_id: 'job-42' },
      error: null,
    });

    const missingJob = await getTidasPackageJobApi('');
    const existingJob = await getTidasPackageJobApi('job-42');

    expect(missingJob).toEqual({
      data: null,
      error: new Error('Missing job id'),
    });
    expect(mockFunctionsInvoke).toHaveBeenCalledWith('tidas_package_jobs', {
      body: { job_id: 'job-42' },
      headers: {
        Authorization: 'Bearer token-123',
      },
      region: FunctionRegion.UsEast1,
    });
    expect(existingJob).toEqual({
      data: { ok: true, job_id: 'job-42' },
      error: null,
    });
  });

  it('attaches state codes while ignoring incomplete records and non-target rows', async () => {
    const builder = createQueryBuilder({
      data: [
        { id: 'row-1', version: '01.00.000', state_code: 20 },
        { id: 'row-2', state_code: 30 },
        { version: '01.00.000', state_code: 40 },
      ],
      error: null,
    });
    mockFrom.mockReturnValueOnce(builder);

    const result = await attachStateCodesToRows('processes', [
      { id: 'row-1', version: '01.00.000' },
      { id: 'row-2', version: '01.00.000', stateCode: 99 },
      { id: 'row-3', version: '01.00.000' },
      { id: 'row-4' as any, version: undefined as any },
    ]);

    expect(builder.select).toHaveBeenCalledWith('id,version,state_code');
    expect(builder.in).toHaveBeenCalledWith('id', ['row-1', 'row-3']);
    expect(result).toEqual([
      { id: 'row-1', version: '01.00.000', stateCode: 20 },
      { id: 'row-2', version: '01.00.000', stateCode: 99 },
      { id: 'row-3', version: '01.00.000' },
      { id: 'row-4', version: undefined },
    ]);
  });

  it('returns rows unchanged when state-code enrichment is skipped or the lookup fails', async () => {
    const skipped = await attachStateCodesToRows('', [{ id: 'row-1', version: '01.00.000' }]);
    expect(skipped).toEqual([{ id: 'row-1', version: '01.00.000' }]);

    const builder = createQueryBuilder({
      data: null,
      error: new Error('lookup failed'),
    });
    mockFrom.mockReturnValueOnce(builder);

    const rows = [{ id: 'row-1', version: '01.00.000' }];
    const failedLookup = await attachStateCodesToRows('processes', rows);

    expect(failedLookup).toBe(rows);
  });

  it('exports a ready package and uses the artifact metadata filename', async () => {
    const { clickSpy, createElementSpy, createObjectURLSpy, link, revokeObjectURLSpy } =
      makeDownloadHooks();

    mockFunctionsInvoke
      .mockResolvedValueOnce({
        data: {
          ok: true,
          job_id: 'job-export',
          mode: 'queued',
          scope: 'current_user',
          root_count: 1,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: makeJobResponse({
          job_id: 'job-export',
          status: 'completed',
          artifacts_by_kind: {
            export_zip: {
              signed_download_url: 'https://example.com/export.zip',
              metadata: { filename: 'custom-export.zip' },
            },
          },
        }),
        error: null,
      });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      blob: jest.fn().mockResolvedValue(new Blob(['zip-data'])),
    });

    const result = await exportTidasPackageApi({ scope: 'current_user' });

    expect(result).toEqual({
      data: {
        ok: true,
        job_id: 'job-export',
        filename: 'custom-export.zip',
      },
      error: null,
    });
    expect(link.download).toBe('custom-export.zip');
    expect(link.href).toBe('blob:download');
    expect(clickSpy).toHaveBeenCalled();
    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:download');

    createElementSpy.mockRestore();
    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
  });

  it('keeps polling running exports and falls back to a roots-based filename', async () => {
    jest.useFakeTimers();
    const { clickSpy, createElementSpy, link } = makeDownloadHooks();

    mockFunctionsInvoke
      .mockResolvedValueOnce({
        data: {
          ok: true,
          job_id: 'job-poll',
          mode: 'queued',
          scope: 'selected_roots',
          root_count: 1,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: makeJobResponse({
          job_id: 'job-poll',
          status: 'running',
        }),
        error: null,
      })
      .mockResolvedValueOnce({
        data: makeJobResponse({
          job_id: 'job-poll',
          status: 'ready',
          artifacts_by_kind: {
            export_zip: {
              signed_download_url: 'https://example.com/flows-package.zip',
              metadata: {},
            },
          },
        }),
        error: null,
      });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      blob: jest.fn().mockResolvedValue(new Blob(['zip-data'])),
    });

    const promise = exportTidasPackageApi({
      roots: [
        {
          table: 'flows',
          id: 'flow-1',
          version: '01.00.000',
        },
      ],
    });

    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(1500);
    const result = await promise;

    expect(result).toEqual({
      data: {
        ok: true,
        job_id: 'job-poll',
        filename: 'flows-package.zip',
      },
      error: null,
    });
    expect(link.download).toBe('flows-package.zip');
    expect(clickSpy).toHaveBeenCalled();

    createElementSpy.mockRestore();
  });

  it('returns export failures for job errors, missing downloads, and timeouts', async () => {
    mockFunctionsInvoke
      .mockResolvedValueOnce({
        data: {
          ok: true,
          job_id: 'job-failed',
          mode: 'queued',
          scope: 'current_user',
          root_count: 1,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: makeJobResponse({
          job_id: 'job-failed',
          status: 'failed',
          request_cache: {
            error_message: 'request cache failed',
          },
        }),
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          job_id: 'job-missing',
          mode: 'queued',
          scope: 'current_user',
          root_count: 1,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: makeJobResponse({
          job_id: 'job-missing',
          status: 'completed',
          artifacts_by_kind: {},
        }),
        error: null,
      });

    const failed = await exportTidasPackageApi();
    const missingDownload = await exportTidasPackageApi();

    expect(failed.error).toEqual(new Error('request cache failed'));
    expect(missingDownload.error).toEqual(
      new Error('Export package is not available for download'),
    );

    jest.useFakeTimers();
    mockFunctionsInvoke.mockReset();
    mockFunctionsInvoke.mockImplementation(async (name: string) => {
      if (name === 'export_tidas_package') {
        return {
          data: {
            ok: true,
            job_id: 'job-timeout',
            mode: 'queued',
            scope: 'current_user',
            root_count: 1,
          },
          error: null,
        };
      }

      return {
        data: makeJobResponse({
          job_id: 'job-timeout',
          status: 'running',
        }),
        error: null,
      };
    });

    const timedOutPromise = exportTidasPackageApi();
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(5 * 60 * 1000 + 3000);
    const timedOut = await timedOutPromise;

    expect(timedOut.error).toEqual(
      new Error('Timed out waiting for the TIDAS package job to finish'),
    );
  });

  it('returns export failures when queueing or polling the job status fails', async () => {
    mockFunctionsInvoke
      .mockResolvedValueOnce({
        data: { ok: false, message: 'queue rejected' },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          job_id: 'job-status-error',
          mode: 'queued',
          scope: 'current_user',
          root_count: 1,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: new Error('status lookup failed'),
      });

    const queueFailure = await exportTidasPackageApi();
    const pollFailure = await exportTidasPackageApi();

    expect(queueFailure.error).toEqual(new Error('queue rejected'));
    expect(pollFailure.error).toEqual(new Error('status lookup failed'));
  });

  it('falls back to generic export errors when queueing or polling returns invalid payloads', async () => {
    mockFunctionsInvoke
      .mockResolvedValueOnce({
        data: { ok: false },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          job_id: 'job-invalid-status',
          mode: 'queued',
          scope: 'current_user',
          root_count: 1,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { ok: false },
        error: null,
      });

    const queueFailure = await exportTidasPackageApi();
    const pollFailure = await exportTidasPackageApi();

    expect(queueFailure.error).toEqual(new Error('Export failed'));
    expect(pollFailure.error).toEqual(new Error('Failed to load TIDAS package job status'));
  });

  it('normalizes oversized export upload failures into a clearer error message', async () => {
    mockFunctionsInvoke
      .mockResolvedValueOnce({
        data: {
          ok: true,
          job_id: 'job-too-large',
          mode: 'queued',
          scope: 'open_data',
          root_count: 1,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: makeJobResponse({
          job_id: 'job-too-large',
          status: 'failed',
          diagnostics: {
            error:
              'object upload failed status=413 Payload Too Large body=<?xml version="1.0"?><Error><Code>EntityTooLarge</Code><Message>The object exceeded the maximum allowed size</Message></Error>',
          },
        }),
        error: null,
      });

    const result = await exportTidasPackageApi({ scope: 'open_data' });

    expect(result.error).toEqual(
      new Error(
        'Export package is too large for the current storage upload limit. Try exporting a smaller scope, or ask an administrator to enable large-file upload support.',
      ),
    );
  });

  it('downloads ready exports and reports status, readiness, and download failures', async () => {
    const { createElementSpy, link } = makeDownloadHooks();

    mockFunctionsInvoke
      .mockResolvedValueOnce({
        data: null,
        error: new Error('lookup failed'),
      })
      .mockResolvedValueOnce({
        data: makeJobResponse({
          job_id: 'job-diagnostics',
          status: 'failed',
          diagnostics: {
            message: 'diagnostics failure',
          },
        }),
        error: null,
      })
      .mockResolvedValueOnce({
        data: makeJobResponse({
          job_id: 'job-not-ready',
          status: 'completed',
          artifacts_by_kind: {},
        }),
        error: null,
      })
      .mockResolvedValueOnce({
        data: makeJobResponse({
          job_id: 'job-download-error',
          status: 'completed',
          diagnostics: {
            error: 'unused in success branch',
          },
          artifacts_by_kind: {
            export_zip: {
              signed_download_url: 'https://example.com/download.zip',
              metadata: {},
            },
          },
        }),
        error: null,
      })
      .mockResolvedValueOnce({
        data: makeJobResponse({
          job_id: 'job-success',
          status: 'completed',
          artifacts_by_kind: {
            export_zip: {
              signed_download_url: 'https://example.com/download-ok.zip',
              metadata: {},
            },
          },
        }),
        error: null,
      });
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
      })
      .mockResolvedValueOnce({
        ok: true,
        blob: jest.fn().mockResolvedValue(new Blob(['zip-data'])),
      });

    const loadFailure = await downloadReadyTidasPackageExportApi('job-lookup');
    const failedJob = await downloadReadyTidasPackageExportApi('job-diagnostics');
    const notReady = await downloadReadyTidasPackageExportApi('job-not-ready');
    const downloadFailure = await downloadReadyTidasPackageExportApi(
      'job-download-error',
      'fallback.zip',
    );
    const success = await downloadReadyTidasPackageExportApi('job-success', 'fallback.zip');

    expect(loadFailure.error).toEqual(new Error('lookup failed'));
    expect(failedJob.error).toEqual(new Error('diagnostics failure'));
    expect(notReady.error).toEqual(new Error('Export package is not ready for download'));
    expect(downloadFailure.error).toEqual(new Error('Failed to download artifact (503)'));
    expect(success).toEqual({
      data: {
        ok: true,
        job_id: 'job-success',
        filename: 'fallback.zip',
      },
      error: null,
    });
    expect(link.download).toBe('fallback.zip');

    createElementSpy.mockRestore();
  });

  it('rewrites docker-internal export download URLs to the browser-accessible Supabase origin', async () => {
    process.env.SUPABASE_URL = 'http://localhost:54321';
    const { createElementSpy, createObjectURLSpy, revokeObjectURLSpy } = makeDownloadHooks();

    mockFunctionsInvoke.mockResolvedValueOnce({
      data: makeJobResponse({
        job_id: 'job-internal-download',
        status: 'completed',
        artifacts_by_kind: {
          export_zip: {
            signed_download_url:
              'http://kong:8000/storage/v1/object/sign/lca_results/export-package.zip?token=abc',
            metadata: {},
          },
        },
      }),
      error: null,
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      blob: jest.fn().mockResolvedValue(new Blob(['zip-data'])),
    });

    const result = await downloadReadyTidasPackageExportApi('job-internal-download');

    expect(result).toEqual({
      data: {
        ok: true,
        job_id: 'job-internal-download',
        filename: 'tidas-package.zip',
      },
      error: null,
    });
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:54321/storage/v1/object/sign/lca_results/export-package.zip?token=abc',
    );

    createElementSpy.mockRestore();
    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
  });

  it('keeps already-public export download URLs unchanged when a public Supabase origin is configured', async () => {
    process.env.SUPABASE_URL = 'http://localhost:54321';
    const { createElementSpy, createObjectURLSpy, revokeObjectURLSpy } = makeDownloadHooks();

    mockFunctionsInvoke.mockResolvedValueOnce({
      data: makeJobResponse({
        job_id: 'job-public-download',
        status: 'completed',
        artifacts_by_kind: {
          export_zip: {
            signed_download_url:
              'http://localhost:54321/storage/v1/object/sign/lca_results/export-package.zip?token=def',
            metadata: {},
          },
        },
      }),
      error: null,
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      blob: jest.fn().mockResolvedValue(new Blob(['zip-data'])),
    });

    await downloadReadyTidasPackageExportApi('job-public-download');

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:54321/storage/v1/object/sign/lca_results/export-package.zip?token=def',
    );

    createElementSpy.mockRestore();
    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
  });

  it('keeps non-docker export download URLs unchanged when a public Supabase origin is configured', async () => {
    process.env.SUPABASE_URL = 'http://localhost:54321';
    const { createElementSpy, createObjectURLSpy, revokeObjectURLSpy } = makeDownloadHooks();

    mockFunctionsInvoke.mockResolvedValueOnce({
      data: makeJobResponse({
        job_id: 'job-external-download',
        status: 'completed',
        artifacts_by_kind: {
          export_zip: {
            signed_download_url: 'https://example.com/download.zip?token=ghi',
            metadata: {},
          },
        },
      }),
      error: null,
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      blob: jest.fn().mockResolvedValue(new Blob(['zip-data'])),
    });

    await downloadReadyTidasPackageExportApi('job-external-download');

    expect(mockFetch).toHaveBeenCalledWith('https://example.com/download.zip?token=ghi');

    createElementSpy.mockRestore();
    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
  });

  it('falls back to generic ready-export status errors and default filenames', async () => {
    const { createElementSpy, link } = makeDownloadHooks();

    mockFunctionsInvoke
      .mockResolvedValueOnce({
        data: { ok: false },
        error: null,
      })
      .mockResolvedValueOnce({
        data: makeJobResponse({
          job_id: 'job-default-name',
          status: 'completed',
          artifacts_by_kind: {
            export_zip: {
              signed_download_url: 'https://example.com/default.zip',
              metadata: {
                filename: '   ',
              },
            },
          },
        }),
        error: null,
      });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      blob: jest.fn().mockResolvedValue(new Blob(['zip-data'])),
    });

    const invalidStatus = await downloadReadyTidasPackageExportApi('job-invalid');
    const defaultNamedDownload = await downloadReadyTidasPackageExportApi('job-default-name');

    expect(invalidStatus.error).toEqual(new Error('Failed to load TIDAS package job status'));
    expect(defaultNamedDownload).toEqual({
      data: {
        ok: true,
        job_id: 'job-default-name',
        filename: 'tidas-package.zip',
      },
      error: null,
    });
    expect(link.download).toBe('tidas-package.zip');

    createElementSpy.mockRestore();
  });

  it('imports packages by hashing, uploading, enqueuing, polling, and unwrapping reports', async () => {
    mockDigest.mockResolvedValueOnce(new Uint8Array([0x0a, 0x1b, 0xff]).buffer);
    mockFunctionsInvoke
      .mockResolvedValueOnce({
        data: {
          ok: true,
          action: 'prepare_upload',
          job_id: 'job-import',
          source_artifact_id: 'artifact-source',
          artifact_url: 'https://example.com/source',
          upload: {
            bucket: 'tidas',
            object_path: 'exports/package.zip',
            token: 'signed-token',
            path: 'exports/package.zip',
            signed_url: 'https://example.com/upload',
            expires_in_seconds: 300,
            filename: 'package.zip',
            byte_size: 8,
            content_type: 'application/zip',
          },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          mode: 'queued',
          job_id: 'job-import',
          source_artifact_id: 'artifact-source',
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: makeJobResponse({
          job_id: 'job-import',
          job_type: 'import_package',
          status: 'completed',
          artifacts_by_kind: {
            import_report: {
              signed_download_url: 'https://example.com/report.json',
            },
          },
        }),
        error: null,
      });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        payload: {
          ok: true,
          code: 'IMPORTED',
          message: 'done',
          summary: {
            total_entries: 1,
            filtered_open_data_count: 0,
            user_conflict_count: 0,
            importable_count: 1,
            imported_count: 1,
            validation_issue_count: 1,
            error_count: 0,
            warning_count: 1,
          },
          filtered_open_data: [],
          user_conflicts: [],
          validation_issues: [
            {
              issue_code: 'localized_text_language_error',
              severity: 'warning',
              category: 'processes',
              file_path: 'processes/a.json',
              location: 'processDataSet/name/baseName/0',
              message: 'Localized text error at processDataSet/name/baseName/0: invalid lang',
              context: {},
            },
          ],
        },
      }),
    });

    const file = createZipFile();
    const result = await importTidasPackageApi(file);

    expect(mockStorageFrom).toHaveBeenCalledWith('tidas');
    expect(mockUploadToSignedUrl).toHaveBeenCalledWith(
      'exports/package.zip',
      'signed-token',
      file,
      {
        cacheControl: '3600',
        contentType: 'application/zip',
        upsert: true,
      },
    );
    expect(result).toEqual({
      data: {
        ok: true,
        code: 'IMPORTED',
        message: 'done',
        summary: {
          total_entries: 1,
          filtered_open_data_count: 0,
          user_conflict_count: 0,
          importable_count: 1,
          imported_count: 1,
          validation_issue_count: 1,
          error_count: 0,
          warning_count: 1,
        },
        filtered_open_data: [],
        user_conflicts: [],
        validation_issues: [
          {
            issue_code: 'localized_text_language_error',
            severity: 'warning',
            category: 'processes',
            file_path: 'processes/a.json',
            location: 'processDataSet/name/baseName/0',
            message: 'Localized text error at processDataSet/name/baseName/0: invalid lang',
            context: {},
          },
        ],
      },
      error: null,
    });
    expect(mockFunctionsInvoke).toHaveBeenNthCalledWith(1, 'import_tidas_package', {
      body: {
        action: 'prepare_upload',
        filename: 'package.zip',
        byte_size: 7,
        content_type: 'application/zip',
      },
      headers: {
        Authorization: 'Bearer token-123',
      },
      region: FunctionRegion.UsEast1,
    });
    expect(mockFunctionsInvoke).toHaveBeenNthCalledWith(2, 'import_tidas_package', {
      body: {
        action: 'enqueue',
        import_policy: 'root_closure_v2',
        artifact_byte_size: 7,
        artifact_sha256: '0a1bff',
        content_type: 'application/zip',
        filename: 'package.zip',
        job_id: 'job-import',
        source_artifact_id: 'artifact-source',
      },
      headers: {
        Authorization: 'Bearer token-123',
      },
      region: FunctionRegion.UsEast1,
    });
  });

  it('rejects new imports before upload when Web Crypto digest is unavailable', async () => {
    const file = createZipFile();
    Object.defineProperty(global, 'crypto', {
      configurable: true,
      value: {
        subtle: {},
      },
      writable: true,
    });

    mockFunctionsInvoke
      .mockResolvedValueOnce({
        data: {
          ok: true,
          action: 'prepare_upload',
          job_id: 'job-null-hash',
          source_artifact_id: 'artifact-null-hash',
          artifact_url: 'https://example.com/source',
          upload: {
            bucket: 'tidas',
            object_path: 'exports/package.zip',
            token: 'signed-token',
            path: 'exports/package.zip',
            signed_url: 'https://example.com/upload',
            expires_in_seconds: 300,
            filename: 'package.zip',
            byte_size: 8,
            content_type: 'application/zip',
          },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { ok: false, message: 'enqueue failed' },
        error: null,
      });

    const result = await importTidasPackageApi(file);

    expect(result.error).toEqual(new Error('Import requires a verified SHA-256 checksum'));
    expect(mockFunctionsInvoke).toHaveBeenCalledTimes(1);
    expect(mockUploadToSignedUrl).not.toHaveBeenCalled();
  });

  it('rejects new imports before upload when digest computation throws', async () => {
    const file = createZipFile();
    mockDigest.mockRejectedValueOnce(new Error('digest failed'));

    mockFunctionsInvoke
      .mockResolvedValueOnce({
        data: {
          ok: true,
          action: 'prepare_upload',
          job_id: 'job-digest-error',
          source_artifact_id: 'artifact-digest-error',
          artifact_url: 'https://example.com/source',
          upload: {
            bucket: 'tidas',
            object_path: 'exports/package.zip',
            token: 'signed-token',
            path: 'exports/package.zip',
            signed_url: 'https://example.com/upload',
            expires_in_seconds: 300,
            filename: 'package.zip',
            byte_size: 8,
            content_type: 'application/zip',
          },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { ok: false, message: 'enqueue failed' },
        error: null,
      });

    const result = await importTidasPackageApi(file);

    expect(result.error).toEqual(new Error('Import requires a verified SHA-256 checksum'));
    expect(mockFunctionsInvoke).toHaveBeenCalledTimes(1);
    expect(mockUploadToSignedUrl).not.toHaveBeenCalled();
  });

  it('rewrites docker-internal import report URLs to the browser-accessible Supabase origin', async () => {
    process.env.SUPABASE_URL = 'http://localhost:54321';
    mockDigest.mockResolvedValueOnce(new Uint8Array([0x0a]).buffer);
    mockFunctionsInvoke
      .mockResolvedValueOnce({
        data: {
          ok: true,
          action: 'prepare_upload',
          job_id: 'job-report-rewrite',
          source_artifact_id: 'artifact-report-rewrite',
          artifact_url: 'https://example.com/source',
          upload: {
            bucket: 'tidas',
            object_path: 'exports/package.zip',
            token: 'signed-token',
            path: 'exports/package.zip',
            signed_url: 'https://example.com/upload',
            expires_in_seconds: 300,
            filename: 'package.zip',
            byte_size: 8,
            content_type: 'application/zip',
          },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          mode: 'queued',
          job_id: 'job-report-rewrite',
          source_artifact_id: 'artifact-report-rewrite',
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: makeJobResponse({
          job_id: 'job-report-rewrite',
          job_type: 'import_package',
          status: 'completed',
          artifacts_by_kind: {
            import_report: {
              signed_download_url:
                'http://kong:8000/storage/v1/object/sign/lca_results/import-report.json?token=xyz',
            },
          },
        }),
        error: null,
      });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        payload: {
          ok: true,
          code: 'IMPORTED',
          message: 'rewritten',
          summary: {
            total_entries: 1,
            filtered_open_data_count: 0,
            user_conflict_count: 0,
            importable_count: 1,
            imported_count: 1,
          },
          filtered_open_data: [],
          user_conflicts: [],
        },
      }),
    });

    const result = await importTidasPackageApi(createZipFile());

    expect(result.data).toEqual({
      ok: true,
      code: 'IMPORTED',
      message: 'rewritten',
      summary: {
        total_entries: 1,
        filtered_open_data_count: 0,
        user_conflict_count: 0,
        importable_count: 1,
        imported_count: 1,
      },
      filtered_open_data: [],
      user_conflicts: [],
    });
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:54321/storage/v1/object/sign/lca_results/import-report.json?token=xyz',
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      },
    );
  });

  it('passes malformed package report URLs through unchanged when normalization cannot parse them', async () => {
    process.env.SUPABASE_URL = 'http://localhost:54321';
    mockDigest.mockResolvedValueOnce(new Uint8Array([0x0b]).buffer);
    mockFunctionsInvoke
      .mockResolvedValueOnce({
        data: {
          ok: true,
          action: 'prepare_upload',
          job_id: 'job-report-invalid-url',
          source_artifact_id: 'artifact-report-invalid-url',
          artifact_url: 'https://example.com/source',
          upload: {
            bucket: 'tidas',
            object_path: 'exports/package.zip',
            token: 'signed-token',
            path: 'exports/package.zip',
            signed_url: 'https://example.com/upload',
            expires_in_seconds: 300,
            filename: 'package.zip',
            byte_size: 8,
            content_type: 'application/zip',
          },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          mode: 'queued',
          job_id: 'job-report-invalid-url',
          source_artifact_id: 'artifact-report-invalid-url',
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: makeJobResponse({
          job_id: 'job-report-invalid-url',
          job_type: 'import_package',
          status: 'completed',
          artifacts_by_kind: {
            import_report: {
              signed_download_url: 'not-a-url',
            },
          },
        }),
        error: null,
      });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        ok: true,
        code: 'RAW',
        message: 'invalid url',
        summary: {
          total_entries: 0,
          filtered_open_data_count: 0,
          user_conflict_count: 0,
          importable_count: 0,
          imported_count: 0,
        },
        filtered_open_data: [],
        user_conflicts: [],
      }),
    });

    const result = await importTidasPackageApi(createZipFile());

    expect(result.data).toEqual({
      ok: true,
      code: 'RAW',
      message: 'invalid url',
      summary: {
        total_entries: 0,
        filtered_open_data_count: 0,
        user_conflict_count: 0,
        importable_count: 0,
        imported_count: 0,
      },
      filtered_open_data: [],
      user_conflicts: [],
    });
    expect(mockFetch).toHaveBeenCalledWith('not-a-url', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });
  });

  it('uses the default package content type and generic import failure when the file type is blank', async () => {
    const file = createZipFile('package', 'package.zip');
    Object.defineProperty(file, 'type', {
      configurable: true,
      value: '',
    });
    mockFunctionsInvoke.mockResolvedValueOnce({
      data: { ok: false },
      error: null,
    });

    const result = await importTidasPackageApi(file);

    expect(result.error).toEqual(new Error('Import failed'));
    expect(mockFunctionsInvoke).toHaveBeenCalledWith('import_tidas_package', {
      body: {
        action: 'prepare_upload',
        filename: 'package.zip',
        byte_size: 7,
        content_type: 'application/zip',
      },
      headers: {
        Authorization: 'Bearer token-123',
      },
      region: FunctionRegion.UsEast1,
    });
  });

  it('returns import failures from prepare, upload, enqueue, job, and report handling', async () => {
    const file = createZipFile();
    mockDigest.mockResolvedValue(new Uint8Array([0x01]).buffer);

    mockFunctionsInvoke.mockResolvedValueOnce({
      data: { ok: false, message: 'prepare failed' },
      error: null,
    });
    const prepareFailed = await importTidasPackageApi(file);
    expect(prepareFailed.error).toEqual(new Error('prepare failed'));

    mockFunctionsInvoke.mockResolvedValueOnce({
      data: {
        ok: true,
        action: 'prepare_upload',
        job_id: 'job-upload',
        source_artifact_id: 'artifact-upload',
        artifact_url: 'https://example.com/source',
        upload: {
          bucket: 'tidas',
          object_path: 'exports/package.zip',
          token: 'signed-token',
          path: 'exports/package.zip',
          signed_url: 'https://example.com/upload',
          expires_in_seconds: 300,
          filename: 'package.zip',
          byte_size: 8,
          content_type: 'application/zip',
        },
      },
      error: null,
    });
    mockUploadToSignedUrl.mockResolvedValueOnce({ error: new Error('upload failed') });
    const uploadFailed = await importTidasPackageApi(file);
    expect(uploadFailed.error).toEqual(new Error('upload failed'));

    mockUploadToSignedUrl.mockResolvedValue({ error: null });
    mockFunctionsInvoke
      .mockResolvedValueOnce({
        data: {
          ok: true,
          action: 'prepare_upload',
          job_id: 'job-enqueue',
          source_artifact_id: 'artifact-enqueue',
          artifact_url: 'https://example.com/source',
          upload: {
            bucket: 'tidas',
            object_path: 'exports/package.zip',
            token: 'signed-token',
            path: 'exports/package.zip',
            signed_url: 'https://example.com/upload',
            expires_in_seconds: 300,
            filename: 'package.zip',
            byte_size: 8,
            content_type: 'application/zip',
          },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { ok: false, message: 'enqueue failed' },
        error: null,
      });
    const enqueueFailed = await importTidasPackageApi(file);
    expect(enqueueFailed.error).toEqual(new Error('enqueue failed'));

    mockFunctionsInvoke
      .mockResolvedValueOnce({
        data: {
          ok: true,
          action: 'prepare_upload',
          job_id: 'job-failed',
          source_artifact_id: 'artifact-failed',
          artifact_url: 'https://example.com/source',
          upload: {
            bucket: 'tidas',
            object_path: 'exports/package.zip',
            token: 'signed-token',
            path: 'exports/package.zip',
            signed_url: 'https://example.com/upload',
            expires_in_seconds: 300,
            filename: 'package.zip',
            byte_size: 8,
            content_type: 'application/zip',
          },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          mode: 'queued',
          job_id: 'job-failed',
          source_artifact_id: 'artifact-failed',
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: makeJobResponse({
          job_id: 'job-failed',
          job_type: 'import_package',
          status: 'failed',
          diagnostics: {
            error: 'job exploded',
          },
        }),
        error: null,
      });
    const jobFailed = await importTidasPackageApi(file);
    expect(jobFailed.error).toEqual(new Error('job exploded'));

    mockFunctionsInvoke
      .mockResolvedValueOnce({
        data: {
          ok: true,
          action: 'prepare_upload',
          job_id: 'job-no-report',
          source_artifact_id: 'artifact-no-report',
          artifact_url: 'https://example.com/source',
          upload: {
            bucket: 'tidas',
            object_path: 'exports/package.zip',
            token: 'signed-token',
            path: 'exports/package.zip',
            signed_url: 'https://example.com/upload',
            expires_in_seconds: 300,
            filename: 'package.zip',
            byte_size: 8,
            content_type: 'application/zip',
          },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          mode: 'queued',
          job_id: 'job-no-report',
          source_artifact_id: 'artifact-no-report',
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: makeJobResponse({
          job_id: 'job-no-report',
          job_type: 'import_package',
          status: 'completed',
          artifacts_by_kind: {},
        }),
        error: null,
      });
    const noReport = await importTidasPackageApi(file);
    expect(noReport.error).toEqual(new Error('Import report is not available'));

    mockFunctionsInvoke
      .mockResolvedValueOnce({
        data: {
          ok: true,
          action: 'prepare_upload',
          job_id: 'job-no-url',
          source_artifact_id: 'artifact-no-url',
          artifact_url: 'https://example.com/source',
          upload: {
            bucket: 'tidas',
            object_path: 'exports/package.zip',
            token: 'signed-token',
            path: 'exports/package.zip',
            signed_url: 'https://example.com/upload',
            expires_in_seconds: 300,
            filename: 'package.zip',
            byte_size: 8,
            content_type: 'application/zip',
          },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          mode: 'queued',
          job_id: 'job-no-url',
          source_artifact_id: 'artifact-no-url',
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: makeJobResponse({
          job_id: 'job-no-url',
          job_type: 'import_package',
          status: 'completed',
          artifacts_by_kind: {
            import_report: {
              signed_download_url: null,
            },
          },
        }),
        error: null,
      });
    const noReportUrl = await importTidasPackageApi(file);
    expect(noReportUrl.error).toEqual(new Error('Package report is not available'));

    mockFunctionsInvoke
      .mockResolvedValueOnce({
        data: {
          ok: true,
          action: 'prepare_upload',
          job_id: 'job-report-fetch',
          source_artifact_id: 'artifact-report-fetch',
          artifact_url: 'https://example.com/source',
          upload: {
            bucket: 'tidas',
            object_path: 'exports/package.zip',
            token: 'signed-token',
            path: 'exports/package.zip',
            signed_url: 'https://example.com/upload',
            expires_in_seconds: 300,
            filename: 'package.zip',
            byte_size: 8,
            content_type: 'application/zip',
          },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          mode: 'queued',
          job_id: 'job-report-fetch',
          source_artifact_id: 'artifact-report-fetch',
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: makeJobResponse({
          job_id: 'job-report-fetch',
          job_type: 'import_package',
          status: 'completed',
          artifacts_by_kind: {
            import_report: {
              signed_download_url: 'https://example.com/report.json',
            },
          },
        }),
        error: null,
      });
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
    });
    const reportFetchFailed = await importTidasPackageApi(file);
    expect(reportFetchFailed.error).toEqual(new Error('Failed to load package report (502)'));

    mockFunctionsInvoke
      .mockResolvedValueOnce({
        data: {
          ok: true,
          action: 'prepare_upload',
          job_id: 'job-fallback-error',
          source_artifact_id: 'artifact-fallback-error',
          artifact_url: 'https://example.com/source',
          upload: {
            bucket: 'tidas',
            object_path: 'exports/package.zip',
            token: 'signed-token',
            path: 'exports/package.zip',
            signed_url: 'https://example.com/upload',
            expires_in_seconds: 300,
            filename: 'package.zip',
            byte_size: 8,
            content_type: 'application/zip',
          },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          mode: 'queued',
          job_id: 'job-fallback-error',
          source_artifact_id: 'artifact-fallback-error',
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: makeJobResponse({
          job_id: 'job-fallback-error',
          job_type: 'import_package',
          status: 'failed',
          diagnostics: {},
          request_cache: null,
        }),
        error: null,
      });
    const fallbackFailure = await importTidasPackageApi(file);
    expect(fallbackFailure.error).toEqual(new Error('TIDAS package job failed'));

    mockFunctionsInvoke
      .mockResolvedValueOnce({
        data: {
          ok: true,
          action: 'prepare_upload',
          job_id: 'job-enqueue-error',
          source_artifact_id: 'artifact-enqueue-error',
          artifact_url: 'https://example.com/source',
          upload: {
            bucket: 'tidas',
            object_path: 'exports/package.zip',
            token: 'signed-token',
            path: 'exports/package.zip',
            signed_url: 'https://example.com/upload',
            expires_in_seconds: 300,
            filename: 'package.zip',
            byte_size: 8,
            content_type: 'application/zip',
          },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: new Error('enqueue network failed'),
      });
    const enqueueError = await importTidasPackageApi(file);
    expect(enqueueError.error).toEqual(new Error('enqueue network failed'));

    mockFunctionsInvoke
      .mockResolvedValueOnce({
        data: {
          ok: true,
          action: 'prepare_upload',
          job_id: 'job-enqueue-default',
          source_artifact_id: 'artifact-enqueue-default',
          artifact_url: 'https://example.com/source',
          upload: {
            bucket: 'tidas',
            object_path: 'exports/package.zip',
            token: 'signed-token',
            path: 'exports/package.zip',
            signed_url: 'https://example.com/upload',
            expires_in_seconds: 300,
            filename: 'package.zip',
            byte_size: 8,
            content_type: 'application/zip',
          },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { ok: false },
        error: null,
      });
    const enqueueDefaultError = await importTidasPackageApi(file);
    expect(enqueueDefaultError.error).toEqual(new Error('Import failed'));

    mockFunctionsInvoke
      .mockResolvedValueOnce({
        data: {
          ok: true,
          action: 'prepare_upload',
          job_id: 'job-raw-report',
          source_artifact_id: 'artifact-raw-report',
          artifact_url: 'https://example.com/source',
          upload: {
            bucket: 'tidas',
            object_path: 'exports/package.zip',
            token: 'signed-token',
            path: 'exports/package.zip',
            signed_url: 'https://example.com/upload',
            expires_in_seconds: 300,
            filename: 'package.zip',
            byte_size: 8,
            content_type: 'application/zip',
          },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          mode: 'queued',
          job_id: 'job-raw-report',
          source_artifact_id: 'artifact-raw-report',
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: makeJobResponse({
          job_id: 'job-raw-report',
          job_type: 'import_package',
          status: 'completed',
          artifacts_by_kind: {
            import_report: {
              signed_download_url: 'https://example.com/report-raw.json',
            },
          },
        }),
        error: null,
      });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        ok: true,
        code: 'RAW',
        message: 'raw report',
        summary: {
          total_entries: 0,
          filtered_open_data_count: 0,
          user_conflict_count: 0,
          importable_count: 0,
          imported_count: 0,
        },
        filtered_open_data: [],
        user_conflicts: [],
      }),
    });
    const rawReport = await importTidasPackageApi(file);
    expect(rawReport.data).toEqual({
      ok: true,
      code: 'RAW',
      message: 'raw report',
      summary: {
        total_entries: 0,
        filtered_open_data_count: 0,
        user_conflict_count: 0,
        importable_count: 0,
        imported_count: 0,
      },
      filtered_open_data: [],
      user_conflicts: [],
    });
  });

  it('parses function invoke errors from json, text, empty bodies, and missing contexts', async () => {
    const noContext = await resolveFunctionInvokeError({ message: 'plain failure' });
    const defaultMessage = await resolveFunctionInvokeError({});
    const emptyText = await resolveFunctionInvokeError({
      message: 'fallback',
      context: {
        status: 422,
        text: jest.fn().mockResolvedValue(''),
      } as any,
    });
    const jsonBody = await resolveFunctionInvokeError({
      message: 'fallback',
      context: {
        status: 409,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            code: 'CONFLICT',
            detail: 'already exists',
          }),
        ),
      } as any,
    });
    const jsonMessageBody = await resolveFunctionInvokeError({
      message: 'fallback',
      context: {
        status: 400,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            message: 'direct message',
          }),
        ),
      } as any,
    });
    const jsonErrorBody = await resolveFunctionInvokeError({
      message: 'fallback',
      context: {
        status: 401,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            error: 'error message',
          }),
        ),
      } as any,
    });
    const jsonFallbackBody = await resolveFunctionInvokeError({
      message: 'fallback',
      context: {
        status: 402,
        text: jest.fn().mockResolvedValue('{}'),
      } as any,
    });
    const plainText = await resolveFunctionInvokeError({
      message: 'fallback',
      context: {
        status: 500,
        text: jest.fn().mockResolvedValue('raw body'),
      } as any,
    });
    const textFailure = await resolveFunctionInvokeError({
      message: 'fallback',
      context: {
        status: 504,
        text: jest.fn().mockRejectedValue(new Error('cannot read')),
      } as any,
    });

    expect(noContext).toEqual({ message: 'plain failure' });
    expect(defaultMessage).toEqual({ message: 'Request failed' });
    expect(emptyText).toEqual({ message: 'fallback', status: 422 });
    expect(jsonBody).toEqual({
      code: 'CONFLICT',
      detail: 'already exists',
      message: 'already exists',
      status: 409,
    });
    expect(jsonMessageBody).toEqual({
      message: 'direct message',
      status: 400,
    });
    expect(jsonErrorBody).toEqual({
      error: 'error message',
      message: 'error message',
      status: 401,
    });
    expect(jsonFallbackBody).toEqual({
      message: 'fallback',
      status: 402,
    });
    expect(plainText).toEqual({
      message: 'fallback: raw body',
      status: 500,
    });
    expect(textFailure).toEqual({
      message: 'fallback',
      status: 504,
    });
  });
  it.each([true, false])(
    'requires and forwards a v2 checksum (available: %s)',
    async (available) => {
      mockDigest.mockResolvedValue(new Uint8Array([10, 27, 255]).buffer);
      if (!available)
        Object.defineProperty(global, 'crypto', { configurable: true, value: {}, writable: true });
      mockFunctionsInvoke
        .mockResolvedValueOnce({
          data: {
            ok: true,
            job_id: 'job-import',
            source_artifact_id: 'source',
            upload: { bucket: 'tidas', object_path: 'package.zip', token: 'token' },
          },
          error: null,
        })
        .mockResolvedValueOnce({ data: { ok: true, job_id: 'job-import' }, error: null });
      const result = await queueImportTidasPackageApi(createZipFile());
      expect(result.error?.message ?? null).toBe(
        available ? null : 'Import requires a verified SHA-256 checksum',
      );
      expect(mockUploadToSignedUrl).toHaveBeenCalledTimes(available ? 1 : 0);
      expect(mockFunctionsInvoke).toHaveBeenCalledTimes(available ? 2 : 1);
      const lastBody =
        mockFunctionsInvoke.mock.calls[mockFunctionsInvoke.mock.calls.length - 1]?.[1]?.body;
      expect(lastBody?.import_policy).toBe(available ? 'root_closure_v2' : undefined);
      expect(lastBody?.artifact_sha256).toBe(available ? '0a1bff' : undefined);
    },
  );
});
