import {
  canRetainAllocationDraft,
  nextExchangeId,
  type AllocationProblem,
} from '@/services/processes/allocation';
import AllocationIssues from './Exchange/allocationIssues';
import { allocationProblemText } from './Exchange/allocationFeedback';
import { verifyAllocationProductProblems } from '@/services/processes/allocationTargets';
// import { checkRequiredFields } from '@/pages/Utils';
import {
  formatDateTime,
  getImportedId,
  isSupabaseDuplicateKeyError,
  jsonToList,
} from '@/services/general/util';
import { createProcess, createProcessVersion, getProcessDetail } from '@/services/processes/api';
import { genProcessFromData } from '@/services/processes/util';
import styles from '@/style/custom.less';
import { CloseOutlined, CopyOutlined, PlusOutlined } from '@ant-design/icons';
import { ActionType, ProForm, ProFormInstance } from '@ant-design/pro-components';
import { Button, Drawer, Space, Spin, Tooltip, App } from 'antd';
import type { FC } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FormattedMessage, useIntl } from 'umi';
import { v4 } from 'uuid';
// import requiredFields from '../requiredFields';
import ToolBarButton from '@/components/ToolBarButton';
import { LCIAResultTable } from '@/services/lciaMethods/data';
import {
  FormProcess,
  ProcessDataSetObjectKeys,
  ProcessDetailResponse,
  ProcessExchangeData,
  ProcessImportData,
} from '@/services/processes/data';
import { ProcessForm } from './form';
import { mergeProcessFormValues } from './formData';

type TabKeysType = ProcessDataSetObjectKeys | 'validation' | 'complianceDeclarations';
type FormProcessWithId = FormProcess & { id?: string };

type Props = {
  lang: string;
  actionRef: React.RefObject<ActionType | undefined>;
  actionType?: 'create' | 'copy' | 'createVersion';
  id?: string;
  version?: string;
  importData?: ProcessImportData | null;
  onClose?: () => void;
  newVersion?: string;
};

// When type is 'copy' or 'createVersion', id and version are required parameters
type CreateProps =
  | (Omit<Props, 'type'> & { actionType?: 'create' })
  | (Omit<Props, 'type' | 'id' | 'version'> & {
      actionType: 'copy';
      id: string;
      version: string;
    })
  | (Omit<Props, 'type' | 'id' | 'version'> & {
      actionType: 'createVersion';
      id: string;
      version: string;
    });

