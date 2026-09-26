import { RefCheckContext, RefCheckType } from '@/contexts/refCheckContext';
import {
  checkReferences,
  getAllRefObj,
  getRejectedComments,
  refDataType,
  ReffPath,
} from '@/pages/Utils/review';
import {
  getCommentApi,
  saveReviewCommentDraftApi,
  submitReviewCommentApi,
} from '@/services/comments/api';
import { CANONICAL_CONTENT_LANGUAGE } from '@/services/general/contentLanguageRegistry';
import { jsonToList } from '@/services/general/util';
import { getProcessDetail } from '@/services/processes/api';
import { genProcessFromData } from '@/services/processes/util';
import { getUserTeamId } from '@/services/roles/api';
import styles from '@/style/custom.less';
import { AuditOutlined, CloseOutlined, ProfileOutlined } from '@ant-design/icons';
import { ActionType, ProForm, ProFormInstance } from '@ant-design/pro-components';
import { App, Button, Drawer, Form, Input, Space, Spin, Tooltip } from 'antd';
import type { FC } from 'react';
import { useEffect, useRef, useState } from 'react';
import { FormattedMessage, useIntl } from 'umi';
import RejectReview from '../RejectReview';
import { TabsDetail } from './tabsDetail';

type Props = {
  id: string;
  reviewId: string;
  version: string;
  lang: string;
  actionRef: React.RefObject<ActionType | undefined> | undefined;
  type: 'edit' | 'view';
  tabType: 'assigned' | 'review' | 'reviewer-rejected' | 'admin-rejected';
  hideButton?: boolean;
};

const DEFAULT_REVIEW_COMPLIANCES = [
  {
    'common:referenceToComplianceSystem': {
      '@refObjectId': '1ea48531-e397-4ca7-ac08-056e4fa11826',
      '@type': 'source data set',
      '@uri': '../sources/1ea48531-e397-4ca7-ac08-056e4fa11826.xml',
      '@version': '20.20.002',
      'common:shortDescription': [
        {
          '@xml:lang': CANONICAL_CONTENT_LANGUAGE,
          '#text':
            'ISO 14040 Environmental Management – Life Cycle Assessment – Principles and Framework, 2006',
        },
      ],
    },
    'common:approvalOfOverallCompliance': 'Fully compliant',
    'common:nomenclatureCompliance': 'Not defined',
    'common:methodologicalCompliance': 'Fully compliant',
    'common:reviewCompliance': 'Fully compliant',
    'common:documentationCompliance': 'Not defined',
    'common:qualityCompliance': 'Not defined',
  },
  {
    'common:approvalOfOverallCompliance': 'Fully compliant',
    'common:nomenclatureCompliance': 'Not defined',
    'common:methodologicalCompliance': 'Fully compliant',
    'common:reviewCompliance': 'Not defined',
    'common:documentationCompliance': 'Fully compliant',
    'common:qualityCompliance': 'Not defined',
    'common:referenceToComplianceSystem': {
      '@refObjectId': '1adb438d-4a8b-4919-885e-0a66da3c0f2a',
      '@type': 'source data set',
      '@uri': '../sources/1adb438d-4a8b-4919-885e-0a66da3c0f2a.xml',
      '@version': '20.20.002',
      'common:shortDescription': [
        {
          '@xml:lang': CANONICAL_CONTENT_LANGUAGE,
          '#text':
            'ISO 14044:2006. Environmental Management – Life Cycle Assessment – Requirements and guidelines.',
        },
      ],
    },
  },
  {
    'common:approvalOfOverallCompliance': 'Fully compliant',
    'common:nomenclatureCompliance': 'Fully compliant',
    'common:methodologicalCompliance': 'Fully compliant',
    'common:reviewCompliance': 'Fully compliant',
    'common:documentationCompliance': 'Fully compliant',
    'common:qualityCompliance': 'Not defined',
    'common:referenceToComplianceSystem': {
      '@refObjectId': 'd92a1a12-2545-49e2-a585-55c259997756',
      '@type': 'source data set',
      '@uri': '../sources/d92a1a12-2545-49e2-a585-55c259997756.xml',
      '@version': '20.20.002',
      'common:shortDescription': [
        {
          '@xml:lang': CANONICAL_CONTENT_LANGUAGE,
          '#text': 'ILCD Data Network - Entry-level',
        },
      ],
    },
  },
  {
    'common:approvalOfOverallCompliance': 'Fully compliant',
    'common:nomenclatureCompliance': 'Fully compliant',
    'common:methodologicalCompliance': 'Not defined',
    'common:reviewCompliance': 'Not defined',
    'common:documentationCompliance': 'Not defined',
    'common:qualityCompliance': 'Not defined',
    'common:referenceToComplianceSystem': {
      '@refObjectId': 'c84c4185-d1b0-44fc-823e-d2ec630c7906',
      '@type': 'source data set',
      '@uri': '../sources/c84c4185-d1b0-44fc-823e-d2ec630c7906.xml',
      '@version': '00.00.001',
      'common:shortDescription': [
        {
          '@xml:lang': CANONICAL_CONTENT_LANGUAGE,
          '#text': 'Environmental Footprint (EF) 3.1',
        },
      ],
    },
  },
  {
    'common:approvalOfOverallCompliance': 'Fully compliant',
    'common:nomenclatureCompliance': 'Fully compliant',
    'common:methodologicalCompliance': 'Fully compliant',
    'common:reviewCompliance': 'Fully compliant',
    'common:documentationCompliance': 'Fully compliant',
    'common:qualityCompliance': 'Fully compliant',
    'common:referenceToComplianceSystem': {
      '@refObjectId': '779fb9ea-de54-4707-b7fc-6154661552b5',
      '@type': 'source data set',
      '@uri': '../sources/779fb9ea-de54-4707-b7fc-6154661552b5.xml',
      '@version': '01.00.000',
      'common:shortDescription': [
        {
          '@xml:lang': CANONICAL_CONTENT_LANGUAGE,
          '#text':
            'Commission Recommendation (EU) 2021/2279. (Annex I. Product Environmental Footprint Method)',
        },
      ],
    },
  },
];

