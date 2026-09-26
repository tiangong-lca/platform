import {
  getReviewBatchEligibility,
  submitAdminReviewBatchDecision,
  submitReviewerBatchDecision,
  type ReviewBatchEligibility,
  type ReviewBatchDecision,
  type ReviewBatchDecisionResult,
} from '@/services/reviews/api';
import { FileExcelOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import { Alert, App, Button, Form, Input, Modal, Space, theme, Tooltip } from 'antd';
import { useState } from 'react';

type BatchReviewActionsProps = {
  role: 'admin' | 'reviewer';
  reviewIds: React.Key[];
  allowApprove: boolean;
  disabled?: boolean;
  onFinished: (failedReviewIds: string[]) => void;
};

const BatchReviewActions = ({
  role,
  reviewIds,
  allowApprove,
  disabled = false,
  onFinished,
}: BatchReviewActionsProps) => {
  const intl = useIntl();
  const { token } = theme.useToken();
  const [form] = Form.useForm<{ reason: string }>();
  const { message, modal } = App.useApp();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<ReviewBatchEligibility[]>([]);

  const operationFor = (decision: ReviewBatchDecision) =>
    `${role === 'admin' ? 'admin' : 'reviewer'}-${decision}` as const;

  const prepare = async (decision: ReviewBatchDecision) => {
    setLoading(true);
    try {
      const result = await getReviewBatchEligibility(reviewIds, operationFor(decision));
      if (result.error) throw result.error;
      setPreview(result.data);
      return result.data;
    } catch {
      message.error(
        intl.formatMessage({
          id: 'pages.review.batch.previewError',
          defaultMessage: 'Unable to check the selected review scope.',
        }),
      );
      return null;
    } finally {
      setLoading(false);
    }
  };

  const previewSummary = (items: ReviewBatchEligibility[]) => {
    const eligibleCount = items.filter((item) => item.eligible).length;
    const reasons = items
      .filter((item) => !item.eligible)
      .reduce<Record<string, number>>((accumulator, item) => {
        const reason = item.reason_code ?? 'NOT_APPLICABLE';
        accumulator[reason] = (accumulator[reason] ?? 0) + 1;
        return accumulator;
      }, {});
    return (
      <Space orientation='vertical'>
        <span>
          {intl.formatMessage(
            {
              id: 'pages.review.batch.scopeSummary',
              defaultMessage:
                '{total} reviews selected (including references); {eligible} can be processed.',
            },
            { total: items.length, eligible: eligibleCount },
          )}
        </span>
        {Object.keys(reasons).length > 0 && (
          <Alert
            type='warning'
            showIcon
            title={intl.formatMessage({
              id: 'pages.review.batch.notApplicable',
              defaultMessage: 'Items not processed',
            })}
            description={Object.entries(reasons)
              .map(([reason, count]) => `${reason}: ${count}`)
              .join('; ')}
          />
        )}
      </Space>
    );
  };

  const submit = async (
    decision: ReviewBatchDecision,
    reason?: string,
    preparedPreview = preview,
  ) => {
    const eligibleReviewIds = preparedPreview
      .filter((item) => item.eligible)
      .map((item) => item.review_id);
    if (eligibleReviewIds.length === 0) {
      message.warning(
        intl.formatMessage({
          id: 'pages.review.batch.noneEligible',
          defaultMessage: 'None of the selected reviews can be processed.',
        }),
      );
      return;
    }
    setLoading(true);
    try {
      const result =
        role === 'admin'
          ? await submitAdminReviewBatchDecision(eligibleReviewIds, decision, reason)
          : await submitReviewerBatchDecision(eligibleReviewIds, decision, reason);
      if (result.error) throw result.error;

      const payload = result.data?.[0] as ReviewBatchDecisionResult | undefined;
      if (!payload) throw new Error('Missing batch result');

      if (payload.summary.failed > 0) {
        message.warning(
          intl.formatMessage(
            {
              id: 'pages.review.batch.partial',
              defaultMessage: '{succeeded} succeeded and {failed} failed.',
            },
            payload.summary,
          ),
        );
      } else {
        message.success(
          intl.formatMessage(
            {
              id: 'pages.review.batch.success',
              defaultMessage: '{count} reviews processed successfully.',
            },
            { count: payload.summary.succeeded },
          ),
        );
      }

      setRejectOpen(false);
      form.resetFields();
      const failedReviewIds = [
        ...preparedPreview.filter((item) => !item.eligible).map((item) => item.review_id),
        ...payload.results.filter((item) => !item.ok).map((item) => item.reviewId),
      ];
      onFinished(Array.from(new Set(failedReviewIds)));
    } catch {
      message.error(
        intl.formatMessage({
          id: 'pages.review.batch.error',
          defaultMessage: 'Unable to process the selected reviews.',
        }),
      );
    } finally {
      setLoading(false);
    }
  };

  const submitReject = async () => {
    const { reason } = await form.validateFields();
    await submit('reject', reason);
  };

  const confirmApprove = () => {
    void prepare('approve').then((items) => {
      if (!items) return;
      modal.confirm({
        title: intl.formatMessage(
          {
            id: 'pages.review.batch.approve.confirm',
            defaultMessage: 'Approve {count} selected reviews?',
          },
          { count: items.filter((item) => item.eligible).length },
        ),
        content: previewSummary(items),
        okText: intl.formatMessage({
          id: 'pages.review.batch.approve',
          defaultMessage: 'Batch approve',
        }),
        onOk: () => submit('approve', undefined, items),
      });
    });
  };

  const openReject = () => {
    void prepare('reject').then((items) => {
      if (!items) return;
      setRejectOpen(true);
    });
  };

  return (
    <>
      <Space size={token.marginXS}>
        {allowApprove && (
          <Tooltip
            title={intl.formatMessage({
              id: 'pages.review.batch.approve',
              defaultMessage: 'Batch approve',
            })}
          >
            <Button
              type='text'
              size='large'
              style={{
                width: token.controlHeightSM,
                height: token.controlHeight,
                paddingInline: 0,
              }}
              aria-label={intl.formatMessage({
                id: 'pages.review.batch.approve',
                defaultMessage: 'Batch approve',
              })}
              icon={<SafetyCertificateOutlined />}
              loading={loading}
              disabled={disabled || reviewIds.length === 0}
              onClick={confirmApprove}
            />
          </Tooltip>
        )}
        <Tooltip
          title={intl.formatMessage({
            id: 'pages.review.batch.reject',
            defaultMessage: 'Batch reject',
          })}
        >
          <Button
            type='text'
            size='large'
            style={{
              width: token.controlHeightSM,
              height: token.controlHeight,
              paddingInline: 0,
            }}
            aria-label={intl.formatMessage({
              id: 'pages.review.batch.reject',
              defaultMessage: 'Batch reject',
            })}
            icon={<FileExcelOutlined />}
            loading={loading}
            disabled={disabled || reviewIds.length === 0}
            onClick={openReject}
          />
        </Tooltip>
      </Space>
      <Modal
        open={rejectOpen}
        title={intl.formatMessage(
          {
            id: 'pages.review.batch.reject.confirm',
            defaultMessage: 'Reject {count} selected reviews',
          },
          { count: reviewIds.length },
        )}
        okText={intl.formatMessage({
          id: 'pages.review.batch.reject',
          defaultMessage: 'Batch reject',
        })}
        okButtonProps={{ danger: true }}
        confirmLoading={loading}
        onCancel={() => setRejectOpen(false)}
        onOk={submitReject}
      >
        {previewSummary(preview)}
        <Form form={form} layout='vertical'>
          <Form.Item
            name='reason'
            label={intl.formatMessage({
              id: 'component.rejectReview.reason.label',
              defaultMessage: 'Reject Reason',
            })}
            rules={[{ required: true, whitespace: true }]}
          >
            <Input.TextArea rows={4} maxLength={1000} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default BatchReviewActions;
