import BatchReviewActions from '@/pages/Review/Components/BatchReviewActions';
import {
  getReviewBatchEligibility,
  submitAdminReviewBatchDecision,
  submitReviewerBatchDecision,
} from '@/services/reviews/api';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockConfirm = jest.fn();
const mockResetFields = jest.fn();
const mockValidateFields = jest.fn();
const mockSuccess = jest.fn();
const mockWarning = jest.fn();
const mockError = jest.fn();

jest.mock('@ant-design/icons', () => ({
  FileExcelOutlined: () => <span data-testid='batch-reject-icon' />,
  SafetyCertificateOutlined: () => <span data-testid='batch-approve-icon' />,
}));

jest.mock('@/services/reviews/api', () => ({
  getReviewBatchEligibility: jest.fn(),
  submitAdminReviewBatchDecision: jest.fn(),
  submitReviewerBatchDecision: jest.fn(),
}));

jest.mock('@umijs/max', () => ({
  useIntl: () => ({
    formatMessage: (
      { defaultMessage }: { defaultMessage: string },
      values?: Record<string, number>,
    ) =>
      Object.entries(values ?? {}).reduce(
        (message, [key, value]) => message.replace(`{${key}}`, String(value)),
        defaultMessage,
      ),
  }),
}));

jest.mock('antd', () => {
  const Form = ({ children }: { children: import('react').ReactNode }) => <form>{children}</form>;
  Form.useForm = () => [
    {
      validateFields: mockValidateFields,
      resetFields: mockResetFields,
    },
  ];
  Form.Item = ({ children, label }: { children: import('react').ReactNode; label?: string }) => (
    <label>
      {label}
      {children}
    </label>
  );

  const Modal = ({
    children,
    open,
    title,
    onCancel,
    onOk,
  }: {
    children: import('react').ReactNode;
    open?: boolean;
    title?: string;
    onCancel?: () => void;
    onOk?: () => void;
  }) =>
    open ? (
      <section aria-label={title}>
        {children}
        <button type='button' onClick={onCancel}>
          cancel
        </button>
        <button type='button' onClick={onOk}>
          confirm reject
        </button>
      </section>
    ) : null;
  const message = {
    success: (...args: unknown[]) => mockSuccess(...args),
    warning: (...args: unknown[]) => mockWarning(...args),
    error: (...args: unknown[]) => mockError(...args),
  };
  const modal = {
    confirm: (options: { onOk?: () => void }) => mockConfirm(options),
  };
  const App = { useApp: () => ({ message, modal }) };

  return {
    Alert: ({ description, title }: { description?: string; title?: string }) => (
      <div>
        {title}: {description}
      </div>
    ),
    App,
    Button: ({
      children,
      disabled,
      icon,
      onClick,
      type,
      size,
      shape,
      style,
      danger,
      'aria-label': ariaLabel,
    }: {
      children: import('react').ReactNode;
      disabled?: boolean;
      icon?: import('react').ReactNode;
      onClick?: () => void;
      type?: string;
      size?: string;
      shape?: string;
      style?: import('react').CSSProperties;
      danger?: boolean;
      'aria-label'?: string;
    }) => (
      <button
        type='button'
        disabled={disabled}
        onClick={onClick}
        aria-label={ariaLabel}
        data-button-type={type}
        data-button-size={size}
        data-button-shape={shape}
        data-button-danger={danger ? 'true' : 'false'}
        style={style}
      >
        {icon}
        {children}
      </button>
    ),
    Form,
    Input: { TextArea: () => <textarea aria-label='review-reason' /> },
    message,
    Modal,
    Space: ({ children, size }: { children: import('react').ReactNode; size?: number }) => (
      <div data-space-size={size}>{children}</div>
    ),
    theme: {
      useToken: () => ({
        token: {
          marginXS: 8,
          controlHeightSM: 24,
          controlHeight: 32,
        },
      }),
    },
    Tooltip: ({ children, title }: { children: import('react').ReactNode; title?: string }) => (
      <span title={title}>{children}</span>
    ),
  };
});

const adminDecisionMock = jest.mocked(submitAdminReviewBatchDecision);
const reviewerDecisionMock = jest.mocked(submitReviewerBatchDecision);
const eligibilityMock = jest.mocked(getReviewBatchEligibility);

const successfulResult = (reviewIds: string[]) => ({
  ok: true,
  command: 'admin_review_batch_decision',
  batchId: 'batch-1',
  summary: { total: reviewIds.length, succeeded: reviewIds.length, failed: 0 },
  results: reviewIds.map((reviewId) => ({ reviewId, ok: true })),
});