const hasMeaningfulCommentItems = (value: any) =>
  jsonToList(value).some((item: any) => {
    if (!item) {
      return false;
    }

    if (Object.prototype.toString.call(item) !== '[object Object]') {
      return true;
    }

    return Object.keys(item).length > 0;
  });

const ReviewProcessDetail: FC<Props> = ({
  id,
  reviewId,
  version,
  lang,
  actionRef,
  type,
  tabType,
  hideButton = false,
}) => {
  const [drawerVisible, setDrawerVisible] = useState(false);
  const formRefEdit = useRef<ProFormInstance>(undefined);
  const [activeTabKey, setActiveTabKey] = useState<string>('processInformation');
  const [fromData, setFromData] = useState<any>({});
  const [initData, setInitData] = useState<any>({});
  const [exchangeDataSource, setExchangeDataSource] = useState<any>([]);
  const [spinning, setSpinning] = useState(false);
  const intl = useIntl();
  const { message } = App.useApp();
  const [refCheckData, setRefCheckData] = useState<any[]>([]);
  const [rejectedComments, setRejectedComments] = useState<any>([]);

  const handletFromData = () => {
    if (fromData?.id) {
      setFromData({
        ...fromData,
        [activeTabKey]: formRefEdit.current?.getFieldsValue()?.[activeTabKey] ?? {},
      });
    }
  };

  const handletExchangeData = (data: any) => {
    if (fromData?.id) setExchangeDataSource([...data]);
  };

  const onTabChange = (key: string) => {
    setActiveTabKey(key);
  };

  const onEdit = () => {
    setDrawerVisible(true);
    setActiveTabKey('processInformation');
  };

  const temporarySave = async () => {
    try {
      const fieldsValue = formRefEdit.current?.getFieldsValue();
      const submitData = {
        modellingAndValidation: {
          complianceDeclarations: fieldsValue?.modellingAndValidation?.complianceDeclarations,
          validation: fieldsValue?.modellingAndValidation?.validation,
        },
      };

      setSpinning(true);
      const result = await saveReviewCommentDraftApi(reviewId, submitData);
      if (!result.error) {
        message.success(
          intl.formatMessage({
            id: 'pages.review.temporarySaveSuccess',
            defaultMessage: 'Temporarily saved successfully.',
          }),
        );
        setDrawerVisible(false);
        actionRef?.current?.reload();
      } else {
        throw result.error;
      }
    } catch (error) {
      console.error(error);
    } finally {
      setSpinning(false);
    }
  };

  const onReset = () => {
    setSpinning(true);
    getProcessDetail(id, version).then(async (result: any) => {
      const { data, error } = await getCommentApi(reviewId, tabType);
      if (!error && data && data.length) {
        const allReviews: any[] = [];
        const allCompliance: any[] = [];
        let hasSeededDefaultCompliance = false;
        data.forEach((item: any) => {
          const reviewItems = jsonToList(item?.json?.modellingAndValidation?.validation?.review);
          if (reviewItems.length) {
            allReviews.push(...reviewItems);
          }

          const complianceItems = jsonToList(
            item?.json?.modellingAndValidation?.complianceDeclarations?.compliance,
          );

          if (hasMeaningfulCommentItems(complianceItems)) {
            allCompliance.push(...complianceItems);
          } else if (tabType === 'review' && type === 'edit' && !hasSeededDefaultCompliance) {
            // Keep reviewer defaults visible even when the comment row exists but its json is empty.
            allCompliance.push(...DEFAULT_REVIEW_COMPLIANCES);
            hasSeededDefaultCompliance = true;
          }
        });
        if (result?.data?.json?.processDataSet) {
          const _compliance =
            result.data.json.processDataSet?.modellingAndValidation?.complianceDeclarations
              ?.compliance;
          const _review =
            result.data.json.processDataSet?.modellingAndValidation?.validation?.review;
          result.data.json.processDataSet.modellingAndValidation = {
            ...result.data.json.processDataSet.modellingAndValidation,
            complianceDeclarations: {
              compliance:
                tabType === 'review' || tabType === 'reviewer-rejected'
                  ? [...(allCompliance.length ? allCompliance : [{}])]
                  : Array.isArray(_compliance)
                    ? [..._compliance, ...allCompliance]
                    : _compliance
                      ? [_compliance, ...allCompliance]
                      : [...allCompliance],
            },
            validation: {
              review:
                tabType === 'review' || tabType === 'reviewer-rejected'
                  ? [
                      ...(allReviews.length
                        ? allReviews
                        : [
                            {
                              'common:scope': [{ '@name': undefined }],
                            },
                          ]),
                    ]
                  : Array.isArray(_review)
                    ? [..._review, ...allReviews]
                    : _review
                      ? [_review, ...allReviews]
                      : [...allReviews],
            },
          };
        }
      }

      // Get the rejected comments
      if (result?.data?.stateCode < 100) {
        const rejectedCommentsRes = await getRejectedComments(id, version);
        setRejectedComments(rejectedCommentsRes);
      }
      const dataSet = genProcessFromData(result.data?.json?.processDataSet ?? {});
      setInitData({ ...dataSet, id: id });
      setFromData({ ...dataSet, id: id });
      setExchangeDataSource(dataSet?.exchanges?.exchange ?? []);
      formRefEdit.current?.resetFields();
      formRefEdit.current?.setFieldsValue({
        ...dataSet,
        id: id,
      });
      setSpinning(false);
    });
  };

  useEffect(() => {
    if (!drawerVisible) return;
    onReset();
  }, [drawerVisible]);

  useEffect(() => {
    setFromData({
      ...fromData,
      exchanges: {
        exchange: [...exchangeDataSource],
      },
    });
  }, [exchangeDataSource]);

  const updateCommentJsonRefsToUnderReview = async (data: any) => {
    const refObjs = getAllRefObj(data);
    const unReview: refDataType[] = []; //stateCode < 20
    const underReview: refDataType[] = []; //stateCode >= 20 && stateCode < 100
    const unRuleVerification: refDataType[] = [];
    const nonExistentRef: refDataType[] = [];
    const userTeamId = await getUserTeamId();
    const path = await checkReferences(
      refObjs,
      new Map<string, any>(),
      userTeamId,
      unReview,
      underReview,
      unRuleVerification,
      nonExistentRef,
      new ReffPath(
        {
          '@refObjectId': '',
          '@version': '',
          '@type': '',
        },
        true,
        false,
      ),
    );
    const problemNodes = path?.findProblemNodes() ?? [];
    const refCheckDataValue: RefCheckType[] = [];

    if (underReview.length > 0) {
      refCheckDataValue.push(
        ...underReview.map((item: any) => {
          return {
            id: item['@refObjectId'],
            version: item['@version'],
            ruleVerification: true,
            nonExistent: false,
            stateCode: 20,
          };
        }),
      );
    } else if (problemNodes && problemNodes.length > 0) {
      let result = problemNodes.map((item: any) => {
        return {
          id: item['@refObjectId'],
          version: item['@version'],
          ruleVerification: item.ruleVerification,
          nonExistent: item.nonExistent,
        };
      });
      refCheckDataValue.push(...result);
    }

    if (refCheckDataValue.length) {
      setRefCheckData(refCheckDataValue);
      setSpinning(false);
      return false;
    } else {
      setRefCheckData([]);
      return true;
    }
  };

  const handleReject = async (reason: string) => {
    try {
      setSpinning(true);
      const fieldsValue = formRefEdit.current?.getFieldsValue();
      const submitData = {
        modellingAndValidation: {
          complianceDeclarations: fieldsValue?.modellingAndValidation?.complianceDeclarations,
          validation: fieldsValue?.modellingAndValidation?.validation,
        },
        comment: {
          message: reason,
        },
      };
      const result = await submitReviewCommentApi(reviewId, submitData, -3);
      if (!result.error) {
        message.success(
          intl.formatMessage({
            id: 'component.rejectReview.success',
            defaultMessage: 'Rejected successfully!',
          }),
        );
        setDrawerVisible(false);
        actionRef?.current?.reload();
      }
    } catch (error) {
      message.error(
        intl.formatMessage({
          id: 'component.rejectReview.error',
          defaultMessage: 'Failed to reject, please try again!',
        }),
      );
    } finally {
      setSpinning(false);
    }
  };

  return (
    <>
      {type === 'edit' ? (
        <Tooltip
          title={<FormattedMessage id={'pages.review.actions.review'} defaultMessage={'Review'} />}
        >
          <Button shape='circle' icon={<AuditOutlined />} size='small' onClick={onEdit} />
        </Tooltip>
      ) : (
        <Tooltip
          title={
            <FormattedMessage
              id='pages.review.actions.viewDetails'
              defaultMessage='View review details'
            />
          }
        >
          <Button shape='circle' icon={<ProfileOutlined />} size='small' onClick={onEdit} />
        </Tooltip>
      )}
      <Drawer
        getContainer={() => document.body}
        title={
          type === 'edit' ? (
            <FormattedMessage
              id={'pages.review.ReviewProcessDetail.edit.title'}
              defaultMessage='Review Process'
            />
          ) : (
            <FormattedMessage
              id={'pages.review.ReviewProcessDetail.view.title'}
              defaultMessage='View Review'
            />
          )
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
        mask={{ closable: false }}
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        footer={
          tabType === 'review' && !hideButton ? (
            <Space className={styles.footer_right}>
              <RejectReview
                buttonType='text'
                isModel={false}
                dataId={id}
                dataVersion={version}
                reviewId={reviewId}
                key={1}
                actionRef={actionRef}
                onOk={handleReject}
              />
              <Button onClick={temporarySave}>
                <FormattedMessage id='pages.button.temporarySave' defaultMessage='Temporary Save' />
              </Button>
              <Button type='primary' onClick={() => formRefEdit.current?.submit()}>
                <FormattedMessage id='pages.button.save' defaultMessage='Save' />
              </Button>
            </Space>
          ) : null
        }
      >
        <Spin spinning={spinning}>
          <RefCheckContext.Provider value={{ refCheckData: refCheckData }}>
            <ProForm
              formRef={formRefEdit}
              initialValues={initData}
              onValuesChange={(_, allValues) => {
                setFromData({ ...fromData, [activeTabKey]: allValues[activeTabKey] ?? {} });
              }}
              submitter={{
                render: () => {
                  return [];
                },
              }}
              onFinish={async () => {
                try {
                  setSpinning(true);
                  const fieldsValue = formRefEdit.current?.getFieldsValue();
                  const submitData = {
                    modellingAndValidation: {
                      complianceDeclarations:
                        fieldsValue?.modellingAndValidation?.complianceDeclarations,
                      validation: fieldsValue?.modellingAndValidation?.validation,
                    },
                  };
                  const isRefCheck = await updateCommentJsonRefsToUnderReview(submitData);
                  if (!isRefCheck) {
                    setSpinning(false);
                    return false;
                  }

                  const result = await submitReviewCommentApi(reviewId, submitData);
                  if (!result.error) {
                    message.success(
                      intl.formatMessage({
                        id: 'pages.review.ReviewProcessDetail.edit.success',
                        defaultMessage: 'Review submitted successfully',
                      }),
                    );
                    setDrawerVisible(false);
                    actionRef?.current?.reload();
                    setSpinning(false);
                    return true;
                  }
                } catch (err) {
                  console.error(err);
                } finally {
                  setSpinning(false);
                }
              }}
            >
              <TabsDetail
                rejectedComments={rejectedComments}
                initData={initData}
                lang={lang}
                activeTabKey={activeTabKey}
                formRef={formRefEdit}
                onData={handletFromData}
                onExchangeData={handletExchangeData}
                onTabChange={onTabChange}
                exchangeDataSource={exchangeDataSource}
                type={type}
              />
              <Form.Item name='id' hidden>
                <Input />
              </Form.Item>
            </ProForm>
          </RefCheckContext.Provider>
        </Spin>
      </Drawer>
    </>
  );
};

export default ReviewProcessDetail;
