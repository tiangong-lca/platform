import TidasImportResult from '@/components/ImportTidasPackage/ImportResult';
import ClosureTaskDetail from '@/components/ClosureTaskDetail';
import { useAntdAppApi } from '@/contexts/AntdAppContext';
import HeaderActionIcon, { getHeaderBadgeStyle } from '@/components/HeaderActionIcon';
import {
  listDataProductTasks,
  refreshDataProductTasks,
  subscribeDataProductTasks,
} from '@/services/dataProducts/taskCenter';
import type {
  LcaBackgroundTask,
  LcaTaskPhase,
  LcaTrackedTaskPhase,
} from '@/services/lca/taskCenter';
import {
  clearFinishedLcaTasks,
  listLcaTasks,
  refreshLcaTasksFromWorkerJobs,
  subscribeLcaTaskCenterOpenRequests,
  subscribeLcaTasks,
} from '@/services/lca/taskCenter';
import {
  taskProgressPercent as taskSummaryProgressPercent,
  type TaskSummaryV2,
} from '@/services/taskCenter/types';
import {
  TIDAS_PACKAGE_EXPORT_TOO_LARGE_ERROR,
  classifyTidasPackageExportError,
} from '@/services/tidasPackage/exportErrors';
import type {
  TidasPackageBackgroundTask,
  TidasPackageTaskPhase,
} from '@/services/tidasPackage/taskCenter';
import {
  clearFinishedTidasPackageTasks,
  downloadTidasPackageExportTask,
  listTidasPackageTasks,
  refreshTidasPackageTasksFromWorkerJobs,
  subscribeTidasPackageTasks,
} from '@/services/tidasPackage/taskCenter';
import { formatLocaleDateTime } from '@/utils/localeFormatting';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DownloadOutlined,
  EyeOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Empty,
  Modal,
  Popover,
  Progress,
  Space,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  theme,
} from 'antd';
import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useIntl } from 'umi';

type IntlShapeLike = ReturnType<typeof useIntl>;

type TaskCenterItem =
  | {
      kind: 'lca';
      task: LcaBackgroundTask;
    }
  | {
      kind: 'package';
      task: TidasPackageBackgroundTask;
    };

type TaskKindFilter = 'all' | 'lca' | 'tidas_export' | 'tidas_import' | 'data_product';

const DIAGNOSTICS_POPOVER_WIDTH = 520;
const DIAGNOSTICS_POPOVER_MAX_HEIGHT = 520;

function useLcaTasks(): LcaBackgroundTask[] {
  return useSyncExternalStore(subscribeLcaTasks, listLcaTasks, listLcaTasks);
}

function useTidasPackageTasks(): TidasPackageBackgroundTask[] {
  return useSyncExternalStore(
    subscribeTidasPackageTasks,
    listTidasPackageTasks,
    listTidasPackageTasks,
  );
}

function useDataProductTaskSummaries(): TaskSummaryV2[] {
  const summaries = useSyncExternalStore(
    subscribeDataProductTasks,
    listDataProductTasks,
    listDataProductTasks,
  );
  return useMemo(
    () => summaries.filter((summary) => summary.category === 'data_product'),
    [summaries],
  );
}

function statusTag(
  state: 'running' | 'completed' | 'failed',
  intl: IntlShapeLike,
  importOutcome?: TidasPackageBackgroundTask['importOutcome'],
): React.ReactNode {
  const resultState =
    state === 'completed' && (importOutcome === 'none' || importOutcome === 'interrupted')
      ? 'failed'
      : state;
  if (resultState === 'completed' && importOutcome === 'partial') {
    return (
      <Tag color='warning'>
        {intl.formatMessage({
          id: 'component.tidasPackage.import.result.partial',
          defaultMessage: 'Partially imported',
        })}
      </Tag>
    );
  }
  if (resultState === 'completed') {
    return (
      <Tag color='success' icon={<CheckCircleOutlined />}>
        {intl.formatMessage({
          id: 'pages.process.lca.taskCenter.status.completed',
          defaultMessage: 'Completed',
        })}
      </Tag>
    );
  }
  if (resultState === 'failed') {
    return (
      <Tag color='error' icon={<CloseCircleOutlined />}>
        {intl.formatMessage({
          id: 'pages.process.lca.taskCenter.status.failed',
          defaultMessage: 'Failed',
        })}
      </Tag>
    );
  }
  return (
    <Tag color='processing' icon={<ClockCircleOutlined />}>
      {intl.formatMessage({
        id: 'pages.process.lca.taskCenter.status.running',
        defaultMessage: 'Running',
      })}
    </Tag>
  );
}

function lcaPhaseLabel(phase: LcaTaskPhase, intl: IntlShapeLike): string {
  if (phase === 'submitting') {
    return intl.formatMessage({
      id: 'pages.process.lca.taskCenter.phase.submitting',
      defaultMessage: 'Submitting',
    });
  }
  if (phase === 'building_snapshot') {
    return intl.formatMessage({
      id: 'pages.process.lca.taskCenter.phase.buildingSnapshot',
      defaultMessage: 'Building snapshot',
    });
  }
  if (phase === 'solving') {
    return intl.formatMessage({
      id: 'pages.process.lca.taskCenter.phase.solving',
      defaultMessage: 'Solving',
    });
  }
  if (phase === 'completed') {
    return intl.formatMessage({
      id: 'pages.process.lca.taskCenter.phase.completed',
      defaultMessage: 'Completed',
    });
  }
  return intl.formatMessage({
    id: 'pages.process.lca.taskCenter.phase.failed',
    defaultMessage: 'Failed',
  });
}

function packagePhaseLabel(phase: TidasPackageTaskPhase, intl: IntlShapeLike): string {
  if (phase === 'submitting') {
    return intl.formatMessage({
      id: 'component.tidasPackage.taskCenter.phase.submitting',
      defaultMessage: 'Submitting',
    });
  }
  if (phase === 'queued') {
    return intl.formatMessage({
      id: 'component.tidasPackage.taskCenter.phase.queued',
      defaultMessage: 'Queued',
    });
  }
  if (phase === 'collect_refs') {
    return intl.formatMessage({
      id: 'component.tidasPackage.taskCenter.phase.collectRefs',
      defaultMessage: 'Collecting related data',
    });
  }
  if (phase === 'import_package') {
    return intl.formatMessage({
      id: 'component.tidasPackage.taskCenter.phase.importPackage',
      defaultMessage: 'Importing data',
    });
  }
  if (phase === 'finalize_zip') {
    return intl.formatMessage({
      id: 'component.tidasPackage.taskCenter.phase.finalizeZip',
      defaultMessage: 'Building ZIP',
    });
  }
  if (phase === 'completed') {
    return intl.formatMessage({
      id: 'pages.process.lca.taskCenter.phase.completed',
      defaultMessage: 'Completed',
    });
  }
  return intl.formatMessage({
    id: 'pages.process.lca.taskCenter.phase.failed',
    defaultMessage: 'Failed',
  });
}

