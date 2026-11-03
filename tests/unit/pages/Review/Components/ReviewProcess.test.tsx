// @ts-nocheck
import ReviewProcessDetail from '@/pages/Review/Components/reviewProcess';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

const toText = (node: any): string => {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(toText).join('');
  if (node?.props?.defaultMessage) return node.props.defaultMessage;
  if (node?.props?.id) return node.props.id;
  if (node?.props?.children) return toText(node.props.children);
  return '';
};

jest.mock('@/pages/Review/Components/validateComment', () => ({
  validateCommentApproval: jest.fn((json: unknown) => ({ valid: true, json })),
}));

jest.mock('umi', () => ({
  __esModule: true,
  FormattedMessage: ({ defaultMessage, id }: any) => defaultMessage ?? id,
  useIntl: () => ({
    formatMessage: ({ defaultMessage, id }: any) => defaultMessage ?? id,
  }),
}));

jest.mock('@ant-design/icons', () => ({
  __esModule: true,
  AuditOutlined: () => <span data-testid='icon-audit' />,
  CloseOutlined: () => <span data-testid='icon-close' />,
  ProfileOutlined: () => <span data-testid='icon-profile' />,
}));

jest.mock('@/style/custom.less', () => ({
  __esModule: true,
  default: { footer_right: 'footer-right' },
}));

let proFormApi: any;
let proFormValues: any = {};
let mockTemporarySaveHandler: any = null;

jest.mock('antd', () => {
  const React = require('react');

  const Button = ({ children, onClick, disabled, icon, ...rest }: any) => {
    if (toText(children) === 'Temporary Save') mockTemporarySaveHandler = onClick;
    return (
      <button type='button' onClick={disabled ? undefined : onClick} disabled={disabled} {...rest}>
        {icon}
        {toText(children)}
      </button>
    );
  };

  const Tooltip = ({ children }: any) => <>{children}</>;
  const Drawer = ({ open, children, footer, extra, title, getContainer, onClose }: any) =>
    open ? (
      <section data-testid='drawer'>
        <div data-testid='drawer-container'>
          {getContainer?.() === globalThis.document?.body ? 'body' : 'custom'}
        </div>
        <header>{toText(title)}</header>
        <button type='button' data-testid='drawer-on-close' onClick={() => onClose?.()}>
          drawer-close
        </button>
        <div>{extra}</div>
        <div>{children}</div>
        <footer>{footer}</footer>
      </section>
    ) : null;

  const FormItem = ({ children }: any) => <div>{children}</div>;
  const FormComponent = ({ children }: any) => <div>{children}</div>;
  FormComponent.Item = FormItem;

  const Input = (props: any) => <input {...props} />;
  const Space = ({ children }: any) => <div>{children}</div>;
  const Spin = ({ spinning, children }: any) =>
    spinning ? <div data-testid='spin'>{children}</div> : <>{children}</>;

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
    Drawer,
    Form: FormComponent,
    Input,
    Space,
    Spin,
    Tooltip,
    App,
    message,
  };
});

const ProFormMock = ({ children, formRef, onFinish, onValuesChange, submitter }: any) => {
  if (!proFormApi) {
    proFormApi = {
      submit: jest.fn(),
      resetFields: jest.fn(),
      setFields: jest.fn(),
      setFieldsValue: jest.fn(),
      getFieldsValue: jest.fn(),
    };
  }

  proFormApi.submit.mockImplementation(async () => onFinish?.());
  proFormApi.getFieldsValue.mockImplementation(() => proFormValues);
  const api = proFormApi;
  React.useImperativeHandle(formRef, () => api, [api]);

  return (
    <form data-testid='proform' onSubmit={(event) => event.preventDefault()}>
      <div onChange={() => onValuesChange?.({}, proFormValues)}>
        {typeof children === 'function' ? children({}) : children}
      </div>
      <button
        type='button'
        data-testid='trigger-values-change'
        onClick={() => onValuesChange?.({}, proFormValues)}
      >
        trigger-values-change
      </button>
      <div data-testid='submitter-render'>{submitter?.render?.() ?? null}</div>
    </form>
  );
};

jest.mock('@ant-design/pro-components', () => ({
  __esModule: true,
  ProForm: (props: any) => <ProFormMock {...props} />,
  ProFormInstance: {},
}));

let mockRejectHandler: any = null;
jest.mock('@/pages/Review/Components/RejectReview', () => ({
  __esModule: true,
  default: ({ onOk }: any) => {
    mockRejectHandler = onOk;
    return (
      <button type='button' onClick={() => onOk?.('Need more evidence')}>
        Reject Stub
      </button>
    );
  },
}));

jest.mock('@/pages/Review/Components/reviewProcess/tabsDetail', () => ({
  __esModule: true,
  TabsDetail: ({ rejectedComments, onData, onExchangeData, onTabChange }: any) => (
    <div data-testid='tabs-detail'>
      {JSON.stringify(rejectedComments)}
      <button type='button' data-testid='trigger-on-data' onClick={() => onData?.()}>
        trigger-on-data
      </button>
      <button
        type='button'
        data-testid='trigger-on-exchange-data'
        onClick={() => onExchangeData?.([{ id: 'exchange-1' }])}
      >
        trigger-on-exchange-data
      </button>
      <button type='button' onClick={() => onTabChange?.('processInformation')}>
        switch-tab
      </button>
    </div>
  ),
}));

