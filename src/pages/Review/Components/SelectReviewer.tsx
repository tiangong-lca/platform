import { renderTableSelectionClearAction } from '@/components/TableSelectionAlert';
import { getReviewerIdsByReviewId } from '@/services/comments/api';
import {
  assignReviewersApi,
  getReviewerIdsApi,
  getReviewsDetail,
  revokeReviewerApi,
} from '@/services/reviews/api';
import { isCurrentAssignedReviewerCommentState } from '@/services/reviews/util';
import { getReviewMembersApi } from '@/services/roles/api';
import { TeamMemberTable } from '@/services/teams/data';
import { getUsersByIds } from '@/services/users/api';
import styles from '@/style/custom.less';
import { CloseOutlined, DeleteOutlined, UsergroupAddOutlined } from '@ant-design/icons';
import { ActionType, ProColumns, ProTable } from '@ant-design/pro-components';
import { FormattedMessage, useIntl } from '@umijs/max';
import { App, Button, DatePicker, Drawer, Space, Spin, theme, Tooltip } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import { useEffect, useRef, useState } from 'react';

type SelectReviewerProps = {
  reviewIds: React.Key[];
  actionRef: any;
  tabType: 'unassigned' | 'assigned';
  disabled?: boolean;
};

export default function SelectReviewer({
  reviewIds,
  actionRef,
  tabType,
  disabled = false,
}: SelectReviewerProps) {
  const intl = useIntl();
  const { message } = App.useApp();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const defaultSelectedRowKeys = useRef<React.Key[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [currentReviewers, setCurrentReviewers] = useState<
    Array<{ reviewer_id: string; reviewer_name?: string; state_code: number }>
  >([]);
  const [reviewDeadline, setReviewDeadline] = useState<Dayjs | null>(dayjs().add(15, 'day'));
  const { token } = theme.useToken();
  const tableRef = useRef<ActionType>(undefined);
  const tableAlertOptionRender = renderTableSelectionClearAction(
    <FormattedMessage id='pages.searchTable.clearSelection' defaultMessage='Clear selection' />,
  );
  const handleRowSelectionChange = (keys: React.Key[]) => {
    setSelectedRowKeys(keys);
  };

  useEffect(() => {
    if (!drawerVisible) {
      setSelectedRowKeys([]);
      defaultSelectedRowKeys.current = [];
      setCurrentReviewers([]);
      setReviewDeadline(dayjs().add(15, 'day'));
      return;
    }
    const init = async () => {
      setSpinning(true);
      switch (tabType) {
        case 'unassigned': {
          const result = await getReviewerIdsApi(reviewIds);
          setSelectedRowKeys(result);
          tableRef.current?.reload();
          break;
        }
        case 'assigned': {
          const result = await getReviewerIdsByReviewId(reviewIds[0] as string);
          const current = (result ?? []).filter((item: any) =>
            isCurrentAssignedReviewerCommentState(item.state_code),
          );
          const keys = current.map((item: any) => item.reviewer_id);
          const users = await getUsersByIds(keys);
          setCurrentReviewers(
            current.map((item: any) => ({
              ...item,
              reviewer_name: users?.find((user: any) => user.id === item.reviewer_id)?.display_name,
            })),
          );
          setSelectedRowKeys(keys);
          const riviewDetail = await getReviewsDetail(reviewIds[0] as string);
          if (riviewDetail?.deadline) {
            setReviewDeadline(dayjs(riviewDetail.deadline));
          }
          defaultSelectedRowKeys.current = keys;
          tableRef.current?.reload();
          break;
        }
      }
      setSpinning(false);
    };
    init();
  }, [drawerVisible, reviewIds, tabType]);

  const columns: ProColumns<TeamMemberTable>[] = [
    {
      title: <FormattedMessage id='pages.review.members.email' defaultMessage='Email' />,
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: <FormattedMessage id='pages.review.members.memberName' defaultMessage='Member Name' />,
      dataIndex: 'display_name',
      key: 'display_name',
    },
    {
      title: <FormattedMessage id='pages.review.members.role' defaultMessage='Role' />,
      dataIndex: 'role',
      key: 'role',
      render: (_, record) => (
        <span>
          {record.role === 'review-admin' ? (
            <FormattedMessage id='pages.review.members.role.admin' defaultMessage='Administrator' />
          ) : record.role === 'review-member' ? (
            <FormattedMessage id='pages.review.members.role.member' defaultMessage='Member' />
          ) : (
            <></>
          )}
        </span>
      ),
    },
  ];

  const revokeReviewer = async (reviewerId: string) => {
    setSpinning(true);
    try {
      const result = await revokeReviewerApi(String(reviewIds[0]), reviewerId);
      if (result.error || (result.data?.length ?? 0) === 0) throw result.error;
      setCurrentReviewers((current) => current.filter((item) => item.reviewer_id !== reviewerId));
      setSelectedRowKeys((current) => current.filter((key) => key !== reviewerId));
      defaultSelectedRowKeys.current = defaultSelectedRowKeys.current.filter(
        (key) => key !== reviewerId,
      );
      message.success(
        intl.formatMessage({
          id: 'pages.review.progress.delete.success',
          defaultMessage: 'Reviewer assignment revoked.',
        }),
      );
      actionRef.current?.reload?.();
    } catch {
      message.error(
        intl.formatMessage({
          id: 'pages.review.progress.delete.error',
          defaultMessage: 'Failed to revoke the reviewer assignment.',
        }),
      );
    } finally {
      setSpinning(false);
    }
  };

  const handleSave = async () => {
    setSpinning(true);
    try {
      const reviewerIds = Array.from(
        new Set([
          ...currentReviewers.map((item) => item.reviewer_id),
          ...selectedRowKeys.map(String),
        ]),
      );

      const result = await assignReviewersApi(
        reviewIds,
        reviewerIds,
        reviewDeadline?.toISOString() ?? null,
      );

      if (!result.error) {
        message.success(
          intl.formatMessage({
            id: 'pages.review.saveSuccess',
            defaultMessage: 'Reviewer assignments saved successfully.',
          }),
        );
        setDrawerVisible(false);
        actionRef.current?.reload();
      } else {
        throw result.error;
      }
    } catch (error) {
      console.error('保存失败:', error);
      message.error(
        intl.formatMessage({
          id: 'pages.review.saveError',
          defaultMessage: 'Save failed',
        }),
      );
    } finally {
      setSpinning(false);
    }
  };

  return (
    <>
      <Tooltip
        title={
          <FormattedMessage
            id='pages.review.selectReviewer.button'
            defaultMessage='Assign for review'
          />
        }
      >
        <Button
          shape='circle'
          onClick={() => setDrawerVisible(true)}
          disabled={disabled}
          type='text'
          icon={<UsergroupAddOutlined />}
          size='small'
        />
      </Tooltip>
      <Drawer
        destroyOnHidden
        styles={{ body: { paddingTop: 0 } }}
        getContainer={() => document.body}
        title={
          <FormattedMessage id='pages.review.drawer.title' defaultMessage='Assign for review' />
        }
        size='90%'
        closable={false}
        extra={
          <Button
            icon={<CloseOutlined />}
            style={{ border: 0 }}
            onClick={() => setDrawerVisible(false)}
          />
        }
        mask={{ closable: true }}
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        footer={
          <Space size={'middle'} className={styles.footer_right}>
            <Button onClick={() => setDrawerVisible(false)}>
              <FormattedMessage id='pages.button.cancel' defaultMessage='Cancel' />
            </Button>
            <Button
              onClick={handleSave}
              type='primary'
              disabled={tabType === 'unassigned' ? selectedRowKeys.length === 0 : false}
            >
              <FormattedMessage
                id='pages.review.assignment.confirm'
                defaultMessage='Confirm assignment'
              />
            </Button>
          </Space>
        }
      >
        <Spin spinning={spinning}>
          {tabType === 'assigned' && currentReviewers.length > 0 && (
            <ProTable
              rowKey='reviewer_id'
              search={false}
              pagination={false}
              options={false}
              headerTitle={
                <FormattedMessage
                  id='pages.review.assignment.current'
                  defaultMessage='Current reviewers'
                />
              }
              dataSource={currentReviewers}
              columns={[
                {
                  title: (
                    <FormattedMessage
                      id='pages.review.members.memberName'
                      defaultMessage='Member Name'
                    />
                  ),
                  dataIndex: 'reviewer_name',
                },
                {
                  title: (
                    <FormattedMessage
                      id='pages.review.progress.table.status'
                      defaultMessage='Review Status'
                    />
                  ),
                  dataIndex: 'state_code',
                  render: (_, record) =>
                    record.state_code === 0
                      ? intl.formatMessage({
                          id: 'pages.review.progress.status.pending',
                          defaultMessage: 'Pending Review',
                        })
                      : intl.formatMessage({
                          id: 'pages.review.progress.status.reviewed',
                          defaultMessage: 'Reviewed',
                        }),
                },
                {
                  title: <FormattedMessage id='pages.review.actions' defaultMessage='Actions' />,
                  render: (_, record) => (
                    <Tooltip
                      title={
                        record.state_code === 0
                          ? intl.formatMessage({
                              id: 'pages.review.progress.tooltip.revoke',
                              defaultMessage: 'Revoke reviewer assignment',
                            })
                          : intl.formatMessage({
                              id: 'pages.review.assignment.cannotRevokeSubmitted',
                              defaultMessage: 'A submitted reviewer cannot be revoked.',
                            })
                      }
                    >
                      <Button
                        danger
                        type='text'
                        icon={<DeleteOutlined />}
                        disabled={record.state_code !== 0}
                        onClick={() => revokeReviewer(record.reviewer_id)}
                      />
                    </Tooltip>
                  ),
                },
              ]}
            />
          )}
          <ProTable<TeamMemberTable>
            rowKey='user_id'
            search={false}
            manualRequest={true}
            actionRef={tableRef}
            options={{ fullScreen: true, reload: true }}
            toolbar={{
              title: (
                <Space align='center'>
                  <span style={{ fontSize: token.fontSize }}>
                    <FormattedMessage id='pages.review.deadline' defaultMessage='Review Deadline' />
                  </span>
                  <DatePicker
                    value={reviewDeadline}
                    onChange={(date) => setReviewDeadline(date)}
                    showTime
                    format='YYYY-MM-DD HH:mm:ss'
                    placeholder={intl.formatMessage({
                      id: 'pages.review.deadline.placeholder',
                      defaultMessage: 'Select review deadline',
                    })}
                    disabledDate={(current) => current && current < dayjs().startOf('day')}
                    size='middle'
                    allowClear
                  />
                </Space>
              ),
            }}
            tableAlertOptionRender={tableAlertOptionRender}
            rowSelection={{
              selectedRowKeys,
              onChange: handleRowSelectionChange,
              getCheckboxProps: (record) => ({
                disabled: currentReviewers.some(
                  (item) => item.reviewer_id === String(record.user_id),
                ),
              }),
            }}
            request={async (params, sort) => {
              const result = await getReviewMembersApi(params, sort, 'review-member');
              return {
                data: result.data,
                success: result.success,
                total: result.total,
              };
            }}
            columns={columns}
          />
        </Spin>
      </Drawer>
    </>
  );
}