function phaseLabel(item: TaskCenterItem, intl: IntlShapeLike): string {
  if (item.kind === 'lca') {
    return lcaPhaseLabel(item.task.phase, intl);
  }
  return packagePhaseLabel(item.task.phase, intl);
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs} ms`;
  }
  if (durationMs < 60 * 1000) {
    return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 2 : 1)} s`;
  }
  const totalSec = Math.round(durationMs / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m ${seconds}s`;
}

function formatDateTime(value: string, intl: IntlShapeLike): string {
  return formatLocaleDateTime(value, intl.locale);
}

function getTaskElapsedMs(item: TaskCenterItem): number {
  const created = Date.parse(
    (item.kind === 'package' && item.task.startedAt) || item.task.createdAt,
  );
  if (!Number.isFinite(created)) {
    return 0;
  }
  const end =
    item.task.state === 'running'
      ? Date.now()
      : Date.parse((item.kind === 'package' && item.task.finishedAt) || item.task.updatedAt);
  if (!Number.isFinite(end)) {
    return 0;
  }
  return Math.max(0, end - created);
}

type ProcessStepState = 'completed' | 'active' | 'waiting' | 'failed';

type ProcessStepItem = {
  key: string;
  title: string;
  description?: React.ReactNode;
  meta?: React.ReactNode;
  state: ProcessStepState;
};

type LcaTimelineStats = {
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
};

function processStateLabel(state: ProcessStepState, intl: IntlShapeLike): string {
  if (state === 'completed') {
    return intl.formatMessage({
      id: 'pages.process.lca.taskCenter.process.status.completed',
      defaultMessage: 'Completed',
    });
  }
  if (state === 'active') {
    return intl.formatMessage({
      id: 'pages.process.lca.taskCenter.process.status.running',
      defaultMessage: 'In progress',
    });
  }
  if (state === 'failed') {
    return intl.formatMessage({
      id: 'pages.process.lca.taskCenter.process.status.failed',
      defaultMessage: 'Stopped',
    });
  }
  return intl.formatMessage({
    id: 'pages.process.lca.taskCenter.process.status.waiting',
    defaultMessage: 'Waiting',
  });
}

const ProcessStepMarker: React.FC<{ index: number; state: ProcessStepState }> = ({
  index,
  state,
}) => {
  const { token } = theme.useToken();

  if (state === 'completed') {
    return <CheckCircleOutlined style={{ color: token.colorSuccess, fontSize: 22 }} />;
  }
  if (state === 'failed') {
    return <CloseCircleOutlined style={{ color: token.colorError, fontSize: 22 }} />;
  }
  const idleConnectorColor = token.colorBorder;
  return (
    <span
      style={{
        alignItems: 'center',
        background: state === 'active' ? token.colorPrimary : token.colorBgContainer,
        border: `1px solid ${state === 'active' ? token.colorPrimary : idleConnectorColor}`,
        borderRadius: '50%',
        color: state === 'active' ? token.colorWhite : token.colorTextTertiary,
        display: 'inline-flex',
        fontSize: 12,
        fontWeight: 600,
        height: 22,
        justifyContent: 'center',
        width: 22,
      }}
    >
      {index + 1}
    </span>
  );
};

const HorizontalProcessSteps: React.FC<{ steps: ProcessStepItem[]; intl: IntlShapeLike }> = ({
  steps,
  intl,
}) => {
  const { token } = theme.useToken();
  const idleConnectorColor = token.colorBorder;
  const connectorColor = (from?: ProcessStepState, to?: ProcessStepState) => {
    if (from === 'completed' && to && to !== 'waiting') {
      return token.colorSuccess;
    }
    return idleConnectorColor;
  };
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`,
        rowGap: 8,
      }}
    >
      {steps.map((step, index) => (
        <div key={step.key} style={{ minWidth: 0, position: 'relative', textAlign: 'center' }}>
          {index > 0 && (
            <div
              style={{
                borderTop: `2px solid ${connectorColor(steps[index - 1]?.state, step.state)}`,
                left: 0,
                position: 'absolute',
                right: 'calc(50% + 14px)',
                top: 11,
              }}
            />
          )}
          {index < steps.length - 1 && (
            <div
              style={{
                borderTop: `2px solid ${connectorColor(step.state, steps[index + 1]?.state)}`,
                left: 'calc(50% + 14px)',
                position: 'absolute',
                right: 0,
                top: 11,
              }}
            />
          )}
          <span
            style={{
              display: 'inline-block',
              lineHeight: 0,
              position: 'relative',
              zIndex: 1,
            }}
          >
            <ProcessStepMarker index={index} state={step.state} />
          </span>
          <Space orientation='vertical' size={1} style={{ display: 'flex', marginTop: 6 }}>
            <Typography.Text strong style={{ fontSize: 12 }}>
              {step.title}
            </Typography.Text>
            <Typography.Text
              type={step.state === 'active' ? undefined : 'secondary'}
              style={{
                color: step.state === 'active' ? token.colorPrimary : undefined,
                fontSize: 12,
              }}
            >
              {step.description ?? processStateLabel(step.state, intl)}
            </Typography.Text>
            {step.meta && (
              <Typography.Text type='secondary' style={{ fontSize: 12 }}>
                {step.meta}
              </Typography.Text>
            )}
          </Space>
        </div>
      ))}
    </div>
  );
};

function processStepStatus(
  index: number,
  currentIndex: number,
  state: 'running' | 'completed' | 'failed',
): ProcessStepState {
  if (state === 'completed') {
    return 'completed';
  }
  if (state === 'failed') {
    if (index < currentIndex) {
      return 'completed';
    }
    if (index === currentIndex) {
      return 'failed';
    }
    return 'waiting';
  }
  if (index < currentIndex) {
    return 'completed';
  }
  if (index === currentIndex) {
    return 'active';
  }
  return 'waiting';
}

function lcaTimelineStats(task: LcaBackgroundTask, phase: LcaTrackedTaskPhase): LcaTimelineStats {
  let startedAt: string | undefined;
  let endedAt: string | undefined;
  let durationMs = 0;
  let hasDuration = false;
  const nowMs = Date.now();

  for (const item of task.phaseTimeline) {
    if (item.phase !== phase) {
      continue;
    }
    const startMs = Date.parse(item.startedAt);
    const endMs = item.endedAt ? Date.parse(item.endedAt) : nowMs;
    if (!startedAt || Date.parse(item.startedAt) < Date.parse(startedAt)) {
      startedAt = item.startedAt;
    }
    if (item.endedAt && (!endedAt || Date.parse(item.endedAt) > Date.parse(endedAt))) {
      endedAt = item.endedAt;
    }
    if (Number.isFinite(startMs) && Number.isFinite(endMs)) {
      durationMs += Math.max(0, endMs - startMs);
      hasDuration = true;
    }
  }

  return {
    startedAt,
    endedAt,
    durationMs: hasDuration ? durationMs : undefined,
  };
}

function processStepMeta(
  step: ProcessStepItem,
  durationMs: number | undefined,
  intl: IntlShapeLike,
): React.ReactNode {
  if (step.state === 'active' && durationMs !== undefined) {
    return intl.formatMessage(
      {
        id: 'pages.process.lca.taskCenter.process.runningDuration',
        defaultMessage: 'Running · {duration}',
      },
      { duration: formatDuration(durationMs) },
    );
  }
  if (step.state === 'completed' && durationMs !== undefined) {
    return intl.formatMessage(
      {
        id: 'pages.process.lca.taskCenter.process.duration',
        defaultMessage: 'Took {duration}',
      },
      { duration: formatDuration(durationMs) },
    );
  }
  return undefined;
}

