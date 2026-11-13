import DatasetClassificationFilter from '@/components/DatasetClassificationFilter';
import {
  ResponsiveDataListViewport,
  dataListTooltipContent,
  dataListPagination,
  getDataListScrollX,
  dataListMetadataText,
  getDataListToolbar,
  orderDataListColumns,
  responsiveDataListTableProps,
} from '@/components/ResponsiveDataList';
import type { DatasetClassificationFilterValue } from '@/services/general/datasetClassification';
import { processtypeOfDataSetOptions } from '@/pages/Processes/Components/optiondata';
import ProcessEdit from '@/pages/Processes/Components/edit';
import ProcessView from '@/pages/Processes/Components/view';
import {
  ContentLanguageAwareTableParams,
  getContentLanguageAwareTableParams,
  guardLocaleMaterializedTableRequest,
  syncLocaleMaterializedTableRequestEpochs,
} from '@/services/general/data';
import { getProcessesByIdAndVersion } from '@/services/processes/api';
import { ProcessTable } from '@/services/processes/data';
import { CloseOutlined, ProductOutlined } from '@ant-design/icons';
import { ActionType, ProColumns, ProTable } from '@ant-design/pro-components';
import { Button, Drawer, Input, Tooltip } from 'antd';
import type { FC } from 'react';
import { useRef, useState } from 'react';
import { FormattedMessage, useIntl } from 'umi';

type ModelResultTableParams = ContentLanguageAwareTableParams & {
  classification: DatasetClassificationFilterValue[];
  keyword: string;
  modelId: string;
  modelVersion: string;
  submodels?: Props['submodels'];
};

type ResultReference = { '@refObjectId'?: string; '@version'?: string };

type Props = {
  resultingProcesses?: ResultReference | ResultReference[];
  submodels: Array<{
    id: string;
    version: string;
    type?: string;
  }>;
  modelId: string;
  modelVersion: string;
  lang: string;
  actionType: 'view' | 'edit';
  /**
   * zh-CN: 存在旧结果且与当前编辑中的模型不一致时显示 PREVIOUS_RESULT 说明；
   * 无旧结果不显示。
   * en-US: Shows the PREVIOUS_RESULT notice when previous results exist and do
   * not match the model currently being edited; hidden when no previous
   * results exist.
   */
  showPreviousResultNotice?: boolean;
};

