import type studyMessages from '@/locales/en-US/pages_study';
import {
  StudyRequestError,
  subscribeStudyIdentityChange,
  readPendingStudyWrite,
  recoverPendingStudyWrite,
  subscribePendingStudyWrites,
  retirePendingStudyWrite,
  type Request,
} from '@/services/study/api';
import { Alert, Button, Space, Spin } from 'antd';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useIntl, useModel } from '@umijs/max';

export type StudyMessageKey = keyof typeof studyMessages extends `pages.study.${infer Key}`
  ? Key
  : never;

export function useStudyText() {
  const intl = useIntl();
  return (key: StudyMessageKey) => intl.formatMessage({ id: `pages.study.${key}` });
}

export function useStudyIdentity() {
  const { initialState } = useModel('@@initialState');
  const [generation, setGeneration] = useState(0);
  useEffect(() => subscribeStudyIdentityChange(() => setGeneration((value) => value + 1)), []);
  return `${initialState?.currentUser?.userid ?? ''}:${generation}`;
}

export function useStudyQuery<T>(key: string, load: () => Promise<T>) {
  const [state, setState] = useState<{ key: string; data?: T; error?: unknown; loading: boolean }>({
    key,
    loading: true,
  });
  const [revision, setRevision] = useState(0);
  const loader = useRef(load);
  loader.current = load;
  useEffect(() => {
    let active = true;
    setState({ key, loading: true });
    loader.current().then(
      (data) => {
        if (active) setState({ key, data, loading: false });
      },
      (error: unknown) => {
        if (active) setState({ key, error, loading: false });
      },
    );
    return () => {
      active = false;
    };
  }, [key, revision]);
  return {
    ...(state.key === key ? state : { data: undefined, error: undefined, loading: true }),
    refresh: () => setRevision((value) => value + 1),
  };
}

export function QueryState({
  loading,
  error,
  retry,
  children,
}: {
  loading: boolean;
  error?: unknown;
  retry: () => void;
  children?: ReactNode;
}) {
  const t = useStudyText();
  if (loading) return <Spin />;
  if (error)
    return (
      <Alert
        type='error'
        showIcon
        title={t('error')}
        description={
          <Space wrap>
            <code>{error instanceof StudyRequestError ? error.code : 'INVALID_RESPONSE'}</code>
            <Button onClick={retry}>{t('refresh')}</Button>
          </Space>
        }
      />
    );
  return children;
}

/** Explicit same-tab recovery; exact parsed mutations are journaled before service dispatch. */
export function useStudyWrite(
  refresh: () => void,
  workflow: string = 'directory:studies',
  onRecovered?: (request: Request, result: unknown) => void,
) {
  const recoveryListener = useRef(onRecovered);
  recoveryListener.current = onRecovered;
  const [localPending, setPending] = useState<(() => Promise<unknown>) | null>(null);
  const [journal, setJournal] = useState<Awaited<ReturnType<typeof readPendingStudyWrite>>>({
    pending: false,
    raw: null,
  });
  const [journalReady, setJournalReady] = useState(false);
  const [recovered, setRecovered] = useState<unknown>();
  useEffect(() => {
    let active = true;
    const load = () => {
      void readPendingStudyWrite(workflow).then(
        (value) => {
          if (active) {
            setJournal(value);
            setJournalReady(true);
          }
        },
        (failure: unknown) => {
          if (active) {
            setJournal({ pending: true, raw: null, error: failure });
            setJournalReady(true);
          }
        },
      );
    };
    load();
    const stop = subscribePendingStudyWrites(load);
    return () => {
      active = false;
      stop();
    };
  }, [workflow]);
  const pending =
    localPending ?? (journal.pending ? () => recoverPendingStudyWrite(workflow) : null);
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const locked = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const execute = useCallback(
    async (command: () => Promise<unknown>) => {
      locked.current = true;
      setBusy(true);
      setError(undefined);
      try {
        await command();
        if (alive.current) {
          setPending(null);
          refresh();
        }
      } catch (failure) {
        if (alive.current) {
          setError(failure);
          setPending(
            failure instanceof StudyRequestError && !failure.retryable ? null : () => command,
          );
        }
      } finally {
        locked.current = false;
        if (alive.current) setBusy(false);
      }
    },
    [refresh],
  );
  return {
    busy: busy || !journalReady,
    pending,
    error:
      error ??
      journal.error ??
      (journal.pending ? new StudyRequestError('RECOVERY_REQUIRED', false) : undefined),
    journal: journal.raw,
    recovered,
    canRetire: journal.canRetire === true,
    retire: () => {
      if (journal.canRetire && !locked.current)
        void execute(async () => {
          const receipt = await retirePendingStudyWrite(workflow);
          if (alive.current) setRecovered(receipt);
          return receipt;
        });
    },
    run: (command: () => Promise<unknown>) => {
      if (journalReady && !pending && !locked.current) void execute(command);
    },
    retry: () => {
      if (pending && !locked.current) {
        const originalRequest = journal.request;
        void execute(async () => {
          const result = await pending();
          if (alive.current && !localPending) {
            setRecovered(result);
            if (originalRequest) recoveryListener.current?.(originalRequest, result);
          }
          return result;
        });
      }
    },
  };
}

export function ExactRecord({ value }: { value: unknown }) {
  return (
    <pre
      style={{
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
        maxHeight: 400,
        overflow: 'auto',
        maxWidth: '100%',
      }}
      tabIndex={0}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function WriteState({ write }: { write: ReturnType<typeof useStudyWrite> }) {
  const t = useStudyText();
  if (!write.error)
    return write.recovered === undefined ? null : (
      <Space orientation='vertical'>
        <span>{t('success')}</span>
        <ExactRecord value={write.recovered} />
      </Space>
    );
  return (
    <Alert
      type='error'
      showIcon
      title={t(write.pending ? 'pending' : 'error')}
      description={
        <Space wrap>
          <code>
            {write.error instanceof StudyRequestError ? write.error.code : 'INVALID_RESPONSE'}
          </code>
          {write.pending && (
            <Button loading={write.busy} onClick={write.retry}>
              {t('retry')}
            </Button>
          )}
          {write.canRetire && <span>{t('retirementNote')}</span>}
          {write.canRetire && (
            <Button onClick={write.retire} disabled={write.busy}>
              {t('retireRejected')}
            </Button>
          )}
          {write.journal && (
            <details>
              <summary>{t('recoveryIntent')}</summary>
              <ExactRecord value={write.journal} />
            </details>
          )}
        </Space>
      }
    />
  );
}