function lcaProcessStageLabel(
  phase: LcaTrackedTaskPhase | 'completed',
  intl: IntlShapeLike,
): string {
  if (phase === 'submitting') {
    return intl.formatMessage({
      id: 'pages.process.lca.taskCenter.process.step.submitTask',
      defaultMessage: 'Submit task',
    });
  }
  if (phase === 'building_snapshot') {
    return intl.formatMessage({
      id: 'pages.process.lca.taskCenter.process.step.buildSnapshot',
      defaultMessage: 'Build snapshot',
    });
  }
  if (phase === 'solving') {
    return intl.formatMessage({
      id: 'pages.process.lca.taskCenter.process.step.solve',
      defaultMessage: 'Solve',
    });
  }
  return intl.formatMessage({
    id: 'pages.process.lca.taskCenter.process.step.organizeResult',
    defaultMessage: 'Organize result',
  });
}

function lcaProcessSteps(task: LcaBackgroundTask, intl: IntlShapeLike): ProcessStepItem[] {
  const hasBuildStage =
    task.mode === 'all_unit' ||
    Boolean(task.buildJobId) ||
    task.phase === 'building_snapshot' ||
    task.phaseTimeline.some((item) => item.phase === 'building_snapshot');
  const hasSolveStage =
    task.state !== 'completed' ||
    Boolean(task.solveJobId) ||
    task.phase === 'solving' ||
    task.phaseTimeline.some((item) => item.phase === 'solving');
  const phases: Array<LcaTrackedTaskPhase | 'completed'> = [
    'submitting',
    ...(hasBuildStage ? (['building_snapshot'] as const) : []),
    ...(hasSolveStage ? (['solving'] as const) : []),
    'completed',
  ];
  const lastTrackedPhase = task.phaseTimeline[task.phaseTimeline.length - 1]?.phase;
  const currentPhase =
    task.phase === 'failed'
      ? (lastTrackedPhase ?? 'submitting')
      : task.phase === 'completed'
        ? 'completed'
        : task.phase;
  const currentIndex = Math.max(
    0,
    phases.findIndex((phase) => phase === currentPhase),
  );

  return phases.map((phase, index) => {
    const state = processStepStatus(index, currentIndex, task.state);
    const stats = phase === 'completed' ? undefined : lcaTimelineStats(task, phase);
    const description =
      phase === 'completed'
        ? task.state === 'completed'
          ? formatDateTime(task.updatedAt, intl)
          : undefined
        : stats?.startedAt
          ? formatDateTime(stats.startedAt, intl)
          : undefined;
    const step: ProcessStepItem = {
      key: phase,
      title: lcaProcessStageLabel(phase, intl),
      description,
      state,
    };
    return {
      ...step,
      meta: processStepMeta(step, stats?.durationMs, intl),
    };
  });
}

function packageProcessStageLabel(
  task: TidasPackageBackgroundTask,
  phase: TidasPackageTaskPhase | 'report',
  intl: IntlShapeLike,
): string {
  if (task.kind === 'tidas_package_import') {
    if (phase === 'submitting') {
      return intl.formatMessage({
        id: 'component.tidasPackage.taskCenter.process.import.prepareUpload',
        defaultMessage: 'Prepare upload',
      });
    }
    if (phase === 'queued') {
      return intl.formatMessage({
        id: 'component.tidasPackage.taskCenter.process.import.validatePackage',
        defaultMessage: 'Validate package',
      });
    }
    if (phase === 'import_package') {
      return intl.formatMessage({
        id: 'component.tidasPackage.taskCenter.process.import.importData',
        defaultMessage: 'Import data',
      });
    }
    return intl.formatMessage({
      id: 'component.tidasPackage.taskCenter.process.import.buildReport',
      defaultMessage: 'Build report',
    });
  }

  if (phase === 'submitting') {
    return intl.formatMessage({
      id: 'component.tidasPackage.taskCenter.process.export.submitTask',
      defaultMessage: 'Submit task',
    });
  }
  if (phase === 'queued') {
    return intl.formatMessage({
      id: 'component.tidasPackage.taskCenter.process.export.queued',
      defaultMessage: 'Queued',
    });
  }
  if (phase === 'collect_refs') {
    return intl.formatMessage({
      id: 'component.tidasPackage.taskCenter.process.export.collectRefs',
      defaultMessage: 'Collect related data',
    });
  }
  if (phase === 'finalize_zip') {
    return intl.formatMessage({
      id: 'component.tidasPackage.taskCenter.process.export.buildZip',
      defaultMessage: 'Build ZIP',
    });
  }
  return intl.formatMessage({
    id: 'component.tidasPackage.taskCenter.process.export.ready',
    defaultMessage: 'Export ready',
  });
}

function packageProcessPhases(
  task: TidasPackageBackgroundTask,
): Array<TidasPackageTaskPhase | 'report'> {
  if (task.kind === 'tidas_package_import') {
    return ['submitting', 'queued', 'import_package', 'report'];
  }
  return ['submitting', 'queued', 'collect_refs', 'finalize_zip', 'completed'];
}

function packageProcessSteps(
  task: TidasPackageBackgroundTask,
  intl: IntlShapeLike,
): ProcessStepItem[] {
  const phases = packageProcessPhases(task);
  const currentPhase =
    task.kind === 'tidas_package_import' && task.phase === 'completed'
      ? 'report'
      : task.phase === 'failed'
        ? phases[phases.length - 1]
        : task.phase;
  const currentIndex = Math.max(
    0,
    phases.findIndex((phase) => phase === currentPhase),
  );

  return phases.map((phase, index) => {
    const state = processStepStatus(index, currentIndex, task.state);
    const description =
      index === 0
        ? formatDateTime(task.createdAt, intl)
        : index === currentIndex && task.state !== 'completed'
          ? processStateLabel(state, intl)
          : state === 'completed'
            ? processStateLabel(state, intl)
            : undefined;
    return {
      key: phase,
      title: packageProcessStageLabel(task, phase, intl),
      description,
      state,
    };
  });
}

const LcaProcessDetail: React.FC<{ task: LcaBackgroundTask; intl: IntlShapeLike }> = ({
  task,
  intl,
}) => <HorizontalProcessSteps steps={lcaProcessSteps(task, intl)} intl={intl} />;

function packageTaskErrorText(
  task: TidasPackageBackgroundTask,
  intl: IntlShapeLike,
): string | undefined {
  if (!task.error) {
    return undefined;
  }

  if (
    task.kind === 'tidas_package_export' &&
    classifyTidasPackageExportError(task.error) === TIDAS_PACKAGE_EXPORT_TOO_LARGE_ERROR
  ) {
    return intl.formatMessage({
      id: 'component.tidasPackage.export.error.tooLarge',
      defaultMessage:
        'Export package is too large for the current storage upload limit. Try exporting a smaller scope, or ask an administrator to enable large-file upload support.',
    });
  }

  return task.error;
}

function diagnosticJson(value: unknown): string | undefined {
  try {
    return JSON.stringify(value, null, 2);
  } catch (_error) {
    return String(value);
  }
}

type DetailRow = {
  label: string;
  value?: React.ReactNode;
};

type DiagnosticField = {
  label: string;
  value?: unknown;
};

