import { contributeLifeCycleModel } from '@/services/lifeCycleModels/api';
import {
  contributeProcess,
  getProcessTableAll,
  getProcessTablePgroongaSearch,
  getProcessTableUuidMentionSearch,
  process_hybrid_search,
} from '@/services/processes/api';
import { BarChartOutlined } from '@ant-design/icons';

import { App, Button, Card, Checkbox, Col, Input, Row, Select, Space, Tag } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { FormattedMessage, history, useIntl, useLocation } from 'umi';
import * as Umi from 'umi';

import AllVersionsList from '@/components/AllVersions';
import OpenDataCatalogFilters from '@/components/OpenDataCatalogFilters';
import ContributeData from '@/components/ContributeData';
import {
  extractContributeDataError,
  getContributeDataErrorMessage,
} from '@/components/ContributeData/utils';
import ExportData from '@/components/ExportData';
import ImportData from '@/components/ImportData';
import {
  DATA_LIST_COLUMN_RESPONSIVE,
  dataListActionColumn,
  dataListIndexColumn,
  dataListText,
  dataListTextColumn,
  ResponsiveDataListActions,
  responsiveDataListTableProps,
  ResponsiveDataListToolbarMore,
  responsiveSearchCardClassName,
  responsiveSearchExtraColProps,
  responsiveSearchPrimaryColProps,
  responsiveSearchRowProps,
  useResponsiveDataListMobile,
} from '@/components/ResponsiveDataList';
import TableFilter from '@/components/TableFilter';
import ToolBarButton from '@/components/ToolBarButton';
import LifeCycleModelCreate from '@/pages/LifeCycleModels/Components/create';
import LifeCycleModelEdit from '@/pages/LifeCycleModels/Components/edit';
import LifeCycleModelView from '@/pages/LifeCycleModels/Components/view';
import { attachStateCodesToRows } from '@/services/general/api';
import {
  getServiceQueryLanguage,
  type SupportedServiceQueryLanguage,
} from '@/services/general/contentLanguageRegistry';
import {
  guardLocaleMaterializedTableRequest,
  syncLocaleMaterializedTableRequestEpochs,
  type LocaleAwareTableParams,
} from '@/services/general/data';
import { resolveRouteViewState } from '@/services/general/routeViewState';
import {
  DEFAULT_BROWSER_APP_LOCALE,
  normalizeRuntimeLocale,
} from '@/services/general/runtimeLocale';
import { getActiveTableSort, mapActiveTableSort } from '@/services/general/tableSort';
import { getDataSource, getLang, getLangText, isDataUnderReview } from '@/services/general/util';
import {
  DEFAULT_OPEN_DATA_FILTERS,
  getOpenDataCatalogFilterArgs,
  type OpenDataCatalogFilters as OpenDataCatalogFilterValue,
} from '@/services/openDataCatalog/types';
import { publishOpenDataProcesses } from '@/services/openDataCatalog/api';
import {
  ProcessImportData,
  ProcessTable,
  resolveProcessModelVersion,
} from '@/services/processes/data';
import { getTeamById } from '@/services/teams/api';
import type { TeamTable } from '@/services/teams/data';
import { ActionType, PageContainer, ProColumns, ProTable } from '@ant-design/pro-components';
import { SearchProps } from 'antd/es/input/Search';
import type { FC, Key, ReactElement } from 'react';
import { getAllVersionsColumns, getDataTitle } from '../Utils';
import {
  getReferenceLookupEmptyResult,
  getReferenceLookupPaginationProps,
  getReferenceLookupTeamId,
  getReferenceLookupUuid,
  showInvalidReferenceLookupUuidMessage,
  showReferenceLookupLimitMessage,
} from '../Utils/referenceLookup';
import ReferenceLookupHelpIcon from '../Utils/ReferenceLookupHelpIcon';
import ProcessCreate from './Components/create';
import ProcessDelete from './Components/delete';
import ProcessEdit from './Components/edit';
import LcaSolveToolbar from './Components/lcaSolveToolbar';
import { processtypeOfDataSetOptions } from './Components/optiondata';
import ReviewDetail from './Components/ReviewDetail';
import ProcessView from './Components/view';

const { Search } = Input;

export const getProcesstypeOfDataSetOptions = (value: string) => {
  const option = processtypeOfDataSetOptions.find((opt) => opt.value === value);
  return option ? option.label : '-';
};

