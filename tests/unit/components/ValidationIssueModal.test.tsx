import { showValidationIssueModal } from '@/components/ValidationIssueModal';
import { publishRuntimeIntlChange } from '@/services/general/runtimeLocale';
import { upsertValidationIssueNotification } from '@/services/notifications/api';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';

let mockZIndexPopupBase: number | undefined = 1000;
let mockZIndexPopupBaseSequence: Array<number | undefined> | null = null;
let latestTableDataSource: any[] = [];
const mockMessageSuccess = jest.fn();
const mockMessageError = jest.fn();

jest.mock('@/services/notifications/api', () => ({
  upsertValidationIssueNotification: jest.fn(),
}));

jest.mock('@/contexts/AntdAppContext', () => ({
  dispatchAntdAppAction: (action: (api: unknown) => void) =>
    action({
      message: {
        error: (...args: any[]) => mockMessageError(...args),
        success: (...args: any[]) => mockMessageSuccess(...args),
      },
    }),
}));

jest.mock('umi', () => ({
  __esModule: true,
  FormattedMessage: ({ defaultMessage, id }: { defaultMessage?: string; id: string }) => (
    <span>{defaultMessage ?? id}</span>
  ),
}));

jest.mock('antd', () => {
  const React = require('react');

  const Button = ({
    children,
    disabled,
    loading,
    onClick,
    style,
    type,
  }: {
    children?: React.ReactNode;
    disabled?: boolean;
    loading?: boolean;
    onClick?: () => void;
    style?: React.CSSProperties;
    type?: string;
  }) => (
    <button
      type='button'
      data-button-type={type}
      data-loading={loading ? 'true' : 'false'}
      disabled={disabled || loading}
      style={style}
      onClick={disabled || loading ? undefined : onClick}
    >
      {children}
    </button>
  );

  const ConfigProvider = ({ children }: { children?: React.ReactNode }) => <>{children}</>;

  const Modal = ({
    children,
    closable,
    closeIcon,
    footer,
    onCancel,
    open,
    title,
    zIndex,
  }: {
    children?: React.ReactNode;
    closable?: boolean;
    closeIcon?: React.ReactNode;
    footer?: React.ReactNode;
    onCancel?: () => void;
    open?: boolean;
    title?: React.ReactNode;
    zIndex?: number;
  }) => {
    if (!open) {
      return null;
    }

    return (
      <div role='dialog' data-z-index={zIndex}>
        <div>{title}</div>
        {closable ? (
          <button aria-label='close' type='button' onClick={onCancel}>
            {closeIcon}
          </button>
        ) : null}
        <div>{children}</div>
        <div>{footer}</div>
      </div>
    );
  };

  const Space = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;

  const Table = ({
    columns,
    dataSource,
    rowKey,
    scroll,
    sticky,
    tableLayout,
  }: {
    columns: Array<{
      title: React.ReactNode;
      key?: string;
      dataIndex?: string;
      onCell?: (record: any, rowIndex?: number) => React.TdHTMLAttributes<HTMLTableCellElement>;
      render?: (value: unknown, record: any, index: number) => React.ReactNode;
      width?: number | string;
    }>;
    dataSource: any[];
    rowKey?: ((record: any) => string) | string;
    scroll?: {
      x?: number | string;
      y?: number;
    };
    sticky?: boolean;
    tableLayout?: 'auto' | 'fixed';
  }) => {
    latestTableDataSource = dataSource;
    return (
      <table
        data-scroll-x={scroll?.x}
        data-scroll-y={scroll?.y}
        data-sticky={sticky ? 'true' : 'false'}
        data-table-layout={tableLayout}
      >
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key ?? String(column.dataIndex)}>{column.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataSource.map((record, rowIndex) => (
            <tr
              key={
                typeof rowKey === 'function'
                  ? rowKey(record)
                  : typeof rowKey === 'string'
                    ? String(record[rowKey] ?? rowIndex)
                    : rowIndex
              }
            >
              {columns.map((column) => {
                const value = column.dataIndex ? record[column.dataIndex] : undefined;
                const content = column.render?.(value, record, rowIndex) ?? value ?? null;
                const cellProps = column.onCell?.(record, rowIndex) ?? {};
                return (
                  <td {...cellProps} key={column.key ?? String(column.dataIndex)}>
                    {content}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return {
    __esModule: true,
    Button,
    ConfigProvider,
    Modal,
    Space,
    Table,
    theme: {
      useToken: () => ({
        token: {
          borderRadiusLG: 8,
          colorBorderSecondary: '#f0f0f0',
          colorPrimary: '#5C246A',
          colorText: '#1f1f1f',
          colorTextDisabled: '#bfbfbf',
          colorTextHeading: '#141414',
          colorTextSecondary: '#8c8c8c',
          get zIndexPopupBase() {
            if (mockZIndexPopupBaseSequence && mockZIndexPopupBaseSequence.length > 0) {
              return mockZIndexPopupBaseSequence.shift();
            }
            return mockZIndexPopupBase;
          },
          fontSizeHeading4: 20,
          fontSizeLG: 16,
          fontWeightStrong: 600,
          lineHeight: 1.5715,
          marginSM: 12,
        },
      }),
    },
  };
});

describe('ValidationIssueModal', () => {
  const mockUpsertValidationIssueNotification =
    upsertValidationIssueNotification as jest.MockedFunction<any>;
  const intl = {
    locale: 'zh-CN',
    formatMessage: (
      { id, defaultMessage }: { id: string; defaultMessage?: string },
      values?: Record<string, string | number | undefined>,
    ) => {
      const messages: Record<string, string> = {
        'pages.validationIssues.downloadHtml': '下载数据校验报告',
        'pages.validationIssues.datasetType.contact': '联系人',
        'pages.validationIssues.datasetType.source': '来源',
        'pages.validationIssues.datasetType.unitgroup': '单位组',
        'pages.validationIssues.datasetType.flowproperty': '流属性',
        'pages.validationIssues.datasetType.flow': '流',
        'pages.validationIssues.datasetType.process': '过程',
        'pages.validationIssues.datasetType.lifecyclemodel': '模型',
        'pages.validationIssues.table.issue': '问题',
        'pages.validationIssues.table.user': '数据拥有者',
        'pages.validationIssues.table.action': '操作',
        'pages.validationIssues.issue.nonExistentRef': '数据不存在',
        'pages.validationIssues.issue.ruleVerificationFailed': '数据校验不通过',
        'pages.validationIssues.issue.sdkInvalid': '当前数据集校验失败',
        'pages.validationIssues.tab.unknown': '未知数据分区（{tab}）',
        'pages.validationIssues.listSeparator': '，',
        'pages.validationIssues.issue.sdkInvalid.navigateHint':
          '对应 tab 下的问题数据会标红，请补充后重试。',
        'pages.validationIssues.issue.sdkInvalid.processInstanceFallback': '未知过程',
        'pages.validationIssues.issue.sdkInvalid.processInstanceIsolatedNodeHint':
          '请检测一下节点是否为孤立节点({nodeNames})',
        'pages.validationIssues.issue.sdkInvalid.processInstanceRequiredField':
          '过程 {processLabel}（缺少 {fieldName}）',
        'pages.validationIssues.issue.sdkInvalid.processInstanceField':
          '过程 {processLabel}（{fieldName}）',
        'pages.validationIssues.issue.sdkInvalid.processInstanceFieldWithFix':
          '过程 {processLabel}（{fieldName}：{suggestedFix}）',
        'pages.validationIssues.confirm': '知道了',
        'pages.process.view.processInformation': '过程信息',
        'pages.process.view.modellingAndValidation': '建模信息',
        'pages.process.view.administrativeInformation': '管理信息',
        'pages.process.view.exchanges': '输入/输出',
        'pages.flow.view.flowProperties': '流属性',
        'pages.lifeCycleModel.view.exchanges': '输入/输出',
        'pages.validationIssues.fixIssue': '修复问题',
        'pages.validationIssues.notifyDataOwner': '通知数据拥有者',
        'pages.validationIssues.dataOwnerNotified': '已通知',
        'pages.validationIssues.notifyDataOwner.ownerMissing': '无法识别数据拥有者。',
        'pages.validationIssues.notifyDataOwner.success': '已通知数据拥有者。',
        'pages.validationIssues.notifyDataOwner.error': '通知数据拥有者失败。',
      };

      const template = messages[id] ?? defaultMessage ?? id;
      if (!values) {
        return template;
      }

      return Object.entries(values).reduce((messageText, [key, value]) => {
        return messageText.split(`{${key}}`).join(String(value ?? ''));
      }, template);
    },
  };

  it('reformats a custom title descriptor when the registry-backed runtime intl changes', async () => {
    const buildIntl = (locale: string, title: string, issue: string) => ({
      locale,
      formatMessage: ({ id, defaultMessage }: { id: string; defaultMessage?: string }) =>
        ({
          'pages.validationIssues.modal.checkDataTitle': title,
          'pages.validationIssues.issue.ruleVerificationFailed': issue,
        })[id] ??
        defaultMessage ??
        id,
    });
    const initialIntl = buildIntl('zh-CN', '校验问题', '数据校验未通过');
    const germanIntl = buildIntl(
      'de-DE',
      'Validierungsprobleme',
      'Datensatzprüfung fehlgeschlagen',
    );
    let modalHandle: { destroy: () => void } | null = null;

    await act(async () => {
      modalHandle = showValidationIssueModal({
        intl: initialIntl,
        issues: [
          {
            code: 'ruleVerificationFailed',
            link: 'http://localhost:8000/mydata/processes?id=process-1&version=01.00.000',
            ref: {
              '@refObjectId': 'process-1',
              '@type': 'process data set',
              '@version': '01.00.000',
            },
          },
        ],
        title: {
          id: 'pages.validationIssues.modal.checkDataTitle',
          defaultMessage: 'Data validation issues',
        },
      }) as { destroy: () => void };
    });
    expect(screen.getByText('校验问题')).toBeInTheDocument();
    expect(screen.getByText('数据校验未通过')).toBeInTheDocument();

    await act(async () => {
      publishRuntimeIntlChange(germanIntl);
    });
    await waitFor(() => {
      expect(screen.getByText('Validierungsprobleme')).toBeInTheDocument();
      expect(screen.getByText('Datensatzprüfung fehlgeschlagen')).toBeInTheDocument();
    });

    await act(async () => {
      modalHandle?.destroy();
    });
  });

  it('recomputes a custom title factory with the active runtime intl', async () => {
    const buildIntl = (locale: string, title: string) => ({
      locale,
      formatMessage: ({ id, defaultMessage }: { id: string; defaultMessage?: string }) =>
        id === 'custom.validation.title' ? title : (defaultMessage ?? id),
    });
    const initialIntl = buildIntl('zh-CN', '自定义校验标题');
    const germanIntl = buildIntl('de-DE', 'Benutzerdefinierter Validierungstitel');
    let modalHandle: { destroy: () => void } | null = null;

    await act(async () => {
      modalHandle = showValidationIssueModal({
        intl: initialIntl,
        issues: [
          {
            code: 'ruleVerificationFailed',
            link: '',
            ref: {
              '@refObjectId': 'process-title-factory',
              '@type': 'process data set',
              '@version': '01.00.000',
            },
          },
        ],
        title: (activeIntl) =>
          activeIntl.formatMessage({
            id: 'custom.validation.title',
            defaultMessage: 'Custom validation title',
          }),
      }) as { destroy: () => void };
    });
    expect(screen.getByText('自定义校验标题')).toBeInTheDocument();

    await act(async () => {
      publishRuntimeIntlChange(germanIntl);
    });
    await waitFor(() => {
      expect(screen.getByText('Benutzerdefinierter Validierungstitel')).toBeInTheDocument();
    });

    await act(async () => {
      modalHandle?.destroy();
    });
  });

  beforeEach(() => {
    cleanup();
    document.body.innerHTML = '';
    mockZIndexPopupBase = 1000;
    mockZIndexPopupBaseSequence = null;
    latestTableDataSource = [];
    mockMessageSuccess.mockReset();
    mockMessageError.mockReset();
    mockUpsertValidationIssueNotification.mockReset();
    mockUpsertValidationIssueNotification.mockResolvedValue({ success: true, error: null });
    localStorage.setItem('isDarkMode', 'false');
    if (!URL.revokeObjectURL) {
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: () => {},
        writable: true,
      });
    }
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  it.each(['ruleVerificationFailed', 'sdkInvalid'] as const)(
    'opens the exact dataset link for %s without a local navigation target',
    async (code) => {
      const onNavigate = jest.fn();
      const windowOpenSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
      let modalHandle: { destroy: () => void } | null = null;

      await act(async () => {
        modalHandle = showValidationIssueModal({
          intl,
          onNavigate,
          issues: [
            {
              code,
              isOwnedByCurrentUser: true,
              link: 'http://localhost:8000/mydata/processes?id=process-1&version=01.00.000',
              ownerName: '流程拥有者',
              ref: {
                '@refObjectId': 'process-1',
                '@type': 'process data set',
                '@version': '01.00.000',
              },
            },
          ],
          title: '数据校验问题',
        }) as { destroy: () => void };
      });

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('数据校验问题')).toBeInTheDocument();
      expect(screen.getByText('数据拥有者')).toBeInTheDocument();
      expect(screen.getByText('流程拥有者')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'close' })).toBeInTheDocument();
      expect(screen.getByText('操作')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '知道了' })).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toHaveAttribute('data-z-index', '2000');

      const fixIssueButton = screen.getByRole('button', { name: '修复问题' });
      expect(fixIssueButton).toBeInTheDocument();

      fireEvent.click(fixIssueButton);

      expect(windowOpenSpy).toHaveBeenCalledWith(
        'http://localhost:8000/mydata/processes?id=process-1&version=01.00.000',
        '_blank',
        'noopener,noreferrer',
      );
      expect(onNavigate).not.toHaveBeenCalled();

      await act(async () => {
        modalHandle?.destroy();
      });
      windowOpenSpy.mockRestore();
    },
  );

  it.each([
    {
      name: 'metadata field',
      detail: {
        key: 'model-name',
        tabName: 'lifeCycleModelInformation',
        fieldLabel: 'Base name',
        fieldPath: 'lifeCycleModelInformation.dataSetInformation.name.baseName',
        formName: [
          'lifeCycleModelInformation',
          'dataSetInformation',
          'name',
          'baseName',
          0,
          '#text',
        ],
        reasonMessage: 'Required',
      },
    },
    {
      name: 'process instance',
      detail: {
        key: 'model-node',
        tabName: 'lifeCycleModelInformation',
        fieldLabel: 'Reference identifier',
        fieldPath: 'processInstance[#node-1].referenceToProcess.@refObjectId',
        processInstanceInternalId: 'node-1',
        presentation: 'highlight-only' as const,
        reasonMessage: 'Required',
      },
    },
    { name: 'tab without field detail', detail: undefined },
  ])('fixes the current model at its $name without opening another page', async ({ detail }) => {
    const onNavigate = jest.fn();
    const windowOpenSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
    try {
      await act(async () => {
        showValidationIssueModal({
          intl,
          onNavigate,
          issues: [
            {
              code: 'sdkInvalid',
              isOwnedByCurrentUser: true,
              link: 'http://localhost:8000/mydata/models?id=model-1&version=01.00.000&required=1',
              ref: {
                '@type': 'lifeCycleModel data set',
                '@refObjectId': 'model-1',
                '@version': '01.00.000',
              },
              sdkDetails: detail ? [detail] : [],
              tabNames: ['lifeCycleModelInformation'],
            },
          ],
        });
      });
      fireEvent.click(screen.getByRole('button', { name: '修复问题' }));
      expect(onNavigate).toHaveBeenCalledWith({ detail, tabName: 'lifeCycleModelInformation' });
      expect(windowOpenSpy).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    } finally {
      windowOpenSpy.mockRestore();
    }
  });

  it.each(['ruleVerificationFailed', 'sdkInvalid'] as const)(
    'notifies the other data owner for %s even when local navigation is available',
    async (code) => {
      const onNavigate = jest.fn();
      const windowOpenSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
      let modalHandle: { destroy: () => void } | null = null;

      await act(async () => {
        modalHandle = showValidationIssueModal({
          intl,
          onNavigate,
          issues: [
            {
              code,
              tabNames: ['processInformation'],
              isOwnedByCurrentUser: false,
              link: 'http://localhost:8000/mydata/processes?id=process-2&version=01.00.000',
              ownerName: '其他拥有者',
              ownerUserId: 'owner-user-2',
              ref: {
                '@refObjectId': 'process-2',
                '@type': 'process data set',
                '@version': '01.00.000',
              },
            },
          ],
          title: '数据校验问题',
        }) as { destroy: () => void };
      });

      const notifyButton = screen.getByRole('button', { name: '通知数据拥有者' });
      expect(notifyButton).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '修复问题' })).not.toBeInTheDocument();

      fireEvent.click(notifyButton);

      await waitFor(() => {
        expect(mockUpsertValidationIssueNotification).toHaveBeenCalledWith({
          recipientUserId: 'owner-user-2',
          ref: {
            '@refObjectId': 'process-2',
            '@type': 'process data set',
            '@version': '01.00.000',
          },
          link: 'http://localhost:8000/mydata/processes?id=process-2&version=01.00.000',
          issues: [
            {
              code,
              tabName: undefined,
              tabNames: ['processInformation'],
              underReviewVersion: undefined,
            },
          ],
        });
      });
      expect(mockMessageSuccess).toHaveBeenCalledWith('已通知数据拥有者。');
      expect(windowOpenSpy).not.toHaveBeenCalled();
      expect(await screen.findByRole('button', { name: '已通知' })).toBeDisabled();

      await act(async () => {
        modalHandle?.destroy();
      });
      expect(onNavigate).not.toHaveBeenCalled();
      windowOpenSpy.mockRestore();
    },
  );

  it('shows an error when notifying data owner without a resolved owner id', async () => {
    let modalHandle: { destroy: () => void } | null = null;

    await act(async () => {
      modalHandle = showValidationIssueModal({
        intl,
        issues: [
          {
            code: 'ruleVerificationFailed',
            isOwnedByCurrentUser: false,
            link: 'http://localhost:8000/mydata/processes?id=process-3&version=01.00.000',
            ownerName: '未知拥有者',
            ref: {
              '@refObjectId': 'process-3',
              '@type': 'process data set',
              '@version': '01.00.000',
            },
          },
        ],
        title: '数据校验问题',
      }) as { destroy: () => void };
    });

    fireEvent.click(screen.getByRole('button', { name: '通知数据拥有者' }));

    expect(mockMessageError).toHaveBeenCalledWith('无法识别数据拥有者。');
    expect(mockUpsertValidationIssueNotification).not.toHaveBeenCalled();

    await act(async () => {
      modalHandle?.destroy();
    });
  });

  it('shows an error when notifying data owner fails', async () => {
    mockUpsertValidationIssueNotification.mockResolvedValueOnce({
      success: false,
      error: new Error('notify failed'),
    });
    let modalHandle: { destroy: () => void } | null = null;

    await act(async () => {
      modalHandle = showValidationIssueModal({
        intl,
        issues: [
          {
            code: 'ruleVerificationFailed',
            isOwnedByCurrentUser: false,
            link: 'http://localhost:8000/mydata/processes?id=process-4&version=01.00.000',
            ownerName: '失败拥有者',
            ownerUserId: 'owner-user-4',
            ref: {
              '@refObjectId': 'process-4',
              '@type': 'process data set',
              '@version': '01.00.000',
            },
          },
        ],
        title: '数据校验问题',
      }) as { destroy: () => void };
    });

    fireEvent.click(screen.getByRole('button', { name: '通知数据拥有者' }));

    await waitFor(() => {
      expect(mockMessageError).toHaveBeenCalledWith('通知数据拥有者失败。');
    });
    expect(screen.getByRole('button', { name: '通知数据拥有者' })).toBeInTheDocument();

    await act(async () => {
      modalHandle?.destroy();
    });
  });

  it('falls back to a generic error when notifying data owner fails without an error payload', async () => {
    mockUpsertValidationIssueNotification.mockResolvedValueOnce({
      success: false,
      error: undefined,
    });
    let modalHandle: { destroy: () => void } | null = null;

    await act(async () => {
      modalHandle = showValidationIssueModal({
        intl,
        issues: [
          {
            code: 'ruleVerificationFailed',
            isOwnedByCurrentUser: false,
            link: 'http://localhost:8000/mydata/processes?id=process-4b&version=01.00.000',
            ownerName: '失败拥有者',
            ownerUserId: 'owner-user-4b',
            ref: {
              '@refObjectId': 'process-4b',
              '@type': 'process data set',
              '@version': '01.00.000',
            },
          },
        ],
        title: '数据校验问题',
      }) as { destroy: () => void };
    });

    fireEvent.click(screen.getByRole('button', { name: '通知数据拥有者' }));

    await waitFor(() => {
      expect(mockMessageError).toHaveBeenCalledWith('通知数据拥有者失败。');
    });
    expect(screen.getByRole('button', { name: '通知数据拥有者' })).toBeInTheDocument();

    await act(async () => {
      modalHandle?.destroy();
    });
  });

  it('renders non existent issues as dataset does not exist and disables the fix issue button', async () => {
    const windowOpenSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
    let modalHandle: { destroy: () => void } | null = null;

    await act(async () => {
      modalHandle = showValidationIssueModal({
        intl,
        issues: [
          {
            code: 'nonExistentRef',
            link: 'http://localhost:8000/mydata/processes?id=process-1&version=01.00.000',
            ref: {
              '@refObjectId': 'process-1',
              '@type': 'process data set',
              '@version': '01.00.000',
            },
          },
        ],
        title: '数据校验问题',
      }) as { destroy: () => void };
    });

    expect(screen.getByText('数据不存在')).toBeInTheDocument();

    const fixIssueButton = screen.getByRole('button', { name: '修复问题' });
    expect(fixIssueButton).toBeDisabled();

    fireEvent.click(fixIssueButton);
    expect(windowOpenSpy).not.toHaveBeenCalled();

    await act(async () => {
      modalHandle?.destroy();
    });
    windowOpenSpy.mockRestore();
  });

  it('merges issues with the same dataset into one row and lists all issue messages', async () => {
    let modalHandle: { destroy: () => void } | null = null;

    await act(async () => {
      modalHandle = showValidationIssueModal({
        intl,
        issues: [
          {
            code: 'ruleVerificationFailed',
            link: 'http://localhost:8000/mydata/processes?id=process-1&version=01.00.000',
            ref: {
              '@refObjectId': 'process-1',
              '@type': 'process data set',
              '@version': '01.00.000',
            },
          },
          {
            code: 'sdkInvalid',
            link: 'http://localhost:8000/mydata/processes?id=process-1&version=01.00.000',
            ref: {
              '@refObjectId': 'process-1',
              '@type': 'process data set',
              '@version': '01.00.000',
            },
            tabNames: [
              'processInformation',
              'modellingAndValidation',
              'administrativeInformation',
              'exchanges',
            ],
          },
        ],
        title: '数据校验问题',
      }) as { destroy: () => void };
    });

    expect(document.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(
      screen.getByText('当前数据集校验失败(过程信息、建模信息、管理信息和输入/输出)'),
    ).toBeInTheDocument();
    expect(screen.getByText('数据校验不通过')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '修复问题' })).toHaveLength(1);

    await act(async () => {
      modalHandle?.destroy();
    });
  });

  it('renders clickable sdk navigation targets and closes the modal after jumping', async () => {
    const onNavigate = jest.fn();
    let modalHandle: { destroy: () => void } | null = null;

    await act(async () => {
      modalHandle = showValidationIssueModal({
        intl,
        issues: [
          {
            code: 'sdkInvalid',
            link: 'http://localhost:8000/mydata/processes?id=process-nav&version=01.00.000',
            ref: {
              '@refObjectId': 'process-nav',
              '@type': 'process data set',
              '@version': '01.00.000',
            },
            sdkDetails: [
              {
                key: 'sdk-nav-1',
                tabName: 'exchanges',
                exchangeInternalId: '0',
                exchangeFlowLabel: 'Electricity, medium voltage',
                fieldLabel: 'Comment',
                fieldPath: 'exchange[#0].generalComment.0.#text',
                reasonMessage: 'Text length 520 exceeds maximum 500',
                suggestedFix: 'Shorten this comment to 500 characters or fewer.',
              },
            ],
            tabNames: ['exchanges'],
          },
        ],
        onNavigate,
        title: '数据校验问题',
      }) as { destroy: () => void };
    });

    const tabButton = screen.getByRole('button', { name: '输入/输出' });
    expect(tabButton).toBeInTheDocument();
    expect(tabButton.parentElement).toHaveAttribute(
      'title',
      '对应 tab 下的问题数据会标红，请补充后重试。',
    );
    expect(screen.queryByText(/Text length 520 exceeds maximum 500/)).not.toBeInTheDocument();

    fireEvent.click(tabButton);

    expect(onNavigate).toHaveBeenCalledWith({
      detail: expect.objectContaining({
        key: 'sdk-nav-1',
        tabName: 'exchanges',
      }),
      tabName: 'exchanges',
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    await act(async () => {
      modalHandle?.destroy();
    });
  });

  it('renders clickable process-instance detail rows for lifecycle model sdk issues', async () => {
    const onNavigate = jest.fn();
    let modalHandle: { destroy: () => void } | null = null;

    await act(async () => {
      modalHandle = showValidationIssueModal({
        intl,
        issues: [
          {
            code: 'sdkInvalid',
            link: 'http://localhost:8000/mydata/models?id=model-1&version=01.00.000',
            ref: {
              '@refObjectId': 'model-1',
              '@type': 'lifeCycleModel data set',
              '@version': '01.00.000',
            },
            sdkDetails: [
              {
                key: 'sdk-lcm-pi-1',
                fieldLabel: '@multiplicationFactor',
                fieldPath: 'processInstance[#node-1].@multiplicationFactor',
                formName: ['@multiplicationFactor'],
                presentation: 'highlight-only',
                processInstanceInternalId: 'node-1',
                processInstanceLabel: '三元正极材料',
                reasonMessage: 'Required value is missing',
                tabName: 'lifeCycleModelInformation',
                validationCode: 'required_missing',
              },
            ],
            tabNames: [],
          },
        ],
        onNavigate,
        title: '数据校验问题',
      }) as { destroy: () => void };
    });

    expect(
      screen.queryByRole('button', {
        name: 'lifeCycleModelInformation',
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('当前数据集校验失败')).toBeInTheDocument();
    expect(screen.queryByText('当前数据集校验失败()')).not.toBeInTheDocument();
    const detailButton = screen.getByRole('button', {
      name: '请检测一下节点是否为孤立节点(三元正极材料)',
    });
    expect(detailButton).toBeInTheDocument();
    expect(screen.queryByText(/@multiplicationFactor/)).not.toBeInTheDocument();

    fireEvent.click(detailButton);

    expect(onNavigate).toHaveBeenCalledWith({
      detail: expect.objectContaining({
        key: 'sdk-lcm-pi-1',
        processInstanceInternalId: 'node-1',
        processInstanceLabel: '三元正极材料',
      }),
      tabName: 'lifeCycleModelInformation',
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    await act(async () => {
      modalHandle?.destroy();
    });
  });

  it('does not render process-instance detail copy for flow-property highlight issues', async () => {
    const onNavigate = jest.fn();
    let modalHandle: { destroy: () => void } | null = null;

    await act(async () => {
      modalHandle = showValidationIssueModal({
        intl,
        issues: [
          {
            code: 'sdkInvalid',
            link: 'http://localhost:8000/mydata/flows?id=flow-1&version=01.00.000',
            ref: {
              '@refObjectId': 'flow-1',
              '@type': 'flow data set',
              '@version': '01.00.000',
            },
            sdkDetails: [
              {
                key: 'sdk-flow-property-quantitative-reference-1',
                fieldLabel: 'Quantitative reference',
                fieldPath: 'flowProperty[#prop-1].quantitativeReference',
                presentation: 'highlight-only',
                reasonMessage: 'Only one quantitative reference is allowed',
                suggestedFix: '以下数据必须有且仅有一条数据作为基准',
                tabName: 'flowProperties',
                validationCode: 'quantitative_reference_count_invalid',
              },
            ],
            tabNames: ['flowProperties'],
          },
        ],
        onNavigate,
        title: '数据校验问题',
      }) as { destroy: () => void };
    });

    const tabButton = screen.getByRole('button', { name: '流属性' });
    expect(tabButton).toBeInTheDocument();
    expect(screen.queryByText(/未知过程/)).not.toBeInTheDocument();
    expect(screen.queryByText(/quantitativeReference/)).not.toBeInTheDocument();
    expect(screen.queryByText(/以下数据必须有且仅有一条数据作为基准/)).not.toBeInTheDocument();

    fireEvent.click(tabButton);

    expect(onNavigate).toHaveBeenCalledWith({
      detail: expect.objectContaining({
        key: 'sdk-flow-property-quantitative-reference-1',
        tabName: 'flowProperties',
      }),
      tabName: 'flowProperties',
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    await act(async () => {
      modalHandle?.destroy();
    });
  });

  it('aggregates multiplication-factor lifecycle model sdk issues into one isolated-node hint', async () => {
    const onNavigate = jest.fn();
    let modalHandle: { destroy: () => void } | null = null;

    await act(async () => {
      modalHandle = showValidationIssueModal({
        intl,
        issues: [
          {
            code: 'sdkInvalid',
            link: 'http://localhost:8000/mydata/models?id=model-1&version=01.00.000',
            ref: {
              '@refObjectId': 'model-1',
              '@type': 'lifeCycleModel data set',
              '@version': '01.00.000',
            },
            sdkDetails: [
              {
                key: 'sdk-lcm-pi-1',
                fieldLabel: '@multiplicationFactor',
                fieldPath: 'processInstance[#node-b].@multiplicationFactor',
                formName: ['@multiplicationFactor'],
                presentation: 'highlight-only',
                processInstanceInternalId: 'node-b',
                processInstanceLabel: 'nodeB',
                reasonMessage: 'Required value is missing',
                tabName: 'lifeCycleModelInformation',
                validationCode: 'required_missing',
              },
              {
                key: 'sdk-lcm-pi-2',
                fieldLabel: '@multiplicationFactor',
                fieldPath: 'processInstance[#node-c].@multiplicationFactor',
                formName: ['@multiplicationFactor'],
                presentation: 'highlight-only',
                processInstanceInternalId: 'node-c',
                processInstanceLabel: 'nodeC',
                reasonMessage: 'Required value is missing',
                tabName: 'lifeCycleModelInformation',
                validationCode: 'required_missing',
              },
            ],
            tabNames: [],
          },
        ],
        onNavigate,
        title: '数据校验问题',
      }) as { destroy: () => void };
    });

    const detailButton = screen.getByRole('button', {
      name: '请检测一下节点是否为孤立节点(nodeB和nodeC)',
    });
    expect(detailButton).toBeInTheDocument();
    expect(screen.queryByText(/@multiplicationFactor/)).not.toBeInTheDocument();

    fireEvent.click(detailButton);

    expect(onNavigate).toHaveBeenCalledWith({
      detail: expect.objectContaining({
        key: 'sdk-lcm-pi-1',
        processInstanceInternalId: 'node-b',
      }),
      tabName: 'lifeCycleModelInformation',
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    await act(async () => {
      modalHandle?.destroy();
    });
  });

  it('localizes isolated-node hints for multiplication-factor lifecycle model sdk issues in English', async () => {
    const onNavigate = jest.fn();
    const enIntl = {
      locale: 'en-US',
      formatMessage: (
        { id, defaultMessage }: { id: string; defaultMessage?: string },
        values?: Record<string, string | number | undefined>,
      ) => {
        const messages: Record<string, string> = {
          'pages.validationIssues.downloadHtml': 'Download Data Validation Report',
          'pages.validationIssues.datasetType.lifecyclemodel': 'Lifecycle model',
          'pages.validationIssues.table.issue': 'Issue',
          'pages.validationIssues.table.user': 'Data owner',
          'pages.validationIssues.table.action': 'Action',
          'pages.validationIssues.issue.sdkInvalid': 'Current dataset validation failed',
          'pages.validationIssues.listSeparator': ', ',
          'pages.validationIssues.issue.sdkInvalid.navigateHint':
            'The invalid data in the corresponding tab will be highlighted. Complete it and try again.',
          'pages.validationIssues.issue.sdkInvalid.processInstanceFallback': 'Unknown process',
          'pages.validationIssues.issue.sdkInvalid.processInstanceIsolatedNodeHint':
            'Please check whether these nodes are isolated ({nodeNames})',
          'pages.validationIssues.confirm': 'Got it',
          'pages.validationIssues.fixIssue': 'Fix issue',
        };

        const template = messages[id] ?? defaultMessage ?? id;
        if (!values) {
          return template;
        }

        return Object.entries(values).reduce((messageText, [key, value]) => {
          return messageText.split(`{${key}}`).join(String(value ?? ''));
        }, template);
      },
    };
    let modalHandle: { destroy: () => void } | null = null;

    await act(async () => {
      modalHandle = showValidationIssueModal({
        intl: enIntl,
        issues: [
          {
            code: 'sdkInvalid',
            link: 'http://localhost:8000/mydata/models?id=model-1&version=01.00.000',
            ref: {
              '@refObjectId': 'model-1',
              '@type': 'lifeCycleModel data set',
              '@version': '01.00.000',
            },
            sdkDetails: [
              {
                key: 'sdk-lcm-pi-en-1',
                fieldLabel: '@multiplicationFactor',
                fieldPath: 'processInstance[#node-b].@multiplicationFactor',
                formName: ['@multiplicationFactor'],
                presentation: 'highlight-only',
                processInstanceInternalId: 'node-b',
                processInstanceLabel: 'nodeB',
                reasonMessage: 'Required value is missing',
                tabName: 'lifeCycleModelInformation',
                validationCode: 'required_missing',
              },
              {
                key: 'sdk-lcm-pi-en-2',
                fieldLabel: '@multiplicationFactor',
                fieldPath: 'processInstance[#node-c].@multiplicationFactor',
                formName: ['@multiplicationFactor'],
                presentation: 'highlight-only',
                processInstanceInternalId: 'node-c',
                processInstanceLabel: 'nodeC',
                reasonMessage: 'Required value is missing',
                tabName: 'lifeCycleModelInformation',
                validationCode: 'required_missing',
              },
            ],
            tabNames: [],
          },
        ],
        onNavigate,
        title: 'Validation issues',
      }) as { destroy: () => void };
    });

    expect(
      screen.getByRole('button', {
        name: 'Please check whether these nodes are isolated (nodeB and nodeC)',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/@multiplicationFactor/)).not.toBeInTheDocument();

    await act(async () => {
      modalHandle?.destroy();
    });
  });

  it('hydrates grouped owner metadata from later issues when the first row is sparse', async () => {
    let modalHandle: { destroy: () => void } | null = null;

    await act(async () => {
      modalHandle = showValidationIssueModal({
        intl,
        issues: [
          {
            code: 'ruleVerificationFailed',
            link: 'http://localhost:8000/mydata/processes?id=process-1&version=01.00.000',
            ownerName: '   ',
            ownerUserId: '   ',
            ref: {
              '@refObjectId': 'process-1',
              '@type': 'process data set',
              '@version': '01.00.000',
            },
          },
          {
            code: 'sdkInvalid',
            isOwnedByCurrentUser: false,
            link: 'http://localhost:8000/mydata/processes?id=process-1&version=01.00.000',
            ownerName: ' 后续拥有者 ',
            ownerUserId: ' user-2 ',
            ref: {
              '@refObjectId': 'process-1',
              '@type': 'process data set',
              '@version': '01.00.000',
            },
            tabNames: ['processInformation'],
          },
          {
            code: 'ruleVerificationFailed',
            link: 'http://localhost:8000/mydata/contacts?id=contact-1&version=01.00.000',
            ownerName: ' 联系人拥有者 ',
            ref: {
              '@refObjectId': 'contact-1',
              '@type': 'contact data set',
              '@version': '01.00.000',
            },
          },
          {
            code: 'sdkInvalid',
            isOwnedByCurrentUser: true,
            link: 'http://localhost:8000/mydata/contacts?id=contact-1&version=01.00.000',
            ref: {
              '@refObjectId': 'contact-1',
              '@type': 'contact data set',
              '@version': '01.00.000',
            },
            tabNames: ['contactInformation'],
          },
        ],
        title: '数据校验问题',
      }) as { destroy: () => void };
    });

    const processRow = latestTableDataSource.find((row) => row.ref['@refObjectId'] === 'process-1');
    const contactRow = latestTableDataSource.find((row) => row.ref['@refObjectId'] === 'contact-1');

    expect(processRow).toMatchObject({
      isOwnedByCurrentUser: false,
      ownerName: '后续拥有者',
      ownerUserId: 'user-2',
    });
    expect(contactRow).toMatchObject({
      isOwnedByCurrentUser: true,
      ownerName: '联系人拥有者',
    });

    expect(screen.getByText('后续拥有者')).toBeInTheDocument();
    expect(screen.getByText('联系人拥有者')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '通知数据拥有者' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '修复问题' })).toBeInTheDocument();

    await act(async () => {
      modalHandle?.destroy();
    });
  });

  it('keeps the table header fixed and sorts rows by the required dataset type order', async () => {
    let modalHandle: { destroy: () => void } | null = null;

    await act(async () => {
      modalHandle = showValidationIssueModal({
        intl,
        issues: [
          {
            code: 'ruleVerificationFailed',
            link: 'http://localhost:8000/mydata/models?id=model-1&version=01.00.000',
            ref: {
              '@refObjectId': 'model-1',
              '@type': 'lifeCycleModel data set',
              '@version': '01.00.000',
            },
          },
          {
            code: 'ruleVerificationFailed',
            isOwnedByCurrentUser: true,
            link: 'http://localhost:8000/mydata/processes?id=process-1&version=01.00.000',
            ownerName: '过程拥有者',
            ref: {
              '@refObjectId': 'process-1',
              '@type': 'process data set',
              '@version': '01.00.000',
            },
          },
          {
            code: 'ruleVerificationFailed',
            link: 'http://localhost:8000/mydata/flows?id=flow-1&version=01.00.000',
            ref: {
              '@refObjectId': 'flow-1',
              '@type': 'flow data set',
              '@version': '01.00.000',
            },
          },
          {
            code: 'ruleVerificationFailed',
            isOwnedByCurrentUser: false,
            link: 'http://localhost:8000/mydata/contacts?id=contact-1&version=01.00.000',
            ownerName: '联系人拥有者',
            ref: {
              '@refObjectId': 'contact-1',
              '@type': 'contact data set',
              '@version': '01.00.000',
            },
          },
        ],
        title: '数据校验问题',
      }) as { destroy: () => void };
    });

    expect(screen.getByRole('table')).toHaveAttribute('data-scroll-y', '360');
    expect(screen.getByRole('table')).toHaveAttribute('data-scroll-x', '1164');
    expect(screen.getByRole('table')).toHaveAttribute('data-sticky', 'true');
    expect(screen.getByRole('table')).toHaveAttribute('data-table-layout', 'fixed');

    const rowTexts = Array.from(document.querySelectorAll('tbody tr')).map((row) =>
      row.textContent?.replace(/\s+/g, ' ').trim(),
    );

    expect(rowTexts).toEqual([
      expect.stringContaining('联系人'),
      expect.stringContaining('流'),
      expect.stringContaining('过程'),
      expect.stringContaining('模型'),
    ]);
    expect(rowTexts[0]).toContain('contact-1');
    expect(rowTexts[1]).toContain('flow-1');
    expect(rowTexts[2]).toContain('process-1');
    expect(rowTexts[3]).toContain('model-1');

    await act(async () => {
      modalHandle?.destroy();
    });
  });

  it('wraps long lifecycle model issue paths within the issue column', async () => {
    const onNavigate = jest.fn();
    let modalHandle: { destroy: () => void } | null = null;

    await act(async () => {
      modalHandle = showValidationIssueModal({
        intl,
        issues: [
          {
            code: 'sdkInvalid',
            link: 'http://localhost:8000/mydata/lifecyclemodels?id=model-long-path&version=01.01.000',
            ref: {
              '@refObjectId': 'model-long-path',
              '@type': 'lifeCycleModel data set',
              '@version': '01.01.000',
            },
            sdkDetails: [
              {
                key: 'model-long-path-detail',
                fieldLabel: 'Version',
                fieldPath:
                  'processInstance[#model-process].connections.outputExchange.downstreamProcess.@version',
                presentation: 'highlight-only',
                processInstanceLabel: '过程 非烧结砖，高压压制成型；高压压制成型；生产混合，在工厂',
                reasonMessage: 'Version is required',
                tabName: 'exchanges',
                validationCode: 'required_missing',
              },
            ],
          },
        ],
        onNavigate,
        title: '数据校验问题',
      }) as { destroy: () => void };
    });

    const longPathButton = screen.getByRole('button', {
      name: /connections\.outputExchange\.downstreamProcess\.@version/,
    });
    const issueCell = longPathButton.closest('td');

    expect(longPathButton).toHaveStyle('max-width: 100%');
    expect(longPathButton).toHaveStyle('overflow-wrap: anywhere');
    expect(longPathButton).toHaveStyle('white-space: normal');
    expect(issueCell).toHaveStyle('overflow-wrap: anywhere');
    expect(issueCell).toHaveStyle('white-space: normal');

    await act(async () => {
      modalHandle?.destroy();
    });
  });

  it('exports html table with the same action column content as the modal', async () => {
    const createObjectURLSpy = jest
      .spyOn(URL, 'createObjectURL')
      .mockImplementation(() => 'blob:validation-issues');
    const revokeObjectURLSpy = jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    let modalHandle: { destroy: () => void } | null = null;

    await act(async () => {
      modalHandle = showValidationIssueModal({
        intl,
        issues: [
          {
            code: 'ruleVerificationFailed',
            isOwnedByCurrentUser: true,
            link: 'http://localhost:8000/mydata/processes?id=process-1&version=01.00.000',
            ownerName: '过程拥有者',
            ref: {
              '@refObjectId': 'process-1',
              '@type': 'process data set',
              '@version': '01.00.000',
            },
          },
          {
            code: 'ruleVerificationFailed',
            isOwnedByCurrentUser: false,
            link: 'http://localhost:8000/mydata/contacts?id=contact-1&version=01.00.000',
            ownerName: '联系人拥有者',
            ref: {
              '@refObjectId': 'contact-1',
              '@type': 'contact data set',
              '@version': '01.00.000',
            },
          },
          {
            code: 'nonExistentRef',
            link: 'http://localhost:8000/mydata/processes?id=process-2&version=01.00.000',
            ref: {
              '@refObjectId': 'process-2',
              '@type': 'process data set',
              '@version': '01.00.000',
            },
          },
        ],
        title: '数据校验问题',
      }) as { destroy: () => void };
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '下载数据校验报告' }));
    });

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);

    const blob = createObjectURLSpy.mock.calls[0][0] as Blob;
    const html = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });

    expect(html).toContain('<html lang="zh-CN" dir="ltr">');
    expect(html).toContain('<th>数据拥有者</th>');
    expect(html).toContain('<th>操作</th>');
    expect(html).not.toContain('<th>链接</th>');
    expect(html).toContain('>联系人拥有者<');
    expect(html).toContain('>过程拥有者<');
    expect(html).toContain('>修复问题<');
    expect(html).not.toContain('>通知数据拥有者<');
    expect(html).toContain('<td>-</td>');
    expect(html).toContain('class="action-link"');
    expect(html).toContain('class="action-link-disabled"');
    expect(html.indexOf('contact-1')).toBeLessThan(html.indexOf('process-1'));
    expect(html.indexOf('process-1')).toBeLessThan(html.indexOf('process-2'));

    await act(async () => {
      modalHandle?.destroy();
    });
    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
  });

  it('clicks the generated download link outside jsdom environments', async () => {
    const createObjectURLSpy = jest
      .spyOn(URL, 'createObjectURL')
      .mockImplementation(() => 'blob:validation-issues-browser');
    const revokeObjectURLSpy = jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const anchorClickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    const originalUserAgent = window.navigator.userAgent;
    let modalHandle: { destroy: () => void } | null = null;

    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/123.0 Safari/537.36',
    });

    await act(async () => {
      modalHandle = showValidationIssueModal({
        intl,
        issues: [
          {
            code: 'ruleVerificationFailed',
            isOwnedByCurrentUser: true,
            link: 'http://localhost:8000/mydata/processes?id=process-browser&version=01.00.000',
            ownerName: '浏览器下载分支',
            ref: {
              '@refObjectId': 'process-browser',
              '@type': 'process data set',
              '@version': '01.00.000',
            },
          },
        ],
        title: '浏览器下载分支',
      }) as { destroy: () => void };
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '下载数据校验报告' }));
    });

    expect(anchorClickSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      modalHandle?.destroy();
    });

    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: originalUserAgent,
    });
    anchorClickSpy.mockRestore();
    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
  });

  it('returns null when issues are empty and closes via confirm/cancel with default title', async () => {
    expect(showValidationIssueModal({ intl, issues: [] })).toBeNull();

    let modalHandle: { destroy: () => void } | null = null;
    await act(async () => {
      modalHandle = showValidationIssueModal({
        intl,
        issues: [
          {
            code: 'ruleVerificationFailed',
            link: 'http://localhost:8000/mydata/processes?id=process-9&version=01.00.000',
            ref: {
              '@refObjectId': 'process-9',
              '@type': 'process data set',
              '@version': '01.00.000',
            },
          },
        ],
      }) as { destroy: () => void };
    });

    expect(screen.getByText('Validation issues')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '知道了' }));
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await act(async () => {
      modalHandle?.destroy();
      modalHandle?.destroy();
    });

    await act(async () => {
      showValidationIssueModal({
        intl,
        issues: [
          {
            code: 'ruleVerificationFailed',
            link: 'http://localhost:8000/mydata/processes?id=process-10&version=01.00.000',
            ref: {
              '@refObjectId': 'process-10',
              '@type': 'process data set',
              '@version': '01.00.000',
            },
          },
        ],
        title: '关闭校验框',
      });
    });
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('covers all issue codes, type fallbacks, duplicate filtering and html escaping', async () => {
    const windowOpenSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
    const createObjectURLSpy = jest
      .spyOn(URL, 'createObjectURL')
      .mockImplementation(() => 'blob:validation-issues-2');
    const revokeObjectURLSpy = jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    let modalHandle: { destroy: () => void } | null = null;

    await act(async () => {
      modalHandle = showValidationIssueModal({
        intl,
        issues: [
          {
            code: 'underReview',
            link: '',
            ref: {
              '@refObjectId': 'contact-1',
              '@type': 'contact data set',
              '@version': '01.00.000',
            },
          },
          {
            code: 'versionUnderReview',
            underReviewVersion: undefined,
            link: '',
            ref: {
              '@refObjectId': 'source-1',
              '@type': 'source data set',
              '@version': '01.00.000',
            },
          },
          {
            code: 'versionIsInTg',
            link: '',
            ref: {
              '@refObjectId': 'unit-1',
              '@type': 'unit group data set',
              '@version': '01.00.000',
            },
          },
          {
            code: 'sdkInvalid',
            link: '',
            tabNames: [''],
            ref: {
              '@refObjectId': 'contact-sdk-empty-tab',
              '@type': 'contact data set',
              '@version': '01.00.000',
            },
          },
          {
            code: 'sdkInvalid',
            link: '',
            // cover tabNames ?? [] fallback branch
            tabNames: ['basicInformation'],
            ref: {
              '@refObjectId': 'contact-sdk-1',
              '@type': 'contact data set',
              '@version': '01.00.000',
            },
          },
          {
            code: 'sdkInvalid',
            link: '',
            tabNames: undefined,
            ref: {
              '@refObjectId': 'contact-sdk-without-tab-names',
              '@type': 'contact data set',
              '@version': '01.00.000',
            },
          },
          {
            code: 'sdkInvalid',
            link: '',
            tabNames: ['basicInformation'],
            ref: {
              '@refObjectId': 'source-sdk-1',
              '@type': 'source data set',
              '@version': '01.00.000',
            },
          },
          {
            code: 'sdkInvalid',
            link: '',
            tabNames: ['basicInformation'],
            ref: {
              '@refObjectId': 'unit-sdk-1',
              '@type': 'unit group data set',
              '@version': '01.00.000',
            },
          },
          {
            code: 'sdkInvalid',
            link: '',
            tabNames: ['baseData', 'baseData'],
            ref: {
              '@refObjectId': 'flowProperty-1',
              '@type': 'flow property data set',
              '@version': '01.00.000',
            },
          },
          {
            code: 'sdkInvalid',
            link: '',
            tabNames: ['baseData'],
            ref: {
              '@refObjectId': 'flow-1',
              '@type': 'flow data set',
              '@version': '01.00.000',
            },
          },
          {
            code: 'sdkInvalid',
            link: '',
            tabNames: ['processInformation', 'unknownTab'],
            ref: {
              '@refObjectId': 'process-1',
              '@type': 'process data set',
              '@version': '01.00.000',
            },
          },
          {
            code: 'sdkInvalid',
            link: '',
            tabNames: ['generalInformation'],
            ref: {
              '@refObjectId': 'model-1',
              '@type': 'lifeCycleModel data set',
              '@version': '01.00.000',
            },
          },
          {
            code: 'mysteryCode' as any,
            link: '',
            ref: {
              '@refObjectId': 'unknown-1',
              '@type': 'mystery data set',
              '@version': '01.00.000',
            },
          },
          {
            code: 'sdkInvalid',
            link: '',
            tabNames: ['mysteryTab'],
            ref: {
              '@refObjectId': 'unknown-sdk-1',
              '@type': 'mystery data set',
              '@version': '01.00.000',
            },
          },
          {
            code: 'ruleVerificationFailed',
            link: '',
            ref: {
              '@refObjectId': 'dup-1',
              '@type': 'process data set',
              '@version': '01.00.000',
            },
          },
          {
            code: 'ruleVerificationFailed',
            link: 'http://localhost:8000/mydata/processes?id=dup-1&version=01.00.000',
            ref: {
              '@refObjectId': 'dup-1',
              '@type': 'process data set',
              '@version': '01.00.000',
            },
          },
          {
            code: 'ruleVerificationFailed',
            link: 'http://localhost:8000/mydata/processes?id=escape-1&version=01.00.000&name=<x>',
            ownerName: 'owner<&"',
            ref: {
              '@refObjectId': '<id&"',
              '@type': 'process data set',
              '@version': "01.00.000'",
            },
          },
        ],
        title: '覆盖所有分支',
      }) as { destroy: () => void };
    });

    expect(screen.getByText('Dataset is under review')).toBeInTheDocument();
    expect(
      screen.getByText('Another version - of this dataset is already under review'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Current version is lower than the published version'),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText('当前数据集校验失败(未知数据分区（baseData）)').length,
    ).toBeGreaterThan(1);
    expect(
      screen.getAllByText('当前数据集校验失败(未知数据分区（basicInformation）)').length,
    ).toBeGreaterThan(2);
    expect(screen.getAllByText('当前数据集校验失败').length).toBeGreaterThan(1);
    expect(
      screen.getByText('当前数据集校验失败(过程信息和未知数据分区（unknownTab）)'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('当前数据集校验失败(未知数据分区（generalInformation）)'),
    ).toBeInTheDocument();
    expect(screen.getByText('当前数据集校验失败(未知数据分区（mysteryTab）)')).toBeInTheDocument();
    expect(screen.getByText('mysteryCode')).toBeInTheDocument();
    expect(screen.getAllByText('mystery data set').length).toBeGreaterThan(1);
    expect(screen.getByText('<id&"')).toBeInTheDocument();
    expect(screen.getByText("01.00.000'")).toBeInTheDocument();
    expect(screen.getByText('owner<&"')).toBeInTheDocument();
    expect(screen.getAllByText('数据校验不通过').length).toBeGreaterThan(0);
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole('button', { name: '修复问题' })[0]);
    expect(windowOpenSpy).toHaveBeenCalledWith(
      'http://localhost:8000/mydata/processes?id=dup-1&version=01.00.000',
      '_blank',
      'noopener,noreferrer',
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '下载数据校验报告' }));
    });

    const blob = createObjectURLSpy.mock.calls[0][0] as Blob;
    const html = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });

    expect(html).toContain('&lt;id&amp;&quot;');
    expect(html).toContain('01.00.000&#39;');
    expect(html).toContain('name=&lt;x&gt;');
    expect(html).toContain('owner&lt;&amp;&quot;');
    expect(html).toContain('class="action-link"');
    expect(html).toContain('>mystery data set<');

    await act(async () => {
      modalHandle?.destroy();
    });
    windowOpenSpy.mockRestore();
    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
  });

  it('falls back to default modal z-index when token base z-index is missing', async () => {
    mockZIndexPopupBase = undefined;
    let modalHandle: { destroy: () => void } | null = null;

    await act(async () => {
      modalHandle = showValidationIssueModal({
        intl,
        issues: [
          {
            code: 'ruleVerificationFailed',
            link: '',
            ref: {
              '@refObjectId': 'z-index-fallback',
              '@type': 'process data set',
              '@version': '01.00.000',
            },
          },
        ],
        title: 'z-index fallback',
      }) as { destroy: () => void };
    });

    expect(screen.getByRole('dialog')).toHaveAttribute('data-z-index', '2000');

    await act(async () => {
      modalHandle?.destroy();
    });
  });

  it('falls back to 1000 when zIndexPopupBase changes to undefined between reads', async () => {
    mockZIndexPopupBaseSequence = [2, undefined];
    let modalHandle: { destroy: () => void } | null = null;

    await act(async () => {
      modalHandle = showValidationIssueModal({
        intl,
        issues: [
          {
            code: 'ruleVerificationFailed',
            link: '',
            ref: {
              '@refObjectId': 'z-index-dynamic-fallback',
              '@type': 'process data set',
              '@version': '01.00.000',
            },
          },
        ],
        title: 'z-index dynamic fallback',
      }) as { destroy: () => void };
    });

    expect(screen.getByRole('dialog')).toHaveAttribute('data-z-index', '2000');

    await act(async () => {
      modalHandle?.destroy();
    });
  });

  it('renders dash when issue description is undefined', async () => {
    let modalHandle: { destroy: () => void } | null = null;

    await act(async () => {
      modalHandle = showValidationIssueModal({
        intl,
        issues: [
          {
            code: undefined as any,
            link: '',
            ref: {
              '@refObjectId': 'issue-code-undefined',
              '@type': 'process data set',
              '@version': '01.00.000',
            },
          },
        ],
        title: 'issue fallback',
      }) as { destroy: () => void };
    });

    expect(screen.getAllByText('-').length).toBeGreaterThan(1);

    await act(async () => {
      modalHandle?.destroy();
    });
  });

  it('opens empty link when grouped issue link becomes undefined before click', async () => {
    const windowOpenSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
    let modalHandle: { destroy: () => void } | null = null;

    await act(async () => {
      modalHandle = showValidationIssueModal({
        intl,
        issues: [
          {
            code: 'ruleVerificationFailed',
            link: 'http://localhost:8000/mydata/processes?id=process-dynamic&version=01.00.000',
            ref: {
              '@refObjectId': 'process-dynamic',
              '@type': 'process data set',
              '@version': '01.00.000',
            },
          },
        ],
        title: 'dynamic link',
      }) as { destroy: () => void };
    });

    latestTableDataSource[0].link = undefined;
    fireEvent.click(screen.getByRole('button', { name: '修复问题' }));
    expect(windowOpenSpy).toHaveBeenCalledWith('', '_blank', 'noopener,noreferrer');

    await act(async () => {
      modalHandle?.destroy();
    });
    windowOpenSpy.mockRestore();
  });

  it('falls back to the plain sdk issue description when no interactive tabs can be rendered', async () => {
    const onNavigate = jest.fn();
    let modalHandle: { destroy: () => void } | null = null;

    await act(async () => {
      modalHandle = showValidationIssueModal({
        intl,
        issues: [
          {
            code: 'sdkInvalid',
            link: '',
            ref: {
              '@refObjectId': 'sdk-no-tabs',
              '@type': 'process data set',
              '@version': '01.00.000',
            },
            sdkDetails: [],
            tabNames: [],
          },
        ],
        onNavigate,
        title: 'sdk fallback',
      }) as { destroy: () => void };
    });

    expect(screen.getByText('当前数据集校验失败')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '过程信息' })).not.toBeInTheDocument();

    await act(async () => {
      modalHandle?.destroy();
    });
  });

  it('uses null sdkDetails safely when sdk navigation falls back to a single tab name', async () => {
    const onNavigate = jest.fn();
    let modalHandle: { destroy: () => void } | null = null;

    await act(async () => {
      modalHandle = showValidationIssueModal({
        intl,
        issues: [
          {
            code: 'sdkInvalid',
            link: '',
            ref: {
              '@refObjectId': 'sdk-null-details',
              '@type': 'process data set',
              '@version': '01.00.000',
            },
            sdkDetails: null as any,
            tabName: 'processInformation',
          },
        ],
        onNavigate,
        title: 'sdk null details',
      }) as { destroy: () => void };
    });

    fireEvent.click(screen.getByRole('button', { name: '过程信息' }));

    expect(onNavigate).toHaveBeenCalledWith({
      detail: undefined,
      tabName: 'processInformation',
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    await act(async () => {
      modalHandle?.destroy();
    });
  });

  it('renders grouped unknown issue codes as a dash without breaking multi-issue rows', async () => {
    let modalHandle: { destroy: () => void } | null = null;

    await act(async () => {
      modalHandle = showValidationIssueModal({
        intl,
        issues: [
          {
            code: undefined as any,
            link: 'http://localhost:8000/mydata/processes?id=unknown-issue&version=01.00.000',
            ref: {
              '@refObjectId': 'unknown-issue',
              '@type': 'process data set',
              '@version': '01.00.000',
            },
          },
          {
            code: 'ruleVerificationFailed',
            link: 'http://localhost:8000/mydata/processes?id=unknown-issue&version=01.00.000',
            ref: {
              '@refObjectId': 'unknown-issue',
              '@type': 'process data set',
              '@version': '01.00.000',
            },
          },
        ],
        title: 'unknown issue row',
      }) as { destroy: () => void };
    });

    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('数据校验不通过')).toBeInTheDocument();

    await act(async () => {
      modalHandle?.destroy();
    });
  });

  it('uses issue.tabName as an interactive fallback and reuses the first sdk detail when needed', async () => {
    const onNavigate = jest.fn();
    let modalHandle: { destroy: () => void } | null = null;

    await act(async () => {
      modalHandle = showValidationIssueModal({
        intl,
        issues: [
          {
            code: 'sdkInvalid',
            link: 'http://localhost:8000/mydata/processes?id=sdk-tab-fallback&version=01.00.000',
            ref: {
              '@refObjectId': 'sdk-tab-fallback',
              '@type': 'process data set',
              '@version': '01.00.000',
            },
            sdkDetails: [
              {
                key: 'sdk-process-detail',
                tabName: 'processInformation',
                fieldLabel: 'Reference year',
                fieldPath: 'processInformation.time.common:referenceYear',
                reasonMessage: 'Reference year is required',
                suggestedFix: 'Please input reference year',
              },
            ],
            tabName: 'exchanges',
          },
        ],
        onNavigate,
        title: 'sdk tab fallback',
      }) as { destroy: () => void };
    });

    expect(screen.getByRole('button', { name: '过程信息' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '输入/输出' })).toBeInTheDocument();
    expect(screen.getByRole('dialog').textContent).toContain(
      '当前数据集校验失败(过程信息和输入/输出)',
    );

    fireEvent.click(screen.getByRole('button', { name: '输入/输出' }));

    expect(onNavigate).toHaveBeenCalledWith({
      detail: expect.objectContaining({
        key: 'sdk-process-detail',
        tabName: 'processInformation',
      }),
      tabName: 'exchanges',
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    await act(async () => {
      modalHandle?.destroy();
    });
  });
});