function taskItemKey(item: TaskCenterItem): string {
  return `${item.kind}:${item.task.id}`;
}

function taskKindFilter(item: TaskCenterItem): TaskKindFilter {
  if (item.kind === 'lca') {
    return 'lca';
  }
  return item.task.kind === 'tidas_package_import' ? 'tidas_import' : 'tidas_export';
}

function lcaModeLabel(mode: LcaBackgroundTask['mode'], intl: IntlShapeLike): string {
  return mode === 'all_unit'
    ? intl.formatMessage({
        id: 'pages.process.lca.mode.allUnit',
        defaultMessage: 'All Processes (Reference Flow = 1)',
      })
    : intl.formatMessage({
        id: 'pages.process.lca.mode.single',
        defaultMessage: 'Single-Process Calculation',
      });
}

function tidasScopeLabel(
  scope: TidasPackageBackgroundTask['scope'] | undefined,
  intl: IntlShapeLike,
): string {
  if (scope === 'current_user') {
    return intl.formatMessage({
      id: 'component.tidasPackage.scope.currentUser',
      defaultMessage: 'Current user data',
    });
  }
  if (scope === 'open_data') {
    return intl.formatMessage({
      id: 'component.tidasPackage.scope.openData',
      defaultMessage: 'Open data',
    });
  }
  if (scope === 'current_user_and_open_data') {
    return intl.formatMessage({
      id: 'component.tidasPackage.scope.currentUserAndOpenData',
      defaultMessage: 'Current user data + open data',
    });
  }
  return intl.formatMessage({
    id: 'pages.process.lca.taskCenter.notSpecified',
    defaultMessage: 'Not specified',
  });
}

function taskTypeLabel(filter: TaskKindFilter, intl: IntlShapeLike): string {
  if (filter === 'lca') {
    return intl.formatMessage({
      id: 'pages.process.lca.taskCenter.type.lca',
      defaultMessage: 'LCA Calculation',
    });
  }
  if (filter === 'tidas_export') {
    return intl.formatMessage({
      id: 'component.tidasPackage.taskCenter.kind.packageExport',
      defaultMessage: 'TIDAS Export',
    });
  }
  if (filter === 'tidas_import') {
    return intl.formatMessage({
      id: 'component.tidasPackage.taskCenter.kind.packageImport',
      defaultMessage: 'TIDAS Import',
    });
  }
  if (filter === 'data_product') {
    return intl.formatMessage({
      id: 'pages.dataProcessing.taskCenter.kind',
      defaultMessage: 'Data Product',
    });
  }
  return intl.formatMessage({
    id: 'pages.process.lca.taskCenter.filter.all',
    defaultMessage: 'All',
  });
}

function taskTitle(item: TaskCenterItem, intl: IntlShapeLike): string {
  if (item.kind === 'lca') {
    return intl.formatMessage({
      id: 'pages.process.lca.taskCenter.title.lca',
      defaultMessage: 'LCA calculation',
    });
  }
  if (item.task.kind === 'tidas_package_export') {
    return item.task.filename
      ? intl.formatMessage(
          {
            id: 'component.tidasPackage.taskCenter.title.exportWithFile',
            defaultMessage: 'Export package: {filename}',
          },
          { filename: item.task.filename },
        )
      : intl.formatMessage({
          id: 'component.tidasPackage.taskCenter.title.export',
          defaultMessage: 'Export TIDAS package',
        });
  }
  return item.task.filename
    ? intl.formatMessage(
        {
          id: 'component.tidasPackage.taskCenter.title.importWithFile',
          defaultMessage: 'Import package: {filename}',
        },
        { filename: item.task.filename },
      )
    : intl.formatMessage({
        id: 'component.tidasPackage.taskCenter.title.import',
        defaultMessage: 'Import TIDAS package',
      });
}

function taskProgressPercent(item: TaskCenterItem): number {
  if (item.task.state === 'completed') {
    return 100;
  }
  if (item.task.state === 'failed') {
    return 0;
  }
  if (item.kind === 'lca') {
    if (item.task.phase === 'solving') {
      return 65;
    }
    if (item.task.phase === 'building_snapshot') {
      return 38;
    }
    return 12;
  }
  if (item.task.phase === 'finalize_zip' || item.task.phase === 'import_package') {
    return 82;
  }
  if (item.task.phase === 'collect_refs') {
    return 48;
  }
  if (item.task.phase === 'queued') {
    return 20;
  }
  return 12;
}

function taskProgressStrokeColor(
  item: TaskCenterItem,
  token: ReturnType<typeof theme.useToken>['token'],
): string {
  if (item.kind === 'package' && item.task.kind === 'tidas_package_import') {
    if (
      item.task.state === 'failed' ||
      item.task.importOutcome === 'none' ||
      item.task.importOutcome === 'interrupted'
    )
      return token.colorError;
    if (item.task.state === 'completed' && item.task.importOutcome === 'partial')
      return token.colorWarning;
  }
  if (item.task.state === 'completed') {
    return token.colorSuccess;
  }
  if (item.task.state === 'failed') {
    return token.colorFillSecondary;
  }
  return token.colorPrimary;
}

function visibleDiagnosticValue(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'string') {
    return value.trim() || undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return diagnosticJson(value);
}

