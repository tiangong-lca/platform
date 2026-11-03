// @ts-nocheck
import ToolbarViewInfo from '@/pages/Review/Components/reviewLifeCycleModels/Components/toolbar/viewInfo';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

let proFormApi: any = null;

jest.mock('@/pages/Review/Components/validateComment', () => ({
  validateCommentApproval: jest.fn((json: unknown) => ({ valid: true, json })),
}));

jest.mock('@/components/TidasRepeatedField', () => ({
  __esModule: true,
  default: ({ name, children, onChange }: any) => (
    <div>
      {children(name)}
      <button type='button' onClick={onChange}>
        Repeated change
      </button>
    </div>
  ),
}));

jest.mock('umi', () => ({
  __esModule: true,
  FormattedMessage: ({ defaultMessage, id }: any) => <span>{defaultMessage ?? id}</span>,
  useIntl: () => ({
    locale: 'en-US',
    formatMessage: ({ defaultMessage, id }: any) => defaultMessage ?? id,
  }),
}));

jest.mock('@ant-design/icons', () => ({
  __esModule: true,
  CloseOutlined: () => <span>close</span>,
  InfoOutlined: () => <span>info</span>,
}));

jest.mock('@/components/LangTextItem/description', () => ({
  __esModule: true,
  default: ({ data }: any) => <div data-testid='lang-text'>{JSON.stringify(data)}</div>,
}));

jest.mock('@/components/LevelTextItem/description', () => ({
  __esModule: true,
  default: ({ data }: any) => <div data-testid='level-text'>{JSON.stringify(data)}</div>,
}));

jest.mock('@/components/LocationTextItem/description', () => ({
  __esModule: true,
  default: ({ data, label }: any) => (
    <div data-testid='location-text'>{`${label?.props?.defaultMessage ?? label}:${data}`}</div>
  ),
}));

jest.mock('@/pages/Contacts/Components/select/description', () => ({
  __esModule: true,
  default: ({ data, title }: any) => (
    <div data-testid='contact-description'>{`${data?.['@refObjectId'] ?? 'none'}:${title?.props?.defaultMessage ?? title}`}</div>
  ),
}));

jest.mock('@/pages/Sources/Components/select/description', () => ({
  __esModule: true,
  default: ({ data, title }: any) => (
    <div data-testid='source-description'>{`${data?.['@refObjectId'] ?? 'none'}:${title?.props?.defaultMessage ?? title}`}</div>
  ),
}));

jest.mock('@/pages/Review/Components/Compliance/form', () => ({
  __esModule: true,
  default: ({ onData }: any) => (
    <button
      type='button'
      data-testid='compliance-form'
      onClick={() => onData?.([{ id: 'updated-compliance' }])}
    >
      compliance-form
    </button>
  ),
}));

jest.mock('@/pages/Review/Components/Compliance/view', () => ({
  __esModule: true,
  default: ({ data }: any) => <div data-testid='compliance-view'>{JSON.stringify(data)}</div>,
}));

jest.mock('@/pages/Review/Components/ReviewForm/form', () => ({
  __esModule: true,
  default: ({ onData }: any) => (
    <button
      type='button'
      data-testid='review-form'
      onClick={() => onData?.([{ id: 'updated-review' }])}
    >
      review-form
    </button>
  ),
}));

jest.mock('@/pages/Review/Components/ReviewForm/view', () => ({
  __esModule: true,
  default: ({ data }: any) => <div data-testid='review-view'>{JSON.stringify(data)}</div>,
}));

let mockRejectHandler: any = null;
jest.mock('@/pages/Review/Components/RejectReview', () => ({
  __esModule: true,
  default: (props: any) => {
    mockRejectHandler = props.onOk;
    return (
      <button
        type='button'
        disabled={props.disabled}
        onClick={() => props.onOk?.('Need model repair')}
      >
        Reject Review
      </button>
    );
  },
}));

jest.mock('@/style/custom.less', () => ({
  __esModule: true,
  default: { footer_right: 'footer-right' },
}));

jest.mock('@/contexts/refCheckContext', () => {
  const React = require('react');
  return {
    __esModule: true,
    RefCheckContext: React.createContext({ refCheckData: [] }),
  };
});