const mockCheckReferences = jest.fn();
const mockGetAllRefObj = jest.fn(() => []);
const mockGetRejectedComments = jest.fn();
const mockReffPathFindProblemNodes = jest.fn(() => []);

jest.mock('@/pages/Utils/review', () => ({
  __esModule: true,
  checkReferences: (...args: any[]) => mockCheckReferences(...args),
  getAllRefObj: (...args: any[]) => mockGetAllRefObj(...args),
  getRejectedComments: (...args: any[]) => mockGetRejectedComments(...args),
  ReffPath: jest.fn().mockImplementation(() => ({
    findProblemNodes: (...args: any[]) => mockReffPathFindProblemNodes(...args),
  })),
}));

const mockGetCommentApi = jest.fn();
const mockSaveReviewCommentDraftApi = jest.fn();
const mockSubmitReviewCommentApi = jest.fn();

jest.mock('@/services/comments/api', () => ({
  __esModule: true,
  getCommentApi: (...args: any[]) => mockGetCommentApi(...args),
  saveReviewCommentDraftApi: (...args: any[]) => mockSaveReviewCommentDraftApi(...args),
  submitReviewCommentApi: (...args: any[]) => mockSubmitReviewCommentApi(...args),
}));

const mockGetProcessDetail = jest.fn();
jest.mock('@/services/processes/api', () => ({
  __esModule: true,
  getProcessDetail: (...args: any[]) => mockGetProcessDetail(...args),
}));

const mockGenProcessFromData = jest.fn();
jest.mock('@/services/processes/util', () => ({
  __esModule: true,
  genProcessFromData: (...args: any[]) => mockGenProcessFromData(...args),
}));

const mockGetUserTeamId = jest.fn();
jest.mock('@/services/roles/api', () => ({
  __esModule: true,
  getUserTeamId: (...args: any[]) => mockGetUserTeamId(...args),
}));

const { message } = require('antd');