const ModelResult: FC<Props> = ({
  submodels: storedSubmodels,
  resultingProcesses,
  modelId,
  modelVersion,
  lang,
  actionType,
  showPreviousResultNotice = false,
}) => {
  const resultRefs = Array.isArray(resultingProcesses)
    ? resultingProcesses
    : resultingProcesses
      ? [resultingProcesses]
      : [];
  const soleResult = resultRefs.length === 1 ? resultRefs[0] : undefined;
  const submodels =
    !storedSubmodels.some((item) => item.type === 'primary') &&
    soleResult?.['@refObjectId'] &&
    soleResult?.['@version']
      ? [
          { id: soleResult['@refObjectId'], version: soleResult['@version'], type: 'primary' },
          ...storedSubmodels.filter(
            (item) =>
              item.id !== soleResult['@refObjectId'] || item.version !== soleResult['@version'],
          ),
        ]
      : storedSubmodels;
  const intl = useIntl();
  const [mainClassification, setMainClassification] = useState<DatasetClassificationFilterValue[]>(
    [],
  );
  const [subClassification, setSubClassification] = useState<DatasetClassificationFilterValue[]>(
    [],
  );
  const [mainKeyword, setMainKeyword] = useState('');
  const [subKeyword, setSubKeyword] = useState('');
  const [appliedMainKeyword, setAppliedMainKeyword] = useState('');
  const [appliedSubKeyword, setAppliedSubKeyword] = useState('');
  const contentLanguageParams = getContentLanguageAwareTableParams(lang);
  const currentContentLanguageRef = useRef(contentLanguageParams.contentLanguage);
  const mainProductRequestEpochRef = useRef(0);
  const subProductRequestEpochRef = useRef(0);
  syncLocaleMaterializedTableRequestEpochs(
    currentContentLanguageRef,
    contentLanguageParams.contentLanguage,
    [mainProductRequestEpochRef, subProductRequestEpochRef],
  );
  const [drawerVisible, setDrawerVisible] = useState(false);
  const subProcuctTableRef = useRef<ActionType>(undefined);
  const mainProcuctTableRef = useRef<ActionType>(undefined);

  const columns: ProColumns<ProcessTable>[] = [
    {
      title: <FormattedMessage id='pages.table.title.index' defaultMessage='Index' />,
      dataIndex: 'index',
      valueType: 'index',
      search: false,
      width: 60,
    },
    {
      title: <FormattedMessage id='pages.table.title.name' defaultMessage='Name' />,
      dataIndex: 'name',
      sorter: true,
      search: false,
      render: (_, row) => {
        return [
          <Tooltip
            key={0}
            placement='topLeft'
            title={dataListTooltipContent(row.name, row.generalComment)}
          >
            {row.name}
          </Tooltip>,
        ];
      },
    },
    {
      title: <FormattedMessage id='pages.process.location' defaultMessage='Location' />,
      dataIndex: 'location',
      search: false,
      render: (_, row) => dataListMetadataText(row.location),
    },
    {
      title: <FormattedMessage id='pages.process.referenceYear' defaultMessage='Reference year' />,
      dataIndex: 'referenceYear',
      search: false,
      render: (_, row) => dataListMetadataText(row.referenceYear),
    },
    {
      title: (
        <FormattedMessage
          id='pages.table.filter.all.datasetType'
          defaultMessage='Type of data set'
        />
      ),
      dataIndex: 'typeOfDataSet',
      search: false,
      render: (_, row) =>
        dataListMetadataText(
          processtypeOfDataSetOptions.find((option) => option.value === row.typeOfDataSet)?.label ??
            row.typeOfDataSet,
        ),
    },
    {
      title: <FormattedMessage id='pages.table.title.version' defaultMessage='Version' />,
      dataIndex: 'version',
      search: false,
      width: 100,
    },
    {
      title: <FormattedMessage id='pages.table.title.updatedAt' defaultMessage='Updated at' />,
      dataIndex: 'modifiedAt',
      valueType: 'dateTime',
      sorter: false,
      search: false,
      width: 120,
    },
    {
      title: <FormattedMessage id='pages.table.title.option' defaultMessage='Actions' />,
      dataIndex: 'option',
      search: false,
      width: 100,
      render: (_, record) => {
        const result = [
          <ProcessView
            key={0}
            id={record.id}
            version={record.version ?? modelVersion}
            buttonType='icon'
            lang={lang}
            disabled={false}
          />,
        ];
        if (actionType === 'edit') {
          result.push(
            <ProcessEdit
              actionFrom='modelResult'
              key={1}
              id={record.id}
              version={record.version ?? modelVersion}
              buttonType='icon'
              lang={lang}
              disabled={false}
              actionRef={
                submodels.some(
                  (item) =>
                    item.id === record.id &&
                    item.version === record.version &&
                    (item.type === 'primary' || (!item.type && item.id === modelId)),
                )
                  ? mainProcuctTableRef
                  : subProcuctTableRef
              }
              setViewDrawerVisible={() => {}}
            />,
          );
        }
        return result;
      },
    },
  ];

  return (
    <>
      <Tooltip
        title={<FormattedMessage id='pages.button.model.result' defaultMessage='Model Results' />}
        placement='left'
      >
        <Button
          type='primary'
          icon={<ProductOutlined />}
          size='small'
          style={{ boxShadow: 'none' }}
          onClick={() => {
            setDrawerVisible(true);
            mainProcuctTableRef.current?.reload();
            subProcuctTableRef.current?.reload();
          }}
        />
      </Tooltip>

      <Drawer
        getContainer={() => document.body}
        title={<FormattedMessage id='pages.button.model.result' defaultMessage='Model Results' />}
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
      >
        {showPreviousResultNotice ? (
          <div style={{ marginBottom: 12 }}>
            <FormattedMessage
              id='pages.lifecyclemodel.calculation.status.previousResult'
              defaultMessage='The results below were saved previously and do not represent the model currently being edited.'
            />
          </div>
        ) : null}
        <ProTable<ProcessTable, ModelResultTableParams>
          {...responsiveDataListTableProps}
          scroll={{ x: getDataListScrollX(columns) }}
          rowKey={(row) => `${row.id}:${row.version ?? modelVersion}`}
          search={false}
          params={{
            ...contentLanguageParams,
            modelId,
            modelVersion,
            submodels,
            classification: mainClassification,
            keyword: appliedMainKeyword,
          }}
          pagination={{ ...dataListPagination, hideOnSinglePage: true }}
          headerTitle={<FormattedMessage id='pages.lifeCycleModel.modelResults.mainProduct' />}
          toolbar={getDataListToolbar({
            search: (
              <Input.Search
                style={{ width: '100%' }}
                value={mainKeyword}
                allowClear
                enterButton
                placeholder={intl.formatMessage({ id: 'pages.search.keyWord' })}
                onChange={(event) => setMainKeyword(event.target.value)}
                onSearch={(value) => {
                  mainProductRequestEpochRef.current += 1;
                  setAppliedMainKeyword(value);
                  mainProcuctTableRef.current?.setPageInfo?.({ current: 1 });
                }}
              />
            ),
            filter: (
              <DatasetClassificationFilter
                datasetKind='process'
                lang={lang}
                value={mainClassification}
                onChange={(value) => {
                  mainProductRequestEpochRef.current += 1;
                  setMainClassification(value);
                  mainProcuctTableRef.current?.setPageInfo?.({ current: 1 });
                }}
              />
            ),
          })}
          actionRef={mainProcuctTableRef}
          request={async (params) => {
            return guardLocaleMaterializedTableRequest(
              params.contentLanguage,
              () => currentContentLanguageRef.current,
              mainProductRequestEpochRef,
              () =>
                getProcessesByIdAndVersion(
                  (params.submodels ?? [])
                    .filter(
                      (entry) =>
                        entry.type === 'primary' || (!entry.type && entry.id === params.modelId),
                    )
                    .map(({ id, version }) => ({ id, version })),
                  params.contentLanguage,
                  { classification: params.classification, keyword: params.keyword },
                ),
            );
          }}
          columns={orderDataListColumns(columns)}
        />
        <ResponsiveDataListViewport columns={columns}>
          {({ scroll }) => (
            <ProTable<ProcessTable, ModelResultTableParams>
              {...responsiveDataListTableProps}
              scroll={scroll}
              rowKey={(row) => `${row.id}:${row.version ?? modelVersion}`}
              search={false}
              params={{
                ...contentLanguageParams,
                modelId,
                modelVersion,
                submodels,
                classification: subClassification,
                keyword: appliedSubKeyword,
              }}
              pagination={{ ...dataListPagination, hideOnSinglePage: true }}
              headerTitle={<FormattedMessage id='pages.lifeCycleModel.modelResults.subProduct' />}
              toolbar={getDataListToolbar({
                search: (
                  <Input.Search
                    style={{ width: '100%' }}
                    value={subKeyword}
                    allowClear
                    enterButton
                    placeholder={intl.formatMessage({ id: 'pages.search.keyWord' })}
                    onChange={(event) => setSubKeyword(event.target.value)}
                    onSearch={(value) => {
                      subProductRequestEpochRef.current += 1;
                      setAppliedSubKeyword(value);
                      subProcuctTableRef.current?.setPageInfo?.({ current: 1 });
                    }}
                  />
                ),
                filter: (
                  <DatasetClassificationFilter
                    datasetKind='process'
                    lang={lang}
                    value={subClassification}
                    onChange={(value) => {
                      subProductRequestEpochRef.current += 1;
                      setSubClassification(value);
                      subProcuctTableRef.current?.setPageInfo?.({ current: 1 });
                    }}
                  />
                ),
              })}
              actionRef={subProcuctTableRef}
              request={async (params) => {
                const subProducts = (params.submodels ?? []).filter(
                  (entry) =>
                    entry.type === 'secondary' || (!entry.type && entry.id !== params.modelId),
                );
                return guardLocaleMaterializedTableRequest(
                  params.contentLanguage,
                  () => currentContentLanguageRef.current,
                  subProductRequestEpochRef,
                  () =>
                    getProcessesByIdAndVersion(
                      subProducts.map((e) => ({ id: e.id, version: e.version })),
                      params.contentLanguage,
                      { classification: params.classification, keyword: params.keyword },
                    ),
                );
              }}
              columns={orderDataListColumns(columns)}
            />
          )}
        </ResponsiveDataListViewport>
      </Drawer>
    </>
  );
};

export default ModelResult;