const mockSaveReviewCommentDraftApi = jest.fn();
const mockSubmitReviewCommentApi = jest.fn();
jest.mock('@/services/comments/api', () => ({
  __esModule: true,
  saveReviewCommentDraftApi: (...args: any[]) => mockSaveReviewCommentDraftApi(...args),
  submitReviewCommentApi: (...args: any[]) => mockSubmitReviewCommentApi(...args),
}));

const mockGetUserDetail = jest.fn();
jest.mock('@/services/users/api', () => ({
  __esModule: true,
  getUserDetail: (...args: any[]) => mockGetUserDetail(...args),
}));

const mockGetUserTeamId = jest.fn();
jest.mock('@/services/roles/api', () => ({
  __esModule: true,
  getUserTeamId: (...args: any[]) => mockGetUserTeamId(...args),
}));

const mockCheckReferences = jest.fn();
const mockGetAllRefObj = jest.fn(() => []);
const mockReffPathFindProblemNodes = jest.fn(() => []);

jest.mock('@/pages/Utils/review', () => ({
  __esModule: true,
  checkReferences: (...args: any[]) => mockCheckReferences(...args),
  getAllRefObj: (...args: any[]) => mockGetAllRefObj(...args),
  ReffPath: jest.fn().mockImplementation(() => ({
    findProblemNodes: (...args: any[]) => mockReffPathFindProblemNodes(...args),
  })),
}));

jest.mock('@/pages/Processes/Components/optiondata', () => ({
  __esModule: true,
  LCIMethodApproachOptions: [{ value: 'approach-a', label: 'Approach A' }],
  LCIMethodPrincipleOptions: [{ value: 'principle-a', label: 'Principle A' }],
  completenessElementaryFlowsTypeOptions: [{ value: 'type-a', label: 'Type A' }],
  completenessElementaryFlowsValueOptions: [{ value: 'value-a', label: 'Value A' }],
  completenessProductModelOptions: [{ value: 'product-a', label: 'Product A' }],
  copyrightOptions: [{ value: 'true', label: 'Copyrighted' }],
  licenseTypeOptions: [{ value: 'open', label: 'Open License' }],
  processtypeOfDataSetOptions: [{ value: 'process-a', label: 'Process A' }],
  uncertaintyDistributionTypeOptions: [{ value: 'distribution-a', label: 'Distribution A' }],
  workflowAndPublicationStatusOptions: [{ value: 'workflow-a', label: 'Workflow A' }],
}));

const toText = (node: any): string => {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(toText).join('');
  if (node?.props?.defaultMessage) return node.props.defaultMessage;
  if (node?.props?.id) return node.props.id;
  if (node?.props?.children) return toText(node.props.children);
  return '';
};

let mockTemporarySaveHandler: any = null;
jest.mock('antd', () => {
  const React = require('react');

  const message = {
    success: jest.fn(),
    error: jest.fn(),
  };

  const App = { useApp: () => ({ message }) };

  const Button = ({ children, onClick, disabled = false, icon, type }: any) => {
    if (toText(children) === 'Temporary Save') mockTemporarySaveHandler = onClick;
    return (
      <button
        type='button'
        data-button-type={type}
        disabled={disabled}
        onClick={disabled ? undefined : onClick}
      >
        {icon}
        {toText(children)}
      </button>
    );
  };

  const Tooltip = ({ children }: any) => <>{children}</>;

  const Drawer = ({ open, title, extra, footer, children, onClose, getContainer }: any) =>
    open ? (
      <section role='dialog' aria-label={toText(title) || 'drawer'}>
        <header>
          <div>{extra}</div>
          <button type='button' data-testid='drawer-on-close' onClick={onClose}>
            close
          </button>
        </header>
        <div data-testid='drawer-container'>{getContainer?.() ? 'has-container' : 'none'}</div>
        <div>{children}</div>
        <footer>{footer}</footer>
      </section>
    ) : null;

  const Card = ({ children, title, tabList, activeTabKey, onTabChange }: any) => (
    <section>
      <header>{toText(title)}</header>
      {tabList ? (
        <div>
          {tabList.map((tab: any) => (
            <button
              key={tab.key}
              type='button'
              data-active={String(activeTabKey === tab.key)}
              onClick={() => onTabChange?.(tab.key)}
            >
              {toText(tab.tab)}
            </button>
          ))}
        </div>
      ) : null}
      <div>{children}</div>
    </section>
  );

  const Descriptions = ({ items = [] }: any) => (
    <dl>
      {items.map((item: any, index: number) => (
        <div key={item.key ?? index}>
          {item.label === undefined ? null : <dt>{toText(item.label)}</dt>}
          <dd>{item.children}</dd>
        </div>
      ))}
    </dl>
  );

  const Divider = ({ children }: any) => <div>{toText(children)}</div>;
  const Space = ({ children, className }: any) => <div className={className}>{children}</div>;
  const Spin = ({ children }: any) => <div>{children}</div>;

  return {
    __esModule: true,
    Button,
    Card,
    Descriptions,
    Divider,
    Drawer,
    Space,
    Spin,
    Tooltip,
    App,
    message,
  };
});