function DiagnosticRows({
  fields,
  intl,
}: {
  fields: DiagnosticField[];
  intl: IntlShapeLike;
}): React.ReactElement {
  const visibleFields = fields
    .map((field) => ({ ...field, value: visibleDiagnosticValue(field.value) }))
    .filter((field): field is { label: string; value: string } => Boolean(field.value));

  if (visibleFields.length === 0) {
    return (
      <Typography.Text type='secondary'>
        {intl.formatMessage({
          id: 'pages.process.lca.taskCenter.diagnostics.empty',
          defaultMessage: 'No diagnostics available',
        })}
      </Typography.Text>
    );
  }

  return (
    <Space orientation='vertical' size={6} style={{ maxWidth: 440 }}>
      {visibleFields.map((field) => (
        <div key={field.label}>
          <Typography.Text type='secondary' style={{ display: 'block', fontSize: 12 }}>
            {field.label}
          </Typography.Text>
          <Typography.Text
            copyable
            style={{
              display: 'block',
              fontSize: 12,
              maxHeight: 160,
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {field.value}
          </Typography.Text>
        </div>
      ))}
    </Space>
  );
}

function lcaDiagnosticContent(task: LcaBackgroundTask, intl: IntlShapeLike): React.ReactNode {
  return (
    <DiagnosticRows
      intl={intl}
      fields={[
        {
          label: intl.formatMessage({
            id: 'pages.process.lca.taskCenter.diagnostics.taskId',
            defaultMessage: 'Task ID',
          }),
          value: task.id,
        },
        {
          label: intl.formatMessage({
            id: 'pages.process.lca.taskCenter.diagnostics.sequence',
            defaultMessage: 'Sequence',
          }),
          value: task.sequence,
        },
        {
          label: intl.formatMessage({
            id: 'pages.process.lca.taskCenter.diagnostics.workerJobId',
            defaultMessage: 'Worker job ID',
          }),
          value: task.workerJobId,
        },
        {
          label: intl.formatMessage({
            id: 'pages.process.lca.taskCenter.diagnostics.rootJobId',
            defaultMessage: 'Root job ID',
          }),
          value: task.rootJobId,
        },
        {
          label: intl.formatMessage({
            id: 'pages.process.lca.taskCenter.diagnostics.jobKind',
            defaultMessage: 'Worker job kind',
          }),
          value: task.jobKind,
        },
        {
          label: intl.formatMessage({
            id: 'pages.process.lca.taskCenter.detail.buildJobId',
            defaultMessage: 'Build job ID',
          }),
          value: task.buildJobId,
        },
        {
          label: intl.formatMessage({
            id: 'pages.process.lca.taskCenter.detail.solveJobId',
            defaultMessage: 'Calculation job ID',
          }),
          value: task.solveJobId,
        },
        {
          label: intl.formatMessage({
            id: 'pages.process.lca.taskCenter.detail.snapshotId',
            defaultMessage: 'Snapshot ID',
          }),
          value: task.snapshotId,
        },
        {
          label: intl.formatMessage({
            id: 'pages.process.lca.taskCenter.detail.resultId',
            defaultMessage: 'Result ID',
          }),
          value: task.resultId,
        },
        {
          label: intl.formatMessage({
            id: 'pages.process.lca.taskCenter.diagnostics.request',
            defaultMessage: 'Request',
          }),
          value: task.request,
        },
      ]}
    />
  );
}

function packageDiagnosticContent(
  task: TidasPackageBackgroundTask,
  intl: IntlShapeLike,
): React.ReactNode {
  return (
    <DiagnosticRows
      intl={intl}
      fields={[
        {
          label: intl.formatMessage({
            id: 'pages.process.lca.taskCenter.diagnostics.taskId',
            defaultMessage: 'Task ID',
          }),
          value: task.id,
        },
        {
          label: intl.formatMessage({
            id: 'pages.process.lca.taskCenter.diagnostics.sequence',
            defaultMessage: 'Sequence',
          }),
          value: task.sequence,
        },
        {
          label: intl.formatMessage({
            id: 'pages.process.lca.taskCenter.diagnostics.taskKind',
            defaultMessage: 'Task kind',
          }),
          value: task.kind,
        },
        {
          label: intl.formatMessage({
            id: 'pages.process.lca.taskCenter.diagnostics.workerJobId',
            defaultMessage: 'Worker job ID',
          }),
          value: task.workerJobId,
        },
        {
          label: intl.formatMessage({
            id: 'pages.process.lca.taskCenter.diagnostics.jobKind',
            defaultMessage: 'Worker job kind',
          }),
          value: task.jobKind,
        },
        {
          label: intl.formatMessage({
            id: 'component.tidasPackage.taskCenter.detail.jobId',
            defaultMessage: 'Job ID',
          }),
          value: task.jobId,
        },
        {
          label: intl.formatMessage({
            id: 'pages.process.lca.taskCenter.diagnostics.request',
            defaultMessage: 'Request',
          }),
          value: task.request,
        },
      ]}
    />
  );
}

const DetailGrid: React.FC<{ rows: DetailRow[] }> = ({ rows }) => {
  const { token } = theme.useToken();
  const visibleRows = rows.filter((row) => row.value !== undefined && row.value !== null);
  return (
    <div
      style={{
        display: 'grid',
        gap: 10,
        gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))',
      }}
    >
      {visibleRows.map((row) => (
        <div
          key={row.label}
          style={{
            background: token.colorFillSecondary,
            borderRadius: 6,
            padding: '8px 10px',
          }}
        >
          <Typography.Text type='secondary' style={{ display: 'block', fontSize: 12 }}>
            {row.label}
          </Typography.Text>
          <Typography.Text strong style={{ fontSize: 13 }}>
            {row.value}
          </Typography.Text>
        </div>
      ))}
    </div>
  );
};

const DetailSection: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <Space orientation='vertical' size={8} style={{ width: '100%' }}>
    <Typography.Text strong>{title}</Typography.Text>
    {children}
  </Space>
);

const PackageProcessDetail: React.FC<{
  item: Extract<TaskCenterItem, { kind: 'package' }>;
  intl: IntlShapeLike;
}> = ({ item, intl }) => (
  <HorizontalProcessSteps steps={packageProcessSteps(item.task, intl)} intl={intl} />
);

function lcaBusinessDetail(task: LcaBackgroundTask, intl: IntlShapeLike): React.ReactNode {
  const errorText = task.error?.trim();
  return (
    <Space orientation='vertical' size={14} style={{ width: '100%' }}>
      <DetailGrid
        rows={[
          {
            label: intl.formatMessage({
              id: 'pages.process.lca.taskCenter.detail.mode',
              defaultMessage: 'Demand type',
            }),
            value: lcaModeLabel(task.mode, intl),
          },
          {
            label: intl.formatMessage({
              id: 'pages.process.lca.taskCenter.detail.scope',
              defaultMessage: 'Data scope',
            }),
            value: task.scope,
          },
        ]}
      />
      {task.state === 'completed' && !task.resultId && (
        <Typography.Text>
          {intl.formatMessage({
            id: 'pages.process.lca.taskCenter.detail.noResult',
            defaultMessage: 'The task completed without a returned result.',
          })}
        </Typography.Text>
      )}
      {task.state === 'failed' && errorText && (
        <DetailSection
          title={intl.formatMessage({
            id: 'pages.process.lca.taskCenter.detail.failureReason',
            defaultMessage: 'Failure reason',
          })}
        >
          <Typography.Text type='danger'>{errorText}</Typography.Text>
        </DetailSection>
      )}
    </Space>
  );
}

function packageBusinessDetail(
  task: TidasPackageBackgroundTask,
  intl: IntlShapeLike,
): React.ReactNode {
  const singleRoot = task.request?.roots?.length === 1 ? task.request.roots[0] : null;
  const isImport = task.kind === 'tidas_package_import';
  const errorText = packageTaskErrorText(task, intl);
  const filename =
    task.filename ??
    (isImport
      ? intl.formatMessage({
          id: 'component.tidasPackage.taskCenter.detail.importFileFallback',
          defaultMessage: 'Uploaded ZIP package',
        })
      : 'tidas-package.zip');

  return (
    <Space orientation='vertical' size={14} style={{ width: '100%' }}>
      <DetailGrid
        rows={[
          {
            label: intl.formatMessage({
              id: 'component.tidasPackage.taskCenter.detail.filename',
              defaultMessage: 'File name',
            }),
            value: filename,
          },
          {
            label: intl.formatMessage({
              id: 'component.tidasPackage.taskCenter.detail.scope',
              defaultMessage: 'Data scope',
            }),
            value: tidasScopeLabel(task.scope ?? undefined, intl),
          },
          {
            label: intl.formatMessage({
              id: 'component.tidasPackage.taskCenter.detail.rootCount',
              defaultMessage: 'Root records',
            }),
            value: task.rootCount,
          },
        ]}
      />
      {isImport && task.jobId && (
        <TidasImportResult
          jobId={task.jobId}
          reportAvailable={task.importReportAvailable}
          detailsAvailable={task.importDetailsAvailable}
        />
      )}
      {singleRoot && (
        <DetailSection
          title={intl.formatMessage({
            id: 'component.tidasPackage.taskCenter.detail.rootRef',
            defaultMessage: 'Root data',
          })}
        >
          <Typography.Text>
            {singleRoot.table} · {singleRoot.id} @ {singleRoot.version}
          </Typography.Text>
        </DetailSection>
      )}
      {!isImport && task.state === 'failed' && errorText && (
        <DetailSection
          title={intl.formatMessage({
            id: 'pages.process.lca.taskCenter.detail.failureReason',
            defaultMessage: 'Failure reason',
          })}
        >
          <Typography.Text type='danger'>{errorText}</Typography.Text>
        </DetailSection>
      )}
    </Space>
  );
}