type ProcessTableRequestParams = LocaleAwareTableParams & {
  dataSource: string;
  teamId: string;
  keyword: string;
  searchRevision: number;
  searchMode: 'keyword' | 'ai' | 'reference';
  stateCode: string | number;
  typeOfDataSet: string;
};

const TableList: FC = () => {
  const { message } = App.useApp();
  const [keyWord, setKeyWord] = useState('');
  const [searchRevision, setSearchRevision] = useState(0);
  const [stateCode, setStateCode] = useState<string | number>('all');
  const [typeOfDataSet, setTypeOfDataSet] = useState<string>('all');
  const [tableDataSource, setTableDataSource] = useState<ProcessTable[]>([]);
  const [openDataFilters, setOpenDataFilters] = useState<OpenDataCatalogFilterValue>({
    ...DEFAULT_OPEN_DATA_FILTERS,
  });
  const [selectedProcessKeys, setSelectedProcessKeys] = useState<Key[]>([]);
  const [selectedProcesses, setSelectedProcesses] = useState<ProcessTable[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [team, setTeam] = useState<TeamTable | null>(null);
  const [importData, setImportData] = useState<ProcessImportData | null>(null);
  const [openAI, setOpenAI] = useState<boolean>(false);
  const [referenceLookup, setReferenceLookup] = useState<boolean>(false);
  const [editDrawerVisible, setEditDrawerVisible] = useState<boolean>(false);
  const [viewDrawerVisible, setViewDrawerVisible] = useState<boolean>(false);
  const [editId, setEditId] = useState<string>('');
  const [editVersion, setEditVersion] = useState<string>('');
  const isMobileDataList = useResponsiveDataListMobile();
  const location = useLocation();
  const dataSource = getDataSource(location.pathname);
  const { initialState } = Umi.useModel?.('@@initialState') ?? {};
  const canPublishOpenData = initialState?.currentUser?.access === 'data_product_manager';

  const searchParams = new URLSearchParams(location.search);
  const tid = searchParams.get('tid');
  const id = searchParams.get('id');
  const version = searchParams.get('version');
  const required =
    resolveRouteViewState('dataset-required', searchParams.get('required')) === 'required';
  const routeMode = resolveRouteViewState('dataset-drawer-mode', searchParams.get('mode'));

  const intl = useIntl();

  const appLocale = normalizeRuntimeLocale(intl.locale) ?? DEFAULT_BROWSER_APP_LOCALE;
  const lang = getLang(appLocale);
  const currentAppLocaleRef = useRef(appLocale);
  const tableRequestEpochRef = useRef(0);
  syncLocaleMaterializedTableRequestEpochs(currentAppLocaleRef, appLocale, [tableRequestEpochRef]);

  const actionRef = useRef<ActionType | undefined>(undefined);
  const attachReviewState = async (result: {
    data?: ProcessTable[];
    page?: number;
    success?: boolean;
    total?: number;
  }) => {
    if (dataSource !== 'my' || !Array.isArray(result.data)) {
      return result;
    }

    return {
      ...result,
      data: await attachStateCodesToRows('processes', result.data),
    };
  };
  const referenceLookupLimitNoticeRef = useRef<string>('');
  const typeOfDataSetFilter = (width: number) => {
    const onChange = (value: string) => {
      setTypeOfDataSet(value);
    };
    return (
      <Select
        defaultValue={'all'}
        style={{ width }}
        onChange={onChange}
        options={[
          {
            value: 'all',
            label: <FormattedMessage id='pages.table.filter.all.datasetType' />,
          },
          ...processtypeOfDataSetOptions,
        ]}
      />
    );
  };
  const processColumns: ProColumns<ProcessTable>[] = [
    {
      ...dataListIndexColumn<ProcessTable>(),
      title: <FormattedMessage id='pages.table.title.index' defaultMessage='Index' />,
      dataIndex: 'index',
      valueType: 'index',
    },
    {
      ...dataListTextColumn<ProcessTable>(300),
      title: <FormattedMessage id='pages.table.title.name' defaultMessage='Name' />,
      dataIndex: 'name',
      sorter: true,
      search: false,
      render: (_, row) => {
        const name = dataListText(row.name, row.generalComment);
        const shortId = String(row.id ?? '').slice(0, 8);
        return (
          <div>
            {name}
            <div>
              {row.site && (
                <Tag color={row.site.status === 'verified' ? 'blue' : 'gold'}>
                  {row.site.status === 'verified'
                    ? intl.formatMessage(
                        {
                          id: 'pages.process.site.verified',
                          defaultMessage: 'Site {code}',
                        },
                        { code: row.site.code },
                      )
                    : intl.formatMessage({
                        id: 'pages.process.site.needsReview',
                        defaultMessage: 'Site to verify',
                      })}
                </Tag>
              )}
              {shortId && (
                <span title={row.id} style={{ fontSize: 12, opacity: 0.65 }}>
                  ID {shortId}
                </span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      ...dataListTextColumn<ProcessTable>(260, DATA_LIST_COLUMN_RESPONSIVE.wide),
      title: (
        <FormattedMessage id='pages.table.title.classification' defaultMessage='Classification' />
      ),
      dataIndex: 'classification',
      sorter: true,
      search: false,
      render: (_, row) => {
        return dataListText(row.classification);
      },
    },
    {
      ...dataListTextColumn<ProcessTable>(180, DATA_LIST_COLUMN_RESPONSIVE.desktop),
      title: (
        <FormattedMessage
          id='pages.process.view.modellingAndValidation.typeOfDataSet'
          defaultMessage='Dataset type'
        />
      ),
      dataIndex: 'typeOfDataSet',
      sorter: false,
      search: false,
      render: (_, row) => {
        return dataListText(getProcesstypeOfDataSetOptions(row.typeOfDataSet));
      },
    },
    ...(dataSource === 'tg'
      ? [
          {
            title: intl.formatMessage({
              id: 'pages.openData.publication.status',
              defaultMessage: 'Publication status',
            }),
            dataIndex: 'isPublished',
            search: false,
            width: 120,
            render: (_: unknown, row: ProcessTable) =>
              row.isPublished ? (
                <span style={{ color: '#389e0d' }}>
                  {intl.formatMessage({
                    id: 'pages.openData.publication.published',
                    defaultMessage: 'Published',
                  })}
                </span>
              ) : (
                <span>
                  {intl.formatMessage({
                    id: 'pages.openData.publication.unpublished',
                    defaultMessage: 'Unpublished',
                  })}
                </span>
              ),
          } as ProColumns<ProcessTable>,
        ]
      : []),
    {
      ...dataListTextColumn<ProcessTable>(132, DATA_LIST_COLUMN_RESPONSIVE.wide),
      title: <FormattedMessage id='pages.process.referenceYear' defaultMessage='Reference year' />,
      dataIndex: 'referenceYear',
      sorter: false,
      search: false,
    },
    {
      ...dataListTextColumn<ProcessTable>(132, DATA_LIST_COLUMN_RESPONSIVE.desktop),
      title: <FormattedMessage id='pages.process.location' defaultMessage='Location' />,
      dataIndex: 'location',
      sorter: false,
      search: false,
    },
    {
      ...dataListTextColumn<ProcessTable>(132),
      title: <FormattedMessage id='pages.table.title.version' defaultMessage='Version' />,
      dataIndex: 'version',
      sorter: false,
      search: false,
      render: (_, row) => {
        return (
          <Space size={'small'}>
            {row.version}
            <AllVersionsList
              lang={lang}
              searchTableName='processes'
              columns={getAllVersionsColumns(processColumns, 5)}
              searchColume={`
                id,
                json->processDataSet->processInformation->dataSetInformation->name,
                json->processDataSet->processInformation->dataSetInformation->classificationInformation->"common:classification"->"common:class",
                json->processDataSet->processInformation->dataSetInformation->"common:generalComment",
                json->processDataSet->processInformation->time->>"common:referenceYear",
                json->processDataSet->modellingAndValidation->LCIMethodAndAllocation->typeOfDataSet,
                json->processDataSet->processInformation->geography->locationOfOperationSupplyOrProduction->>"@location",
                json->processDataSet->processInformation->geography->locationOfOperationSupplyOrProduction->descriptionOfRestrictions,
                json->processDataSet->processInformation->quantitativeReference->>referenceToReferenceFlow,
                json->processDataSet->processInformation->technology->technologyDescriptionAndIncludedProcesses,
                json->processDataSet->processInformation->technology->technologicalApplicability,
                json->processDataSet->exchanges->exchange,
                version,
                modified_at,
                state_code,
                team_id,
                model_id,
                model_version
              `}
              id={row.id}
              addVersionComponent={({ newVersion }) => (
                <ProcessCreate
                  newVersion={newVersion}
                  actionType='createVersion'
                  id={row.id}
                  version={row.version}
                  lang={lang}
                  actionRef={actionRef}
                />
              )}
              operationRender={(versionRow) => {
                const optionColumn = processColumns.find((column) => column.dataIndex === 'option');
                return optionColumn?.render?.(
                  null as any,
                  versionRow,
                  0,
                  undefined as any,
                  {} as any,
                ) as any;
              }}
              operationColumnWidth={isMobileDataList ? 72 : dataSource === 'my' ? 204 : 168}
            ></AllVersionsList>
          </Space>
        );
      },
    },
    {
      ...dataListTextColumn<ProcessTable>(180, DATA_LIST_COLUMN_RESPONSIVE.wide),
      title: <FormattedMessage id='pages.table.title.updatedAt' defaultMessage='Updated at' />,
      dataIndex: 'modifiedAt',
      valueType: 'dateTime',
      sorter: false,
      search: false,
    },
    {
      ...dataListActionColumn<ProcessTable>(
        isMobileDataList ? 72 : dataSource === 'my' ? 204 : 168,
      ),
      title: <FormattedMessage id='pages.table.title.option' defaultMessage='Actions' />,
      dataIndex: 'option',
      render: (_, row) => {
        const actionDisabled = isDataUnderReview(row.stateCode);
        const modelVersion = resolveProcessModelVersion(row);
        if (dataSource === 'my') {
          return [
            <ResponsiveDataListActions
              key={0}
              isMobile={isMobileDataList}
              moreMenus={[
                {
                  key: 'logs',
                  name: <ReviewDetail processId={row.id} processVersion={row.version} />,
                },
                {
                  key: 'export',
                  name: <ExportData tableName='processes' id={row.id} version={row.version} />,
                },
                {
                  key: 'copy',
                  name: (
                    <>
                      {row.modelId ? (
                        <LifeCycleModelCreate
                          actionType='copy'
                          id={row.modelId}
                          version={modelVersion}
                          lang={lang}
                          actionRef={actionRef}
                          buttonType={'icon'}
                        />
                      ) : (
                        <ProcessCreate
                          actionType='copy'
                          id={row.id}
                          version={row.version}
                          lang={lang}
                          actionRef={actionRef}
                        />
                      )}
                    </>
                  ),
                },
                {
                  key: 'contribute',
                  name: (
                    <ContributeData
                      onOk={async () => {
                        const contributeResult = row.modelId
                          ? await contributeLifeCycleModel(row.modelId, modelVersion)
                          : await contributeProcess(row.id, row.version);
                        const contributeError = extractContributeDataError(contributeResult);

                        if (contributeError) {
                          message.error(getContributeDataErrorMessage(intl, contributeError));
                          console.log(contributeError);
                        } else {
                          message.success(
                            intl.formatMessage({
                              id: 'component.contributeData.success',
                              defaultMessage: 'Data contributed to the team successfully.',
                            }),
                          );
                        }
                        actionRef.current?.reload();
                      }}
                      disabled={!!row.teamId}
                    />
                  ),
                },
              ]}
            >
              <ProcessView
                id={row.id}
                version={row.version}
                // dataSource={dataSource}
                buttonType={'icon'}
                lang={lang}
                disabled={false}
                actionRef={actionRef}
              />
              <LifeCycleModelView
                disabled={!row.modelId}
                id={row.modelId}
                version={modelVersion}
                lang={lang}
                buttonType={'iconModel'}
                actionRef={actionRef}
              />
              {row.modelId ? (
                <LifeCycleModelEdit
                  disabled={actionDisabled}
                  id={row.modelId}
                  version={modelVersion}
                  lang={lang}
                  actionRef={actionRef}
                  buttonType={'icon'}
                />
              ) : (
                <ProcessEdit
                  disabled={actionDisabled}
                  id={row.id}
                  version={row.version}
                  lang={lang}
                  buttonType={'icon'}
                  actionRef={actionRef}
                  setViewDrawerVisible={() => {}}
                />
              )}

              <ProcessDelete
                disabled={actionDisabled}
                id={row.id}
                version={row.version}
                buttonType={'icon'}
                actionRef={actionRef}
                setViewDrawerVisible={() => {}}
              />
            </ResponsiveDataListActions>,
          ];
        }
        if (dataSource === 'tg' || dataSource === 'ex') {
          return [
            <ResponsiveDataListActions
              key={0}
              isMobile={isMobileDataList}
              moreMenus={[
                {
                  key: 'copy',
                  name: (
                    <ProcessCreate
                      actionType='copy'
                      id={row.id}
                      version={row.version}
                      lang={lang}
                      actionRef={actionRef}
                    />
                  ),
                },
                {
                  key: 'export',
                  name: <ExportData tableName='processes' id={row.id} version={row.version} />,
                },
              ]}
            >
              <ProcessView
                id={row.id}
                version={row.version}
                // dataSource={dataSource}
                buttonType={'icon'}
                lang={lang}
                disabled={false}
                actionRef={actionRef}
              />
              <LifeCycleModelView
                disabled={!row.modelId}
                id={row.modelId}
                version={modelVersion}
                lang={lang}
                buttonType={'iconModel'}
                actionRef={actionRef}
              />
              <ReviewDetail processId={row.id} processVersion={row.version} />
            </ResponsiveDataListActions>,
          ];
        }
        return [
          <ResponsiveDataListActions key={0} isMobile={isMobileDataList}>
            <ProcessView
              id={row.id}
              version={row.version}
              // dataSource={dataSource}
              buttonType={'icon'}
              lang={lang}
              disabled={false}
              actionRef={actionRef}
            />
            <LifeCycleModelView
              disabled={!row.modelId}
              id={row.modelId}
              version={modelVersion}
              lang={lang}
              buttonType={'iconModel'}
              actionRef={actionRef}
            />
            <ProcessCreate
              actionType='copy'
              id={row.id}
              version={row.version}
              lang={lang}
              actionRef={actionRef}
            />
            <ExportData tableName='processes' id={row.id} version={row.version} />
          </ResponsiveDataListActions>,
        ];
      },
    },
  ];

  useEffect(() => {
    getTeamById(tid ?? '').then((res) => {
      if (res.data.length > 0) setTeam(res.data[0] ?? null);
    });
  }, []);

  useEffect(() => {
    if (id && version && dataSource === 'my') {
      setEditId(id);
      setEditVersion(version);
      if (routeMode === 'view') {
        setEditDrawerVisible(false);
        setViewDrawerVisible(true);
      } else {
        setViewDrawerVisible(false);
        setEditDrawerVisible(true);
      }
    }
  }, [id, version, dataSource, routeMode]);

  const handleEditClose = () => {
    setEditDrawerVisible(false);
    setViewDrawerVisible(false);
    setEditId('');
    setEditVersion('');
  };

  const onSearch: SearchProps['onSearch'] = (value) => {
    setSelectedProcessKeys([]);
    setSelectedProcesses([]);
    setKeyWord(value);
    setSearchRevision((revision) => revision + 1);
    if (referenceLookup && !getReferenceLookupUuid(value)) {
      showInvalidReferenceLookupUuidMessage(intl);
    }
  };
  const handlePublishSelected = async () => {
    if (!canPublishOpenData || selectedProcesses.length === 0) return;
    setIsPublishing(true);
    try {
      const result = await publishOpenDataProcesses(
        selectedProcesses.map(({ id, version }) => ({ id, version })),
      );
      if (result.error || !result.data) throw result.error ?? new Error('Invalid publish response');
      message.success(
        intl.formatMessage(
          {
            id: 'pages.openData.publication.success',
            defaultMessage: 'Published {count} process versions.',
          },
          { count: result.data.publishedCount },
        ),
      );
      setSelectedProcessKeys([]);
      setSelectedProcesses([]);
      actionRef.current?.reload();
    } catch (error) {
      console.error(error);
      message.error(
        intl.formatMessage({
          id: 'pages.openData.publication.error',
          defaultMessage: 'Failed to publish selected processes.',
        }),
      );
    } finally {
      setIsPublishing(false);
    }
  };

  useEffect(() => {
    setSelectedProcessKeys([]);
    setSelectedProcesses([]);
  }, [openDataFilters, openAI, referenceLookup, typeOfDataSet]);
  const handleImportData = (jsonData: ProcessImportData) => {
    setImportData(jsonData);
  };

  const applyProcessTableResult = async (result?: {
    data?: ProcessTable[];
    success?: boolean;
    total?: number;
  }) => {
    const resolvedResult = result ?? { data: [], success: false, total: 0 };
    return attachReviewState(resolvedResult);
  };

  return (
    <PageContainer
      header={{
        title: team?.json?.title ? getLangText(team?.json?.title, lang) : false,
        breadcrumb: {},
      }}
    >
      <Card className={responsiveSearchCardClassName}>
        <Row {...responsiveSearchRowProps}>
          <Col {...responsiveSearchPrimaryColProps}>
            <Search
              size={'large'}
              placeholder={
                referenceLookup
                  ? intl.formatMessage({ id: 'pages.search.referenceLookup.placeholder' })
                  : openAI
                    ? intl.formatMessage({ id: 'pages.search.placeholder' })
                    : intl.formatMessage({ id: 'pages.search.keyWord' })
              }
              onSearch={onSearch}
              enterButton
            />
          </Col>
          <Col {...responsiveSearchExtraColProps}>
            <Checkbox
              checked={openAI}
              onChange={(e) => {
                setOpenAI(e.target.checked);
                if (e.target.checked) {
                  setReferenceLookup(false);
                }
              }}
            >
              <FormattedMessage id='pages.search.openAI' defaultMessage='AI Recommendation' />
            </Checkbox>
            <Space className='responsive-data-list-reference-lookup-option' size={4} align='center'>
              <Checkbox
                checked={referenceLookup}
                onChange={(e) => {
                  setReferenceLookup(e.target.checked);
                  if (e.target.checked) {
                    setOpenAI(false);
                  }
                }}
              >
                <FormattedMessage
                  id='pages.search.referenceLookup'
                  defaultMessage='Reference Lookup'
                />
              </Checkbox>
              <ReferenceLookupHelpIcon />
            </Space>
          </Col>
        </Row>
      </Card>
      <ProTable<ProcessTable, ProcessTableRequestParams>
        key={`process-table:${dataSource}:${tid ?? ''}`}
        {...responsiveDataListTableProps}
        rowKey={(record) => `${record.id}:${record.version}`}
        headerTitle={
          <>
            {getDataTitle(dataSource)} /{' '}
            <FormattedMessage id='menu.tgdata.processes' defaultMessage='Processes' />
          </>
        }
        actionRef={actionRef}
        dataSource={tableDataSource}
        onDataSourceChange={setTableDataSource}
        params={{
          locale: appLocale,
          dataSource,
          teamId: tid ?? '',
          keyword: keyWord,
          searchRevision,
          searchMode: referenceLookup ? 'reference' : openAI ? 'ai' : 'keyword',
          stateCode,
          typeOfDataSet,
          ...(dataSource === 'tg'
            ? { openDataFilterRevision: JSON.stringify(openDataFilters) }
            : {}),
        }}
        rowSelection={
          dataSource === 'tg' && canPublishOpenData
            ? {
                selectedRowKeys: selectedProcessKeys,
                onChange: (keys, rows) => {
                  setSelectedProcessKeys(keys);
                  setSelectedProcesses(rows);
                },
              }
            : undefined
        }
        search={false}
        options={isMobileDataList ? false : { fullScreen: true }}
        optionsRender={
          isMobileDataList
            ? undefined
            : (_, defaultOptions) => {
                const settings = (defaultOptions ?? []) as ReactElement[];
                if (dataSource !== 'my') {
                  return settings;
                }
                const calcOption = <LcaSolveToolbar key='lca-calc-option' placement='option' />;
                const analysisPageOption = (
                  <ToolBarButton
                    key='lca-analysis-page-option'
                    icon={<BarChartOutlined />}
                    placement='option'
                    tooltip={intl.formatMessage({
                      id: 'pages.process.lca.page.title',
                      defaultMessage: 'LCA Analysis',
                    })}
                    onClick={() => {
                      history.push('/mydata/processes/analysis');
                    }}
                  />
                );
                const reloadIndex = settings.findIndex((item) => item.key === 'reload');
                if (reloadIndex < 0) {
                  return [...settings, calcOption, analysisPageOption];
                }
                return [
                  ...settings.slice(0, reloadIndex + 1),
                  calcOption,
                  analysisPageOption,
                  ...settings.slice(reloadIndex + 1),
                ];
              }
        }
        pagination={{
          showSizeChanger: false,
          pageSize: 10,
          ...getReferenceLookupPaginationProps(referenceLookup),
        }}
        toolBarRender={() => {
          if (dataSource === 'my') {
            const filters = [
              <span key={3}>{typeOfDataSetFilter(isMobileDataList ? 120 : 160)}</span>,
              <TableFilter
                key={2}
                width={isMobileDataList ? 112 : 140}
                onChange={(val) => {
                  setStateCode(val);
                }}
              />,
            ];
            const mobileActions = isMobileDataList
              ? [
                  <ResponsiveDataListToolbarMore key='process-mobile-toolbar-more'>
                    <ProcessCreate
                      importData={importData}
                      onClose={() => setImportData(null)}
                      key='process-create-option'
                      lang={lang}
                      actionRef={actionRef}
                    />
                    <LcaSolveToolbar key='lca-calc-option' />
                    <ToolBarButton
                      key='lca-analysis-page-option'
                      icon={<BarChartOutlined />}
                      tooltip={intl.formatMessage({
                        id: 'pages.process.lca.page.title',
                        defaultMessage: 'LCA Analysis',
                      })}
                      onClick={() => {
                        history.push('/mydata/processes/analysis');
                      }}
                    />
                    <ImportData onJsonData={handleImportData} key='process-import-option' />
                  </ResponsiveDataListToolbarMore>,
                ]
              : [];
            const desktopActions = isMobileDataList
              ? []
              : [
                  <ProcessCreate
                    importData={importData}
                    onClose={() => setImportData(null)}
                    key={0}
                    lang={lang}
                    actionRef={actionRef}
                  />,
                  <ImportData onJsonData={handleImportData} key={1} />,
                ];
            return [...filters, ...mobileActions, ...desktopActions];
          }
          if (dataSource === 'tg') {
            return [
              <span key='process-type-filter'>
                {typeOfDataSetFilter(isMobileDataList ? 120 : 160)}
              </span>,
              ...(canPublishOpenData
                ? [
                    <Button
                      key='publish-selected-processes'
                      type='primary'
                      disabled={selectedProcesses.length === 0}
                      loading={isPublishing}
                      onClick={handlePublishSelected}
                    >
                      {intl.formatMessage(
                        {
                          id: 'pages.openData.publication.publishSelected',
                          defaultMessage: 'Publish selected ({count})',
                        },
                        { count: selectedProcesses.length },
                      )}
                    </Button>,
                  ]
                : []),
              <OpenDataCatalogFilters
                key='open-data-filters'
                includePublication
                value={openDataFilters}
                onChange={setOpenDataFilters}
              />,
            ];
          }
          return [<span key={0}>{typeOfDataSetFilter(isMobileDataList ? 120 : 160)}</span>];
        }}
        request={async (
          params: ProcessTableRequestParams & { pageSize?: number; current?: number },
          sort,
        ) => {
          const {
            locale: requestedLocale,
            dataSource: requestedDataSource,
            teamId: requestedTeamId,
            keyword: requestedKeyword,
            searchRevision: _searchRevision,
            searchMode,
            stateCode: requestedStateCode,
            typeOfDataSet: requestedTypeOfDataSet,
            openDataFilterRevision: _openDataFilterRevision,
            ...requestParams
          } = params;
          void _searchRevision;
          void _openDataFilterRevision;
          setTableDataSource([]);
          return guardLocaleMaterializedTableRequest(
            requestedLocale,
            () => currentAppLocaleRef.current,
            tableRequestEpochRef,
            async ({ isCurrentRequest }) => {
              try {
                if (searchMode === 'reference') {
                  const referenceLookupUuid = getReferenceLookupUuid(requestedKeyword);
                  if (!referenceLookupUuid) {
                    return applyProcessTableResult(
                      getReferenceLookupEmptyResult(requestParams.current),
                    );
                  }
                  const referenceLookupTeamId = getReferenceLookupTeamId(requestedTeamId);

                  const result = await getProcessTableUuidMentionSearch(
                    requestParams,
                    lang,
                    requestedDataSource,
                    referenceLookupUuid,
                    requestedStateCode,
                    requestedTypeOfDataSet,
                    referenceLookupTeamId,
                    ...getOpenDataCatalogFilterArgs(requestedDataSource, openDataFilters),
                  );
                  const noticeKey = [
                    requestedDataSource,
                    referenceLookupUuid,
                    requestedStateCode,
                    requestedTypeOfDataSet,
                    referenceLookupTeamId,
                    requestedLocale,
                  ].join(':');
                  if (
                    isCurrentRequest() &&
                    result.capped &&
                    referenceLookupLimitNoticeRef.current !== noticeKey
                  ) {
                    referenceLookupLimitNoticeRef.current = noticeKey;
                    showReferenceLookupLimitMessage(intl);
                  }
                  return applyProcessTableResult(result);
                }
                if (requestedKeyword.length > 0) {
                  let orderBy:
                    | {
                        key: 'common:class' | 'baseName';
                        lang?: SupportedServiceQueryLanguage;
                        order: 'asc' | 'desc';
                      }
                    | undefined;
                  const activeSort = getActiveTableSort(sort);
                  if (activeSort) {
                    const { field, order } = activeSort;
                    if (field === 'name') {
                      orderBy = {
                        key: 'baseName',
                        lang: getServiceQueryLanguage(lang),
                        order: order === 'ascend' ? 'asc' : 'desc',
                      };
                    } else if (field === 'classification') {
                      orderBy = { key: 'common:class', order: order === 'ascend' ? 'asc' : 'desc' };
                    }
                  }
                  if (searchMode === 'ai') {
                    return applyProcessTableResult(
                      await process_hybrid_search(
                        requestParams,
                        lang,
                        requestedDataSource,
                        requestedKeyword,
                        {},
                        requestedStateCode,
                        requestedTypeOfDataSet,
                        requestedTeamId,
                        ...getOpenDataCatalogFilterArgs(requestedDataSource, openDataFilters),
                      ),
                    );
                  }
                  return applyProcessTableResult(
                    requestedDataSource === 'tg'
                      ? await getProcessTablePgroongaSearch(
                          requestParams,
                          lang,
                          requestedDataSource,
                          requestedKeyword,
                          {},
                          requestedStateCode,
                          requestedTypeOfDataSet,
                          orderBy,
                          requestedTeamId,
                          false,
                          openDataFilters,
                        )
                      : await getProcessTablePgroongaSearch(
                          requestParams,
                          lang,
                          requestedDataSource,
                          requestedKeyword,
                          {},
                          requestedStateCode,
                          requestedTypeOfDataSet,
                          orderBy,
                          requestedTeamId,
                        ),
                  );
                }

                const sortFields: Record<string, string> = {
                  name: 'json->processDataSet->processInformation->dataSetInformation->name',
                  classification:
                    'json->processDataSet->processInformation->dataSetInformation->classificationInformation->"common:classification"->"common:class"',
                };

                const convertedSort = mapActiveTableSort(sort, sortFields);

                return applyProcessTableResult(
                  await getProcessTableAll(
                    requestParams,
                    convertedSort,
                    lang,
                    requestedDataSource,
                    requestedTeamId,
                    requestedStateCode,
                    requestedTypeOfDataSet,
                    ...getOpenDataCatalogFilterArgs(requestedDataSource, openDataFilters),
                  ),
                );
              } catch (error) {
                if (isCurrentRequest()) {
                  message.error(
                    intl.formatMessage({
                      id: 'pages.process.list.loadError',
                      defaultMessage: 'Failed to load process list.',
                    }),
                  );
                }
                return applyProcessTableResult();
              }
            },
          );
        }}
        columns={processColumns}
      />

      {editDrawerVisible && editId && editVersion && (
        <ProcessEdit
          id={editId}
          version={editVersion}
          lang={lang}
          buttonType={'icon'}
          actionRef={actionRef}
          setViewDrawerVisible={handleEditClose}
          autoOpen={true}
          autoCheckRequired={required}
        />
      )}
      {viewDrawerVisible && editId && editVersion && (
        <ProcessView
          id={editId}
          version={editVersion}
          lang={lang}
          buttonType={'icon'}
          disabled={false}
          actionRef={actionRef}
          autoOpen={true}
          onDrawerClose={handleEditClose}
        />
      )}
    </PageContainer>
  );
};

export default TableList;