const mockMessage = jest.requireMock('antd').message as Record<string, jest.Mock>;

jest.mock('@ant-design/pro-components', () => {
  const React = require('react');

  const setNestedValue = (source: any, path: any[], value: any) => {
    const next = { ...(source ?? {}) };
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

  const getNestedValue = (source: any, path: any[]) =>
    path.reduce((acc: any, key: string) => (acc ? acc[key] : undefined), source);

  const ProForm = ({ initialValues = {}, formRef, children, onFinish, submitter }: any) => {
    const valuesRef = React.useRef<any>(JSON.parse(JSON.stringify(initialValues ?? {})));

    const api = React.useMemo(() => {
      return {
        getFieldValue: jest.fn((path: any) => {
          const namePath = Array.isArray(path) ? path : [path];
          return getNestedValue(valuesRef.current, namePath);
        }),
        setFieldValue: jest.fn((path: any, value: any) => {
          const namePath = Array.isArray(path) ? path : [path];
          valuesRef.current = setNestedValue(valuesRef.current, namePath, value);
        }),
        getFieldsValue: jest.fn(() => valuesRef.current),
        setFields: jest.fn(),
        setFieldsValue: jest.fn((next: any) => {
          valuesRef.current = { ...valuesRef.current, ...(next ?? {}) };
        }),
        submit: jest.fn(async () => onFinish?.()),
      };
    }, [onFinish]);

    React.useLayoutEffect(() => {
      if (formRef) {
        formRef.current = api;
      }
      proFormApi = api;
    }, [api, formRef]);

    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onFinish?.();
        }}
      >
        {typeof children === 'function' ? children(valuesRef.current) : children}
        {submitter?.render?.() ?? null}
      </form>
    );
  };

  return {
    __esModule: true,
    ProForm,
    ProFormInstance: {},
  };
});