describe('BatchReviewActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConfirm.mockImplementation(({ onOk }: { onOk?: () => void }) => onOk?.());
    mockValidateFields.mockResolvedValue({ reason: 'insufficient evidence' });
    eligibilityMock.mockImplementation(async (reviewIds) => ({
      data: reviewIds.map((reviewId, ordinal) => ({
        ordinal,
        review_id: String(reviewId),
        eligible: true,
        reviewer_count: 1,
        submitted_opinion_count: 1,
        approve_opinion_count: 1,
        reject_opinion_count: 0,
      })),
      error: null,
    }));
  });

  it('submits a successful admin batch approval and refreshes the table', async () => {
    const onFinished = jest.fn();
    adminDecisionMock.mockResolvedValue({
      data: [successfulResult(['review-1', 'review-2'])],
      error: null,
    } as never);

    render(
      <BatchReviewActions
        role='admin'
        reviewIds={['review-1', 'review-2']}
        allowApprove
        onFinished={onFinished}
      />,
    );
    const approveButton = screen.getByRole('button', { name: 'Batch approve' });
    expect(screen.getByTestId('batch-approve-icon')).toBeInTheDocument();
    expect(approveButton).toHaveAttribute('data-button-type', 'text');
    expect(approveButton).toHaveAttribute('data-button-size', 'large');
    expect(approveButton).not.toHaveAttribute('data-button-shape');
    expect(approveButton).toHaveAttribute('data-button-danger', 'false');
    expect(approveButton).toHaveStyle({ width: '24px', height: '32px', paddingInline: 0 });
    expect(approveButton.parentElement?.parentElement).toHaveAttribute('data-space-size', '8');
    fireEvent.click(approveButton);

    await waitFor(() =>
      expect(adminDecisionMock).toHaveBeenCalledWith(
        ['review-1', 'review-2'],
        'approve',
        undefined,
      ),
    );
    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ onOk: expect.any(Function) }),
    );
    expect(mockSuccess).toHaveBeenCalledWith('2 reviews processed successfully.');
    expect(mockResetFields).toHaveBeenCalled();
    expect(onFinished).toHaveBeenCalledWith([]);
  });

  it('retains ineligible selections after processing the eligible batch scope', async () => {
    const onFinished = jest.fn();
    eligibilityMock.mockResolvedValueOnce({
      data: [
        {
          ordinal: 0,
          review_id: 'review-1',
          eligible: true,
          reviewer_count: 1,
          submitted_opinion_count: 1,
          approve_opinion_count: 1,
          reject_opinion_count: 0,
        },
        {
          ordinal: 1,
          review_id: 'review-2',
          eligible: false,
          reason_code: 'OPINIONS_PENDING',
          reviewer_count: 1,
          submitted_opinion_count: 0,
          approve_opinion_count: 0,
          reject_opinion_count: 0,
        },
      ],
      error: null,
    });
    adminDecisionMock.mockResolvedValue({
      data: [successfulResult(['review-1'])],
      error: null,
    } as never);

    render(
      <BatchReviewActions
        role='admin'
        reviewIds={['review-1', 'review-2']}
        allowApprove
        onFinished={onFinished}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Batch approve' }));

    await waitFor(() =>
      expect(adminDecisionMock).toHaveBeenCalledWith(['review-1'], 'approve', undefined),
    );
    expect(onFinished).toHaveBeenCalledWith(['review-2']);
  });

  it('submits a reviewer rejection as an advisory opinion and reports partial results', async () => {
    const onFinished = jest.fn();
    reviewerDecisionMock.mockResolvedValue({
      data: [
        {
          ...successfulResult(['review-1', 'review-2']),
          command: 'reviewer_review_batch_decision',
          summary: { total: 2, succeeded: 1, failed: 1 },
          results: [
            { reviewId: 'review-1', ok: true },
            { reviewId: 'review-2', ok: false, code: 'NOT_APPLICABLE' },
          ],
        },
      ],
      error: null,
    } as never);

    render(
      <BatchReviewActions
        role='reviewer'
        reviewIds={['review-1', 'review-2']}
        allowApprove={false}
        disabled={false}
        onFinished={onFinished}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Batch approve' })).not.toBeInTheDocument();
    expect(screen.getByTestId('batch-reject-icon')).toBeInTheDocument();
    const rejectButton = screen.getByRole('button', { name: 'Batch reject' });
    expect(rejectButton).toHaveAttribute('data-button-type', 'text');
    expect(rejectButton).toHaveAttribute('data-button-size', 'large');
    expect(rejectButton).not.toHaveAttribute('data-button-shape');
    expect(rejectButton).toHaveAttribute('data-button-danger', 'false');
    expect(rejectButton).toHaveStyle({ width: '24px', height: '32px', paddingInline: 0 });
    fireEvent.click(rejectButton);
    expect(
      await screen.findByRole('region', { name: 'Reject 2 selected reviews' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
    expect(screen.queryByRole('region')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Batch reject' }));
    fireEvent.click(await screen.findByRole('button', { name: 'confirm reject' }));

    await waitFor(() =>
      expect(reviewerDecisionMock).toHaveBeenCalledWith(
        ['review-1', 'review-2'],
        'reject',
        'insufficient evidence',
      ),
    );
    expect(mockWarning).toHaveBeenCalledWith('1 succeeded and 1 failed.');
    expect(onFinished).toHaveBeenCalledWith(['review-2']);
  });

  it('reports command and malformed-response failures without refreshing', async () => {
    const onFinished = jest.fn();
    adminDecisionMock.mockResolvedValue({ data: null, error: new Error('denied') } as never);
    reviewerDecisionMock.mockResolvedValue({ data: [], error: null } as never);

    const { rerender } = render(
      <BatchReviewActions
        role='admin'
        reviewIds={['review-1']}
        allowApprove
        disabled={false}
        onFinished={onFinished}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Batch approve' }));
    await waitFor(() => expect(mockError).toHaveBeenCalledTimes(1));

    rerender(
      <BatchReviewActions
        role='reviewer'
        reviewIds={['review-2']}
        allowApprove
        disabled={false}
        onFinished={onFinished}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Batch approve' }));
    await waitFor(() => expect(mockError).toHaveBeenCalledTimes(2));
    expect(onFinished).not.toHaveBeenCalled();
  });

  it('reports eligibility failures before opening a confirmation', async () => {
    eligibilityMock
      .mockResolvedValueOnce({
        data: [],
        error: new Error('approve preflight failed'),
      } as never)
      .mockResolvedValueOnce({
        data: [],
        error: new Error('reject preflight failed'),
      } as never);

    render(
      <BatchReviewActions
        role='admin'
        reviewIds={['review-1']}
        allowApprove
        onFinished={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Batch approve' }));

    await waitFor(() =>
      expect(mockError).toHaveBeenCalledWith('Unable to check the selected review scope.'),
    );
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(adminDecisionMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Batch reject' }));

    await waitFor(() => expect(mockError).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(adminDecisionMock).not.toHaveBeenCalled();
  });

  it('shows ineligible reason counts and does not submit an empty eligible scope', async () => {
    eligibilityMock.mockResolvedValueOnce({
      data: [
        {
          ordinal: 1,
          review_id: 'review-1',
          eligible: false,
          reason_code: null,
          reviewer_count: 0,
          submitted_opinion_count: 0,
          approve_opinion_count: 0,
          reject_opinion_count: 0,
        },
        {
          ordinal: 2,
          review_id: 'review-2',
          eligible: false,
          reason_code: 'REVIEW_ALREADY_COMPLETED',
          reviewer_count: 1,
          submitted_opinion_count: 1,
          approve_opinion_count: 1,
          reject_opinion_count: 0,
        },
      ],
      error: null,
    });

    render(
      <BatchReviewActions
        role='admin'
        reviewIds={['review-1', 'review-2']}
        allowApprove
        onFinished={jest.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Batch reject' }));

    expect(
      await screen.findByRole('region', { name: 'Reject 2 selected reviews' }),
    ).toHaveTextContent('NOT_APPLICABLE: 1; REVIEW_ALREADY_COMPLETED: 1');
    fireEvent.click(screen.getByRole('button', { name: 'confirm reject' }));

    await waitFor(() =>
      expect(mockWarning).toHaveBeenCalledWith('None of the selected reviews can be processed.'),
    );
    expect(adminDecisionMock).not.toHaveBeenCalled();
  });

  it('disables actions for explicit disablement and empty selections', () => {
    const { rerender } = render(
      <BatchReviewActions
        role='admin'
        reviewIds={['review-1']}
        allowApprove
        disabled
        onFinished={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Batch approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Batch reject' })).toBeDisabled();

    rerender(
      <BatchReviewActions role='admin' reviewIds={[]} allowApprove onFinished={jest.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Batch approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Batch reject' })).toBeDisabled();
  });
});