function taskDiagnosticContent(item: TaskCenterItem, intl: IntlShapeLike): React.ReactNode {
  if (item.kind === 'lca') {
    return lcaDiagnosticContent(item.task, intl);
  }
  return packageDiagnosticContent(item.task, intl);
}

function taskBusinessDetailContent(item: TaskCenterItem, intl: IntlShapeLike): React.ReactNode {
  if (item.kind === 'lca') {
    return lcaBusinessDetail(item.task, intl);
  }
  return packageBusinessDetail(item.task, intl);
}

function taskProcessDetailContent(item: TaskCenterItem, intl: IntlShapeLike): React.ReactNode {
  if (item.kind === 'lca') {
    return (
      <DetailSection
        title={intl.formatMessage({
          id: 'pages.process.lca.taskCenter.process.title',
          defaultMessage: 'Execution stages',
        })}
      >
        <LcaProcessDetail task={item.task} intl={intl} />
      </DetailSection>
    );
  }
  return (
    <DetailSection
      title={intl.formatMessage({
        id: 'pages.process.lca.taskCenter.process.title',
        defaultMessage: 'Execution stages',
      })}
    >
      <PackageProcessDetail item={item} intl={intl} />
    </DetailSection>
  );
}

const TaskDetailPopoverContent: React.FC<{
  item: TaskCenterItem;
  intl: IntlShapeLike;
}> = ({ item, intl }) => {
  return (
    <Space orientation='vertical' size={12} style={{ minWidth: 0, width: '100%' }}>
      <DetailSection
        title={intl.formatMessage({
          id: 'pages.process.lca.taskCenter.detail.infoTitle',
          defaultMessage: 'Detail information',
        })}
      >
        {taskBusinessDetailContent(item, intl)}
      </DetailSection>
      {taskProcessDetailContent(item, intl)}
    </Space>
  );
};

const TaskDiagnosticsPopoverContent: React.FC<{
  item: TaskCenterItem;
  intl: IntlShapeLike;
}> = ({ item, intl }) => {
  return (
    <div
      style={{
        maxHeight: DIAGNOSTICS_POPOVER_MAX_HEIGHT,
        maxWidth: 'calc(100vw - 96px)',
        minWidth: 360,
        overflowX: 'hidden',
        overflowY: 'auto',
        paddingRight: 4,
        width: DIAGNOSTICS_POPOVER_WIDTH,
      }}
    >
      <DetailSection
        title={intl.formatMessage({
          id: 'pages.process.lca.taskCenter.detail.debugTitle',
          defaultMessage: 'Debug information',
        })}
      >
        {taskDiagnosticContent(item, intl)}
      </DetailSection>
    </div>
  );
};