describe('ReviewLifeCycleModelToolbarViewInfo', () => {
  const baseData = {
    lifeCycleModelInformation: {
      dataSetInformation: {
        'common:UUID': 'uuid-1',
        name: {
          baseName: [{ '@xml:lang': 'en', '#text': 'Model name' }],
        },
      },
      mathematicalRelations: {
        variableParameter: {
          uncertaintyDistributionType: 'distribution-a',
        },
      },
    },
    modellingAndValidation: {
      LCIMethodAndAllocation: {
        typeOfDataSet: 'process-a',
        LCIMethodPrinciple: 'principle-a',
        LCIMethodApproaches: 'approach-a',
      },
      completeness: {
        completenessProductModel: 'product-a',
        completenessElementaryFlows: {
          '@type': 'type-a',
          '@value': 'value-a',
        },
      },
      complianceDeclarations: {
        compliance: [{ id: 'compliance-1' }],
      },
      validation: {},
    },
    administrativeInformation: {
      publicationAndOwnership: {
        'common:workflowAndPublicationStatus': 'workflow-a',
        'common:copyright': 'true',
        'common:licenseType': 'open',
      },
    },
  };

  const renderComponent = (props: any = {}) => {
    const actionRef = { current: { reload: jest.fn() } };
    const onReviewComplete = props.onReviewComplete ?? jest.fn();

    render(
      <ToolbarViewInfo
        lang='en'
        data={baseData}
        type='edit'
        reviewId='review-1'
        tabType='review'
        actionRef={actionRef}
        onReviewComplete={onReviewComplete}
        {...props}
      />,
    );

    return { actionRef, onReviewComplete };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    proFormApi = null;
    mockRejectHandler = null;
    mockTemporarySaveHandler = null;
    mockGetUserDetail.mockResolvedValue({
      data: {
        contact: {
          '@refObjectId': 'contact-1',
          '@version': '1.0.0',
        },
      },
    });
    mockGetUserTeamId.mockResolvedValue('team-1');
    mockCheckReferences.mockResolvedValue({
      findProblemNodes: () => [],
    });
    mockReffPathFindProblemNodes.mockReturnValue([]);
    mockSaveReviewCommentDraftApi.mockResolvedValue({ data: [{}], error: null });
    mockSubmitReviewCommentApi.mockResolvedValue({ data: [{}], error: null });
  });

  it('renders mapped option labels across view tabs', async () => {
    renderComponent({ type: 'view', tabType: 'assigned' });

    await userEvent.click(screen.getByRole('button', { name: /info/i }));

    expect(screen.getByText('uuid-1')).toBeInTheDocument();
    expect(screen.getAllByTestId('lang-text')[0]).toHaveTextContent('Model name');

    await userEvent.click(screen.getByRole('button', { name: /modelling and validation/i }));
    expect(screen.getByText('Process A')).toBeInTheDocument();
    expect(screen.getByText('Principle A')).toBeInTheDocument();
    expect(screen.getByText('Approach A')).toBeInTheDocument();
    expect(screen.getByText('Product A')).toBeInTheDocument();
    expect(screen.getByText('Type A')).toBeInTheDocument();
    expect(screen.getByText('Value A')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /administrative information/i }));
    expect(screen.getByText('Workflow A')).toBeInTheDocument();
    expect(screen.getByText('Copyrighted')).toBeInTheDocument();
    expect(screen.getByText('Open License')).toBeInTheDocument();
  });

  it('initializes validation defaults and reviewer contact when the validation tab is opened', async () => {
    renderComponent();

    await userEvent.click(screen.getByRole('button', { name: /info/i }));
    await userEvent.click(screen.getByRole('button', { name: /^Validation$/i }));

    await waitFor(() =>
      expect(proFormApi.getFieldValue).toHaveBeenCalledWith([
        'modellingAndValidation',
        'validation',
        'review',
      ]),
    );
    await waitFor(() =>
      expect(proFormApi.setFieldValue).toHaveBeenCalledWith(
        ['modellingAndValidation', 'validation', 'review'],
        [{ 'common:scope': [{}] }],
      ),
    );
    await waitFor(() =>
      expect(proFormApi.setFieldValue).toHaveBeenCalledWith(
        [
          'modellingAndValidation',
          'validation',
          'review',
          0,
          'common:referenceToNameOfReviewerAndInstitution',
        ],
        {
          '@refObjectId': 'contact-1',
          '@version': '1.0.0',
        },
      ),
    );
  });

  it('keeps an existing validation review instead of replacing it with a default row', async () => {
    renderComponent({
      data: {
        ...baseData,
        modellingAndValidation: {
          ...baseData.modellingAndValidation,
          validation: { review: [{ id: 'existing-review' }] },
        },
      },
    });

    await userEvent.click(screen.getByRole('button', { name: /info/i }));
    await userEvent.click(screen.getByRole('button', { name: /^Validation$/i }));

    expect(proFormApi.setFieldValue).not.toHaveBeenCalledWith(
      ['modellingAndValidation', 'validation', 'review'],
      [{ 'common:scope': [{}] }],
    );
  });

  it('renders sparse fallback labels, keeps empty validation arrays initialized, and invokes edit-form onData callbacks', async () => {
    mockGetUserDetail.mockResolvedValueOnce({ data: {} });

    renderComponent({
      data: {
        lifeCycleModelInformation: {
          dataSetInformation: {
            name: {},
          },
        },
        modellingAndValidation: {
          LCIMethodAndAllocation: {
            typeOfDataSet: 'unknown',
            LCIMethodPrinciple: 'unknown',
            LCIMethodApproaches: 'unknown',
          },
          completeness: {
            completenessProductModel: 'unknown',
            completenessElementaryFlows: {
              '@type': 'unknown',
              '@value': 'unknown',
            },
          },
          complianceDeclarations: {
            compliance: [],
          },
          validation: {
            review: [],
          },
        },
        administrativeInformation: {
          publicationAndOwnership: {
            'common:workflowAndPublicationStatus': 'unknown',
            'common:copyright': 'unknown',
            'common:licenseType': 'unknown',
          },
        },
      },
    });

    await userEvent.click(screen.getByRole('button', { name: /info/i }));
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: /modelling and validation/i }));
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: /administrative information/i }));
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: /^Validation$/i }));
    await waitFor(() =>
      expect(proFormApi.setFieldValue).toHaveBeenCalledWith(
        ['modellingAndValidation', 'validation', 'review'],
        [{ 'common:scope': [{}] }],
      ),
    );
    await userEvent.click(screen.getByTestId('review-form'));

    await userEvent.click(screen.getByRole('button', { name: /compliance declarations/i }));
    await userEvent.click(screen.getByTestId('compliance-form'));
    await userEvent.click(screen.getByRole('button', { name: 'Repeated change' }));
  });

  it('falls back to dash labels when mapped option fields are omitted entirely', async () => {
    renderComponent({
      data: {
        lifeCycleModelInformation: {
          dataSetInformation: {
            name: {},
          },
        },
        modellingAndValidation: {
          completeness: {},
          complianceDeclarations: {
            compliance: [],
          },
          validation: {},
        },
        administrativeInformation: {},
      },
      type: 'view',
      tabType: 'assigned',
    });

    await userEvent.click(screen.getByRole('button', { name: /info/i }));

    await userEvent.click(screen.getByRole('button', { name: /modelling and validation/i }));
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: /administrative information/i }));
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
  });

  it('temporarily saves review comments through the comment command boundary', async () => {
    const { actionRef, onReviewComplete } = renderComponent();

    await userEvent.click(screen.getByRole('button', { name: /info/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Temporary Save' }));

    expect(mockSaveReviewCommentDraftApi).toHaveBeenCalledWith('review-1', {
      modellingAndValidation: {
        complianceDeclarations: {
          compliance: [{ id: 'compliance-1' }],
        },
        validation: {},
      },
    });
    expect(mockMessage.success).toHaveBeenCalledWith('Temporarily saved successfully.');
    expect(actionRef.current.reload).toHaveBeenCalled();
    expect(onReviewComplete).toHaveBeenCalled();
  });

  it('keeps the model review open when temporary save fails', async () => {
    mockSaveReviewCommentDraftApi.mockResolvedValueOnce({
      data: [],
      error: new Error('draft failed'),
    });
    const { actionRef, onReviewComplete } = renderComponent();

    await userEvent.click(screen.getByRole('button', { name: /info/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Temporary Save' }));

    await waitFor(() => expect(mockMessage.error).toHaveBeenCalledWith('Action failed'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(actionRef.current.reload).not.toHaveBeenCalled();
    expect(onReviewComplete).not.toHaveBeenCalled();
  });

  it('ignores duplicate model temporary-save requests', async () => {
    renderComponent();
    await userEvent.click(screen.getByRole('button', { name: /info/i }));

    await act(async () => {
      await Promise.all([mockTemporarySaveHandler(), mockTemporarySaveHandler()]);
    });

    expect(mockSaveReviewCommentDraftApi).toHaveBeenCalledTimes(1);
  });

  it('submits a reviewer rejection with the current model opinion metadata', async () => {
    const { actionRef, onReviewComplete } = renderComponent();

    await userEvent.click(screen.getByRole('button', { name: /info/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Reject Review' }));

    await waitFor(() =>
      expect(mockSubmitReviewCommentApi).toHaveBeenCalledWith(
        'review-1',
        {
          modellingAndValidation: {
            complianceDeclarations: {
              compliance: [{ id: 'compliance-1' }],
            },
            validation: {},
          },
          comment: { message: 'Need model repair' },
        },
        -3,
      ),
    );
    expect(mockCheckReferences).not.toHaveBeenCalled();
    expect(mockMessage.success).toHaveBeenCalledWith('Rejected successfully!');
    expect(actionRef.current.reload).toHaveBeenCalled();
    expect(onReviewComplete).toHaveBeenCalled();
  });

  it('keeps the model review open when reviewer rejection fails', async () => {
    mockSubmitReviewCommentApi.mockResolvedValueOnce({
      data: [],
      error: new Error('reject failed'),
    });
    const { actionRef, onReviewComplete } = renderComponent();

    await userEvent.click(screen.getByRole('button', { name: /info/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Reject Review' }));

    await waitFor(() =>
      expect(mockMessage.error).toHaveBeenCalledWith('Failed to reject, please try again!'),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(actionRef.current.reload).not.toHaveBeenCalled();
    expect(onReviewComplete).not.toHaveBeenCalled();
  });

  it('ignores duplicate model rejection requests', async () => {
    renderComponent();
    await userEvent.click(screen.getByRole('button', { name: /info/i }));

    await act(async () => {
      await Promise.all([
        mockRejectHandler('Need model repair'),
        mockRejectHandler('Need model repair'),
      ]);
    });

    expect(mockSubmitReviewCommentApi).toHaveBeenCalledTimes(1);
  });

  it('stops invalid model review metadata before reference checks or submission', async () => {
    renderComponent();
    await userEvent.click(screen.getByRole('button', { name: /info/i }));
    jest
      .requireMock('@/pages/Review/Components/validateComment')
      .validateCommentApproval.mockImplementationOnce(
        (_json: unknown, _kind: unknown, _root: unknown, _intl: unknown, showFields: any) => {
          showFields('validation', [
            { name: ['modellingAndValidation', 'validation'], errors: ['Invalid review'] },
          ]);
          return { valid: false };
        },
      );
    const submittedFormApi = proFormApi;
    await userEvent.click(screen.getByRole('button', { name: /^Save$/i }));
    expect(submittedFormApi.setFields).toHaveBeenCalledWith([
      { name: ['modellingAndValidation', 'validation'], errors: ['Invalid review'] },
    ]);
    expect(mockGetAllRefObj).not.toHaveBeenCalled();
    expect(mockSubmitReviewCommentApi).not.toHaveBeenCalled();
  });

  it('submits the review when reference checks pass', async () => {
    const { actionRef } = renderComponent();

    await userEvent.click(screen.getByRole('button', { name: /info/i }));
    await userEvent.click(screen.getByRole('button', { name: /^Save$/i }));

    await waitFor(() => expect(mockGetAllRefObj).toHaveBeenCalled());
    await waitFor(() => expect(mockGetUserTeamId).toHaveBeenCalled());
    expect(mockSubmitReviewCommentApi).toHaveBeenCalledWith(
      'review-1',
      {
        modellingAndValidation: {
          complianceDeclarations: {
            compliance: [{ id: 'compliance-1' }],
          },
          validation: {},
        },
      },
      1,
      'lifeCycleModel',
    );
    expect(mockMessage.success).toHaveBeenCalledWith('Review submitted successfully');
    expect(actionRef.current.reload).toHaveBeenCalled();
  });

  it('keeps the model review open when approval submission fails', async () => {
    mockSubmitReviewCommentApi.mockResolvedValueOnce({
      data: [],
      error: new Error('submit failed'),
    });
    const { actionRef, onReviewComplete } = renderComponent();

    await userEvent.click(screen.getByRole('button', { name: /info/i }));
    await userEvent.click(screen.getByRole('button', { name: /^Save$/i }));

    await waitFor(() => expect(mockMessage.error).toHaveBeenCalledWith('Action failed'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(actionRef.current.reload).not.toHaveBeenCalled();
    expect(onReviewComplete).not.toHaveBeenCalled();
  });

  it('ignores duplicate model approval submissions', async () => {
    renderComponent();
    await userEvent.click(screen.getByRole('button', { name: /info/i }));

    await act(async () => {
      await Promise.all([proFormApi.submit(), proFormApi.submit()]);
    });

    expect(mockSubmitReviewCommentApi).toHaveBeenCalledTimes(1);
  });

  it('blocks submit when reference checks report under-review items', async () => {
    mockCheckReferences.mockImplementationOnce(
      async (_refObjs: any, _cache: any, _teamId: any, _unReview: any[], underReview: any[]) => {
        underReview.push({
          '@refObjectId': 'process-2',
          '@version': '2.0.0',
          state_code: 30,
        });
        return {
          findProblemNodes: () => [],
        };
      },
    );

    renderComponent();

    await userEvent.click(screen.getByRole('button', { name: /info/i }));
    await userEvent.click(screen.getByRole('button', { name: /^Save$/i }));

    await waitFor(() => expect(mockCheckReferences).toHaveBeenCalled());
    expect(mockSubmitReviewCommentApi).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('blocks submit when reference checks report problem nodes without under-review refs', async () => {
    mockCheckReferences.mockResolvedValueOnce({
      findProblemNodes: () => [
        {
          '@refObjectId': 'process-3',
          '@version': '03.00.000',
          ruleVerification: false,
          nonExistent: true,
        },
      ],
    });

    renderComponent();

    await userEvent.click(screen.getByRole('button', { name: /info/i }));
    await userEvent.click(screen.getByRole('button', { name: /^Save$/i }));

    await waitFor(() => expect(mockCheckReferences).toHaveBeenCalled());
    expect(mockSubmitReviewCommentApi).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('submits the review when reference checking resolves without a path object', async () => {
    const { actionRef } = renderComponent();
    mockCheckReferences.mockResolvedValueOnce(undefined);

    await userEvent.click(screen.getByRole('button', { name: /info/i }));
    await userEvent.click(screen.getByRole('button', { name: /^Save$/i }));

    await waitFor(() => expect(mockCheckReferences).toHaveBeenCalled());
    expect(mockSubmitReviewCommentApi).toHaveBeenCalledWith(
      'review-1',
      {
        modellingAndValidation: {
          complianceDeclarations: {
            compliance: [{ id: 'compliance-1' }],
          },
          validation: {},
        },
      },
      1,
      'lifeCycleModel',
    );
    expect(mockMessage.success).toHaveBeenCalledWith('Review submitted successfully');
    expect(actionRef.current.reload).toHaveBeenCalled();
  });

  it('uses the unified review footer and supports header close and drawer onClose', async () => {
    renderComponent();

    await userEvent.click(screen.getByRole('button', { name: /info/i }));
    expect(screen.getByTestId('drawer-container')).toHaveTextContent('has-container');

    const footer = screen.getByRole('dialog').querySelector('footer') as HTMLElement;
    expect(
      within(footer)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Reject Review', 'Temporary Save', 'Save']);
    expect(within(footer).queryByRole('button', { name: /^Cancel$/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('button', { name: 'close' })[0]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /info/i }));
    await userEvent.click(screen.getByTestId('drawer-on-close'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders sparse fallback values and unknown option labels across view tabs', async () => {
    renderComponent({
      type: 'view',
      tabType: 'assigned',
      data: {
        lifeCycleModelInformation: {
          dataSetInformation: {
            name: {},
          },
          mathematicalRelations: {
            variableParameter: {},
          },
        },
        modellingAndValidation: {
          dataSourcesTreatmentEtc: {},
          LCIMethodAndAllocation: {
            typeOfDataSet: 'unknown-type',
            LCIMethodPrinciple: 'unknown-principle',
            LCIMethodApproaches: 'unknown-approach',
          },
          completeness: {
            completenessProductModel: 'unknown-product',
            completenessElementaryFlows: {
              '@type': 'unknown-type',
              '@value': 'unknown-value',
            },
          },
          validation: {},
        },
        administrativeInformation: {
          publicationAndOwnership: {
            'common:workflowAndPublicationStatus': 'unknown-workflow',
            'common:copyright': 'unknown-copyright',
            'common:licenseType': 'unknown-license',
          },
        },
      },
    });

    await userEvent.click(screen.getByRole('button', { name: /info/i }));
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: /modelling and validation/i }));
    expect(screen.getAllByText('-').length).toBeGreaterThan(3);

    await userEvent.click(screen.getByRole('button', { name: /administrative information/i }));
    expect(screen.getAllByTestId('source-description')[0]).toHaveTextContent('none');
    expect(screen.getAllByText('-').length).toBeGreaterThan(5);
  });

  it('renders nullish option fallbacks when mapped fields are missing', async () => {
    renderComponent({
      type: 'view',
      tabType: 'assigned',
      data: {
        lifeCycleModelInformation: {
          dataSetInformation: {
            name: {},
          },
          mathematicalRelations: {
            variableParameter: {},
          },
        },
        modellingAndValidation: {
          dataSourcesTreatmentEtc: {},
          LCIMethodAndAllocation: {},
          completeness: {
            completenessElementaryFlows: {},
          },
          validation: {},
        },
        administrativeInformation: {
          publicationAndOwnership: {},
        },
      },
    });

    await userEvent.click(screen.getByRole('button', { name: /info/i }));
    await userEvent.click(screen.getByRole('button', { name: /modelling and validation/i }));
    expect(screen.getAllByText('-').length).toBeGreaterThan(5);

    await userEvent.click(screen.getByRole('button', { name: /administrative information/i }));
    expect(screen.getAllByText('-').length).toBeGreaterThan(8);
  });

  it('executes inert validation and compliance callbacks in edit mode', async () => {
    renderComponent();

    await userEvent.click(screen.getByRole('button', { name: /info/i }));
    await userEvent.click(screen.getByRole('button', { name: /^Validation$/i }));
    await userEvent.click(screen.getByTestId('review-form'));

    await userEvent.click(screen.getByRole('button', { name: /compliance declarations/i }));
    await userEvent.click(screen.getByTestId('compliance-form'));
    await userEvent.click(screen.getByRole('button', { name: 'Repeated change' }));

    expect(screen.getByTestId('review-form')).toBeInTheDocument();
    expect(screen.getByTestId('compliance-form')).toBeInTheDocument();
  });

  it('initializes validation defaults when the current review array is empty', async () => {
    renderComponent({
      data: {
        ...baseData,
        modellingAndValidation: {
          ...baseData.modellingAndValidation,
          validation: {
            review: [],
          },
        },
      },
    });

    await userEvent.click(screen.getByRole('button', { name: /info/i }));
    await userEvent.click(screen.getByRole('button', { name: /^Validation$/i }));

    await waitFor(() =>
      expect(proFormApi.setFieldValue).toHaveBeenCalledWith(
        ['modellingAndValidation', 'validation', 'review'],
        [{ 'common:scope': [{}] }],
      ),
    );
  });

  it('submits when reference checks return no path object', async () => {
    mockCheckReferences.mockResolvedValueOnce(undefined);
    const { actionRef } = renderComponent();

    await userEvent.click(screen.getByRole('button', { name: /info/i }));
    await userEvent.click(screen.getByRole('button', { name: /^Save$/i }));

    await waitFor(() => expect(mockSubmitReviewCommentApi).toHaveBeenCalled());
    expect(actionRef.current.reload).toHaveBeenCalled();
  });

  it('blocks submit when reference checks surface problem nodes without under-review refs', async () => {
    mockCheckReferences.mockResolvedValueOnce({
      findProblemNodes: () => [
        {
          '@refObjectId': 'process-3',
          '@version': '3.0.0',
          ruleVerification: false,
          nonExistent: true,
        },
      ],
    });

    renderComponent();

    await userEvent.click(screen.getByRole('button', { name: /info/i }));
    await userEvent.click(screen.getByRole('button', { name: /^Save$/i }));

    await waitFor(() => expect(mockCheckReferences).toHaveBeenCalled());
    expect(mockSubmitReviewCommentApi).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('omits review footer actions when tabType is not review', async () => {
    renderComponent({ tabType: 'assigned', type: 'view' });

    await userEvent.click(screen.getByRole('button', { name: /info/i }));

    expect(screen.queryByRole('button', { name: /^Cancel$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Temporary Save' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Save$/i })).not.toBeInTheDocument();
  });
});