const ProcessCreate: FC<CreateProps> = ({
  lang,
  actionRef,
  actionType = 'create',
  newVersion,
  id,
  version,
  importData,
  onClose = () => {},
}) => {
  const { message } = App.useApp();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const formRefCreate = useRef<ProFormInstance | undefined>(undefined);
  const [activeTabKey, setActiveTabKey] = useState<TabKeysType>('processInformation');
  const [fromData, setFromData] = useState<FormProcessWithId>();
  const [initData, setInitData] = useState<FormProcessWithId>();
  const [exchangeDataSource, setExchangeDataSource] = useState<ProcessExchangeData[]>([]);
  const [allocationProblems, setAllocationProblems] = useState<AllocationProblem[]>([]);
  useEffect(() => {
    let active = true;
    void verifyAllocationProductProblems(exchangeDataSource).then((problems) => {
      if (active) setAllocationProblems(problems);
    });
    return () => {
      active = false;
    };
  }, [exchangeDataSource]);
  const [spinning, setSpinning] = useState<boolean>(false);
  const intl = useIntl();
  const importedId = getImportedId(importData?.[0]);

  const handletFromData = () => {
    const fieldsValue = formRefCreate.current?.getFieldsValue(true);
    setFromData((current) => mergeProcessFormValues(current, fieldsValue));
  };

  const reloadFromFirstPage = useCallback(async () => {
    await actionRef.current?.reload(true);
  }, [actionRef]);

  const handletExchangeDataCreate = (data: ProcessExchangeData) => {
    // if (fromData?.id)
    setExchangeDataSource([
      ...exchangeDataSource,
      { ...data, '@dataSetInternalID': nextExchangeId(exchangeDataSource) },
    ]);
  };

  const handletExchangeData = (data: ProcessExchangeData[]) => {
    if (fromData?.id) setExchangeDataSource([...data]);
  };

  const onTabChange = (key: TabKeysType) => {
    setActiveTabKey(key);
  };

  const getFormDetail = () => {
    if (!id || !version) return;
    setSpinning(true);
    getProcessDetail(id, version).then(async (result: ProcessDetailResponse) => {
      const dataSet = genProcessFromData(result.data?.json?.processDataSet ?? {});
      if (actionType === 'createVersion' && newVersion) {
        dataSet.administrativeInformation.publicationAndOwnership['common:dataSetVersion'] =
          newVersion;
      }
      setInitData({ ...dataSet, id: id });
      setFromData({ ...dataSet, id: id });
      setExchangeDataSource(dataSet?.exchanges?.exchange ?? []);
      formRefCreate.current?.resetFields();
      formRefCreate.current?.setFieldsValue({
        ...dataSet,
        id: id,
      });
      setSpinning(false);
    });
  };
  useEffect(() => {
    if (importData && importData.length > 0 && !drawerVisible) {
      setDrawerVisible(true);
    }
  }, [importData]);
  useEffect(() => {
    if (!drawerVisible) {
      onClose();
      formRefCreate.current?.resetFields();
      setInitData(undefined);
      setFromData(undefined);
      setExchangeDataSource([]);
      return;
    }
    if (importData && importData.length > 0) {
      const formData = genProcessFromData(importData[0].processDataSet);
      setInitData(formData);
      setFromData(formData);
      setExchangeDataSource(formData?.exchanges?.exchange ?? []);
      formRefCreate.current?.setFieldsValue(formData);
      return;
    }

    if (actionType === 'copy' || actionType === 'createVersion') {
      getFormDetail();
      return;
    }

    const currentDateTime = formatDateTime(new Date());
    const newData = {
      administrativeInformation: {
        dataEntryBy: {
          'common:timeStamp': currentDateTime,
        },
        publicationAndOwnership: {
          'common:dataSetVersion': '01.01.000',
          'common:permanentDataSetURI': intl.formatMessage({
            id: 'pages.process.view.administrativeInformation.permanentDataSetURI.default',
            defaultMessage: 'Automatically generated',
          }),
        },
      },
      modellingAndValidation: {
        complianceDeclarations: {
          // compliance: [
          //   {
          //     'common:approvalOfOverallCompliance': 'Fully compliant',
          //     'common:nomenclatureCompliance': 'Fully compliant',
          //     'common:methodologicalCompliance': 'Fully compliant',
          //     'common:reviewCompliance': 'Fully compliant',
          //     'common:documentationCompliance': 'Fully compliant',
          //     'common:qualityCompliance': 'Fully compliant',
          //   },
          // ],
        },
        // validation: {
        //   review: [
        //     {
        //       'common:scope': [{}],
        //     },
        //   ],
        // },
      },
    };
    const newId = v4();
    setInitData({ ...newData, id: newId } as FormProcessWithId);
    // formRefCreate.current?.resetFields();
    const currentData = formRefCreate.current?.getFieldsValue(true);
    formRefCreate.current?.setFieldsValue({ ...currentData, ...newData });
    setFromData({ ...newData, id: newId } as FormProcessWithId);
    setExchangeDataSource([]);
  }, [drawerVisible]);

  useEffect(() => {
    setFromData(
      (current) =>
        ({
          ...current,
          exchanges: { exchange: exchangeDataSource },
        }) as FormProcessWithId,
    );
  }, [exchangeDataSource]);

  return (
    <>
      {actionType === 'copy' ? (
        <Tooltip title={<FormattedMessage id='pages.button.copy' defaultMessage='Copy' />}>
          <Button
            shape='circle'
            icon={<CopyOutlined />}
            size='small'
            onClick={() => {
              setDrawerVisible(true);
            }}
          ></Button>
        </Tooltip>
      ) : (
        <ToolBarButton
          icon={<PlusOutlined />}
          tooltip={
            actionType === 'createVersion' ? (
              <FormattedMessage id='pages.button.createVersion' defaultMessage='Create Version' />
            ) : (
              <FormattedMessage id='pages.button.create' defaultMessage='Create' />
            )
          }
          onClick={() => {
            setDrawerVisible(true);
          }}
        />
      )}
      <Drawer
        destroyOnHidden
        getContainer={() => document.body}
        title={
          actionType === 'copy' ? (
            <FormattedMessage id='pages.process.drawer.title.copy' defaultMessage='Copy process' />
          ) : actionType === 'createVersion' ? (
            <FormattedMessage
              id='pages.process.drawer.title.createVersion'
              defaultMessage='Create Version'
            />
          ) : (
            <FormattedMessage
              id='pages.process.drawer.title.create'
              defaultMessage='Create process'
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
          <Space size={'middle'} className={styles.footer_right}>
            <Button onClick={() => setDrawerVisible(false)}>
              {' '}
              <FormattedMessage id='pages.button.cancel' defaultMessage='Cancel' />
            </Button>
            <Button onClick={() => formRefCreate.current?.submit()} type='primary'>
              <FormattedMessage id='pages.button.save' defaultMessage='Save' />
            </Button>
          </Space>
        }
      >
        <Spin spinning={spinning}>
          <ProForm
            formRef={formRefCreate}
            initialValues={initData}
            onValuesChange={handletFromData}
            submitter={{
              render: () => {
                return [];
              },
            }}
            onFinish={async () => {
              setSpinning(true);
              const paramsId = actionType === 'createVersion' ? (id ?? '') : (importedId ?? v4());
              const problems = await verifyAllocationProductProblems(exchangeDataSource);
              setAllocationProblems(problems);
              const retainDraft =
                problems.length > 0 &&
                !problems.some((problem) => problem.code === 'unverified') &&
                canRetainAllocationDraft(
                  initData?.exchanges?.exchange as ProcessExchangeData[] | undefined,
                  exchangeDataSource,
                );
              if (problems.length && !retainDraft) {
                message.error(allocationProblemText(problems, exchangeDataSource, lang, intl));
                setSpinning(false);
                return;
              }

              const processPayload = {
                ...mergeProcessFormValues(fromData, formRefCreate.current?.getFieldsValue(true)),
                exchanges: { exchange: exchangeDataSource },
              };
              const result =
                actionType === 'createVersion'
                  ? retainDraft
                    ? await createProcessVersion(
                        id ?? '',
                        version ?? '',
                        processPayload,
                        undefined,
                        { allocationDraft: true },
                      )
                    : await createProcessVersion(id ?? '', version ?? '', processPayload)
                  : retainDraft
                    ? await createProcess(paramsId, processPayload, undefined, {
                        allocationDraft: true,
                      })
                    : await createProcess(paramsId, processPayload);
              if (result.data) {
                if (retainDraft)
                  message.warning(
                    intl.formatMessage({
                      id: 'pages.process.allocation.draftRetained',
                      defaultMessage:
                        'Saved as a draft with existing allocation issues. Repair these before validation, review or calculation.',
                    }),
                  );
                message.success(
                  intl.formatMessage({
                    id: 'pages.button.create.success',
                    defaultMessage: 'Created successfully!',
                  }),
                );
                formRefCreate.current?.resetFields();
                setDrawerVisible(false);
                await reloadFromFirstPage();
              } else {
                message.error(
                  isSupabaseDuplicateKeyError(result.error)
                    ? intl.formatMessage({
                        id: 'pages.button.create.error.duplicateId',
                        defaultMessage: 'Data with the same ID and version already exists.',
                      })
                    : (result.error?.message ?? 'Error'),
                );
              }
              setSpinning(false);
              return true;
            }}
          >
            <AllocationIssues
              problems={allocationProblems}
              exchanges={exchangeDataSource}
              lang={lang}
            />
            <ProcessForm
              formType={actionType}
              lang={lang}
              activeTabKey={activeTabKey}
              formRef={formRefCreate}
              onData={handletFromData}
              onExchangeData={handletExchangeData}
              onExchangeDataCreate={handletExchangeDataCreate}
              onTabChange={(key) => onTabChange(key as TabKeysType)}
              exchangeDataSource={exchangeDataSource}
              lciaResults={jsonToList(fromData?.LCIAResults?.LCIAResult) as LCIAResultTable[]}
              lciaCalculationEvidence={fromData?.LCIAResults?.['common:other']}
            />
          </ProForm>
        </Spin>
      </Drawer>
    </>
  );
};

export default ProcessCreate;