const LcaTaskCenter: React.FC = () => {
  const { message } = useAntdAppApi();
  const intl = useIntl();
  const { token } = theme.useToken();
  const [open, setOpen] = useState(false);
  const [downloadingTaskId, setDownloadingTaskId] = useState<string | null>(null);
  const [refreshingTasks, setRefreshingTasks] = useState(false);
  const [activeFilter, setActiveFilter] = useState<TaskKindFilter>('all');
  const [expandedTaskKeys, setExpandedTaskKeys] = useState<string[]>([]);
  const lcaTasks = useLcaTasks();
  const packageTasks = useTidasPackageTasks();
  const dataProductTasks = useDataProductTaskSummaries();

  const refreshAllTasks = useCallback(async () => {
    await Promise.all([
      refreshLcaTasksFromWorkerJobs(),
      refreshTidasPackageTasksFromWorkerJobs(),
      refreshDataProductTasks(),
    ]);
  }, []);

  useEffect(() => {
    void refreshAllTasks().catch(() => undefined);
    const interval = window.setInterval(() => {
      void refreshAllTasks().catch(() => undefined);
    }, 5000);
    return () => {
      window.clearInterval(interval);
    };
  }, [refreshAllTasks]);

  useEffect(
    () =>
      subscribeLcaTaskCenterOpenRequests(() => {
        setOpen(true);
        void refreshAllTasks().catch(() => undefined);
      }),
    [refreshAllTasks],
  );

  const items = useMemo<TaskCenterItem[]>(
    () =>
      [
        ...lcaTasks.map((task) => ({ kind: 'lca' as const, task })),
        ...packageTasks.map((task) => ({ kind: 'package' as const, task })),
      ].sort(
        (left, right) =>
          Date.parse(right.task.createdAt) - Date.parse(left.task.createdAt) ||
          left.task.id.localeCompare(right.task.id),
      ),
    [lcaTasks, packageTasks],
  );

  const runningCount = useMemo(
    () =>
      items.filter((item) => item.task.state === 'running').length +
      dataProductTasks.filter((task) => task.runState === 'active').length,
    [dataProductTasks, items],
  );
  const filteredItems = useMemo(
    () =>
      activeFilter === 'all'
        ? items
        : items.filter((item) => taskKindFilter(item) === activeFilter),
    [activeFilter, items],
  );
  const filterOptions = useMemo(
    () =>
      (['all', 'lca', 'tidas_export', 'tidas_import', 'data_product'] as const).map((value) => ({
        value,
        label: taskTypeLabel(value, intl),
      })),
    [intl],
  );
  const badgeStyle = getHeaderBadgeStyle(token.colorError);
  const visibleDataProductTasks = useMemo(
    () => (activeFilter === 'all' || activeFilter === 'data_product' ? dataProductTasks : []),
    [activeFilter, dataProductTasks],
  );

  useEffect(() => {
    setExpandedTaskKeys((current) =>
      current.filter(
        (key) =>
          items.some((item) => taskItemKey(item) === key) ||
          dataProductTasks.some((task) => `data-product:${task.id}` === key),
      ),
    );
  }, [dataProductTasks, items]);

  const handleDownload = async (task: TidasPackageBackgroundTask) => {
    try {
      setDownloadingTaskId(task.id);
      const result = await downloadTidasPackageExportTask(task.id);
      message.success(
        intl.formatMessage(
          {
            id: 'component.tidasPackage.taskCenter.download.success',
            defaultMessage: 'Downloaded {filename}',
          },
          { filename: result.filename },
        ),
      );
    } catch (error: any) {
      message.error(
        error?.message ||
          intl.formatMessage({
            id: 'component.tidasPackage.taskCenter.download.error',
            defaultMessage: 'Failed to download TIDAS package',
          }),
      );
    } finally {
      setDownloadingTaskId(null);
    }
  };

  const handleRefreshTasks = async () => {
    try {
      setRefreshingTasks(true);
      await refreshAllTasks();
    } catch (error: any) {
      message.error(
        error?.message ||
          intl.formatMessage({
            id: 'pages.process.lca.taskCenter.refresh.error',
            defaultMessage: 'Failed to refresh tasks',
          }),
      );
    } finally {
      setRefreshingTasks(false);
    }
  };

  const modalTitle = (
    <div
      style={{
        alignItems: 'center',
        display: 'flex',
        gap: 16,
        justifyContent: 'space-between',
        paddingRight: 40,
      }}
    >
      <Typography.Title level={3} style={{ margin: 0 }}>
        {intl.formatMessage({
          id: 'pages.process.lca.taskCenter.title',
          defaultMessage: 'Task Center',
        })}
      </Typography.Title>
      <Space size={8}>
        <Button
          icon={<ReloadOutlined />}
          loading={refreshingTasks}
          onClick={() => {
            void handleRefreshTasks();
          }}
        >
          {intl.formatMessage({
            id: 'pages.process.lca.taskCenter.refresh',
            defaultMessage: 'Refresh',
          })}
        </Button>
        <Button
          onClick={() => {
            clearFinishedLcaTasks();
            clearFinishedTidasPackageTasks();
          }}
        >
          {intl.formatMessage({
            id: 'pages.process.lca.taskCenter.clearFinished',
            defaultMessage: 'Clear finished',
          })}
        </Button>
      </Space>
    </div>
  );

  return (
    <>
      <HeaderActionIcon
        aria-label={intl.formatMessage({
          id: 'pages.process.lca.taskCenter.title',
          defaultMessage: 'Task Center',
        })}
        title={intl.formatMessage({
          id: 'pages.process.lca.taskCenter.title',
          defaultMessage: 'Task Center',
        })}
        icon={<ClockCircleOutlined />}
        badgeCount={runningCount}
        badgeStyle={badgeStyle}
        onClick={() => {
          setOpen(true);
          void refreshAllTasks().catch(() => undefined);
        }}
      />
      <Modal
        title={modalTitle}
        open={open}
        onCancel={() => {
          setOpen(false);
        }}
        footer={null}
        width={1120}
      >
        <Space orientation='vertical' size={24} style={{ width: '100%' }}>
          <Tabs
            activeKey={activeFilter}
            animated={false}
            items={filterOptions.map((option) => ({
              key: option.value,
              label: option.label,
            }))}
            tabBarGutter={24}
            tabBarStyle={{ marginBottom: 0 }}
            onChange={(key) => {
              setActiveFilter(key as TaskKindFilter);
            }}
          />
          <div
            style={{
              border: `1px solid ${token.colorBorderSecondary}`,
              borderRadius: 6,
              maxHeight: '68vh',
              overflow: 'auto',
            }}
          >
            {filteredItems.length === 0 && visibleDataProductTasks.length === 0 ? (
              <div style={{ padding: 40 }}>
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={intl.formatMessage({
                    id: 'pages.process.lca.taskCenter.empty',
                    defaultMessage: 'No tasks',
                  })}
                />
              </div>
            ) : (
              <>
                {visibleDataProductTasks.map((task, index) => {
                  const itemKey = `data-product:${task.id}`;
                  const isClosureCheck = task.jobKind === 'lcia.scope_closure_check';
                  const closureCheckId =
                    task.deepLink?.routeKey === 'data_product.closure_check'
                      ? task.deepLink.params.closureCheckId
                      : task.closureCheckId;
                  const resultSetId = task.deepLink?.params.resultSetId ?? task.resultSetId;
                  const expanded = expandedTaskKeys.includes(itemKey);
                  const taskHref = `/data-processing?${new URLSearchParams({
                    tab: 'builds',
                    ...(resultSetId ? { resultSetId } : {}),
                    ...(task.deepLink?.routeKey === 'data_product.closure_check' &&
                    task.deepLink.params.closureCheckId
                      ? { closureCheckId: task.deepLink.params.closureCheckId }
                      : {}),
                    ...(task.deepLink?.routeKey === 'data_product.package' &&
                    task.deepLink.params.packageId
                      ? { packageId: task.deepLink.params.packageId, tab: 'preview' }
                      : {}),
                  }).toString()}`;
                  const progressPercent = taskSummaryProgressPercent(task);
                  return (
                    <div
                      key={`data-product:${task.id}`}
                      style={{
                        alignItems: 'center',
                        borderTop:
                          index === 0 ? undefined : `1px solid ${token.colorBorderSecondary}`,
                        display: 'grid',
                        gap: 14,
                        gridTemplateColumns:
                          'minmax(250px, 1.35fr) minmax(108px, 0.48fr) minmax(230px, 0.9fr) minmax(168px, max-content)',
                        minHeight: 76,
                        padding: '12px 16px',
                      }}
                    >
                      <Space orientation='vertical' size={3} style={{ minWidth: 0 }}>
                        <Space size={8} wrap>
                          <Typography.Text strong style={{ fontSize: 14 }}>
                            {task.title}
                          </Typography.Text>
                          <Tag
                            color={
                              task.runState === 'succeeded'
                                ? 'success'
                                : task.runState === 'blocked'
                                  ? 'warning'
                                  : task.runState === 'failed'
                                    ? 'error'
                                    : task.runState === 'cancelled'
                                      ? 'default'
                                      : 'processing'
                            }
                          >
                            {task.workerStatus}
                          </Tag>
                          {task.domainValidity !== 'none' ? (
                            <Tag>{`Certificate: ${task.domainValidity}`}</Tag>
                          ) : null}
                        </Space>
                        <Typography.Text type='secondary' style={{ fontSize: 12 }}>
                          {task.progressLabel ?? `Worker job ${task.id}`}
                        </Typography.Text>
                        {task.runState === 'failed' && task.errorSummary ? (
                          <Typography.Text
                            type='danger'
                            style={{ fontSize: 12, overflowWrap: 'anywhere' }}
                          >
                            {task.errorSummary}
                          </Typography.Text>
                        ) : null}
                      </Space>
                      <Typography.Text style={{ fontSize: 13 }}>
                        {formatDateTime(task.updatedAt, intl)}
                      </Typography.Text>
                      <Space orientation='vertical' size={5} style={{ width: '100%' }}>
                        <Typography.Text style={{ fontSize: 13 }}>
                          {task.phase ?? 'Queued'}
                        </Typography.Text>
                        <div style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
                          <Progress
                            percent={progressPercent}
                            showInfo={false}
                            size='small'
                            style={{ flex: '1 1 132px', marginBottom: 0, minWidth: 132 }}
                            railColor={token.colorFillSecondary}
                          />
                          <Typography.Text style={{ fontSize: 12, minWidth: 34 }}>
                            {progressPercent}%
                          </Typography.Text>
                        </div>
                      </Space>
                      <Space size={6} wrap>
                        {isClosureCheck ? (
                          <>
                            <Tooltip
                              title={intl.formatMessage({
                                id: 'pages.process.lca.taskCenter.view',
                                defaultMessage: 'View',
                              })}
                            >
                              <Button
                                aria-label={intl.formatMessage({
                                  id: 'pages.process.lca.taskCenter.view',
                                  defaultMessage: 'View',
                                })}
                                icon={<EyeOutlined />}
                                size='small'
                                type='text'
                                style={expanded ? { color: token.colorPrimary } : undefined}
                                onClick={() => {
                                  setExpandedTaskKeys((current) =>
                                    current.includes(itemKey)
                                      ? current.filter((key) => key !== itemKey)
                                      : [...current, itemKey],
                                  );
                                }}
                              />
                            </Tooltip>
                            <Button size='small' type='link' href={taskHref}>
                              {intl.formatMessage({
                                id: 'pages.process.lca.taskCenter.continueProcessing',
                                defaultMessage: 'Continue',
                              })}
                            </Button>
                          </>
                        ) : (
                          <Button size='small' type='link' href={taskHref} icon={<EyeOutlined />}>
                            {intl.formatMessage({
                              id: 'pages.process.lca.taskCenter.openWorkbench',
                              defaultMessage: 'Open',
                            })}
                          </Button>
                        )}
                      </Space>
                      {expanded && isClosureCheck ? (
                        <div
                          style={{
                            background: token.colorFillSecondary,
                            borderRadius: 6,
                            gridColumn: '1 / -1',
                            marginTop: 2,
                            padding: '12px 14px',
                          }}
                        >
                          {closureCheckId ? (
                            <ClosureTaskDetail
                              canDownloadReport={task.capabilities.canDownloadReport}
                              closureCheckId={closureCheckId}
                              errorSummary={task.errorSummary}
                              refreshSignal={`${task.workerStatus}:${task.updatedAt}`}
                            />
                          ) : (
                            <Alert
                              type='error'
                              title={intl.formatMessage({
                                id: 'pages.dataProcessing.closure.detailUnavailable',
                                defaultMessage: 'Task details are currently unavailable.',
                              })}
                            />
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {filteredItems.map((item, index) => {
                  const itemKey = taskItemKey(item);
                  const progressPercent = taskProgressPercent(item);
                  const expanded = expandedTaskKeys.includes(itemKey);
                  return (
                    <div
                      key={itemKey}
                      style={{
                        alignItems: 'center',
                        borderTop:
                          index === 0 && visibleDataProductTasks.length === 0
                            ? undefined
                            : `1px solid ${token.colorBorderSecondary}`,
                        display: 'grid',
                        gap: 14,
                        gridTemplateColumns:
                          'minmax(250px, 1.35fr) minmax(108px, 0.48fr) minmax(230px, 0.9fr) minmax(168px, max-content)',
                        minHeight: 76,
                        padding: '12px 16px',
                      }}
                    >
                      <Space orientation='vertical' size={3} style={{ minWidth: 0 }}>
                        <Space size={8} wrap>
                          <Typography.Text strong style={{ fontSize: 14 }}>
                            {taskTitle(item, intl)}
                          </Typography.Text>
                          {statusTag(
                            item.task.state,
                            intl,
                            item.kind === 'package' ? item.task.importOutcome : undefined,
                          )}
                          <Popover
                            trigger='click'
                            placement='bottomLeft'
                            styles={{
                              content: {
                                maxHeight: DIAGNOSTICS_POPOVER_MAX_HEIGHT,
                                overflowX: 'hidden',
                                overflowY: 'auto',
                              },
                              root: {
                                maxWidth: DIAGNOSTICS_POPOVER_WIDTH + 32,
                              },
                            }}
                            content={<TaskDiagnosticsPopoverContent item={item} intl={intl} />}
                          >
                            <Tooltip
                              title={intl.formatMessage({
                                id: 'pages.process.lca.taskCenter.diagnostics',
                                defaultMessage: 'Diagnostics',
                              })}
                            >
                              <Button
                                aria-label={intl.formatMessage({
                                  id: 'pages.process.lca.taskCenter.diagnostics',
                                  defaultMessage: 'Diagnostics',
                                })}
                                size='small'
                                type='text'
                                icon={<InfoCircleOutlined style={{ fontSize: 12 }} />}
                                style={{
                                  color: token.colorTextTertiary,
                                  height: 18,
                                  minWidth: 18,
                                  paddingInline: 0,
                                  width: 18,
                                }}
                              />
                            </Tooltip>
                          </Popover>
                        </Space>
                        <Typography.Text type='secondary' style={{ fontSize: 12 }}>
                          {intl.formatMessage({
                            id: 'pages.process.lca.taskCenter.updated',
                            defaultMessage: 'Updated',
                          })}{' '}
                          {formatDateTime(item.task.updatedAt, intl)}
                        </Typography.Text>
                      </Space>
                      <Typography.Text style={{ fontSize: 13 }}>
                        {intl.formatMessage({
                          id: 'pages.process.lca.taskCenter.elapsedPrefix',
                          defaultMessage: 'Elapsed',
                        })}{' '}
                        {formatDuration(getTaskElapsedMs(item))}
                      </Typography.Text>
                      <Space orientation='vertical' size={5} style={{ width: '100%' }}>
                        <Space size={4} wrap>
                          <Typography.Text style={{ fontSize: 13 }}>
                            {intl.formatMessage({
                              id: 'pages.process.lca.taskCenter.phasePrefix',
                              defaultMessage: 'Phase:',
                            })}
                          </Typography.Text>
                          <Typography.Text style={{ fontSize: 13 }}>
                            {phaseLabel(item, intl)}
                          </Typography.Text>
                        </Space>
                        <div style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
                          <Progress
                            percent={progressPercent}
                            showInfo={false}
                            size='small'
                            strokeColor={taskProgressStrokeColor(item, token)}
                            style={{ flex: '1 1 132px', marginBottom: 0, minWidth: 132 }}
                            railColor={token.colorFillSecondary}
                          />
                          <Typography.Text style={{ fontSize: 12, minWidth: 34 }}>
                            {progressPercent}%
                          </Typography.Text>
                        </div>
                      </Space>
                      <Space size={6} wrap>
                        <Tooltip
                          title={intl.formatMessage({
                            id: 'pages.process.lca.taskCenter.view',
                            defaultMessage: 'View',
                          })}
                        >
                          <Button
                            aria-label={intl.formatMessage({
                              id: 'pages.process.lca.taskCenter.view',
                              defaultMessage: 'View',
                            })}
                            icon={<EyeOutlined />}
                            size='small'
                            type='text'
                            style={expanded ? { color: token.colorPrimary } : undefined}
                            onClick={() => {
                              setExpandedTaskKeys((current) =>
                                current.includes(itemKey)
                                  ? current.filter((key) => key !== itemKey)
                                  : [...current, itemKey],
                              );
                            }}
                          />
                        </Tooltip>
                        {item.kind === 'package' &&
                          item.task.kind === 'tidas_package_export' &&
                          item.task.state === 'completed' && (
                            <Tooltip
                              title={intl.formatMessage({
                                id: 'component.tidasPackage.taskCenter.download',
                                defaultMessage: 'Download',
                              })}
                            >
                              <Button
                                aria-label={intl.formatMessage({
                                  id: 'component.tidasPackage.taskCenter.download',
                                  defaultMessage: 'Download',
                                })}
                                icon={<DownloadOutlined />}
                                loading={downloadingTaskId === item.task.id}
                                size='small'
                                type='text'
                                onClick={() => {
                                  void handleDownload(item.task);
                                }}
                              />
                            </Tooltip>
                          )}
                      </Space>
                      {expanded && (
                        <div
                          style={{
                            background: token.colorFillSecondary,
                            borderRadius: 6,
                            gridColumn: '1 / -1',
                            marginTop: 2,
                            padding: '12px 14px',
                          }}
                        >
                          <TaskDetailPopoverContent item={item} intl={intl} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </Space>
      </Modal>
    </>
  );
};

export default LcaTaskCenter;
