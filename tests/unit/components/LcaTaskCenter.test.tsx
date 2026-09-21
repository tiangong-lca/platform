// @ts-nocheck
import LcaTaskCenter from '@/components/LcaTaskCenter';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

let mockTasks: any[] = [];
let mockPackageTasks: any[] = [];
let mockDataProductTasks: any[] = [];
const mockClearFinishedLcaTasks = jest.fn();
const mockClearFinishedTidasPackageTasks = jest.fn();
const mockDownloadTidasPackageExportTask = jest.fn();
const mockRefreshLcaTasksFromWorkerJobs = jest.fn();
const mockRefreshTidasPackageTasksFromWorkerJobs = jest.fn();
const mockSubscribeLcaTasks = jest.fn(() => jest.fn());
const mockSubscribeTidasPackageTasks = jest.fn(() => jest.fn());
const mockSubscribeLcaTaskCenterOpenRequests = jest.fn(() => jest.fn());
const mockRefreshDataProductTasks = jest.fn();
const mockSubscribeDataProductTasks = jest.fn(() => jest.fn());

jest.mock('@/components/ImportTidasPackage/ImportResult', () => ({
  __esModule: true,
  default: ({ jobId }: { jobId: string }) => (
    <button type='button' aria-label='Download report' data-testid='import-result'>
      {jobId}
    </button>
  ),
  importOutcomeLabel: (value: string) => value,
}));

jest.mock('@/components/ClosureTaskDetail', () => ({
  __esModule: true,
  default: ({ canDownloadReport, closureCheckId, refreshSignal }: any) => (
    <div data-testid={`mock-closure-detail-${closureCheckId}`}>
      {`${canDownloadReport}:${refreshSignal}`}
    </div>
  ),
}));

const formatWithValues = (message: string, values?: Record<string, any>) =>
  Object.entries(values ?? {}).reduce((text, [key, value]) => {
    return text.replace(`{${key}}`, String(value));
  }, message);

jest.mock('@/services/lca/taskCenter', () => ({
  __esModule: true,
  clearFinishedLcaTasks: () => mockClearFinishedLcaTasks(),
  listLcaTasks: () => mockTasks,
  refreshLcaTasksFromWorkerJobs: (...args: any[]) => mockRefreshLcaTasksFromWorkerJobs(...args),
  subscribeLcaTaskCenterOpenRequests: (...args: any[]) =>
    mockSubscribeLcaTaskCenterOpenRequests(...args),
  subscribeLcaTasks: (...args: any[]) => mockSubscribeLcaTasks(...args),
}));

jest.mock('@/services/tidasPackage/taskCenter', () => ({
  __esModule: true,
  clearFinishedTidasPackageTasks: () => mockClearFinishedTidasPackageTasks(),
  downloadTidasPackageExportTask: (...args: any[]) => mockDownloadTidasPackageExportTask(...args),
  listTidasPackageTasks: () => mockPackageTasks,
  refreshTidasPackageTasksFromWorkerJobs: (...args: any[]) =>
    mockRefreshTidasPackageTasksFromWorkerJobs(...args),
  subscribeTidasPackageTasks: (...args: any[]) => mockSubscribeTidasPackageTasks(...args),
}));

jest.mock('@/services/dataProducts/taskCenter', () => ({
  __esModule: true,
  listDataProductTasks: () => mockDataProductTasks,
  refreshDataProductTasks: (...args: any[]) => mockRefreshDataProductTasks(...args),
  subscribeDataProductTasks: (...args: any[]) => mockSubscribeDataProductTasks(...args),
}));

jest.mock('umi', () => ({
  __esModule: true,
  useIntl: () => ({
    locale: 'en-US',
    formatMessage: ({ defaultMessage, id }: any, values?: Record<string, any>) =>
      formatWithValues(defaultMessage ?? id, values),
  }),
}));

jest.mock('@ant-design/icons', () => ({
  __esModule: true,
  CheckCircleOutlined: () => <span>check-icon</span>,
  ClockCircleOutlined: ({ onClick }: any) => (
    <button type='button' aria-label='open-lca-task-center' onClick={onClick}>
      clock-icon
    </button>
  ),
  CloseCircleOutlined: () => <span>close-icon</span>,
  DownloadOutlined: () => <span>download-icon</span>,
  EyeOutlined: () => <span>eye-icon</span>,
  InfoCircleOutlined: () => <span>info-icon</span>,
  ReloadOutlined: () => <span>reload-icon</span>,
}));

