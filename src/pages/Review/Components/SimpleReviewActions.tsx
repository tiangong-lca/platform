import {
  approveReviewApi,
  submitSimpleReviewDecision,
  type ReviewSubmitDatasetTable,
} from '@/services/reviews/api';
import { FileExcelOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useIntl } from '@umijs/max';
import { App, Button, Form, Input, Modal, Space, Tooltip } from 'antd';
import { useState } from 'react';
import RejectReview from './RejectReview';

type SimpleReviewActionsProps = {
  reviewId: string;
  targetTable: ReviewSubmitDatasetTable;
  role: 'admin' | 'reviewer';
  actionRef: any;
  approveDisabledReason?: string;
  dataVersion?: string;
  approveOpinionCount?: number;
  rejectOpinionCount?: number;
};

const SimpleReviewActions = ({
  reviewId,
  targetTable,
  role,
  actionRef,
  approveDisabledReason,
  dataVersion,
  approveOpinionCount = 0,
  rejectOpinionCount = 0,
}: SimpleReviewActionsProps) => {
  const intl = useIntl();
  const [form] = Form.useForm<{ reason: string }>();
  const { message, modal } = App.useApp();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const reload = () => actionRef?.current?.reload?.();

  const approve = async () => {
    setLoading(true);
    try {
      const result =
        role === 'admin'
          ? await approveReviewApi(reviewId, targetTable)
          : await submitSimpleReviewDecision(reviewId, 'approve');
      if (result.error) throw result.error;
      message.success(
        intl.formatMessage({
          id: 'pages.review.simpleDecision.approveSuccess',
          defaultMessage: 'Review approved.',
        }),
      );
      reload();
    } catch {
      message.error(
        intl.formatMessage({
          id: 'pages.review.simpleDecision.error',
          defaultMessage: 'Unable to submit the review decision.',
        }),
      );
    } finally {
      setLoading(false);
    }
  };

  const rejectAsReviewer = async () => {
    const { reason } = await form.validateFields();
    setLoading(true);
    try {
      const result = await submitSimpleReviewDecision(reviewId, 'reject', reason);
      if (result.error) throw result.error;
      message.success(
        intl.formatMessage({
          id: 'pages.review.simpleDecision.rejectSuccess',
          defaultMessage: 'Review rejection submitted.',
        }),
      );
      setRejectOpen(false);
      form.resetFields();
      reload();
    } catch {
      message.error(
        intl.formatMessage({
          id: 'pages.review.simpleDecision.error',
          defaultMessage: 'Unable to submit the review decision.',
        }),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Space>
        <Tooltip
          title={
            approveDisabledReason ||
            intl.formatMessage({
              id: 'pages.review.simpleDecision.approve',
              defaultMessage: 'Approve',
            })
          }
        >
          <Button
            size='small'
            shape='circle'
            icon={<SafetyCertificateOutlined />}
            loading={loading}
            disabled={Boolean(approveDisabledReason)}
            onClick={() =>
              modal.confirm({
                title: intl.formatMessage({
                  id: 'pages.review.simpleDecision.approveConfirm',
                  defaultMessage: 'Confirm approval?',
                }),
                okButtonProps: {
                  type: 'primary',
                },
                content:
                  role === 'admin'
                    ? intl.formatMessage(
                        {
                          id: 'pages.review.simpleDecision.approveSummary',
                          defaultMessage:
                            'Version {version}; approve opinions: {approve}; reject opinions: {reject}.',
                        },
                        {
                          version: dataVersion ?? '-',
                          approve: approveOpinionCount,
                          reject: rejectOpinionCount,
                        },
                      )
                    : undefined,
                onOk: approve,
              })
            }
          />
        </Tooltip>
        {role === 'admin' ? (
          <RejectReview
            reviewId={reviewId}
            dataId=''
            dataVersion=''
            isModel={targetTable === 'lifecyclemodels'}
            targetTable={targetTable}
            actionRef={actionRef}
          />
        ) : (
          <>
            <Tooltip
              title={intl.formatMessage({
                id: 'pages.review.simpleDecision.reject',
                defaultMessage: 'Reject',
              })}
            >
              <Button
                size='small'
                shape='circle'
                type='default'
                icon={<FileExcelOutlined />}
                onClick={() => setRejectOpen(true)}
              />
            </Tooltip>
            <Modal
              open={rejectOpen}
              title={intl.formatMessage({
                id: 'component.rejectReview.modal.title',
                defaultMessage: 'Reject Review',
              })}
              confirmLoading={loading}
              onCancel={() => setRejectOpen(false)}
              onOk={rejectAsReviewer}
            >
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
        )}
      </Space>
    </>
  );
};

export default SimpleReviewActions;
