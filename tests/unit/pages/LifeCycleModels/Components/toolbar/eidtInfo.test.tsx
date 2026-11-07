// @ts-nocheck
import ToolbarEditInfo from '@/pages/LifeCycleModels/Components/toolbar/eidtInfo';
import { act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { render, screen, waitFor } from '../../../../../helpers/testUtils';

jest.mock(
  '@tiangong-lca/tidas-sdk',
  () => ({
    __esModule: true,
    createLifeCycleModel: jest.fn().mockReturnValue({
      validateEnhanced: jest.fn().mockReturnValue({ success: true }),
    }),
  }),
  { virtual: true },
);

jest.mock('umi', () => ({
  __esModule: true,
  FormattedMessage: ({ defaultMessage, id }: any) => <span>{defaultMessage ?? id}</span>,
  useIntl: () => ({
    formatMessage: ({ defaultMessage, id }: any, values?: Record<string, unknown>) => {
      const template = defaultMessage ?? id;

      return template.replace(/\{(\w+)\}/g, (_match: string, key: string) =>
        String(values?.[key] ?? `{${key}}`),
      );
    },
    locale: 'en',
  }),
}));

jest.mock('@/contexts/refCheckContext', () => {
  const React = require('react');
  const parentContextValue = { refCheckData: [] };
  return {
    __esModule: true,
    RefCheckContext: React.createContext(parentContextValue),
    useRefCheckContext: () => parentContextValue,
  };
});

jest.mock('@/pages/LifeCycleModels/Components/form', () => {
  const React = require('react');
  return {
    __esModule: true,
    LifeCycleModelForm: ({ children, onTabChange, onData, formRef, activeTabKey }: any) => (
      <div data-testid='life-cycle-model-form'>
        {children}
        <div data-testid='active-tab'>{activeTabKey}</div>
        <button type='button' onClick={() => onTabChange?.('validation')}>
          switch-validation
        </button>
        <button type='button' onClick={() => onTabChange?.('complianceDeclarations')}>
          switch-compliance
        </button>
        <button type='button' onClick={() => onTabChange?.('technology')}>
          switch-technology
        </button>
        <button
          type='button'
          onClick={() =>
            formRef?.current?.setFieldValue(['modellingAndValidation', 'validation'], {
              review: [{ id: 'validation-review' }],
            })
          }
        >
          set-validation-value
        </button>
        <button
          type='button'
          onClick={() =>
            formRef?.current?.setFieldValue(['modellingAndValidation', 'complianceDeclarations'], {
              compliance: [{ id: 'compliance-review' }],
            })
          }
        >
          set-compliance-value
        </button>
        <button
          type='button'
          onClick={() =>
            formRef?.current?.setFieldValue(['lifeCycleModelInformation'], {
              dataSetInformation: {
                name: {
                  en: 'generic-name',
                },
              },
            })
          }
        >
          set-generic-value
        </button>
        <button type='button' onClick={() => onData?.()}>
          sync-form-data
        </button>
      </div>
    ),
  };
});

jest.mock('@/components/ValidationIssueModal', () => ({
  __esModule: true,
  showValidationIssueModal: jest.fn(),
}));

const { showValidationIssueModal: mockShowValidationIssueModal } = jest.requireMock(
  '@/components/ValidationIssueModal',
);
const mockValidateVisibleFormFields = jest.fn();

jest.mock('@/pages/Utils/validation/formSupport', () => ({
  __esModule: true,
  validateVisibleFormFields: (...args: any[]) => mockValidateVisibleFormFields(...args),
}));

jest.mock('@/style/custom.less', () => ({
  __esModule: true,
  default: { footer_right: 'footer-right' },
}));

jest.mock('antd', () => {
  const React = require('react');
  const { toText } = require('../../../../../helpers/nodeToText');

  const Button = ({ children, onClick, disabled = false, icon, htmlType = 'button' }: any) => (
    <button
      type={htmlType === 'submit' ? 'submit' : htmlType === 'reset' ? 'reset' : 'button'}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
    >
      {icon}
      {toText(children)}
    </button>
  );

  const Tooltip = ({ children }: any) => <>{children}</>;

  const Drawer = ({ open, title, extra, footer, children, onClose, getContainer }: any) => {
    if (!open) return null;
    getContainer?.();
    const label = toText(title) || 'drawer';
    return (
      <section role='dialog' aria-label={label}>
        <header>
          <div>{extra}</div>
          <button type='button' onClick={onClose}>
            close
          </button>
        </header>
        <div>{children}</div>
        <footer>{footer}</footer>
      </section>
    );
  };

  const Space = ({ children, className }: any) => <div className={className ?? ''}>{children}</div>;

  const Spin = ({ spinning, children }: any) =>
    spinning ? <div data-testid='spin'>{children}</div> : <div>{children}</div>;

  const message = {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    loading: jest.fn(),
  };

  const App = { useApp: () => ({ message }) };

  return {
    __esModule: true,
    Button,
    Tooltip,
    Drawer,
    Space,
    Spin,
    App,
    message,
  };
});

const { message: mockAntdMessage } = jest.requireMock('antd');

let latestRefsDrawerProps: any = null;
const mockGetRefsOfCurrentVersion = jest.fn(async () => ({ oldRefs: [] }));
const mockGetRefsOfNewVersion = jest.fn(async () => ({ newRefs: [], oldRefs: [] }));
const mockUpdateRefsData = jest.fn((data: any) => data);

jest.mock('@ant-design/icons', () => ({
  __esModule: true,
  CloseOutlined: () => <span>close-icon</span>,
  InfoOutlined: () => <span>info-icon</span>,
}));

jest.mock('@/components/RefsOfNewVersionDrawer', () => ({
  __esModule: true,
  default: (props: any) => {
    latestRefsDrawerProps = props;
    if (!props.open) return null;
    return (
      <div data-testid='refs-drawer'>
        <button type='button' onClick={props.onKeep}>
          keep-current
        </button>
        <button type='button' onClick={() => props.onUpdate(props.dataSource)}>
          update-latest
        </button>
        <button type='button' onClick={props.onCancel}>
          cancel-refs
        </button>
      </div>
    );
  },
}));

jest.mock('@/pages/Utils/updateReference', () => ({
  __esModule: true,
  getRefsOfCurrentVersion: (...args: any[]) => mockGetRefsOfCurrentVersion(...args),
  getRefsOfNewVersion: (...args: any[]) => mockGetRefsOfNewVersion(...args),
  updateRefsData: (...args: any[]) => mockUpdateRefsData(...args),
}));

jest.mock('@ant-design/pro-components', () => {
  const React = require('react');

  const setNestedValue = (source: any, path: any[], value: any) => {
    const next = { ...source };
    let cursor = next;
    path.forEach((key: string, index: number) => {
      if (index === path.length - 1) {
        cursor[key] = value;
      } else {
        cursor[key] = { ...(cursor[key] ?? {}) };
        cursor = cursor[key];
      }
    });
    return next;
  };

  const getNestedValue = (source: any, path: any[]) => {
    return path.reduce((acc: any, key: string) => (acc ? acc[key] : undefined), source);
  };

  const buildChangedValue = (path: any[], value: any) => {
    return path.reduceRight((acc: any, key: string) => ({ [key]: acc }), value);
  };

  const ProForm = ({
    formRef,
    initialValues = {},
    onValuesChange,
    onFinish,
    submitter,
    children,
  }: any) => {
    const valuesRef = React.useRef({ ...initialValues });

    const setValue = (namePath: any[], value: any) => {
      valuesRef.current = setNestedValue(valuesRef.current, namePath, value);
      const changed = buildChangedValue(namePath, value);
      onValuesChange?.(changed, { ...valuesRef.current });
    };

    const api = {
      submit: async () => onFinish?.({ ...valuesRef.current }),
      resetFields: () => {
        valuesRef.current = { ...initialValues };
      },
      setFieldsValue: (next: any) => {
        valuesRef.current = { ...valuesRef.current, ...next };
      },
      getFieldsValue: () => ({ ...valuesRef.current }),
      setFieldValue: (name: any, value: any) => {
        const path = Array.isArray(name) ? name : [name];
        setValue(path, value);
      },
      getFieldValue: (name: any) => {
        const path = Array.isArray(name) ? name : [name];
        return getNestedValue(valuesRef.current, path);
      },
      validateFields: async () => valuesRef.current,
    };

    React.useLayoutEffect(() => {
      if (formRef) {
        formRef.current = api;
      }
    }, [formRef]);

    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onFinish?.({ ...valuesRef.current });
        }}
      >
        <button
          type='button'
          onClick={() =>
            onValuesChange?.(
              {},
              setNestedValue(valuesRef.current, ['modellingAndValidation', 'validation'], {
                review: [{ id: 'validation-review' }],
              }),
            )
          }
        >
          trigger-validation-change
        </button>
        <button
          type='button'
          onClick={() =>
            onValuesChange?.(
              {},
              setNestedValue(
                valuesRef.current,
                ['modellingAndValidation', 'complianceDeclarations'],
                {
                  compliance: [{ id: 'compliance-review' }],
                },
              ),
            )
          }
        >
          trigger-compliance-change
        </button>
        {typeof children === 'function' ? children(valuesRef.current) : children}
        {submitter?.render?.() ?? null}
      </form>
    );
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const ProTable = ({ dataSource, columns, rowSelection, pagination, loading }: any) => {
    return (
      <div data-testid='pro-table'>
        {dataSource?.map((row: any, idx: number) => (
          <div key={row.key || idx} data-testid={`table-row-${idx}`}>
            {columns?.map((col: any, colIdx: number) => (
              <div key={colIdx} data-testid={`table-cell-${col.dataIndex || colIdx}`}>
                {col.render ? col.render(row[col.dataIndex], row, idx) : row[col.dataIndex]}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  };

  return {
    __esModule: true,
    ProForm,
    ProFormInstance: {},
    ProTable,
    ActionType: {},
  };
});

const mockCheckReferences = jest.fn();
const mockCheckRequiredFields = jest.fn().mockReturnValue({ checkResult: true, tabName: '' });
const mockDealModel = jest.fn((modelDetail, unReview) => {
  // 模拟 dealModel 的行为：如果 stateCode < 20，添加到 unReview
  if (modelDetail?.stateCode < 20) {
    unReview.push({
      '@type': 'lifeCycleModel data set',
      '@refObjectId': modelDetail?.id,
      '@version': modelDetail?.version,
    });
  }
  // 处理 submodels（模拟被注释掉的逻辑）
  if (modelDetail?.json_tg?.submodels) {
    modelDetail.json_tg.submodels.forEach((item: any) => {
      unReview.push({
        '@refObjectId': item.id,
        '@version': modelDetail?.version,
        '@type': 'process data set',
      });
    });
  }
});
const mockDealProcress = jest.fn();
const mockCheckVersions = jest.fn().mockResolvedValue(undefined);
const mockBuildValidationIssues = jest.fn().mockReturnValue([]);
const mockEnrichValidationIssuesWithOwner = jest.fn(async (issues: any[]) => issues);
const mockGetAllRefObj = jest.fn().mockReturnValue([]);
const mockSubmitDatasetReview = jest.fn().mockResolvedValue({
  data: [{ review: { id: 'review-1' } }],
});
const mockGetErrRefTab = jest.fn().mockReturnValue(null);
const mockMapValidationIssuesToRefCheckData = jest.fn().mockReturnValue([]);
const mockValidateDatasetWithSdk = jest.fn().mockReturnValue({ success: true, issues: [] });

function MockReffPath() {}
MockReffPath.prototype.findProblemNodes = function () {
  return [];
};

jest.mock('@/pages/Utils/review', () => ({
  __esModule: true,
  buildValidationIssues: (...args: any[]) => mockBuildValidationIssues(...args),
  checkReferences: (...args: any[]) => mockCheckReferences(...args),
  checkVersions: (...args: any[]) => mockCheckVersions(...args),
  checkRequiredFields: (...args: any[]) => mockCheckRequiredFields(...args),
  collectValidationIssueRefTabNames: ({ refs, resolveTabName }: any) => {
    const tabNames: string[] = [];
    const tabNamesByKey = new Map<string, string[]>();

    refs.forEach((ref: any) => {
      const tabName = resolveTabName(ref);
      if (!tabName) return;
      if (!tabNames.includes(tabName)) tabNames.push(tabName);
      const key = `${ref['@type']}:${ref['@refObjectId']}:${ref['@version']}`;
      const refTabNames = tabNamesByKey.get(key) ?? [];
      if (!refTabNames.includes(tabName)) tabNamesByKey.set(key, [...refTabNames, tabName]);
    });

    return {
      getRefTabNames: (ref: any) =>
        tabNamesByKey.get(`${ref['@type']}:${ref['@refObjectId']}:${ref['@version']}`),
      tabNames,
    };
  },
  dealModel: (...args: any[]) => mockDealModel(...args),
  dealProcress: (...args: any[]) => mockDealProcress(...args),
  enrichValidationIssuesWithOwner: (...args: any[]) => mockEnrichValidationIssuesWithOwner(...args),
  getAllRefObj: (...args: any[]) => mockGetAllRefObj(...args),
  getErrRefTab: (...args: any[]) => mockGetErrRefTab(...args),
  mapValidationIssuesToRefCheckData: (...args: any[]) =>
    mockMapValidationIssuesToRefCheckData(...args),
  ReffPath: MockReffPath,
  submitDatasetReview: (...args: any[]) => mockSubmitDatasetReview(...args),
  validateDatasetWithSdk: (...args: any[]) => mockValidateDatasetWithSdk(...args),
}));

const mockGetLifeCycleModelDetail = jest.fn();
jest.mock('@/services/lifeCycleModels/api', () => ({
  __esModule: true,
  getLifeCycleModelDetail: (...args: any[]) => mockGetLifeCycleModelDetail(...args),
}));

const mockGetProcessDetail = jest.fn();
jest.mock('@/services/processes/api', () => ({
  __esModule: true,
  getProcessDetail: (...args: any[]) => mockGetProcessDetail(...args),
}));

const mockNormalizeLangPayloadForSave = jest.fn();
jest.mock('@/services/general/api', () => ({
  __esModule: true,
  normalizeLangPayloadForSave: (...args: any[]) => mockNormalizeLangPayloadForSave(...args),
}));

const mockGetUserTeamId = jest.fn().mockResolvedValue('team-1');
jest.mock('@/services/roles/api', () => ({
  __esModule: true,
  getUserTeamId: (...args: any[]) => mockGetUserTeamId(...args),
}));

const mockGetLang = jest.fn((locale: string) => (locale === 'zh-CN' ? 'zh' : 'en'));
const mockGetLangText = jest.fn((langTexts: any, lang: string) => {
  if (Array.isArray(langTexts)) {
    const filterList = langTexts.filter((i) => i && i['@xml:lang'] && i['@xml:lang'] === lang);
    if (filterList.length > 0) {
      return filterList[0]['#text'] ?? '-';
    }
    const filterListEn = langTexts.filter((i) => i && i['@xml:lang'] && i['@xml:lang'] === 'en');
    if (filterListEn.length > 0) {
      return filterListEn[0]['#text'] ?? '-';
    }
    return langTexts[0]?.['#text'] ?? '-';
  }
  return langTexts?.['#text'] ?? '-';
});
jest.mock('@/services/general/util', () => ({
  jsonToList: (value: any) =>
    value === null || value === undefined ? [] : Array.isArray(value) ? value : [value],
  __esModule: true,
  getLang: (...args: any[]) => mockGetLang(...args),
  getLangText: (...args: any[]) => mockGetLangText(...args),
}));

const mockGenLifeCycleModelJsonOrdered = jest.fn().mockReturnValue({});
const mockGenReferenceToResultingProcess = jest.fn();
jest.mock('@/services/lifeCycleModels/util', () => ({
  __esModule: true,
  genLifeCycleModelJsonOrdered: (...args: any[]) => mockGenLifeCycleModelJsonOrdered(...args),
  genReferenceToResultingProcess: (...args: any[]) => mockGenReferenceToResultingProcess(...args),
}));

const mockGenLifeCycleModelProcesses = jest.fn();
jest.mock('@/services/lifeCycleModels/util_calculate', () => ({
  __esModule: true,
  genLifeCycleModelProcesses: (...args: any[]) => mockGenLifeCycleModelProcesses(...args),
}));

jest.mock('uuid', () => ({
  __esModule: true,
  v4: () => 'uuid-1',
}));

jest.mock(
  '@tiangong-lca/tidas-sdk',
  () => ({
    __esModule: true,
    createLifeCycleModel: jest.fn(() => ({
      validateEnhanced: jest.fn(() => ({ success: true, error: { issues: [] } })),
      lifeCycleModelDataSet: {
        lifeCycleModelInformation: {
          dataSetInformation: {},
        },
      },
    })),
  }),
  { virtual: true },
);

beforeEach(() => {
  Object.values(mockAntdMessage).forEach((fn) => fn.mockReset());
  mockShowValidationIssueModal.mockReset();
  mockValidateVisibleFormFields.mockReset().mockResolvedValue(undefined);
  latestRefsDrawerProps = null;
  mockCheckReferences.mockReset();
  mockCheckRequiredFields.mockReset().mockReturnValue({ checkResult: true, tabName: '' });
  mockDealModel.mockReset();
  mockDealProcress.mockReset();
  mockCheckVersions.mockReset().mockResolvedValue(undefined);
  mockBuildValidationIssues.mockReset().mockReturnValue([]);
  mockEnrichValidationIssuesWithOwner
    .mockReset()
    .mockImplementation(async (issues: any[]) => issues);
  mockGetAllRefObj.mockReset().mockReturnValue([]);
  mockGetErrRefTab.mockReset().mockReturnValue(null);
  mockMapValidationIssuesToRefCheckData.mockReset().mockReturnValue([]);
  mockValidateDatasetWithSdk.mockReset().mockReturnValue({ success: true, issues: [] });
  mockGetLifeCycleModelDetail.mockReset();
  mockGetProcessDetail.mockReset();
  mockNormalizeLangPayloadForSave.mockReset().mockImplementation(async (payload: any) => ({
    payload,
  }));
  mockGetUserTeamId.mockReset().mockResolvedValue('team-1');
  mockGenLifeCycleModelJsonOrdered.mockReset().mockReturnValue({});
  mockGenReferenceToResultingProcess
    .mockReset()
    .mockImplementation((_processes: any, _version: string, payload: any) => payload);
  mockGenLifeCycleModelProcesses.mockReset().mockResolvedValue({
    lifeCycleModelProcesses: [],
    up2DownEdges: [],
  });
  mockGetRefsOfCurrentVersion.mockReset().mockResolvedValue({ oldRefs: [] });
  mockGetRefsOfNewVersion.mockReset().mockResolvedValue({ newRefs: [], oldRefs: [] });
  mockUpdateRefsData.mockReset().mockImplementation((data: any) => data);
  mockSubmitDatasetReview.mockReset().mockResolvedValue({
    data: [{ review: { id: 'review-1' } }],
  });
});

describe('ToolbarEditInfo', () => {
  const baseProps = {
    lang: 'en',
    data: { id: 'model-1', version: '1.0' },
    onData: jest.fn(),
    action: 'edit',
  };
  const createModelDetail = (overrides: Record<string, any> = {}) => ({
    success: true,
    data: {
      id: 'model-1',
      version: '1.0',
      stateCode: 10,
      teamId: 'team-1',
      json_tg: {
        xflow: { nodes: [], edges: [] },
        submodels: [{ id: 'model-1', version: '1.0', type: 'primary' }],
      },
      json: {
        lifeCycleModelDataSet: {
          lifeCycleModelInformation: { dataSetInformation: { name: {} } },
        },
      },
      ruleVerification: [],
      ...overrides,
    },
  });

  it('validates missing nodes when checking data', async () => {
    const ref = React.createRef<any>();
    render(<ToolbarEditInfo ref={ref} {...baseProps} />);

    let result;
    await act(async () => {
      result = await ref.current?.handleCheckData('checkData', [], []);
    });

    expect(mockAntdMessage.error).toHaveBeenCalledWith('Please add node');
    expect(result).toEqual({ checkResult: false, unReview: [] });
    expect(mockGetLifeCycleModelDetail).not.toHaveBeenCalled();
  });

  it('allows validation to continue when nodes are provided without edges', async () => {
    const ref = React.createRef<any>();
    mockGetLifeCycleModelDetail.mockResolvedValue(createModelDetail());
    mockGetProcessDetail.mockResolvedValue({});
    mockCheckReferences.mockResolvedValue({ findProblemNodes: () => [] });
    render(<ToolbarEditInfo ref={ref} {...baseProps} />);

    const nodes = [{ data: { quantitativeReference: '1', id: 'proc-1', version: '1.0' } }];
    let result;
    await act(async () => {
      result = await ref.current?.handleCheckData('checkData', nodes, []);
    });

    expect(mockGetLifeCycleModelDetail).toHaveBeenCalledWith('model-1', '1.0');
    expect(result?.checkResult).toBe(true);
  });

  it('validates that one node must be selected as the quantitative reference', async () => {
    const ref = React.createRef<any>();
    render(<ToolbarEditInfo ref={ref} {...baseProps} />);

    const nodes = [{ data: { quantitativeReference: '0', id: 'proc-1', version: '1.0' } }];
    let result;
    await act(async () => {
      result = await ref.current?.handleCheckData('checkData', nodes, [{}]);
    });

    expect(mockAntdMessage.error).toHaveBeenCalledWith('Please select a node as reference');
    expect(result).toEqual({ checkResult: false, unReview: [] });
    expect(mockGetLifeCycleModelDetail).not.toHaveBeenCalled();
  });

  it('submits form data on save', async () => {
    const onData = jest.fn();
    const ref = React.createRef<any>();
    render(<ToolbarEditInfo ref={ref} {...baseProps} onData={onData} />);

    await userEvent.click(screen.getByRole('button', { name: 'info-icon' }));
    expect(
      await screen.findByRole('dialog', { name: 'Model base information' }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onData).toHaveBeenCalledWith(expect.any(Object));
    expect(
      screen.queryByRole('dialog', { name: 'Model base information' }),
    ).not.toBeInTheDocument();
  });

  it('opens the refs drawer and keeps the current reference versions', async () => {
    mockGetRefsOfNewVersion.mockResolvedValue({
      newRefs: [{ id: 'new-ref', version: '2.0.0' }],
      oldRefs: [{ id: 'old-ref', version: '1.0.0' }],
    });

    render(<ToolbarEditInfo {...baseProps} />);

    await userEvent.click(screen.getByRole('button', { name: 'info-icon' }));
    await screen.findByRole('dialog', { name: 'Model base information' });

    await userEvent.click(screen.getByRole('button', { name: 'Update Reference' }));

    expect(await screen.findByTestId('refs-drawer')).toBeInTheDocument();
    expect(latestRefsDrawerProps.dataSource).toEqual([{ id: 'new-ref', version: '2.0.0' }]);

    await userEvent.click(screen.getByRole('button', { name: 'keep-current' }));

    expect(mockUpdateRefsData).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'model-1', version: '1.0' }),
      [{ id: 'old-ref', version: '1.0.0' }],
      false,
    );
    expect(screen.queryByTestId('refs-drawer')).not.toBeInTheDocument();
  });

  it('updates to the latest reference versions from the refs drawer', async () => {
    mockGetRefsOfNewVersion.mockResolvedValue({
      newRefs: [{ id: 'new-ref', version: '2.0.0' }],
      oldRefs: [{ id: 'old-ref', version: '1.0.0' }],
    });

    render(<ToolbarEditInfo {...baseProps} />);

    await userEvent.click(screen.getByRole('button', { name: 'info-icon' }));
    await screen.findByRole('dialog', { name: 'Model base information' });

    await userEvent.click(screen.getByRole('button', { name: 'Update Reference' }));
    expect(await screen.findByTestId('refs-drawer')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'update-latest' }));

    expect(mockUpdateRefsData).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'model-1', version: '1.0' }),
      [{ id: 'new-ref', version: '2.0.0' }],
      true,
    );
    expect(screen.queryByTestId('refs-drawer')).not.toBeInTheDocument();
  });

  it('updates references inline when no newer versions are available', async () => {
    mockGetRefsOfNewVersion.mockResolvedValue({
      newRefs: [],
      oldRefs: [{ id: 'old-ref', version: '1.0.0' }],
    });

    render(<ToolbarEditInfo {...baseProps} />);

    await userEvent.click(screen.getByRole('button', { name: 'info-icon' }));
    await screen.findByRole('dialog', { name: 'Model base information' });

    await userEvent.click(screen.getByRole('button', { name: 'Update Reference' }));

    await screen.findByRole('dialog', { name: 'Model base information' });
    expect(mockUpdateRefsData).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'model-1', version: '1.0' }),
      [{ id: 'old-ref', version: '1.0.0' }],
      false,
    );
    expect(screen.queryByTestId('refs-drawer')).not.toBeInTheDocument();
  });

  it('updates reference descriptions through the imperative handle', async () => {
    const ref = React.createRef<any>();

    render(<ToolbarEditInfo ref={ref} {...baseProps} />);

    await act(async () => {
      await ref.current?.updateReferenceDescription({
        id: 'model-1',
        version: '1.0',
        lifeCycleModelInformation: { dataSetInformation: { name: { en: 'model' } } },
      });
    });

    expect(mockGetRefsOfCurrentVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'model-1',
        version: '1.0',
      }),
    );
    expect(mockUpdateRefsData).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'model-1',
        version: '1.0',
      }),
      [],
      false,
    );
  });

  it('merges validation tab data into reference updates', async () => {
    const ref = React.createRef<any>();

    render(<ToolbarEditInfo ref={ref} {...baseProps} />);

    await userEvent.click(screen.getByRole('button', { name: 'info-icon' }));
    await screen.findByRole('dialog', { name: 'Model base information' });

    await userEvent.click(screen.getByRole('button', { name: 'switch-validation' }));
    await waitFor(() => expect(screen.getByTestId('active-tab')).toHaveTextContent('validation'));
    await userEvent.click(screen.getByRole('button', { name: 'set-validation-value' }));
    await userEvent.click(screen.getByRole('button', { name: 'sync-form-data' }));
    await act(async () => {
      await ref.current?.updateReferenceDescription({ id: 'model-1', version: '1.0' });
    });

    expect(mockGetRefsOfCurrentVersion).toHaveBeenLastCalledWith(
      expect.objectContaining({
        modellingAndValidation: expect.objectContaining({
          validation: { review: [{ id: 'validation-review' }] },
        }),
      }),
    );
  });

  it('handles validation tab value changes through the form value change handler', async () => {
    render(<ToolbarEditInfo {...baseProps} />);

    await userEvent.click(screen.getByRole('button', { name: 'info-icon' }));
    await screen.findByRole('dialog', { name: 'Model base information' });

    await userEvent.click(screen.getByRole('button', { name: 'switch-validation' }));
    await waitFor(() => expect(screen.getByTestId('active-tab')).toHaveTextContent('validation'));
    await userEvent.click(screen.getByRole('button', { name: 'trigger-validation-change' }));

    expect(screen.getByTestId('active-tab')).toHaveTextContent('validation');
  });

  it('merges compliance tab data into reference updates', async () => {
    const ref = React.createRef<any>();

    render(<ToolbarEditInfo ref={ref} {...baseProps} />);

    await userEvent.click(screen.getByRole('button', { name: 'info-icon' }));
    await screen.findByRole('dialog', { name: 'Model base information' });

    await userEvent.click(screen.getByRole('button', { name: 'switch-compliance' }));
    await waitFor(() =>
      expect(screen.getByTestId('active-tab')).toHaveTextContent('complianceDeclarations'),
    );
    await userEvent.click(screen.getByRole('button', { name: 'set-compliance-value' }));
    await userEvent.click(screen.getByRole('button', { name: 'sync-form-data' }));
    await act(async () => {
      await ref.current?.updateReferenceDescription({ id: 'model-1', version: '1.0' });
    });

    expect(mockGetRefsOfCurrentVersion).toHaveBeenLastCalledWith(
      expect.objectContaining({
        modellingAndValidation: expect.objectContaining({
          complianceDeclarations: { compliance: [{ id: 'compliance-review' }] },
        }),
      }),
    );
  });

  it('handles compliance tab value changes through the form value change handler', async () => {
    render(<ToolbarEditInfo {...baseProps} />);

    await userEvent.click(screen.getByRole('button', { name: 'info-icon' }));
    await screen.findByRole('dialog', { name: 'Model base information' });

    await userEvent.click(screen.getByRole('button', { name: 'switch-compliance' }));
    await waitFor(() =>
      expect(screen.getByTestId('active-tab')).toHaveTextContent('complianceDeclarations'),
    );
    await userEvent.click(screen.getByRole('button', { name: 'trigger-compliance-change' }));

    expect(screen.getByTestId('active-tab')).toHaveTextContent('complianceDeclarations');
  });

  it('merges generic tab data into reference updates', async () => {
    const ref = React.createRef<any>();

    render(<ToolbarEditInfo ref={ref} {...baseProps} />);

    await userEvent.click(screen.getByRole('button', { name: 'info-icon' }));
    await screen.findByRole('dialog', { name: 'Model base information' });

    await userEvent.click(screen.getByRole('button', { name: 'set-generic-value' }));
    await userEvent.click(screen.getByRole('button', { name: 'sync-form-data' }));
    await act(async () => {
      await ref.current?.updateReferenceDescription({ id: 'model-1', version: '1.0' });
    });

    expect(mockGetRefsOfCurrentVersion).toHaveBeenLastCalledWith(
      expect.objectContaining({
        lifeCycleModelInformation: {
          dataSetInformation: {
            name: {
              en: 'generic-name',
            },
          },
        },
      }),
    );
  });

  it('falls back to an empty object when syncing a generic tab without form data', async () => {
    const ref = React.createRef<any>();

    render(<ToolbarEditInfo ref={ref} {...baseProps} />);

    await userEvent.click(screen.getByRole('button', { name: 'info-icon' }));
    await screen.findByRole('dialog', { name: 'Model base information' });

    await userEvent.click(screen.getByRole('button', { name: 'switch-technology' }));
    await waitFor(() => expect(screen.getByTestId('active-tab')).toHaveTextContent('technology'));
    await userEvent.click(screen.getByRole('button', { name: 'sync-form-data' }));
    await act(async () => {
      await ref.current?.updateReferenceDescription({ id: 'model-1', version: '1.0' });
    });

    expect(mockGetRefsOfCurrentVersion).toHaveBeenLastCalledWith(
      expect.objectContaining({
        technology: {},
      }),
    );
  });

  it('returns review metadata when nodes and edges pass validation', async () => {
    const ref = React.createRef<any>();
    const problemNodes = [
      { '@refObjectId': 'proc-3', '@version': '2.0', ruleVerification: [], nonExistent: false },
    ];

    const mockModelDetail = {
      data: {
        id: 'model-1',
        version: '1.0',
        stateCode: 10, // stateCode < 20，会被添加到 unReview
        teamId: 'team-1',
        json_tg: { xflow: { nodes: [], edges: [] } },
        json: {
          lifeCycleModelDataSet: {
            lifeCycleModelInformation: { dataSetInformation: { name: {} } },
          },
        },
        ruleVerification: [],
      },
      success: true,
    };
    // 代码第 223 行检查 modelDetail.stateCode，所以需要在 modelDetail 上也添加 stateCode
    (mockModelDetail as any).stateCode = 10;
    mockGetLifeCycleModelDetail.mockResolvedValue(mockModelDetail);
    mockGetProcessDetail.mockResolvedValue({ data: {} });
    mockCheckReferences.mockResolvedValue({ findProblemNodes: () => problemNodes });

    render(<ToolbarEditInfo ref={ref} {...baseProps} />);

    const nodes = [
      { data: { quantitativeReference: '1', id: 'proc-1', version: '1.0' } },
      { data: { quantitativeReference: '0', id: 'proc-2', version: '1.0' } },
    ];
    const edges = [{}];

    let result;
    await act(async () => {
      result = await ref.current?.handleCheckData('checkData', nodes, edges);
    });

    expect(mockGetLifeCycleModelDetail).toHaveBeenCalledWith('model-1', '1.0');
    expect(mockGetProcessDetail).not.toHaveBeenCalled();
    expect(mockCheckReferences).toHaveBeenCalled();
    expect(mockGenLifeCycleModelJsonOrdered).toHaveBeenCalled();
    expect(mockGetUserTeamId).toHaveBeenCalled();
    expect(mockDealModel).toHaveBeenCalled();
    expect(mockDealProcress).not.toHaveBeenCalled();
    expect(mockAntdMessage.error).toHaveBeenCalledWith('Data check failed, please check the data!');
    expect(result.checkResult).toBe(false);
    expect(Array.isArray(result.unReview)).toBe(true);
  });

  it('continues data check when the lifecycle model detail cannot be loaded', async () => {
    const ref = React.createRef<any>();
    mockGetLifeCycleModelDetail.mockResolvedValue({ success: false });
    mockGetProcessDetail.mockResolvedValue(undefined);
    mockCheckReferences.mockResolvedValue({ findProblemNodes: () => [] });

    render(<ToolbarEditInfo ref={ref} {...baseProps} />);

    const nodes = [{ data: { quantitativeReference: '1', id: 'proc-1', version: '1.0' } }];
    let result;
    await act(async () => {
      result = await ref.current?.handleCheckData('checkData', nodes, [{}]);
    });

    expect(mockAntdMessage.error).not.toHaveBeenCalledWith(
      'Data check failed, please check the data!',
    );
    expect(result).toEqual({ checkResult: true, problemNodes: [], unReview: [] });
  });

  it('falls back to empty id and version when the current model identity is missing', async () => {
    const ref = React.createRef<any>();
    mockGetLifeCycleModelDetail.mockResolvedValue(createModelDetail());
    mockGetProcessDetail.mockResolvedValue({});
    mockCheckReferences.mockResolvedValue({ findProblemNodes: () => [] });

    render(<ToolbarEditInfo ref={ref} {...baseProps} data={{}} />);

    const nodes = [{ data: { quantitativeReference: '1', id: 'proc-1', version: '1.0' } }];
    let result;
    await act(async () => {
      result = await ref.current?.handleCheckData('checkData', nodes, [{}]);
    });

    expect(mockGetLifeCycleModelDetail).toHaveBeenCalledWith('', '');
    expect(mockGenLifeCycleModelJsonOrdered).toHaveBeenCalledWith('', expect.any(Object));
    expect(mockGetProcessDetail).toHaveBeenCalledWith('model-1', '1.0');
    expect(mockCheckReferences).toHaveBeenCalledTimes(1);
    expect(result.checkResult).toBe(true);
  });

  it('prefers the saved validation snapshot when building sdk validation input', async () => {
    const ref = React.createRef<any>();
    mockGetLifeCycleModelDetail.mockResolvedValue(
      createModelDetail({
        json_tg: {
          xflow: { nodes: [], edges: [] },
          submodels: [
            { id: 'sub-1', type: 'secondary' },
            { id: 'model-saved', version: '2.0', type: 'primary' },
          ],
        },
      }),
    );
    mockGetProcessDetail.mockResolvedValue({});
    mockCheckReferences.mockResolvedValue({ findProblemNodes: () => [] });
    const finalOrderedJson = {
      lifeCycleModelDataSet: {
        finalized: true,
      },
    };
    const nodes = [{ data: { quantitativeReference: '1', id: 'proc-1', version: '1.0' } }];
    const validationSnapshot = {
      modelId: 'model-saved',
      version: '2.0',
      payload: {
        lifeCycleModelInformation: {
          dataSetInformation: {
            name: {
              baseName: { en: 'saved-model' },
            },
          },
        },
        model: {
          nodes: [{ id: 'snapshot-node' }],
          edges: [{ id: 'snapshot-edge' }],
        },
      },
    };
    const rawOrderedJson = {
      lifeCycleModelDataSet: validationSnapshot.payload,
    };
    mockGenLifeCycleModelJsonOrdered.mockReturnValue(rawOrderedJson);
    mockGenLifeCycleModelProcesses.mockResolvedValue({
      lifeCycleModelProcesses: [{ modelInfo: { id: 'primary-process' } }],
      up2DownEdges: [],
    });
    mockGenReferenceToResultingProcess.mockReturnValue(finalOrderedJson);

    render(<ToolbarEditInfo ref={ref} {...baseProps} />);

    await act(async () => {
      await ref.current?.handleCheckData('checkData', nodes, [], {
        validationSnapshot,
      });
    });

    expect(mockGetLifeCycleModelDetail).toHaveBeenCalledWith('model-saved', '2.0');
    expect(mockGetProcessDetail).toHaveBeenCalledWith('model-saved', '2.0');
    expect(mockGenLifeCycleModelJsonOrdered).toHaveBeenCalledWith(
      'model-saved',
      validationSnapshot.payload,
    );
    expect(mockNormalizeLangPayloadForSave).not.toHaveBeenCalled();
    expect(mockGenLifeCycleModelProcesses).not.toHaveBeenCalled();
    expect(mockGenReferenceToResultingProcess).not.toHaveBeenCalled();
    expect(mockValidateDatasetWithSdk).toHaveBeenCalledWith(
      'lifeCycleModel data set',
      rawOrderedJson,
    );
  });

  it('revalidates metadata fields after opening the base info drawer for sdk errors without revalidating on tab switch', async () => {
    const ref = React.createRef<any>();
    mockGetLifeCycleModelDetail.mockResolvedValue(createModelDetail());
    mockGetProcessDetail.mockResolvedValue({});
    mockCheckReferences.mockResolvedValue({ findProblemNodes: () => [] });
    mockValidateDatasetWithSdk.mockReturnValue({
      success: false,
      issues: [
        {
          code: 'required_missing',
          path: [
            'lifeCycleModelDataSet',
            'lifeCycleModelInformation',
            'dataSetInformation',
            'name',
            'baseName',
          ],
        },
      ],
    });

    render(<ToolbarEditInfo ref={ref} {...baseProps} />);

    const nodes = [{ data: { quantitativeReference: '1', id: 'proc-1', version: '1.0' } }];
    await act(async () => {
      await ref.current?.handleCheckData('checkData', nodes, []);
    });

    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Model base information' })).toBeInTheDocument(),
    );
    await waitFor(() => expect(mockValidateVisibleFormFields).toHaveBeenCalledTimes(2));

    await userEvent.click(screen.getByRole('button', { name: 'switch-validation' }));
    await waitFor(() => expect(screen.getByTestId('active-tab')).toHaveTextContent('validation'));
    expect(mockValidateVisibleFormFields).toHaveBeenCalledTimes(2);
  });

  it('uses structuredClone while falling back to raw sdk validation payloads and empty model nodes', async () => {
    const ref = React.createRef<any>();
    const originalStructuredClone = global.structuredClone;
    const structuredCloneSpy = jest.fn((value) => JSON.parse(JSON.stringify(value)));
    global.structuredClone = structuredCloneSpy as typeof structuredClone;

    try {
      const rawOrderedJson = {
        lifeCycleModelDataSet: {
          lifeCycleModelInformation: {
            dataSetInformation: {
              name: {
                baseName: { en: 'raw-model' },
              },
            },
          },
        },
      };

      mockGetLifeCycleModelDetail.mockResolvedValue(createModelDetail({ json_tg: undefined }));
      mockGetProcessDetail.mockResolvedValue({});
      mockCheckReferences.mockResolvedValue({ findProblemNodes: () => [] });
      mockGenLifeCycleModelJsonOrdered.mockReturnValue(rawOrderedJson);
      mockNormalizeLangPayloadForSave.mockResolvedValue(undefined);

      render(<ToolbarEditInfo ref={ref} {...baseProps} />);

      const nodes = [{ data: { quantitativeReference: '1', id: 'proc-1', version: '1.0' } }];
      await act(async () => {
        await ref.current?.handleCheckData('checkData', nodes, [{}]);
      });

      expect(structuredCloneSpy).not.toHaveBeenCalled();
      expect(mockGenLifeCycleModelProcesses).not.toHaveBeenCalled();
      expect(mockGenReferenceToResultingProcess).not.toHaveBeenCalled();
      expect(mockValidateDatasetWithSdk).toHaveBeenCalledWith(
        'lifeCycleModel data set',
        rawOrderedJson,
      );
    } finally {
      global.structuredClone = originalStructuredClone;
    }
  });

  it('returns an undefined sdk validation dataset directly when ordered payload generation is empty', async () => {
    const ref = React.createRef<any>();
    const originalStructuredClone = global.structuredClone;
    // @ts-expect-error exercising the JSON-clone undefined fast path
    delete global.structuredClone;

    try {
      mockGetLifeCycleModelDetail.mockResolvedValue(createModelDetail({ json_tg: undefined }));
      mockGetProcessDetail.mockResolvedValue({});
      mockCheckReferences.mockResolvedValue({ findProblemNodes: () => [] });
      mockGenLifeCycleModelJsonOrdered.mockReturnValue(undefined);
      mockNormalizeLangPayloadForSave.mockResolvedValue(undefined);

      render(<ToolbarEditInfo ref={ref} {...baseProps} />);

      const nodes = [{ data: { quantitativeReference: '1', id: 'proc-1', version: '1.0' } }];
      let result;
      await act(async () => {
        result = await ref.current?.handleCheckData('checkData', nodes, [{}]);
      });

      expect(mockGenReferenceToResultingProcess).not.toHaveBeenCalled();
      expect(mockValidateDatasetWithSdk).toHaveBeenCalledWith('lifeCycleModel data set', undefined);
      expect(result.checkResult).toBe(true);
    } finally {
      global.structuredClone = originalStructuredClone;
    }
  });

  it('blocks data check when the lifecycle model itself is already under review', async () => {
    const ref = React.createRef<any>();
    mockGetLifeCycleModelDetail.mockResolvedValue({
      success: true,
      data: {
        id: 'model-1',
        version: '1.0',
        stateCode: 30,
        teamId: 'team-1',
        json_tg: { xflow: { nodes: [], edges: [] } },
        json: {
          lifeCycleModelDataSet: {
            lifeCycleModelInformation: { dataSetInformation: { name: {} } },
          },
        },
        ruleVerification: [],
      },
    });

    render(<ToolbarEditInfo ref={ref} {...baseProps} />);

    const nodes = [{ data: { quantitativeReference: '1', id: 'proc-1', version: '1.0' } }];
    let result;
    await act(async () => {
      result = await ref.current?.handleCheckData('checkData', nodes, [{}]);
    });

    expect(mockAntdMessage.error).toHaveBeenCalledWith(
      'This data set is under review and cannot be validated',
    );
    expect(result).toEqual({ checkResult: false, unReview: [] });
  });

  it('allows review when the exact referenced data version is already under review', async () => {
    const ref = React.createRef<any>();
    mockGetLifeCycleModelDetail.mockResolvedValue({
      success: true,
      data: {
        id: 'model-1',
        version: '1.0',
        stateCode: 10,
        teamId: 'team-1',
        json_tg: { xflow: { nodes: [], edges: [] } },
        json: {
          lifeCycleModelDataSet: {
            lifeCycleModelInformation: { dataSetInformation: { name: {} } },
          },
        },
        ruleVerification: [],
      },
    });
    mockGetProcessDetail.mockResolvedValue({ data: {} });
    mockDealModel.mockImplementation((_modelDetail: any, _unReview: any[], underReview: any[]) => {
      underReview.push({
        '@refObjectId': 'flow-1',
        '@version': '1.0',
        '@type': 'flow data set',
      });
    });
    mockCheckReferences.mockResolvedValue({
      findProblemNodes: () => [],
    });

    render(<ToolbarEditInfo ref={ref} {...baseProps} />);

    const nodes = [{ data: { quantitativeReference: '1', id: 'proc-1', version: '1.0' } }];
    let result;
    await act(async () => {
      result = await ref.current?.handleCheckData('review', nodes, [{}]);
    });

    expect(mockBuildValidationIssues).toHaveBeenCalledWith(
      expect.objectContaining({
        actionFrom: 'review',
        problemNodes: [],
      }),
    );
    expect(result.checkResult).toBe(true);
    expect(result.problemNodes).toEqual([]);
  });

  it('blocks review when referenced process or model versions are already under review', async () => {
    const ref = React.createRef<any>();
    mockGetLifeCycleModelDetail.mockResolvedValue(createModelDetail());
    mockGetProcessDetail.mockResolvedValue({});
    mockCheckReferences.mockResolvedValue({
      findProblemNodes: () => [
        {
          '@refObjectId': 'model-ref',
          '@version': '1.0',
          '@type': 'lifeCycleModel data set',
          underReviewVersion: '2.0',
        },
        {
          '@refObjectId': 'process-ref',
          '@version': '3.0',
          '@type': 'process data set',
          underReviewVersion: '4.0',
        },
      ],
    });

    render(<ToolbarEditInfo ref={ref} {...baseProps} />);

    const nodes = [{ data: { quantitativeReference: '1', id: 'proc-1', version: '1.0' } }];
    let result;
    await act(async () => {
      result = await ref.current?.handleCheckData('review', nodes, [{}]);
    });

    expect(mockBuildValidationIssues).toHaveBeenCalledWith(
      expect.objectContaining({
        actionFrom: 'review',
        problemNodes: expect.arrayContaining([
          expect.objectContaining({
            '@refObjectId': 'model-ref',
            underReviewVersion: '2.0',
          }),
          expect.objectContaining({
            '@refObjectId': 'process-ref',
            underReviewVersion: '4.0',
          }),
        ]),
      }),
    );
    expect(result.checkResult).toBe(false);
    expect(result.problemNodes).toHaveLength(2);
  });

  it('blocks review when referenced process or model versions are older than published TG versions', async () => {
    const ref = React.createRef<any>();
    mockGetLifeCycleModelDetail.mockResolvedValue(createModelDetail());
    mockGetProcessDetail.mockResolvedValue({});
    mockCheckReferences.mockResolvedValue({
      findProblemNodes: () => [
        {
          '@refObjectId': 'model-ref',
          '@version': '1.0',
          '@type': 'lifeCycleModel data set',
          versionIsInTg: true,
        },
        {
          '@refObjectId': 'process-ref',
          '@version': '3.0',
          '@type': 'process data set',
          versionIsInTg: true,
        },
      ],
    });

    render(<ToolbarEditInfo ref={ref} {...baseProps} />);

    const nodes = [{ data: { quantitativeReference: '1', id: 'proc-1', version: '1.0' } }];
    let result;
    await act(async () => {
      result = await ref.current?.handleCheckData('review', nodes, [{}]);
    });

    expect(mockBuildValidationIssues).toHaveBeenCalledWith(
      expect.objectContaining({
        actionFrom: 'review',
        problemNodes: expect.arrayContaining([
          expect.objectContaining({
            '@refObjectId': 'model-ref',
            versionIsInTg: true,
          }),
          expect.objectContaining({
            '@refObjectId': 'process-ref',
            versionIsInTg: true,
          }),
        ]),
      }),
    );
    expect(result.checkResult).toBe(false);
    expect(result.problemNodes).toHaveLength(2);
  });

  it('submits a review successfully through the imperative handle', async () => {
    const ref = React.createRef<any>();
    mockGetLifeCycleModelDetail.mockResolvedValue({
      success: true,
      data: {
        id: 'model-1',
        version: '1.0',
        stateCode: 10,
        teamId: 'team-1',
        json_tg: { xflow: { nodes: [], edges: [] } },
        json: {
          lifeCycleModelDataSet: {
            lifeCycleModelInformation: { dataSetInformation: { name: {} } },
          },
        },
        ruleVerification: [],
      },
    });
    mockGetProcessDetail.mockResolvedValue({ data: {} });

    render(<ToolbarEditInfo ref={ref} {...baseProps} />);

    const nodes = [{ data: { quantitativeReference: '1', id: 'proc-1', version: '1.0' } }];
    let checkResult;
    await act(async () => {
      checkResult = await ref.current?.handleCheckData('review', nodes, [{}]);
    });
    mockAntdMessage.success.mockClear();

    let submitSucceeded;
    await act(async () => {
      submitSucceeded = await ref.current?.submitReview(checkResult.unReview);
    });

    expect(mockSubmitDatasetReview).toHaveBeenCalledWith('lifecyclemodels', 'model-1', '1.0');
    expect(mockAntdMessage.success).toHaveBeenCalledWith('Review submitted successfully');
    expect(submitSucceeded).toBe(true);
  });

  it('stops the imperative review submission when the submit-review command fails', async () => {
    const ref = React.createRef<any>();
    mockGetLifeCycleModelDetail.mockResolvedValue({
      success: true,
      data: {
        id: 'model-1',
        version: '1.0',
        stateCode: 10,
        teamId: 'team-1',
        json_tg: { xflow: { nodes: [], edges: [] } },
        json: {
          lifeCycleModelDataSet: {
            lifeCycleModelInformation: { dataSetInformation: { name: {} } },
          },
        },
        ruleVerification: [],
      },
    });
    mockGetProcessDetail.mockResolvedValue({});
    mockSubmitDatasetReview.mockResolvedValue({ error: { message: 'review failed' } });

    render(<ToolbarEditInfo ref={ref} {...baseProps} />);

    const nodes = [{ data: { quantitativeReference: '1', id: 'proc-1', version: '1.0' } }];
    let checkResult;
    await act(async () => {
      checkResult = await ref.current?.handleCheckData('review', nodes, [{}]);
    });
    mockAntdMessage.success.mockClear();

    let submitSucceeded;
    await act(async () => {
      submitSucceeded = await ref.current?.submitReview(checkResult.unReview);
    });

    expect(mockSubmitDatasetReview).toHaveBeenCalled();
    expect(mockAntdMessage.error).toHaveBeenCalledWith('review failed');
    expect(mockAntdMessage.success).not.toHaveBeenCalledWith('Review submitted successfully');
    expect(submitSucceeded).toBe(false);
  });

  it('falls back to the default submit-review error when the command omits a message', async () => {
    const ref = React.createRef<any>();
    mockGetLifeCycleModelDetail.mockResolvedValue({
      success: true,
      data: {
        id: 'model-1',
        version: '1.0',
        stateCode: 10,
        teamId: 'team-1',
        json_tg: { xflow: { nodes: [], edges: [] } },
        json: {
          lifeCycleModelDataSet: {
            lifeCycleModelInformation: { dataSetInformation: { name: {} } },
          },
        },
        ruleVerification: [],
      },
    });
    mockGetProcessDetail.mockResolvedValue({});
    mockSubmitDatasetReview.mockResolvedValue({ error: {} });

    render(<ToolbarEditInfo ref={ref} {...baseProps} />);

    const nodes = [{ data: { quantitativeReference: '1', id: 'proc-1', version: '1.0' } }];
    let checkResult;
    await act(async () => {
      checkResult = await ref.current?.handleCheckData('review', nodes, [{}]);
    });
    mockAntdMessage.success.mockClear();

    await act(async () => {
      await ref.current?.submitReview(checkResult.unReview);
    });

    expect(mockSubmitDatasetReview).toHaveBeenCalled();
    expect(mockAntdMessage.error).toHaveBeenCalledWith('Submit review failed');
    expect(mockAntdMessage.success).not.toHaveBeenCalledWith('Review submitted successfully');
  });

  it('fails imperative review submission when no model detail has been checked yet', async () => {
    const ref = React.createRef<any>();

    render(<ToolbarEditInfo ref={ref} {...baseProps} />);

    let submitSucceeded;
    await act(async () => {
      submitSucceeded = await ref.current?.submitReview([]);
    });

    expect(mockSubmitDatasetReview).not.toHaveBeenCalled();
    expect(mockAntdMessage.error).toHaveBeenCalledWith('Submit review failed');
    expect(submitSucceeded).toBe(false);
  });

  it('surfaces process-instance validation issues separately from tab-level errors', async () => {
    const ref = React.createRef<any>();
    mockValidateDatasetWithSdk.mockReturnValueOnce({
      success: false,
      issues: [{ path: ['lifeCycleModelDataSet', 'processInstance'] }],
    });
    mockGetLifeCycleModelDetail.mockResolvedValue({
      success: true,
      data: {
        id: 'model-1',
        version: '1.0',
        stateCode: 10,
        teamId: 'team-1',
        json_tg: { xflow: { nodes: [], edges: [] } },
        json: {
          lifeCycleModelDataSet: {
            lifeCycleModelInformation: { dataSetInformation: { name: {} } },
          },
        },
        ruleVerification: [],
      },
    });
    mockGetProcessDetail.mockResolvedValue({ data: {} });
    mockCheckReferences.mockResolvedValue({ findProblemNodes: () => [] });

    render(<ToolbarEditInfo ref={ref} {...baseProps} />);

    const nodes = [{ data: { quantitativeReference: '1', id: 'proc-1', version: '1.0' } }];
    let result;
    await act(async () => {
      result = await ref.current?.handleCheckData('checkData', nodes, [{}]);
    });

    expect(mockAntdMessage.error).toHaveBeenCalledWith('Please complete the process instance data');
    expect(result.checkResult).toBe(false);
  });

  it('emits normalized process-instance sdk details for graph navigation callbacks', async () => {
    const ref = React.createRef<any>();
    const onProcessInstanceValidationChange = jest.fn();
    mockValidateDatasetWithSdk.mockReturnValueOnce({
      success: false,
      issues: [
        {
          code: 'required_missing',
          path: [
            'lifeCycleModelDataSet',
            'lifeCycleModelInformation',
            'technology',
            'processes',
            'processInstance',
            0,
            'referenceToProcess',
            '@refObjectId',
          ],
        },
      ],
    });
    mockGenLifeCycleModelJsonOrdered.mockReturnValueOnce({
      lifeCycleModelDataSet: {
        lifeCycleModelInformation: {
          technology: {
            processes: {
              processInstance: [
                {
                  '@dataSetInternalID': 'pi-1',
                  referenceToProcess: {},
                },
              ],
            },
          },
        },
      },
    });
    mockGetLifeCycleModelDetail.mockResolvedValue(createModelDetail());
    mockGetProcessDetail.mockResolvedValue({ data: {} });
    mockCheckReferences.mockResolvedValue({ findProblemNodes: () => [] });

    render(
      <ToolbarEditInfo
        ref={ref}
        {...baseProps}
        onProcessInstanceValidationChange={onProcessInstanceValidationChange}
      />,
    );

    const nodes = [{ data: { quantitativeReference: '1', id: 'proc-1', version: '1.0' } }];
    await act(async () => {
      await ref.current?.handleCheckData('checkData', nodes, [{}]);
    });

    expect(onProcessInstanceValidationChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        fieldPath: 'processInstance[#pi-1].referenceToProcess.@refObjectId',
        formName: ['referenceToProcess', '@refObjectId'],
        presentation: 'highlight-only',
        tabName: 'lifeCycleModelInformation',
      }),
    ]);
  });

  it('does not count highlight-only process-instance sdk details as lifecycle-model tab issues', async () => {
    const ref = React.createRef<any>();
    mockValidateDatasetWithSdk.mockReturnValueOnce({
      success: false,
      issues: [
        {
          code: 'required_missing',
          path: [
            'lifeCycleModelDataSet',
            'lifeCycleModelInformation',
            'technology',
            'processes',
            'processInstance',
            0,
            '@multiplicationFactor',
          ],
        },
      ],
    });
    mockGenReferenceToResultingProcess.mockReturnValueOnce({
      lifeCycleModelDataSet: {
        lifeCycleModelInformation: {
          technology: {
            processes: {
              processInstance: [
                {
                  '@dataSetInternalID': 'pi-1',
                  referenceToProcess: {},
                },
              ],
            },
          },
        },
      },
    });
    mockGetLifeCycleModelDetail.mockResolvedValue(createModelDetail());
    mockGetProcessDetail.mockResolvedValue({ data: {} });
    mockCheckReferences.mockResolvedValue({ findProblemNodes: () => [] });

    render(<ToolbarEditInfo ref={ref} {...baseProps} />);

    const nodes = [{ data: { quantitativeReference: '1', id: 'proc-1', version: '1.0' } }];
    await act(async () => {
      await ref.current?.handleCheckData('checkData', nodes, [{}]);
    });

    expect(mockBuildValidationIssues).toHaveBeenCalledWith(
      expect.objectContaining({
        sdkInvalidTabNames: [],
      }),
    );
  });

  it.each([
    [
      'checkData',
      {
        id: 'pages.validationIssues.modal.checkDataTitle',
        defaultMessage: 'Data validation issues',
      },
    ],
    [
      'review',
      {
        id: 'pages.validationIssues.modal.reviewTitle',
        defaultMessage: 'Review submission blocked',
      },
    ],
  ])('shows the validation issue modal for %s checks', async (from, expectedTitle) => {
    const ref = React.createRef<any>();
    const validationIssues = [{ issueCode: 'MISSING_REQUIRED_FIELD', datasetType: 'model' }];
    const mappedRefCheckData = [{ key: 'validation-issue' }];

    mockValidateDatasetWithSdk.mockReturnValueOnce({
      success: false,
      issues: [{ path: ['lifeCycleModelDataSet', 'lifeCycleModelInformation'] }],
    });
    mockBuildValidationIssues.mockReturnValueOnce(validationIssues);
    mockMapValidationIssuesToRefCheckData.mockReturnValueOnce(mappedRefCheckData);
    mockGetLifeCycleModelDetail.mockResolvedValue(createModelDetail());
    mockGetProcessDetail.mockResolvedValue({ data: {} });
    mockCheckReferences.mockResolvedValue({ findProblemNodes: () => [] });

    render(<ToolbarEditInfo ref={ref} {...baseProps} />);

    const nodes = [{ data: { quantitativeReference: '1', id: 'proc-1', version: '1.0' } }];
    let result;
    await act(async () => {
      result = await ref.current?.handleCheckData(from, nodes, [{}]);
    });

    expect(mockMapValidationIssuesToRefCheckData).toHaveBeenCalledWith(validationIssues);
    expect(mockShowValidationIssueModal).toHaveBeenCalledWith(
      expect.objectContaining({
        issues: validationIssues,
        title: expectedTitle,
      }),
    );
    expect(mockAntdMessage.error).not.toHaveBeenCalled();
    expect(result.checkResult).toBe(false);
  });

  it('shows a main-product error when rule verification fails on the model process', async () => {
    const ref = React.createRef<any>();
    mockGetLifeCycleModelDetail.mockResolvedValue({
      success: true,
      data: {
        id: 'model-1',
        version: '1.0',
        stateCode: 10,
        teamId: 'team-1',
        json_tg: {
          xflow: { nodes: [], edges: [] },
          submodels: [{ id: 'model-1', version: '1.0', type: 'primary' }],
        },
        json: {
          lifeCycleModelDataSet: {
            lifeCycleModelInformation: { dataSetInformation: { name: {} } },
          },
        },
        ruleVerification: [],
      },
    });
    mockGetProcessDetail.mockResolvedValue({ data: {} });
    mockCheckReferences.mockResolvedValue({ findProblemNodes: () => [] });
    mockDealModel.mockImplementation(
      (_modelDetail: any, _unReview: any[], _underReview: any[], unRuleVerification: any[]) => {
        unRuleVerification.push({
          '@refObjectId': 'model-1',
          '@version': '1.0',
          '@type': 'process data set',
        });
      },
    );

    render(<ToolbarEditInfo ref={ref} {...baseProps} />);

    const nodes = [{ data: { quantitativeReference: '1', id: 'proc-1', version: '1.0' } }];
    let result;
    await act(async () => {
      result = await ref.current?.handleCheckData('review', nodes, [{}]);
    });

    expect(mockAntdMessage.error).toHaveBeenCalledWith(
      'Please complete the main product process data in the model results',
    );
    expect(result.checkResult).toBe(false);
  });

  it('shows tab-level validation errors and reopens the drawer for correction', async () => {
    const ref = React.createRef<any>();
    mockValidateDatasetWithSdk.mockReturnValueOnce({
      success: false,
      issues: [{ path: ['lifeCycleModelDataSet', 'lifeCycleModelInformation'] }],
    });
    mockGetLifeCycleModelDetail.mockResolvedValue(createModelDetail());
    mockGetProcessDetail.mockResolvedValue({});
    mockDealModel.mockImplementation(
      (
        _modelDetail: any,
        _unReview: any[],
        _underReview: any[],
        unRuleVerification: any[],
        nonExistentRef: any[],
      ) => {
        nonExistentRef.push({
          '@refObjectId': 'flow-1',
          '@version': '1.0',
          '@type': 'flow data set',
          refTab: 'administrativeInformation',
        });
        unRuleVerification.push({
          '@refObjectId': 'source-1',
          '@version': '1.0',
          '@type': 'source data set',
          refTab: 'modellingAndValidation',
        });
      },
    );
    mockGetErrRefTab.mockImplementation((item: any) => item.refTab ?? null);
    mockCheckReferences.mockResolvedValue({
      findProblemNodes: () => [
        {
          '@refObjectId': 'contact-1',
          '@version': '1.0',
          '@type': 'contact data set',
          refTab: 'technology',
        },
      ],
    });

    render(<ToolbarEditInfo ref={ref} {...baseProps} />);

    const nodes = [{ data: { quantitativeReference: '1', id: 'proc-1', version: '1.0' } }];
    let result;
    await act(async () => {
      result = await ref.current?.handleCheckData('checkData', nodes, [{}]);
      await Promise.resolve();
    });

    expect(mockAntdMessage.error).toHaveBeenCalledWith(
      'Data check failed in Life cycle model information, Administrative information, Modelling and validation, and Unknown section (technology). Please check the data!',
    );
    expect(
      await screen.findByRole('dialog', { name: 'Model base information' }),
    ).toBeInTheDocument();
    expect(result.checkResult).toBe(false);
  });

  it('shows a sub-product error when a secondary process fails rule verification', async () => {
    const ref = React.createRef<any>();
    mockGetLifeCycleModelDetail.mockResolvedValue(
      createModelDetail({
        json_tg: {
          xflow: { nodes: [], edges: [] },
          submodels: [{ id: 'secondary-1', type: 'secondary' }],
        },
      }),
    );
    mockGetProcessDetail.mockResolvedValue({});
    mockCheckReferences.mockResolvedValue({ findProblemNodes: () => [] });
    mockDealModel.mockImplementation(
      (_modelDetail: any, _unReview: any[], _underReview: any[], unRuleVerification: any[]) => {
        unRuleVerification.push({
          '@refObjectId': 'secondary-1',
          '@version': '1.0',
          '@type': 'process data set',
        });
      },
    );

    render(<ToolbarEditInfo ref={ref} {...baseProps} />);

    const nodes = [{ data: { quantitativeReference: '1', id: 'proc-1', version: '1.0' } }];
    let result;
    await act(async () => {
      result = await ref.current?.handleCheckData('review', nodes, [{}]);
    });

    expect(mockAntdMessage.error).toHaveBeenCalledWith(
      'Please complete the sub product process data in the model results',
    );
    expect(result.checkResult).toBe(false);
  });

  it('adds secondary submodels to unreviewed refs when data check succeeds', async () => {
    const ref = React.createRef<any>();
    mockGetLifeCycleModelDetail.mockResolvedValue(
      createModelDetail({
        json_tg: {
          xflow: { nodes: [], edges: [] },
          submodels: [
            { id: 'secondary-1', type: 'secondary' },
            { id: 'main-1', type: 'main' },
          ],
        },
      }),
    );
    mockGetProcessDetail.mockResolvedValue({});
    mockCheckReferences.mockResolvedValue({ findProblemNodes: () => [] });

    render(<ToolbarEditInfo ref={ref} {...baseProps} />);

    const nodes = [{ data: { quantitativeReference: '1', id: 'proc-1', version: '1.0' } }];
    let result;
    await act(async () => {
      result = await ref.current?.handleCheckData('checkData', nodes, [{}]);
    });

    expect(mockAntdMessage.success).toHaveBeenCalledWith('Data validation passed.');
    expect(result).toEqual({
      checkResult: true,
      problemNodes: [],
      unReview: [
        {
          '@refObjectId': 'secondary-1',
          '@type': 'process data set',
          '@version': '1.0',
        },
      ],
    });
  });

  it('falls back to an empty version when secondary submodels are added from a versionless model', async () => {
    const ref = React.createRef<any>();
    mockGetLifeCycleModelDetail.mockResolvedValue(
      createModelDetail({
        json_tg: {
          xflow: { nodes: [], edges: [] },
          submodels: [{ id: 'secondary-1', type: 'secondary' }],
        },
      }),
    );
    mockGetProcessDetail.mockResolvedValue({});
    mockCheckReferences.mockResolvedValue({ findProblemNodes: () => [] });

    render(<ToolbarEditInfo ref={ref} {...baseProps} data={{ id: 'model-1' }} />);

    const nodes = [{ data: { quantitativeReference: '1', id: 'proc-1', version: '1.0' } }];
    let result;
    await act(async () => {
      result = await ref.current?.handleCheckData('checkData', nodes, [{}]);
    });

    expect(result.unReview).toEqual([
      {
        '@refObjectId': 'secondary-1',
        '@type': 'process data set',
        '@version': '',
      },
    ]);
  });

  it('closes the drawer from the icon button, header close, cancel action, and refs cancel', async () => {
    mockGetRefsOfNewVersion.mockResolvedValue({
      newRefs: [{ id: 'new-ref', version: '2.0.0' }],
      oldRefs: [{ id: 'old-ref', version: '1.0.0' }],
    });

    render(<ToolbarEditInfo {...baseProps} />);

    await userEvent.click(screen.getByRole('button', { name: 'info-icon' }));
    expect(
      await screen.findByRole('dialog', { name: 'Model base information' }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'close-icon' }));
    expect(
      screen.queryByRole('dialog', { name: 'Model base information' }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'info-icon' }));
    await screen.findByRole('dialog', { name: 'Model base information' });
    await userEvent.click(screen.getByRole('button', { name: 'close' }));
    expect(
      screen.queryByRole('dialog', { name: 'Model base information' }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'info-icon' }));
    await screen.findByRole('dialog', { name: 'Model base information' });
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      screen.queryByRole('dialog', { name: 'Model base information' }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'info-icon' }));
    await screen.findByRole('dialog', { name: 'Model base information' });
    await userEvent.click(screen.getByRole('button', { name: 'Update Reference' }));
    expect(await screen.findByTestId('refs-drawer')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'cancel-refs' }));
    expect(screen.queryByTestId('refs-drawer')).not.toBeInTheDocument();
  });

  it('falls back to a generic data-check error when validation issues have a non-string tab path', async () => {
    const ref = React.createRef<any>();
    mockValidateDatasetWithSdk.mockReturnValueOnce({
      success: false,
      issues: [{ path: ['lifeCycleModelDataSet', { tab: 'invalid' }] }],
    });
    mockGetLifeCycleModelDetail.mockResolvedValue(createModelDetail());
    mockGetProcessDetail.mockResolvedValue({});
    mockCheckReferences.mockResolvedValue({ findProblemNodes: () => [] });

    render(<ToolbarEditInfo ref={ref} {...baseProps} />);

    const nodes = [{ data: { quantitativeReference: '1', id: 'proc-1', version: '1.0' } }];
    let result;
    await act(async () => {
      result = await ref.current?.handleCheckData('checkData', nodes, [{}]);
    });

    expect(mockAntdMessage.error).toHaveBeenCalledWith('Data check failed, please check the data!');
    expect(result.checkResult).toBe(false);
  });

  it('falls back to empty team and name metadata when submitting a review without them', async () => {
    const ref = React.createRef<any>();
    mockGetLifeCycleModelDetail.mockResolvedValue(
      createModelDetail({
        teamId: undefined,
        json: {
          lifeCycleModelDataSet: {},
        },
      }),
    );
    mockGetProcessDetail.mockResolvedValue({});
    mockCheckReferences.mockResolvedValue({ findProblemNodes: () => [] });

    render(<ToolbarEditInfo ref={ref} {...baseProps} />);

    const nodes = [{ data: { quantitativeReference: '1', id: 'proc-1', version: '1.0' } }];
    let checkResult;
    await act(async () => {
      checkResult = await ref.current?.handleCheckData('review', nodes, [{}]);
    });
    mockAntdMessage.success.mockClear();

    await act(async () => {
      await ref.current?.submitReview(checkResult.unReview);
    });

    expect(mockSubmitDatasetReview).toHaveBeenCalledWith('lifecyclemodels', 'model-1', '1.0');
  });

  it('hides the update-reference action outside edit mode', async () => {
    render(<ToolbarEditInfo {...baseProps} action='create' />);

    await userEvent.click(screen.getByRole('button', { name: 'info-icon' }));

    expect(
      await screen.findByRole('dialog', { name: 'Model base information' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update Reference' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });
});