jest.mock('antd', () => {
  const React = require('react');

  const Alert = ({ title }: any) => <div role='alert'>{title}</div>;

  const Badge = ({ count, children }: any) => (
    <div>
      <span data-testid='badge-count'>{count}</span>
      {children}
    </div>
  );

  const Button = ({ children, onClick, disabled, icon, 'aria-label': ariaLabel }: any) => (
    <button
      type='button'
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => {
        if (!disabled) {
          onClick?.();
        }
      }}
    >
      {children ?? icon}
    </button>
  );

  const Empty: any = ({ description }: any) => <div data-testid='empty'>{description}</div>;
  Empty.PRESENTED_IMAGE_SIMPLE = 'simple';

  const List: any = ({ dataSource = [], renderItem }: any) => (
    <div data-testid='list'>{dataSource.map((item: any) => renderItem(item))}</div>
  );
  List.Item = ({ children, actions = [] }: any) => (
    <div data-testid='list-item'>
      <div>{children}</div>
      <div>{actions}</div>
    </div>
  );

  const Modal = ({ open, title, children, onCancel }: any) =>
    open ? (
      <div role='dialog'>
        <h1>{title}</h1>
        {children}
        <button type='button' onClick={onCancel}>
          Close
        </button>
      </div>
    ) : null;

  const Popover = ({ children, content }: any) => {
    const [open, setOpen] = React.useState(false);
    const trigger = React.isValidElement(children)
      ? React.cloneElement(children, {
          onClick: (...args: any[]) => {
            children.props.onClick?.(...args);
            setOpen((current: boolean) => !current);
          },
        })
      : children;

    return (
      <div>
        {trigger}
        {open ? <div>{content}</div> : null}
      </div>
    );
  };

  const Progress = ({ percent, strokeColor }: any) => (
    <div role='progressbar' data-color={strokeColor}>
      {percent}%
    </div>
  );
  const Space = ({ children, style, ...props }: any) => {
    const domProps = { ...props };
    delete domProps.align;
    delete domProps.direction;
    delete domProps.size;
    delete domProps.split;
    delete domProps.wrap;
    return (
      <div style={style} {...domProps}>
        {children}
      </div>
    );
  };
  const Tag = ({ children, color }: any) => <span data-color={color}>{children}</span>;
  const Tabs = ({ activeKey, items = [], onChange }: any) => (
    <div role='tablist'>
      {items.map((item: any) => (
        <button
          key={item.key}
          aria-selected={activeKey === item.key}
          role='tab'
          type='button'
          onClick={() => onChange?.(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
  const Tooltip = ({ children, ...props }: any) =>
    React.isValidElement(children) ? React.cloneElement(children, props) : <>{children}</>;
  const Typography = {
    Text: ({ children }: any) => <span>{children}</span>,
    Title: ({ children }: any) => <h2>{children}</h2>,
  };
  const theme = {
    useToken: () => ({
      token: {
        colorBgContainer: '#fff',
        colorBorder: '#d9d9d9',
        colorBorderSecondary: '#d9d9d9',
        colorError: '#ff4d4f',
        colorFillSecondary: '#fafafa',
        colorPrimary: '#1677ff',
        colorSuccess: '#52c41a',
        colorWarning: '#faad14',
        colorTextTertiary: '#595959',
        colorWhite: '#fff',
      },
    }),
  };
  const message = {
    success: jest.fn(),
    error: jest.fn(),
  };
  const App = require('../../mocks/antdApp').createAntdAppMock({ message });

  return {
    __esModule: true,
    App,
    Alert,
    Badge,
    Button,
    Empty,
    List,
    Modal,
    Popover,
    Progress,
    Space,
    Tag,
    Tabs,
    Tooltip,
    Typography,
    message,
    theme,
  };
});

const { message } = jest.requireMock('antd') as {
  message: {
    success: jest.Mock;
    error: jest.Mock;
  };
};

describe('LcaTaskCenter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTasks = [];
    mockPackageTasks = [];
    mockDataProductTasks = [];
    mockDownloadTidasPackageExportTask.mockResolvedValue({ filename: 'downloaded.zip' });
    mockRefreshLcaTasksFromWorkerJobs.mockResolvedValue([]);
    mockRefreshTidasPackageTasksFromWorkerJobs.mockResolvedValue([]);
    mockRefreshDataProductTasks.mockResolvedValue([]);
  });

  it.each([
    ['success', 'completed', 'Completed', 'success'],
    ['partial', 'completed', 'Partially imported', 'warning'],
    ['none', 'completed', 'Failed', 'error'],
    ['interrupted', 'completed', 'Failed', 'error'],
    ['partial', 'failed', 'Failed', 'error'],
    ['success', 'running', 'Running', 'processing'],
  ])('uses the correct import result label and color (%s/%s)', (outcome, state, label, color) => {
    mockPackageTasks = [
      {
        id: 'colors',
        kind: 'tidas_package_import',
        state,
        phase: state,
        importOutcome: outcome,
        jobId: 'job',
        rootCount: 0,
        createdAt: '2026-09-18T00:00:00Z',
        updatedAt: '2026-09-18T00:01:00Z',
      },
    ];
    render(<LcaTaskCenter />);
    fireEvent.click(screen.getByRole('button', { name: 'Task Center' }));
    expect(
      screen.getAllByText(label).find((node) => node.hasAttribute('data-color')),
    ).toHaveAttribute('data-color', color);
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'data-color',
      { success: '#52c41a', warning: '#faad14', error: '#ff4d4f', processing: '#1677ff' }[color],
    );
    expect(screen.getByRole('button', { name: 'Diagnostics' })).toBeInTheDocument();
    expect(screen.getByTestId('import-result')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(screen.getByTestId('import-result')).toBeInTheDocument();
    expect(screen.getByText('Uploaded ZIP package')).toBeInTheDocument();
    expect(screen.getByText('Data scope')).toBeInTheDocument();
    expect(screen.getByText('Root records')).toBeInTheDocument();
    expect(screen.getAllByText('Execution stages').length).toBeGreaterThan(0);
  });

  it('does not offer report actions for an import without a job id', () => {
    mockPackageTasks = [
      {
        id: 'missing-job',
        kind: 'tidas_package_import',
        state: 'running',
        phase: 'queued',
        rootCount: 0,
        createdAt: '2026-09-18T00:00:00Z',
        updatedAt: '2026-09-18T00:01:00Z',
      },
    ];
    render(<LcaTaskCenter />);
    fireEvent.click(screen.getByRole('button', { name: 'Task Center' }));
    expect(screen.queryByTestId('import-result')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(screen.queryByTestId('import-result')).not.toBeInTheDocument();
  });

  it('keeps completed package duration and order fixed after later metadata refreshes', () => {
    mockPackageTasks = ['b', 'a'].map((id) => ({
      id,
      sequence: 1,
      kind: 'tidas_package_import',
      state: id === 'a' ? 'completed' : 'failed',
      phase: id === 'a' ? 'completed' : 'failed',
      filename: `${id}.zip`,
      createdAt: '2026-09-09T10:31:50.000Z',
      startedAt: '2026-09-09T10:31:52.000Z',
      finishedAt: '2026-09-09T10:31:55.170Z',
      updatedAt: '2026-09-10T01:33:38.000Z',
    }));
    const view = render(<LcaTaskCenter />);
    fireEvent.click(screen.getByRole('button', { name: 'open-lca-task-center' }));
    expect(screen.getAllByText('Elapsed 3.17 s')).toHaveLength(2);
    const names = () =>
      screen.getAllByText(/Import package: [ab]\.zip/).map((el) => el.textContent);
    expect(names()).toEqual(['Import package: a.zip', 'Import package: b.zip']);
    mockPackageTasks = mockPackageTasks
      .map((task) => ({ ...task, updatedAt: '2026-09-11T01:33:38.000Z' }))
      .reverse();
    act(() => mockSubscribeTidasPackageTasks.mock.calls[0][0]());
    view.rerender(<LcaTaskCenter />);
    expect(screen.getAllByText('Elapsed 3.17 s')).toHaveLength(2);
    expect(names()).toEqual(['Import package: a.zip', 'Import package: b.zip']);
  });

  it('shows the empty state when there are no tracked tasks', () => {
    render(<LcaTaskCenter />);

    expect(screen.getByTestId('badge-count')).toHaveTextContent('0');

    fireEvent.click(screen.getByRole('button', { name: 'open-lca-task-center' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Task Center')).toBeInTheDocument();
    expect(screen.getByTestId('empty')).toHaveTextContent('No tasks');

    fireEvent.click(screen.getByRole('button', { name: 'Clear finished' }));
    expect(mockClearFinishedLcaTasks).toHaveBeenCalledTimes(1);
    expect(mockClearFinishedTidasPackageTasks).toHaveBeenCalledTimes(1);
    expect(mockSubscribeLcaTasks).toHaveBeenCalled();
    expect(mockSubscribeTidasPackageTasks).toHaveBeenCalled();
    expect(mockSubscribeLcaTaskCenterOpenRequests).toHaveBeenCalled();
  });

  it('renders running and completed tasks, task details, and diagnostics', () => {
    const circularRequest: Record<string, unknown> = {};
    circularRequest.self = circularRequest;
    mockTasks = [
      {
        id: 'task-running',
        sequence: 1,
        mode: 'single',
        scope: 'data_product',
        state: 'running',
        phase: 'solving',
        message: 'running message',
        createdAt: '2026-03-12T12:00:00.000Z',
        updatedAt: '2026-03-12T12:01:00.000Z',
        workerJobId: 'worker-lca-1',
        rootJobId: 'root-lca-1',
        jobKind: 'lca.solve',
        solveJobId: 'solve-1',
        request: circularRequest,
        error: 'Solve failed once',
        phaseTimeline: [
          {
            phase: 'submitting',
            startedAt: '2026-03-12T12:00:00.000Z',
            endedAt: '2026-03-12T12:00:05.000Z',
          },
          {
            phase: 'solving',
            startedAt: '2026-03-12T12:00:05.000Z',
          },
        ],
      },
      {
        id: 'task-completed',
        sequence: 2,
        mode: 'all_unit',
        scope: 'full_library',
        state: 'completed',
        phase: 'completed',
        message: 'cache hit for recent result',
        createdAt: '2026-03-12T11:00:00.000Z',
        updatedAt: '2026-03-12T11:00:10.000Z',
        buildJobId: 'build-2',
        solveJobId: 'solve-2',
        snapshotId: 'snapshot-2',
        resultId: 'result-2',
        phaseTimeline: [
          {
            phase: 'submitting',
            startedAt: '2026-03-12T11:00:00.000Z',
            endedAt: '2026-03-12T11:00:01.000Z',
          },
          {
            phase: 'building_snapshot',
            startedAt: '2026-03-12T11:00:01.000Z',
            endedAt: '2026-03-12T11:00:04.000Z',
          },
          {
            phase: 'solving',
            startedAt: '2026-03-12T11:00:04.000Z',
            endedAt: '2026-03-12T11:00:10.000Z',
          },
        ],
      },
    ];

    render(<LcaTaskCenter />);

    expect(screen.getByTestId('badge-count')).toHaveTextContent('1');

    fireEvent.click(screen.getByRole('button', { name: 'open-lca-task-center' }));

    expect(screen.queryByText('#1')).not.toBeInTheDocument();
    expect(screen.queryByText('#2')).not.toBeInTheDocument();
    expect(screen.getAllByText('LCA Calculation').length).toBeGreaterThan(0);
    expect(screen.getByText('Solving')).toBeInTheDocument();
    expect(screen.getAllByText('Completed').length).toBeGreaterThan(0);
    expect(screen.getAllByText('65%').length).toBeGreaterThan(0);
    expect(screen.getAllByText('100%').length).toBeGreaterThan(0);
    expect(screen.queryByText('Solving LCA result')).not.toBeInTheDocument();
    expect(screen.queryByText('Cache hit; result is ready')).not.toBeInTheDocument();
    expect(screen.queryByText('solve-1')).not.toBeInTheDocument();
    expect(screen.queryByText('result-2')).not.toBeInTheDocument();
    expect(screen.queryByText('Solve failed once')).not.toBeInTheDocument();

    const viewButtons = screen.getAllByRole('button', { name: 'View' });
    fireEvent.click(viewButtons[0]);
    expect(screen.getByText('Detail information')).toBeInTheDocument();
    expect(screen.getByText('Demand type')).toBeInTheDocument();
    expect(screen.getByText('Single-Process Calculation')).toBeInTheDocument();
    expect(screen.getByText('Data scope')).toBeInTheDocument();
    expect(screen.getByText('data_product')).toBeInTheDocument();
    expect(screen.queryByText('Solving LCA result')).not.toBeInTheDocument();
    fireEvent.click(viewButtons[1]);
    expect(screen.queryByText('Cache hit; result is ready')).not.toBeInTheDocument();
    expect(screen.queryByText('The calculation result is ready.')).not.toBeInTheDocument();
    expect(screen.getAllByText('Execution stages').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Submit task').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Solve').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Organize result').length).toBeGreaterThan(0);
    expect(screen.getByText('Build snapshot')).toBeInTheDocument();
    expect(screen.getByText('Took 3.00 s')).toBeInTheDocument();

    screen.getAllByRole('button', { name: 'Diagnostics' }).forEach((button) => {
      fireEvent.click(button);
    });
    expect(screen.getAllByText('Build job ID').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Task ID').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sequence').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Worker job ID').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Root job ID').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Worker job kind').length).toBeGreaterThan(0);
    expect(screen.getByText('worker-lca-1')).toBeInTheDocument();
    expect(screen.getAllByText('Calculation job ID').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Snapshot ID').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Result ID').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Request').length).toBeGreaterThan(0);
    expect(screen.getByText('[object Object]')).toBeInTheDocument();
    expect(screen.queryByText('Solve failed once')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear finished' }));
    expect(mockClearFinishedLcaTasks).toHaveBeenCalledTimes(1);
    expect(mockClearFinishedTidasPackageTasks).toHaveBeenCalledTimes(1);
  });

  it('renders failed, building, and submitting summaries with their status labels', () => {
    const nowSpy = jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-03-12T12:10:00.000Z').valueOf());
    mockTasks = [
      {
        id: 'task-build',
        sequence: 3,
        mode: 'single',
        scope: 'data_product',
        state: 'running',
        phase: 'building_snapshot',
        message: 'build message',
        createdAt: '2026-03-12T12:09:59.500Z',
        updatedAt: '2026-03-12T12:10:00.000Z',
        buildJobId: 'build-3',
        phaseTimeline: [
          {
            phase: 'building_snapshot',
            startedAt: '2026-03-12T12:09:59.500Z',
          },
        ],
      },
      {
        id: 'task-submit',
        sequence: 4,
        mode: 'single',
        scope: 'private',
        state: 'running',
        phase: 'submitting',
        message: 'submit message',
        createdAt: '2026-03-12T12:09:00.000Z',
        updatedAt: '2026-03-12T12:10:00.000Z',
        phaseTimeline: [
          {
            phase: 'submitting',
            startedAt: '2026-03-12T12:09:00.000Z',
          },
        ],
      },
      {
        id: 'task-failed',
        sequence: 5,
        mode: 'all_unit',
        scope: 'full_library',
        state: 'failed',
        phase: 'failed',
        message: 'failed message',
        error: 'Server failure',
        createdAt: '2026-03-12T12:00:00.000Z',
        updatedAt: '2026-03-12T12:01:00.000Z',
        phaseTimeline: [],
      },
    ];

    render(<LcaTaskCenter />);

    expect(screen.getByTestId('badge-count')).toHaveTextContent('2');
    fireEvent.click(screen.getByRole('button', { name: 'open-lca-task-center' }));

    expect(screen.getByText('Building snapshot')).toBeInTheDocument();
    expect(screen.getAllByText('Submitting').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Failed').length).toBeGreaterThan(0);
    expect(screen.queryByText('Building calculation snapshot')).not.toBeInTheDocument();
    expect(screen.queryByText('Submitting calculation')).not.toBeInTheDocument();
    expect(screen.queryByText('Calculation failed')).not.toBeInTheDocument();
    expect(screen.queryByText('build-3')).not.toBeInTheDocument();
    expect(screen.queryByText('Server failure')).not.toBeInTheDocument();

    const viewButtons = screen.getAllByRole('button', { name: 'View' });
    fireEvent.click(viewButtons[0]);
    expect(screen.getByText('Demand type')).toBeInTheDocument();
    expect(screen.getByText('Single-Process Calculation')).toBeInTheDocument();
    expect(screen.queryByText('Building calculation snapshot')).not.toBeInTheDocument();

    fireEvent.click(viewButtons[1]);
    expect(screen.queryByText('Submitting calculation')).not.toBeInTheDocument();
    fireEvent.click(viewButtons[2]);
    expect(screen.queryByText('Calculation failed')).not.toBeInTheDocument();
    expect(screen.getByText('Server failure')).toBeInTheDocument();
    nowSpy.mockRestore();
  });

  it('shows completed tasks without result ids and falls back to raw invalid timestamps', () => {
    mockTasks = [
      {
        id: 'task-no-result',
        sequence: 6,
        mode: 'single',
        scope: 'demo',
        state: 'completed',
        phase: 'completed',
        message: 'completed without result',
        createdAt: 'not-a-date',
        updatedAt: 'still-not-a-date',
        phaseTimeline: [],
      },
    ];

    render(<LcaTaskCenter />);
    fireEvent.click(screen.getByRole('button', { name: 'open-lca-task-center' }));

    expect(screen.getAllByText('Completed').length).toBeGreaterThan(0);
    expect(screen.queryByText('Calculation completed')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(screen.queryByText('Calculation completed')).not.toBeInTheDocument();
    expect(screen.getByText('The task completed without a returned result.')).toBeInTheDocument();
    expect(screen.queryByText('0 ms')).not.toBeInTheDocument();
    expect(
      screen.queryByText((_, element) => element?.textContent === 'Created not-a-date'),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByText((_, element) => element?.textContent === 'Updated still-not-a-date')
        .length,
    ).toBeGreaterThan(0);
  });

  it('refreshes worker-backed task families on mount, timer, open request, and manual refresh failures', async () => {
    jest.useFakeTimers();
    let openRequestListener: (() => void) | undefined;
    mockSubscribeLcaTaskCenterOpenRequests.mockImplementation((listener: () => void) => {
      openRequestListener = listener;
      return jest.fn();
    });
    mockRefreshDataProductTasks.mockRejectedValue({});

    render(<LcaTaskCenter />);

    await waitFor(() => expect(mockRefreshDataProductTasks).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockRefreshLcaTasksFromWorkerJobs).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(mockRefreshTidasPackageTasksFromWorkerJobs).toHaveBeenCalledTimes(1),
    );

    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    await waitFor(() => expect(mockRefreshDataProductTasks).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockRefreshLcaTasksFromWorkerJobs).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(mockRefreshTidasPackageTasksFromWorkerJobs).toHaveBeenCalledTimes(2),
    );

    act(() => {
      openRequestListener?.();
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await waitFor(() => expect(mockRefreshDataProductTasks).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(mockRefreshLcaTasksFromWorkerJobs).toHaveBeenCalledTimes(3));
    await waitFor(() =>
      expect(mockRefreshTidasPackageTasksFromWorkerJobs).toHaveBeenCalledTimes(3),
    );

    fireEvent.click(screen.getByRole('button', { name: 'open-lca-task-center' }));
    await waitFor(() => expect(mockRefreshDataProductTasks).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(mockRefreshLcaTasksFromWorkerJobs).toHaveBeenCalledTimes(4));
    await waitFor(() =>
      expect(mockRefreshTidasPackageTasksFromWorkerJobs).toHaveBeenCalledTimes(4),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(message.error).toHaveBeenCalledWith('Failed to refresh tasks'));

    mockRefreshDataProductTasks.mockRejectedValueOnce(new Error('refresh failed'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(message.error).toHaveBeenCalledWith('refresh failed'));

    jest.useRealTimers();
  });

  it('covers modal close and task-summary fallbacks for sparse or inconsistent task metadata', () => {
    mockTasks = [
      {
        id: 'task-running-completed',
        sequence: 7,
        mode: 'single',
        scope: 'data_product',
        state: 'running',
        phase: 'completed',
        message: 'running with completed phase',
        createdAt: '2026-03-12T12:00:00.000Z',
        updatedAt: '2026-03-12T12:00:01.000Z',
        phaseTimeline: [],
      },
      {
        id: 'task-build-no-id',
        sequence: 8,
        mode: 'single',
        scope: 'data_product',
        state: 'running',
        phase: 'building_snapshot',
        message: 'build without id',
        createdAt: '2026-03-12T12:00:00.000Z',
        updatedAt: '2026-03-12T12:00:01.000Z',
        phaseTimeline: [{ phase: 'building_snapshot', startedAt: '2026-03-12T12:00:00.000Z' }],
      },
      {
        id: 'task-running-failed-phase',
        sequence: 8.5,
        mode: 'single',
        scope: 'data_product',
        state: 'running',
        phase: 'failed',
        message: 'failed phase while still running',
        createdAt: '2026-03-12T12:00:00.000Z',
        updatedAt: '2026-03-12T12:00:01.000Z',
        phaseTimeline: [],
      },
      {
        id: 'task-solve-no-id',
        sequence: 9,
        mode: 'single',
        scope: 'data_product',
        state: 'running',
        phase: 'solving',
        message: 'solve without id',
        createdAt: '2026-03-12T12:00:00.000Z',
        updatedAt: '2026-03-12T12:00:01.000Z',
        phaseTimeline: [{ phase: 'solving', startedAt: '2026-03-12T12:00:00.000Z' }],
      },
      {
        id: 'task-completed-result',
        sequence: 10,
        mode: 'single',
        scope: 'data_product',
        state: 'completed',
        phase: 'completed',
        message: 'completed normally',
        resultId: 'result-10',
        createdAt: '2026-03-12T12:00:00.000Z',
        updatedAt: 'invalid-updated-at',
        phaseTimeline: [{ phase: 'solving', startedAt: 'invalid-start' }],
      },
    ];

    render(<LcaTaskCenter />);
    fireEvent.click(screen.getByRole('button', { name: 'open-lca-task-center' }));

    expect(screen.getByText('Building snapshot')).toBeInTheDocument();
    expect(screen.getByText('Solving')).toBeInTheDocument();
    expect(screen.queryByText('Building calculation snapshot')).not.toBeInTheDocument();
    expect(screen.queryByText('Solving LCA result')).not.toBeInTheDocument();
    expect(screen.queryByText('Calculation completed; result is ready')).not.toBeInTheDocument();
    screen.getAllByRole('button', { name: 'View' }).forEach((button) => {
      fireEvent.click(button);
    });
    expect(screen.queryByText('Building calculation snapshot')).not.toBeInTheDocument();
    expect(screen.queryByText('Solving LCA result')).not.toBeInTheDocument();
    expect(screen.queryByText('Calculation completed; result is ready')).not.toBeInTheDocument();
    expect(screen.getAllByText('Detail information').length).toBeGreaterThan(0);
    expect(screen.queryByText('result-10')).not.toBeInTheDocument();
    expect(screen.getAllByText('Completed').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('filters task tabs, collapses inline details, and handles sparse diagnostics and progress', () => {
    mockTasks = [
      {
        id: '',
        mode: 'single',
        scope: 'full_library',
        state: 'completed',
        phase: 'completed',
        workerJobId: '   ',
        createdAt: '2026-03-12T12:00:00.000Z',
        updatedAt: '2026-03-12T12:05:00.000Z',
        phaseTimeline: [],
      },
      {
        id: 'lca-building-filter',
        mode: 'all_unit',
        scope: 'full_library',
        state: 'running',
        phase: 'building_snapshot',
        createdAt: '2026-03-12T12:00:00.000Z',
        updatedAt: '2026-03-12T12:04:00.000Z',
        phaseTimeline: [
          {
            phase: 'building_snapshot',
            startedAt: '2026-03-12T12:01:00.000Z',
            endedAt: '2026-03-12T12:02:00.000Z',
          },
          {
            phase: 'building_snapshot',
            startedAt: '2026-03-12T12:00:30.000Z',
            endedAt: '2026-03-12T12:03:00.000Z',
          },
        ],
      },
    ];
    mockPackageTasks = [
      {
        id: 'pkg-export-combined-scope',
        kind: 'tidas_package_export',
        state: 'completed',
        phase: 'completed',
        createdAt: '2026-03-12T12:00:00.000Z',
        updatedAt: '2026-03-12T12:03:00.000Z',
        scope: 'current_user_and_open_data',
        rootCount: 0,
      },
      {
        id: 'pkg-import-filter',
        kind: 'tidas_package_import',
        importOutcome: 'partial',
        state: 'running',
        phase: 'queued',
        filename: 'package.zip',
        createdAt: '2026-03-12T12:00:00.000Z',
        updatedAt: '2026-03-12T12:02:00.000Z',
        rootCount: 0,
      },
    ];
    render(<LcaTaskCenter />);
    fireEvent.click(screen.getByRole('button', { name: 'open-lca-task-center' }));

    expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('tab', { name: 'LCA Calculation' }));
    expect(screen.queryByText('Import TIDAS package')).not.toBeInTheDocument();

    const lcaViewButton = screen.getAllByRole('button', { name: 'View' })[0];
    fireEvent.click(lcaViewButton);
    expect(screen.getByText('Detail information')).toBeInTheDocument();
    fireEvent.click(lcaViewButton);
    expect(screen.queryByText('Detail information')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Diagnostics' })[0]);
    expect(screen.getByText('No diagnostics available')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'View' })[1]);
    expect(screen.getByText('Build snapshot')).toBeInTheDocument();

    act(() => {
      mockTasks = [];
      mockSubscribeLcaTasks.mock.calls[0][0]();
    });
    expect(screen.queryByText('Build snapshot')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'TIDAS Export' }));
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(screen.getByText('Current user data + open data')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'TIDAS Import' }));
    expect(screen.getByText('Import package: package.zip')).toBeInTheDocument();
  });

  it('renders package tasks, supports download actions, and handles download errors', async () => {
    mockTasks = [
      {
        id: 'lca-task-running',
        sequence: 1,
        mode: 'single',
        scope: 'data_product',
        state: 'running',
        phase: 'submitting',
        message: 'lca running',
        createdAt: '2026-03-12T12:00:00.000Z',
        updatedAt: '2026-03-12T12:00:01.000Z',
        phaseTimeline: [],
      },
    ];
    mockPackageTasks = [
      {
        id: 'pkg-completed',
        sequence: 2,
        kind: 'tidas_package_export',
        state: 'completed',
        phase: 'completed',
        message: 'finished',
        createdAt: '2026-03-12T12:00:00.000Z',
        updatedAt: '2026-03-12T12:00:04.000Z',
        workerJobId: 'worker-package-1',
        jobKind: 'tidas.export',
        filename: 'custom.zip',
        jobId: 'job-1',
        scope: 'current_user',
        rootCount: 1,
        request: {
          roots: [{ table: 'processes', id: 'p-1', version: '01.00.000' }],
        },
      },
      {
        id: 'pkg-completed-default-name',
        sequence: 2.1,
        kind: 'tidas_package_export',
        state: 'completed',
        phase: 'completed',
        message: 'finished without filename',
        createdAt: '2026-03-12T12:00:00.000Z',
        updatedAt: '2026-03-12T12:00:04.500Z',
        scope: 'open_data',
        rootCount: 0,
      },
      {
        id: 'pkg-running-queued',
        sequence: 3,
        kind: 'tidas_package_export',
        state: 'running',
        phase: 'queued',
        message: 'queueing',
        createdAt: '2026-03-12T12:00:00.000Z',
        updatedAt: '2026-03-12T12:00:03.000Z',
        rootCount: 2,
        request: {
          roots: [
            { table: 'flows', id: 'f-1', version: '01.00.000' },
            { table: 'flows', id: 'f-2', version: '01.00.000' },
          ],
        },
      },
      {
        id: 'pkg-running-collect',
        sequence: 4,
        kind: 'tidas_package_export',
        state: 'running',
        phase: 'collect_refs',
        message: 'collecting refs',
        createdAt: '2026-03-12T12:00:00.000Z',
        updatedAt: '2026-03-12T12:00:02.000Z',
        rootCount: 0,
      },
      {
        id: 'pkg-running-submit',
        sequence: 4.5,
        kind: 'tidas_package_export',
        state: 'running',
        phase: 'submitting',
        message: 'submitting package',
        createdAt: '2026-03-12T12:00:00.000Z',
        updatedAt: '2026-03-12T12:00:02.500Z',
        rootCount: 0,
      },
      {
        id: 'pkg-running-finalize',
        sequence: 5,
        kind: 'tidas_package_export',
        state: 'running',
        phase: 'finalize_zip',
        message: 'finalizing',
        createdAt: '2026-03-12T12:00:00.000Z',
        updatedAt: '2026-03-12T12:00:01.000Z',
        rootCount: 0,
      },
      {
        id: 'pkg-running-completed-phase',
        sequence: 5.5,
        kind: 'tidas_package_export',
        state: 'running',
        phase: 'completed',
        message: 'completed phase while running',
        createdAt: '2026-03-12T12:00:00.000Z',
        updatedAt: '2026-03-12T12:00:05.500Z',
        rootCount: 0,
      },
      {
        id: 'pkg-running-failed-phase',
        sequence: 5.6,
        kind: 'tidas_package_export',
        state: 'running',
        phase: 'failed',
        message: 'failed phase while running',
        createdAt: '2026-03-12T12:00:00.000Z',
        updatedAt: '2026-03-12T12:00:05.600Z',
        rootCount: 0,
      },
      {
        id: 'pkg-import-running',
        sequence: 5.7,
        kind: 'tidas_package_import',
        importOutcome: 'success',
        state: 'running',
        phase: 'import_package',
        message: 'importing package data',
        createdAt: '2026-03-12T12:00:00.000Z',
        updatedAt: '2026-03-12T12:00:05.700Z',
        workerJobId: 'worker-package-import-running',
        jobId: 'import-job-1',
        rootCount: 0,
      },
      {
        id: 'pkg-import-completed',
        sequence: 5.8,
        kind: 'tidas_package_import',
        state: 'completed',
        phase: 'completed',
        message: 'import completed',
        createdAt: '2026-03-12T12:00:00.000Z',
        updatedAt: '2026-03-12T12:00:05.800Z',
        workerJobId: 'worker-package-import-completed',
        jobId: 'import-job-2',
        rootCount: 0,
      },
      {
        id: 'pkg-import-failed',
        sequence: 5.9,
        kind: 'tidas_package_import',
        state: 'failed',
        phase: 'failed',
        message: 'import failed',
        createdAt: '2026-03-12T12:00:00.000Z',
        updatedAt: '2026-03-12T12:00:05.900Z',
        workerJobId: 'worker-package-import-failed',
        jobId: 'import-job-3',
        error: 'import validation failed',
        rootCount: 0,
      },
      {
        id: 'pkg-failed',
        sequence: 6,
        kind: 'tidas_package_export',
        state: 'failed',
        phase: 'failed',
        message: 'backend failed',
        createdAt: '2026-03-12T12:00:00.000Z',
        updatedAt: '2026-03-12T12:00:05.000Z',
        error: 'package failed',
        rootCount: 0,
      },
      {
        id: 'pkg-failed-too-large',
        sequence: 6.1,
        kind: 'tidas_package_export',
        state: 'failed',
        phase: 'failed',
        message: 'backend failed',
        createdAt: '2026-03-12T12:00:00.000Z',
        updatedAt: '2026-03-12T12:00:05.100Z',
        error:
          'object upload failed status=413 Payload Too Large body=<?xml version="1.0"?><Error><Code>EntityTooLarge</Code><Message>The object exceeded the maximum allowed size</Message></Error>',
        rootCount: 0,
      },
    ];
    mockDownloadTidasPackageExportTask
      .mockResolvedValueOnce({ filename: 'downloaded.zip' })
      .mockRejectedValueOnce({})
      .mockRejectedValueOnce(new Error('download broken'));

    render(<LcaTaskCenter />);
    fireEvent.click(screen.getByRole('button', { name: 'open-lca-task-center' }));

    expect(screen.getByTestId('badge-count')).toHaveTextContent('8');
    expect(screen.getAllByText('TIDAS Export').length).toBeGreaterThan(0);
    expect(screen.getAllByText('TIDAS Import').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Queued').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Submitting').length).toBeGreaterThan(0);
    expect(screen.getByText('Collecting related data')).toBeInTheDocument();
    expect(screen.getAllByText('Importing data').length).toBeGreaterThan(0);
    expect(screen.getByText('Building ZIP')).toBeInTheDocument();
    expect(screen.getAllByText('Completed').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Failed').length).toBeGreaterThan(0);
    expect(screen.queryByText('Export package failed')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Export package exceeded the storage upload limit'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Export package ready (custom.zip)')).not.toBeInTheDocument();
    expect(screen.queryByText('Export package ready (tidas-package.zip)')).not.toBeInTheDocument();
    expect(screen.queryByText('Import package completed')).not.toBeInTheDocument();
    expect(screen.queryByText('Import package failed')).not.toBeInTheDocument();
    expect(screen.queryByText('queueing')).not.toBeInTheDocument();
    expect(screen.queryByText('importing package data')).not.toBeInTheDocument();
    expect(screen.queryByText('import validation failed')).not.toBeInTheDocument();
    expect(screen.queryByText('package failed')).not.toBeInTheDocument();

    screen.getAllByRole('button', { name: 'View' }).forEach((button) => {
      fireEvent.click(button);
    });
    expect(screen.queryByText('Export package failed')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Export package exceeded the storage upload limit'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Export package ready (custom.zip)')).not.toBeInTheDocument();
    expect(screen.queryByText('Export package ready (tidas-package.zip)')).not.toBeInTheDocument();
    expect(screen.queryByText('Import package completed')).not.toBeInTheDocument();
    expect(screen.queryByText('Import package failed')).not.toBeInTheDocument();
    expect(screen.queryByText('queueing')).not.toBeInTheDocument();
    expect(screen.queryByText('importing package data')).not.toBeInTheDocument();
    expect(screen.getAllByText('File name').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Root records').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Execution stages').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Prepare upload').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Validate package').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Import data').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Build report').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Collect related data').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Build ZIP').length).toBeGreaterThan(0);
    expect(screen.queryByText('import validation failed')).not.toBeInTheDocument();
    expect(screen.getByText('package failed')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Export package is too large for the current storage upload limit. Try exporting a smaller scope, or ask an administrator to enable large-file upload support.',
      ),
    ).toBeInTheDocument();

    const diagnosticsButtons = screen.getAllByRole('button', { name: 'Diagnostics' });
    diagnosticsButtons.forEach((button) => {
      fireEvent.click(button);
    });
    expect(
      screen.queryByText((_, element) => element?.textContent?.includes('root_count') ?? false),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('filename')).not.toBeInTheDocument();
    expect(screen.getAllByText('Job ID').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Task kind').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Worker job kind').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Request').length).toBeGreaterThan(0);
    expect(screen.getByText('job-1')).toBeInTheDocument();
    expect(screen.getAllByText('Worker job ID').length).toBeGreaterThan(0);
    expect(screen.getByText('worker-package-1')).toBeInTheDocument();
    expect(
      screen.getAllByText((_, element) => element?.textContent?.includes('"id": "p-1"') ?? false)
        .length,
    ).toBeGreaterThan(0);

    const downloadButtons = screen.getAllByRole('button', { name: 'Download' });
    expect(downloadButtons).toHaveLength(2);
    fireEvent.click(downloadButtons[0]);
    await waitFor(() => {
      expect(mockDownloadTidasPackageExportTask).toHaveBeenNthCalledWith(1, 'pkg-completed');
    });
    await waitFor(() => {
      expect(message.success).toHaveBeenCalledWith('Downloaded downloaded.zip');
    });

    fireEvent.click(downloadButtons[1]);
    await waitFor(() => {
      expect(mockDownloadTidasPackageExportTask).toHaveBeenNthCalledWith(
        2,
        'pkg-completed-default-name',
      );
    });
    await waitFor(() => {
      expect(message.error).toHaveBeenCalledWith('Failed to download TIDAS package');
    });

    fireEvent.click(downloadButtons[0]);
    await waitFor(() => {
      expect(mockDownloadTidasPackageExportTask).toHaveBeenNthCalledWith(3, 'pkg-completed');
    });
    await waitFor(() => {
      expect(message.error).toHaveBeenCalledWith('download broken');
    });
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
  });

  it('renders and filters every safe data-product task state and deep-link shape', () => {
    const base = {
      schemaVersion: 'task-summary.v2',
      category: 'data_product',
      workerStatus: 'running',
      domainValidity: 'none',
      projectionUpdatedAt: '2026-07-22T00:00:00Z',
      progressFraction: 0.25,
      capabilities: {
        canCancel: false,
        canDownloadReport: false,
        canOpenWorkbench: true,
        canPreviewResult: false,
      },
      createdAt: '2026-07-22T00:00:00Z',
      updatedAt: '2026-07-22T00:00:00Z',
    };
    mockDataProductTasks = [
      {
        ...base,
        jobId: 'closure-job',
        id: 'closure-job',
        jobKind: 'lcia.scope_closure_check',
        title: 'Closure passed',
        resultSetId: '77777777-7777-4777-8777-777777777777',
        resultSetName: 'August result set',
        workerStatus: 'completed',
        runState: 'succeeded',
        domainValidity: 'valid',
        phase: 'complete',
        progressLabel: 'All rows scanned',
        deepLink: {
          routeKey: 'data_product.closure_check',
          params: { closureCheckId: 'closure-1' },
        },
      },
      {
        ...base,
        jobId: 'package-job',
        id: 'package-job',
        jobKind: 'lcia_result.package_build',
        title: 'Package blocked',
        workerStatus: 'blocked',
        runState: 'blocked',
        deepLink: {
          routeKey: 'data_product.package',
          params: { packageId: 'package-1' },
        },
        updatedAt: '2026-07-22T00:01:00Z',
      },
      {
        ...base,
        jobId: 'failed-job',
        id: 'failed-job',
        jobKind: 'lcia_result.package_build',
        title: 'Package failed',
        workerStatus: 'failed',
        runState: 'failed',
        errorSummary: 'Result package materialization failed.',
        updatedAt: '2026-07-22T00:02:00Z',
      },
      {
        ...base,
        jobId: 'cancelled-job',
        id: 'cancelled-job',
        jobKind: 'lcia_result.package_build',
        title: 'Package cancelled',
        workerStatus: 'cancelled',
        runState: 'cancelled',
        updatedAt: '2026-07-22T00:03:00Z',
      },
      {
        ...base,
        jobId: 'active-job',
        id: 'active-job',
        jobKind: 'lcia_result.package_build',
        title: 'Package running',
        runState: 'active',
        updatedAt: '2026-07-22T00:04:00Z',
      },
    ];

    render(<LcaTaskCenter />);
    expect(screen.getByTestId('badge-count')).toHaveTextContent('1');
    fireEvent.click(screen.getByRole('button', { name: 'open-lca-task-center' }));

    expect(screen.getByText('Closure passed')).toBeInTheDocument();
    expect(screen.getByText('Certificate: valid')).toBeInTheDocument();
    expect(screen.getByText('All rows scanned')).toBeInTheDocument();
    expect(screen.getByText('Worker job package-job')).toBeInTheDocument();
    expect(screen.getByText('Result package materialization failed.')).toBeInTheDocument();
    expect(screen.getAllByText('Queued')).toHaveLength(4);
    expect(screen.getAllByRole('progressbar')).toHaveLength(5);

    fireEvent.click(screen.getByRole('tab', { name: 'LCA Calculation' }));
    expect(screen.queryByText('Closure passed')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Data Product' }));
    expect(screen.getByText('Package running')).toBeInTheDocument();
  });

  it('expands closure details in place and keeps them open across feed refreshes', () => {
    const closureTask = {
      schemaVersion: 'task-summary.v2',
      category: 'data_product',
      jobId: 'closure-job',
      id: 'closure-job',
      jobKind: 'lcia.scope_closure_check',
      title: 'Recoverable closure check',
      workerStatus: 'running',
      runState: 'active',
      domainValidity: 'pending',
      projectionUpdatedAt: '2026-07-22T00:00:00Z',
      progressFraction: 0.25,
      capabilities: {
        canCancel: false,
        canDownloadReport: true,
        canOpenWorkbench: true,
        canPreviewResult: false,
      },
      deepLink: {
        routeKey: 'data_product.closure_check',
        params: { closureCheckId: 'closure-1' },
      },
      createdAt: '2026-07-22T00:00:00Z',
      updatedAt: '2026-07-22T00:00:00Z',
    };
    mockDataProductTasks = [closureTask];

    const { rerender } = render(<LcaTaskCenter />);
    fireEvent.click(screen.getByRole('button', { name: 'open-lca-task-center' }));

    expect(screen.queryByRole('button', { name: 'Open' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-closure-detail-closure-1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(screen.getByTestId('mock-closure-detail-closure-1')).toHaveTextContent(
      'true:running:2026-07-22T00:00:00Z',
    );

    mockDataProductTasks = [
      {
        ...closureTask,
        workerStatus: 'completed',
        runState: 'succeeded',
        updatedAt: '2026-07-22T00:01:00Z',
      },
    ];
    rerender(<LcaTaskCenter />);

    expect(screen.getByTestId('mock-closure-detail-closure-1')).toHaveTextContent(
      'true:completed:2026-07-22T00:01:00Z',
    );

    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(screen.queryByTestId('mock-closure-detail-closure-1')).not.toBeInTheDocument();
  });

  it('fails closed in place when a closure task has no safe closure id', () => {
    mockDataProductTasks = [
      {
        schemaVersion: 'task-summary.v2',
        category: 'data_product',
        jobId: 'closure-without-id',
        id: 'closure-without-id',
        jobKind: 'lcia.scope_closure_check',
        title: 'Closure without detail identity',
        workerStatus: 'completed',
        runState: 'succeeded',
        domainValidity: 'valid',
        projectionUpdatedAt: '2026-07-22T00:00:00Z',
        capabilities: {
          canCancel: false,
          canDownloadReport: false,
          canOpenWorkbench: true,
          canPreviewResult: false,
        },
        createdAt: '2026-07-22T00:00:00Z',
        updatedAt: '2026-07-22T00:00:00Z',
      },
    ];

    render(<LcaTaskCenter />);
    fireEvent.click(screen.getByRole('button', { name: 'open-lca-task-center' }));
    fireEvent.click(screen.getByRole('button', { name: 'View' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Task details are currently unavailable.');
    expect(screen.queryByText('Open')).not.toBeInTheDocument();
  });
});