describe('ReviewProcessDetail component', () => {
  const baseProcessDetail = {
    data: {
      id: 'process-1',
      version: '01',
      stateCode: 10,
      json: {
        processDataSet: {
          modellingAndValidation: {
            validation: { review: [] },
            complianceDeclarations: { compliance: [] },
          },
        },
      },
    },
    success: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    proFormApi = null;
    mockRejectHandler = null;
    mockTemporarySaveHandler = null;
    proFormValues = {
      modellingAndValidation: {
        validation: { review: [] },
        complianceDeclarations: { compliance: [] },
      },
    };
    mockGetProcessDetail.mockResolvedValue(baseProcessDetail);
    mockGetCommentApi.mockResolvedValue({ data: [], error: null });
    mockGetRejectedComments.mockResolvedValue([]);
    mockGenProcessFromData.mockReturnValue({
      processInformation: {},
      exchanges: { exchange: [] },
      modellingAndValidation: {
        validation: { review: [] },
        complianceDeclarations: { compliance: [] },
      },
    });
    mockCheckReferences.mockResolvedValue({
      findProblemNodes: () => [],
    });
    mockGetAllRefObj.mockReturnValue([]);
    mockReffPathFindProblemNodes.mockReturnValue([]);
    mockSaveReviewCommentDraftApi.mockResolvedValue({ data: [{}], error: null });
    mockSubmitReviewCommentApi.mockResolvedValue({ data: [{}], error: null });
    mockGetUserTeamId.mockResolvedValue('team-1');
    message.success.mockReset();
    message.error.mockReset();
  });

  const renderComponent = (props: any = {}) => {
    const actionRef = props.actionRef ?? { current: { reload: jest.fn() } };

    render(
      <ReviewProcessDetail
        id='process-1'
        reviewId='review-1'
        version='01'
        lang='en'
        actionRef={actionRef}
        type='edit'
        tabType='review'
        {...props}
      />,
    );

    return { actionRef };
  };

  it('temporarily saves review comment drafts through the comment command boundary', async () => {
    const { actionRef } = renderComponent();

    fireEvent.click(screen.getAllByRole('button')[0]);
    await waitFor(() => expect(mockGetProcessDetail).toHaveBeenCalledWith('process-1', '01'));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Temporary Save' }));
    });

    expect(mockSaveReviewCommentDraftApi).toHaveBeenCalledWith('review-1', {
      modellingAndValidation: {
        complianceDeclarations: { compliance: [] },
        validation: { review: [] },
      },
    });
    expect(message.success).toHaveBeenCalledWith('Temporarily saved successfully.');
    expect(actionRef.current.reload).toHaveBeenCalled();
  });

  it('ignores duplicate process temporary-save requests', async () => {
    renderComponent();
    fireEvent.click(screen.getAllByRole('button')[0]);
    await waitFor(() => expect(mockTemporarySaveHandler).not.toBeNull());

    await act(async () => {
      await Promise.all([mockTemporarySaveHandler(), mockTemporarySaveHandler()]);
    });

    expect(mockSaveReviewCommentDraftApi).toHaveBeenCalledTimes(1);
  });

  it('tracks tab-level form and exchange callbacks from TabsDetail', async () => {
    renderComponent();

    fireEvent.click(screen.getAllByRole('button')[0]);
    await waitFor(() => expect(mockGetProcessDetail).toHaveBeenCalled());

    proFormValues = {
      processInformation: {
        name: 'updated-name',
      },
    };

    fireEvent.click(screen.getByText('switch-tab'));
    fireEvent.click(screen.getByTestId('trigger-on-data'));

    await waitFor(() => expect(proFormApi.getFieldsValue).toHaveBeenCalled());

    proFormValues = {};
    fireEvent.click(screen.getByTestId('trigger-on-data'));
    fireEvent.click(screen.getByTestId('trigger-on-exchange-data'));
    fireEvent.click(screen.getByTestId('trigger-values-change'));

    expect(screen.getByTestId('tabs-detail')).toBeInTheDocument();
  });

  it('logs temporary save failures from the draft command', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockSaveReviewCommentDraftApi.mockResolvedValueOnce({
      data: [],
      error: new Error('draft failed'),
    });

    renderComponent();

    fireEvent.click(screen.getAllByRole('button')[0]);
    await waitFor(() => expect(mockGetProcessDetail).toHaveBeenCalled());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Temporary Save' }));
    });

    expect(message.success).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('submits review comments through the command boundary when reference checks pass', async () => {
    const { actionRef } = renderComponent();

    fireEvent.click(screen.getAllByRole('button')[0]);
    await waitFor(() => expect(mockGetProcessDetail).toHaveBeenCalled());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    expect(mockGetAllRefObj).toHaveBeenCalled();
    expect(mockGetUserTeamId).toHaveBeenCalled();
    expect(mockSubmitReviewCommentApi).toHaveBeenCalledWith('review-1', {
      modellingAndValidation: {
        complianceDeclarations: { compliance: [] },
        validation: { review: [] },
      },
    });
    expect(message.success).toHaveBeenCalledWith('Review submitted successfully');
    expect(actionRef.current.reload).toHaveBeenCalled();
  });

  it('ignores duplicate process approval submissions', async () => {
    renderComponent();
    fireEvent.click(screen.getAllByRole('button')[0]);
    await waitFor(() => expect(proFormApi).toBeDefined());

    await act(async () => {
      await Promise.all([proFormApi.submit(), proFormApi.submit()]);
    });

    expect(mockSubmitReviewCommentApi).toHaveBeenCalledTimes(1);
  });

  it('supports header close and drawer onClose dismissal paths', async () => {
    renderComponent();

    fireEvent.click(screen.getByTestId('icon-audit').closest('button') as HTMLButtonElement);
    await waitFor(() => expect(screen.getByTestId('drawer')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('icon-close').closest('button') as HTMLButtonElement);
    await waitFor(() => expect(screen.queryByTestId('drawer')).not.toBeInTheDocument());

    fireEvent.click(screen.getByTestId('icon-audit').closest('button') as HTMLButtonElement);
    await waitFor(() => expect(screen.getByTestId('drawer')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('drawer-on-close'));
    await waitFor(() => expect(screen.queryByTestId('drawer')).not.toBeInTheDocument());
  });

  it('logs submit failures when review submission throws', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockSubmitReviewCommentApi.mockRejectedValueOnce(new Error('submit failed'));

    renderComponent();

    fireEvent.click(screen.getByTestId('icon-audit').closest('button') as HTMLButtonElement);
    await waitFor(() => expect(mockGetProcessDetail).toHaveBeenCalled());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    await waitFor(() => expect(consoleSpy).toHaveBeenCalledWith(expect.any(Error)));
    consoleSpy.mockRestore();
  });

  it('submits reviewer rejections with the reviewer-rejected state', async () => {
    const { actionRef } = renderComponent();

    proFormValues = {
      modellingAndValidation: {
        validation: { review: [{ id: 'review-item' }] },
        complianceDeclarations: { compliance: [{ id: 'compliance-item' }] },
      },
    };

    fireEvent.click(screen.getAllByRole('button')[0]);
    await waitFor(() => expect(mockGetProcessDetail).toHaveBeenCalled());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reject Stub' }));
    });

    expect(mockSubmitReviewCommentApi).toHaveBeenCalledWith(
      'review-1',
      {
        modellingAndValidation: {
          complianceDeclarations: { compliance: [{ id: 'compliance-item' }] },
          validation: { review: [{ id: 'review-item' }] },
        },
        comment: {
          message: 'Need more evidence',
        },
      },
      -3,
    );
    expect(message.success).toHaveBeenCalledWith('Rejected successfully!');
    expect(actionRef.current.reload).toHaveBeenCalled();
  });

  it('ignores duplicate process rejection requests', async () => {
    renderComponent();
    fireEvent.click(screen.getAllByRole('button')[0]);
    await waitFor(() => expect(mockRejectHandler).not.toBeNull());

    await act(async () => {
      await Promise.all([
        mockRejectHandler('Need more evidence'),
        mockRejectHandler('Need more evidence'),
      ]);
    });

    expect(mockSubmitReviewCommentApi).toHaveBeenCalledTimes(1);
  });

  it('blocks submission when reference checking reports under-review dependencies', async () => {
    mockCheckReferences.mockImplementation(async (...args: any[]) => {
      args[4].push({
        '@refObjectId': 'ref-2',
        '@version': '2.0.0',
      });
      return {
        findProblemNodes: () => [],
      };
    });

    renderComponent();

    fireEvent.click(screen.getAllByRole('button')[0]);
    await waitFor(() => expect(mockGetProcessDetail).toHaveBeenCalled());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    expect(mockSubmitReviewCommentApi).not.toHaveBeenCalled();
    expect(screen.getByTestId('drawer')).toBeInTheDocument();
  });

  it('loads rejected comments for under-review processes', async () => {
    mockGetRejectedComments.mockResolvedValue([{ message: 'Needs revision' }]);

    renderComponent();

    fireEvent.click(screen.getAllByRole('button')[0]);

    await waitFor(() => expect(mockGetRejectedComments).toHaveBeenCalledWith('process-1', '01'));
    expect(screen.getByTestId('tabs-detail')).toHaveTextContent('Needs revision');
  });

  it('merges review defaults and saved reviewer comments before hydrating the form', async () => {
    mockGetCommentApi.mockResolvedValueOnce({
      data: [
        { json: {} },
        {
          json: {
            modellingAndValidation: {
              validation: {
                review: [{ id: 'review-comment-1' }],
              },
              complianceDeclarations: {
                compliance: [{ id: 'compliance-comment-1' }],
              },
            },
          },
        },
      ],
      error: null,
    });
    mockGenProcessFromData.mockImplementation((data: any) => data);

    renderComponent({ tabType: 'review' });

    fireEvent.click(screen.getAllByRole('button')[0]);

    await waitFor(() => expect(mockGenProcessFromData).toHaveBeenCalled());

    const mergedData = mockGenProcessFromData.mock.calls.at(-1)?.[0];
    expect(mergedData.modellingAndValidation.validation.review).toEqual([
      { id: 'review-comment-1' },
    ]);
    expect(mergedData.modellingAndValidation.complianceDeclarations.compliance).toEqual(
      expect.arrayContaining([
        { id: 'compliance-comment-1' },
        expect.objectContaining({
          'common:referenceToComplianceSystem': expect.any(Object),
        }),
      ]),
    );
  });

  it('hydrates default compliance templates for normalized empty reviewer comments', async () => {
    mockGetCommentApi.mockResolvedValueOnce({
      data: [{ json: {} }],
      error: null,
    });
    mockGenProcessFromData.mockImplementation((data: any) => data);

    renderComponent({ tabType: 'review', type: 'edit' });

    fireEvent.click(screen.getAllByRole('button')[0]);

    await waitFor(() => expect(mockGenProcessFromData).toHaveBeenCalled());

    const mergedData = mockGenProcessFromData.mock.calls.at(-1)?.[0];
    expect(mergedData.modellingAndValidation.validation.review).toEqual([
      {
        'common:scope': [{ '@name': undefined }],
      },
    ]);
    expect(mergedData.modellingAndValidation.complianceDeclarations.compliance).toHaveLength(5);
    expect(mergedData.modellingAndValidation.complianceDeclarations.compliance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          'common:referenceToComplianceSystem': expect.objectContaining({
            '@refObjectId': '1ea48531-e397-4ca7-ac08-056e4fa11826',
          }),
        }),
      ]),
    );
  });

  it('uses fallback review and compliance placeholders for reviewer-rejected records with sparse comments', async () => {
    mockGetCommentApi.mockResolvedValueOnce({
      data: [{ json: {} }],
      error: null,
    });
    mockGenProcessFromData.mockImplementation((data: any) => data);

    renderComponent({
      tabType: 'reviewer-rejected',
      type: 'edit',
    });

    fireEvent.click(screen.getAllByRole('button')[0]);

    await waitFor(() => expect(mockGenProcessFromData).toHaveBeenCalled());

    const mergedData = mockGenProcessFromData.mock.calls.at(-1)?.[0];
    expect(mergedData.modellingAndValidation.complianceDeclarations.compliance).toEqual([{}]);
    expect(mergedData.modellingAndValidation.validation.review).toEqual([
      {
        'common:scope': [{ '@name': undefined }],
      },
    ]);
  });

  it('merges assigned comments into existing review arrays', async () => {
    mockGetProcessDetail.mockResolvedValueOnce({
      ...baseProcessDetail,
      data: {
        ...baseProcessDetail.data,
        json: {
          processDataSet: {
            modellingAndValidation: {
              validation: {
                review: [{ id: 'existing-review' }],
              },
              complianceDeclarations: {
                compliance: [{ id: 'existing-compliance' }],
              },
            },
          },
        },
      },
    });
    mockGetCommentApi.mockResolvedValueOnce({
      data: [
        {
          json: {
            modellingAndValidation: {
              validation: {
                review: [{ id: 'comment-review' }],
              },
              complianceDeclarations: {
                compliance: [{ id: 'comment-compliance' }],
              },
            },
          },
        },
      ],
      error: null,
    });
    mockGenProcessFromData.mockImplementation((data: any) => data);

    renderComponent({ tabType: 'assigned' });

    fireEvent.click(screen.getAllByRole('button')[0]);

    await waitFor(() => expect(mockGenProcessFromData).toHaveBeenCalled());

    const mergedData = mockGenProcessFromData.mock.calls.at(-1)?.[0];
    expect(mergedData.modellingAndValidation.complianceDeclarations.compliance).toEqual([
      { id: 'existing-compliance' },
      { id: 'comment-compliance' },
    ]);
    expect(mergedData.modellingAndValidation.validation.review).toEqual([
      { id: 'existing-review' },
      { id: 'comment-review' },
    ]);
  });

  it('merges assigned comments into existing review objects', async () => {
    mockGetProcessDetail.mockResolvedValueOnce({
      ...baseProcessDetail,
      data: {
        ...baseProcessDetail.data,
        json: {
          processDataSet: {
            modellingAndValidation: {
              validation: {
                review: { id: 'existing-review' },
              },
              complianceDeclarations: {
                compliance: { id: 'existing-compliance' },
              },
            },
          },
        },
      },
    });
    mockGetCommentApi.mockResolvedValueOnce({
      data: [
        {
          json: {
            modellingAndValidation: {
              validation: {
                review: [{ id: 'comment-review' }],
              },
              complianceDeclarations: {
                compliance: [{ id: 'comment-compliance' }],
              },
            },
          },
        },
      ],
      error: null,
    });
    mockGenProcessFromData.mockImplementation((data: any) => data);

    renderComponent({ tabType: 'assigned' });

    fireEvent.click(screen.getAllByRole('button')[0]);

    await waitFor(() => expect(mockGenProcessFromData).toHaveBeenCalled());

    const mergedData = mockGenProcessFromData.mock.calls.at(-1)?.[0];
    expect(mergedData.modellingAndValidation.complianceDeclarations.compliance).toEqual([
      { id: 'existing-compliance' },
      { id: 'comment-compliance' },
    ]);
    expect(mergedData.modellingAndValidation.validation.review).toEqual([
      { id: 'existing-review' },
      { id: 'comment-review' },
    ]);
  });

  it('falls back to comment arrays when assigned rows have no existing review payload', async () => {
    mockGetProcessDetail.mockResolvedValueOnce({
      ...baseProcessDetail,
      data: {
        ...baseProcessDetail.data,
        json: {
          processDataSet: {
            modellingAndValidation: {
              validation: {},
              complianceDeclarations: {},
            },
          },
        },
      },
    });
    mockGetCommentApi.mockResolvedValueOnce({
      data: [
        {
          json: {
            modellingAndValidation: {
              validation: {
                review: [{ id: 'comment-review' }],
              },
              complianceDeclarations: {
                compliance: [{ id: 'comment-compliance' }],
              },
            },
          },
        },
      ],
      error: null,
    });
    mockGenProcessFromData.mockImplementation((data: any) => data);

    renderComponent({ tabType: 'assigned' });

    fireEvent.click(screen.getAllByRole('button')[0]);

    await waitFor(() => expect(mockGenProcessFromData).toHaveBeenCalled());

    const mergedData = mockGenProcessFromData.mock.calls.at(-1)?.[0];
    expect(mergedData.modellingAndValidation.complianceDeclarations.compliance).toEqual([
      { id: 'comment-compliance' },
    ]);
    expect(mergedData.modellingAndValidation.validation.review).toEqual([{ id: 'comment-review' }]);
  });

  it('treats legacy compliance comment arrays with null and primitive entries as meaningful', async () => {
    mockGetProcessDetail.mockResolvedValueOnce({
      ...baseProcessDetail,
      data: {
        ...baseProcessDetail.data,
        json: {
          processDataSet: {
            modellingAndValidation: {
              validation: {},
              complianceDeclarations: {},
            },
          },
        },
      },
    });
    mockGetCommentApi.mockResolvedValueOnce({
      data: [
        {
          json: {
            modellingAndValidation: {
              validation: {
                review: [{ id: 'comment-review' }],
              },
              complianceDeclarations: {
                compliance: [null, 'legacy compliance note'],
              },
            },
          },
        },
      ],
      error: null,
    });
    mockGenProcessFromData.mockImplementation((data: any) => data);

    renderComponent({ tabType: 'assigned' });

    fireEvent.click(screen.getAllByRole('button')[0]);

    await waitFor(() => expect(mockGenProcessFromData).toHaveBeenCalled());

    const mergedData = mockGenProcessFromData.mock.calls.at(-1)?.[0];
    expect(mergedData.modellingAndValidation.complianceDeclarations.compliance).toEqual([
      null,
      'legacy compliance note',
    ]);
    expect(mergedData.modellingAndValidation.validation.review).toEqual([{ id: 'comment-review' }]);
  });

  it('handles sparse process detail payloads and skips rejected-comment loading for published rows', async () => {
    mockGetProcessDetail.mockResolvedValueOnce({
      data: {
        id: 'process-1',
        version: '01',
        stateCode: 100,
        json: {},
      },
      success: true,
    });
    mockGenProcessFromData.mockReturnValue({});

    renderComponent();

    fireEvent.click(screen.getAllByRole('button')[0]);

    await waitFor(() => expect(mockGenProcessFromData).toHaveBeenCalledWith({}));
    expect(mockGetRejectedComments).not.toHaveBeenCalled();
  });

  it('submits when reference checks return no path object', async () => {
    mockCheckReferences.mockResolvedValueOnce(undefined);
    const { actionRef } = renderComponent();

    fireEvent.click(screen.getAllByRole('button')[0]);
    await waitFor(() => expect(mockGetProcessDetail).toHaveBeenCalled());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    expect(mockSubmitReviewCommentApi).toHaveBeenCalledWith('review-1', {
      modellingAndValidation: {
        complianceDeclarations: { compliance: [] },
        validation: { review: [] },
      },
    });
    expect(actionRef.current.reload).toHaveBeenCalled();
  });

  it('blocks submission when problem nodes are returned without under-review refs', async () => {
    mockCheckReferences.mockResolvedValueOnce({
      findProblemNodes: () => [
        {
          '@refObjectId': 'ref-3',
          '@version': '3.0.0',
          ruleVerification: false,
          nonExistent: true,
        },
      ],
    });

    renderComponent();

    fireEvent.click(screen.getAllByRole('button')[0]);
    await waitFor(() => expect(mockGetProcessDetail).toHaveBeenCalled());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    expect(mockSubmitReviewCommentApi).not.toHaveBeenCalled();
    expect(screen.getByTestId('drawer')).toBeInTheDocument();
  });

  it('shows a reject error when reviewer rejection submission throws', async () => {
    mockSubmitReviewCommentApi.mockRejectedValueOnce(new Error('reject failed'));

    renderComponent();

    fireEvent.click(screen.getAllByRole('button')[0]);
    await waitFor(() => expect(mockGetProcessDetail).toHaveBeenCalled());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reject Stub' }));
    });

    expect(message.error).toHaveBeenCalledWith('Failed to reject, please try again!');
  });

  it('opens in view mode without review footer actions', async () => {
    renderComponent({ type: 'view', tabType: 'review' });

    fireEvent.click(screen.getAllByRole('button')[0]);
    await waitFor(() => expect(mockGetProcessDetail).toHaveBeenCalled());

    expect(screen.getByText('View Review')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Temporary Save' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject Stub' })).not.toBeInTheDocument();
  });

  it('merges saved review data and default compliance templates when opening review mode', async () => {
    mockGetProcessDetail.mockResolvedValueOnce({
      data: {
        id: 'process-1',
        version: '01',
        stateCode: 100,
        json: {
          processDataSet: {
            modellingAndValidation: {
              validation: { review: [{ id: 'existing-review' }] },
              complianceDeclarations: { compliance: [{ id: 'existing-compliance' }] },
            },
          },
        },
      },
      success: true,
    });
    mockGetCommentApi.mockResolvedValueOnce({
      data: [
        {
          json: {
            modellingAndValidation: {
              validation: { review: [{ id: 'saved-review' }] },
              complianceDeclarations: { compliance: [{ id: 'saved-compliance' }] },
            },
          },
        },
        {
          json: null,
        },
      ],
      error: null,
    });

    renderComponent();

    fireEvent.click(screen.getAllByRole('button')[0]);

    await waitFor(() => expect(mockGenProcessFromData).toHaveBeenCalled());

    const merged = mockGenProcessFromData.mock.calls.at(-1)?.[0];
    expect(merged.modellingAndValidation.validation.review).toEqual([{ id: 'saved-review' }]);
    expect(merged.modellingAndValidation.complianceDeclarations.compliance).toHaveLength(6);
    expect(proFormApi.resetFields).toHaveBeenCalled();
    expect(proFormApi.setFieldsValue).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'process-1',
      }),
    );
    expect(mockGetRejectedComments).not.toHaveBeenCalled();
  });

  it('merges persisted review data into non-review tabs instead of replacing it', async () => {
    mockGetProcessDetail.mockResolvedValueOnce({
      data: {
        id: 'process-1',
        version: '01',
        stateCode: 100,
        json: {
          processDataSet: {
            modellingAndValidation: {
              validation: { review: { id: 'existing-review' } },
              complianceDeclarations: { compliance: { id: 'existing-compliance' } },
            },
          },
        },
      },
      success: true,
    });
    mockGetCommentApi.mockResolvedValueOnce({
      data: [
        {
          json: {
            modellingAndValidation: {
              validation: { review: [{ id: 'saved-review' }] },
              complianceDeclarations: { compliance: [{ id: 'saved-compliance' }] },
            },
          },
        },
      ],
      error: null,
    });

    renderComponent({ type: 'view', tabType: 'assigned' });

    fireEvent.click(screen.getAllByRole('button')[0]);

    await waitFor(() => expect(mockGenProcessFromData).toHaveBeenCalled());

    const merged = mockGenProcessFromData.mock.calls.at(-1)?.[0];
    expect(merged.modellingAndValidation.validation.review).toEqual([
      { id: 'existing-review' },
      { id: 'saved-review' },
    ]);
    expect(merged.modellingAndValidation.complianceDeclarations.compliance).toEqual([
      { id: 'existing-compliance' },
      { id: 'saved-compliance' },
    ]);
  });

  it('restores default compliance templates when saved review comments are empty', async () => {
    mockGetProcessDetail.mockResolvedValueOnce({
      data: {
        id: 'process-1',
        version: '01',
        stateCode: 100,
        json: {
          processDataSet: {
            modellingAndValidation: {
              validation: { review: [] },
              complianceDeclarations: { compliance: [] },
            },
          },
        },
      },
      success: true,
    });
    mockGetCommentApi.mockResolvedValueOnce({
      data: [
        {
          json: {
            modellingAndValidation: {
              validation: { review: [] },
              complianceDeclarations: { compliance: [] },
            },
          },
        },
      ],
      error: null,
    });

    renderComponent();

    fireEvent.click(screen.getAllByRole('button')[0]);

    await waitFor(() => expect(mockGenProcessFromData).toHaveBeenCalled());

    const merged = mockGenProcessFromData.mock.calls.at(-1)?.[0];
    expect(merged.modellingAndValidation.validation.review).toEqual([
      {
        'common:scope': [{ '@name': undefined }],
      },
    ]);
    expect(merged.modellingAndValidation.complianceDeclarations.compliance).toHaveLength(5);
    expect(merged.modellingAndValidation.complianceDeclarations.compliance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          'common:referenceToComplianceSystem': expect.objectContaining({
            '@refObjectId': '1ea48531-e397-4ca7-ac08-056e4fa11826',
          }),
        }),
      ]),
    );
  });

  it('merges persisted review arrays into existing non-review arrays', async () => {
    mockGetProcessDetail.mockResolvedValueOnce({
      data: {
        id: 'process-1',
        version: '01',
        stateCode: 100,
        json: {
          processDataSet: {
            modellingAndValidation: {
              validation: { review: [{ id: 'existing-review' }] },
              complianceDeclarations: { compliance: [{ id: 'existing-compliance' }] },
            },
          },
        },
      },
      success: true,
    });
    mockGetCommentApi.mockResolvedValueOnce({
      data: [
        {
          json: {
            modellingAndValidation: {
              validation: { review: [{ id: 'saved-review' }] },
              complianceDeclarations: { compliance: [{ id: 'saved-compliance' }] },
            },
          },
        },
      ],
      error: null,
    });

    renderComponent({ type: 'view', tabType: 'assigned' });

    fireEvent.click(screen.getAllByRole('button')[0]);

    await waitFor(() => expect(mockGenProcessFromData).toHaveBeenCalled());

    const merged = mockGenProcessFromData.mock.calls.at(-1)?.[0];
    expect(merged.modellingAndValidation.validation.review).toEqual([
      { id: 'existing-review' },
      { id: 'saved-review' },
    ]);
    expect(merged.modellingAndValidation.complianceDeclarations.compliance).toEqual([
      { id: 'existing-compliance' },
      { id: 'saved-compliance' },
    ]);
  });

  it('falls back to saved review arrays when the current non-review payload is missing review data', async () => {
    mockGetProcessDetail.mockResolvedValueOnce({
      data: {
        id: 'process-1',
        version: '01',
        stateCode: 100,
        json: {
          processDataSet: {
            modellingAndValidation: {},
          },
        },
      },
      success: true,
    });
    mockGetCommentApi.mockResolvedValueOnce({
      data: [
        {
          json: {
            modellingAndValidation: {
              validation: { review: [{ id: 'saved-review' }] },
              complianceDeclarations: { compliance: [{ id: 'saved-compliance' }] },
            },
          },
        },
      ],
      error: null,
    });

    renderComponent({ type: 'view', tabType: 'assigned' });

    fireEvent.click(screen.getAllByRole('button')[0]);

    await waitFor(() => expect(mockGenProcessFromData).toHaveBeenCalled());

    const merged = mockGenProcessFromData.mock.calls.at(-1)?.[0];
    expect(merged.modellingAndValidation.validation.review).toEqual([{ id: 'saved-review' }]);
    expect(merged.modellingAndValidation.complianceDeclarations.compliance).toEqual([
      { id: 'saved-compliance' },
    ]);
  });

  it('stops invalid review metadata before reference checks or submission', async () => {
    renderComponent();
    fireEvent.click(screen.getAllByRole('button')[0]);
    await waitFor(() => expect(mockGetProcessDetail).toHaveBeenCalled());
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
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    expect(proFormApi.setFields).toHaveBeenCalledWith([
      { name: ['modellingAndValidation', 'validation'], errors: ['Invalid review'] },
    ]);
    expect(mockGetAllRefObj).not.toHaveBeenCalled();
    expect(mockSubmitReviewCommentApi).not.toHaveBeenCalled();
    expect(screen.getByTestId('drawer')).toBeInTheDocument();
  });

  it('runs tab/update hooks and supports both close actions', async () => {
    renderComponent();

    fireEvent.click(screen.getAllByRole('button')[0]);
    await waitFor(() => expect(mockGetProcessDetail).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId('trigger-on-data'));
    fireEvent.click(screen.getByTestId('trigger-on-exchange-data'));
    fireEvent.click(screen.getByRole('button', { name: 'switch-tab' }));
    fireEvent.click(screen.getByTestId('trigger-values-change'));

    fireEvent.click(screen.getByTestId('icon-close').closest('button') as HTMLButtonElement);
    await waitFor(() => expect(screen.queryByTestId('drawer')).not.toBeInTheDocument());

    fireEvent.click(screen.getAllByRole('button')[0]);
    await waitFor(() => expect(screen.getByTestId('drawer')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('drawer-on-close'));
    await waitFor(() => expect(screen.queryByTestId('drawer')).not.toBeInTheDocument());
  });

  it('ignores tab edits while loading and handles a comment whose dataset is unavailable', async () => {
    let resolveDetail!: (value: any) => void;
    mockGetProcessDetail.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDetail = resolve;
      }),
    );
    mockGetCommentApi.mockResolvedValueOnce({
      data: [
        {
          json: {
            modellingAndValidation: { validation: { review: [{ '@type': 'Not reviewed' }] } },
          },
        },
      ],
      error: null,
    });
    renderComponent();
    fireEvent.click(screen.getAllByRole('button')[0]);
    fireEvent.click(screen.getByTestId('trigger-on-data'));
    fireEvent.click(screen.getByTestId('trigger-on-exchange-data'));
    expect(proFormApi.getFieldsValue).not.toHaveBeenCalled();
    await act(async () => {
      resolveDetail({ data: { json: {}, stateCode: 100 }, success: true });
    });
    await waitFor(() => expect(mockGenProcessFromData).toHaveBeenCalledWith({}));
    expect(mockSubmitReviewCommentApi).not.toHaveBeenCalled();
  });

  it('falls back to empty process datasets, updates tab snapshots, and accepts missing reference paths', async () => {
    proFormValues = {
      processInformation: { title: 'Updated process' },
      modellingAndValidation: {
        validation: { review: [] },
        complianceDeclarations: { compliance: [] },
      },
    };
    mockGetProcessDetail.mockResolvedValueOnce({
      data: {
        id: 'process-1',
        version: '01',
        stateCode: 100,
        json: {},
      },
      success: true,
    });
    mockCheckReferences.mockResolvedValueOnce(undefined);

    renderComponent();

    fireEvent.click(screen.getAllByRole('button')[0]);

    await waitFor(() => expect(mockGenProcessFromData).toHaveBeenCalledWith({}));
    await waitFor(() =>
      expect(proFormApi.setFieldsValue).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'process-1',
        }),
      ),
    );

    fireEvent.click(screen.getByTestId('trigger-on-data'));
    await waitFor(() => expect(proFormApi.getFieldsValue).toHaveBeenCalled());

    proFormValues = {
      modellingAndValidation: {
        validation: { review: [] },
        complianceDeclarations: { compliance: [] },
      },
    };

    fireEvent.click(screen.getByTestId('trigger-on-data'));
    fireEvent.click(screen.getByTestId('trigger-on-exchange-data'));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    await waitFor(() =>
      expect(mockSubmitReviewCommentApi).toHaveBeenCalledWith('review-1', {
        modellingAndValidation: {
          complianceDeclarations: {
            compliance: [],
          },
          validation: {
            review: [],
          },
        },
      }),
    );
  });

  it('falls back to an empty exchange list when generated process data omits exchanges', async () => {
    mockGenProcessFromData.mockReturnValueOnce({
      processInformation: {},
      modellingAndValidation: {
        validation: { review: [] },
        complianceDeclarations: { compliance: [] },
      },
    });

    renderComponent();

    fireEvent.click(screen.getAllByRole('button')[0]);

    await waitFor(() => expect(mockGenProcessFromData).toHaveBeenCalled());
    await waitFor(() =>
      expect(proFormApi.setFieldsValue).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'process-1',
        }),
      ),
    );

    expect(screen.getByTestId('tabs-detail')).toBeInTheDocument();
  });

  it('logs temporary save failures when the draft command returns an error', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    mockSaveReviewCommentDraftApi.mockResolvedValueOnce({
      data: [],
      error: new Error('save failed'),
    });

    renderComponent();

    fireEvent.click(screen.getAllByRole('button')[0]);
    await waitFor(() => expect(mockGetProcessDetail).toHaveBeenCalled());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Temporary Save' }));
    });

    expect(consoleSpy).toHaveBeenCalledWith(expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('blocks submission when reference checking returns problem nodes', async () => {
    mockCheckReferences.mockResolvedValueOnce({
      findProblemNodes: () => [
        {
          '@refObjectId': 'problem-ref',
          '@version': '03.00.000',
          ruleVerification: false,
          nonExistent: true,
        },
      ],
    });

    renderComponent();

    fireEvent.click(screen.getAllByRole('button')[0]);
    await waitFor(() => expect(mockGetProcessDetail).toHaveBeenCalled());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    expect(mockSubmitReviewCommentApi).not.toHaveBeenCalled();
    expect(screen.getByTestId('drawer')).toBeInTheDocument();
  });

  it('logs submit error payloads after reference checks pass', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    mockSubmitReviewCommentApi.mockResolvedValueOnce({
      data: [],
      error: new Error('submit failed'),
    });

    renderComponent();

    fireEvent.click(screen.getAllByRole('button')[0]);
    await waitFor(() => expect(mockGetProcessDetail).toHaveBeenCalled());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    expect(consoleSpy).toHaveBeenCalledWith(expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('shows an error when rejection returns an error payload', async () => {
    mockSubmitReviewCommentApi.mockResolvedValueOnce({
      data: [],
      error: new Error('reject failed'),
    });

    renderComponent();

    fireEvent.click(screen.getAllByRole('button')[0]);
    await waitFor(() => expect(mockGetProcessDetail).toHaveBeenCalled());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reject Stub' }));
    });

    expect(message.error).toHaveBeenCalledWith('Failed to reject, please try again!');
  });
});
