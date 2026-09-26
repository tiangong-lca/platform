import { renderTableSelectionClearAction } from '@/components/TableSelectionAlert';
import AccountView from '@/pages/Account/view';
import ContactView from '@/pages/Contacts/Components/view';
import FlowpropertyView from '@/pages/Flowproperties/Components/view';
import FlowView from '@/pages/Flows/Components/view';
import LifeCycleModelView from '@/pages/LifeCycleModels/Components/view';
import ProcessView from '@/pages/Processes/Components/view';
import SourceView from '@/pages/Sources/Components/view';
import UnitGroupView from '@/pages/Unitgroups/Components/view';
import { ListPagination } from '@/services/general/data';
import { getLang } from '@/services/general/util';
import { genProcessName } from '@/services/processes/util';
import {
  getReviewsTableDataOfReviewAdmin,
  getReviewsTableDataOfReviewMember,
  getRootReviewReferenceProgress,
  type ReviewDisplayMode,
  type ReviewQueueFilters,
  type ReviewSubmitDatasetTable,
  type RootReviewReferenceProgress,
} from '@/services/reviews/api';
import { ReviewsTable } from '@/services/reviews/data';
import { ExperimentOutlined } from '@ant-design/icons';
import { ProColumns, ProTable } from '@ant-design/pro-components';
import { FormattedMessage, useIntl } from '@umijs/max';
import {
  Alert,
  Button,
  Card,
  Col,
  Input,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  theme,
  Tooltip,
} from 'antd';
import { SearchProps } from 'antd/es/input/Search';
import { SortOrder } from 'antd/es/table/interface';
import { useEffect, useRef, useState } from 'react';
import BatchReviewActions from './BatchReviewActions';
import RejectReview from './RejectReview';
import ReviewLifeCycleModelsDetail from './reviewLifeCycleModels';
import ReviewProcessDetail from './reviewProcess';
import ReviewProgress from './ReviewProgress';
import ReviewTaskDetail from './ReviewTaskDetail';
import SelectReviewer from './SelectReviewer';
import SimpleReviewActions from './SimpleReviewActions';

const { Search } = Input;

export const SELECTED_REVIEW_ROW_BUTTON_STYLE = `
  .review-table-with-expand-icon
    .ant-table-cell:not(.review-action-column)
    .ant-btn {
    background: transparent !important;
    border-color: transparent !important;
    box-shadow: none;
  }
`;

export const REVIEW_DISPLAY_MODE_FILTER_WIDTH = '10.5em';
export const REVIEW_DATA_TYPE_FILTER_WIDTH = '9.5em';

const ReviewFilterLabel = ({ label }: { label: React.ReactNode }) => (
  <Tooltip title={label}>
    <span
      style={{
        display: 'block',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  </Tooltip>
);

type AssignmentReviewProps = {
  userData: { user_id: string; role: string } | null;
  tableType:
    | 'unassigned'
    | 'in-progress'
    | 'completed'
    | 'pending'
    | 'submitted'
    | 'assigned'
    | 'reviewed'
    | 'reviewer-rejected'
    | 'admin-rejected';
  actionRef: any;
  actionFrom?: 'reviewMember';
  hideReviewButton?: boolean;
  onOpenQualityDiagnostic?: () => void;
};

export const isReferenceMatchingReviewTab = (
  record: RootReviewReferenceProgress,
  tableType: AssignmentReviewProps['tableType'],
) => {
  switch (tableType) {
    case 'unassigned':
      return record.state_code === 0;
    case 'in-progress':
    case 'assigned':
      return record.state_code === 1;
    case 'completed':
    case 'admin-rejected':
      return [-1, 2].includes(record.state_code);
    case 'pending':
      return record.state_code > 0 && record.actor_comment_state_code === 0;
    case 'submitted':
    case 'reviewed':
      return record.state_code === 1 && [1, -3].includes(record.actor_comment_state_code as number);
    case 'reviewer-rejected':
      return record.state_code === -1 && record.actor_comment_state_code === -1;
    default:
      return false;
  }
};

export const isExpandableRootReview = (record: Pick<ReviewsTable, 'reviewKind' | 'targetTable'>) =>
  record.reviewKind === 'root' &&
  Boolean(record.targetTable) &&
  ['processes', 'lifecyclemodels'].includes(record.targetTable as string);

const MODEL_PROCESS_REVIEW_TABLES: ReviewSubmitDatasetTable[] = ['processes', 'lifecyclemodels'];
export const isReviewTargetTableCompatible = (
  displayMode: ReviewDisplayMode,
  targetTable?: ReviewSubmitDatasetTable,
) => {
  if (!targetTable || displayMode === 'all') return true;
  const isModelProcess = MODEL_PROCESS_REVIEW_TABLES.includes(targetTable);
  return displayMode === 'model_process' ? isModelProcess : !isModelProcess;
};

const ExpandIconStyle = () => {
  const { token } = theme.useToken();
  return (
    <style>{`
      .review-table-with-expand-icon .ant-table-row-expand-icon:hover,
      .review-table-with-expand-icon .ant-table-row-expand-icon-expanded,
      .review-table-with-expand-icon .ant-table-row-expand-icon-expanded:hover,
      .review-table-with-expand-icon .ant-table-row-expand-icon:focus,
      .review-table-with-expand-icon .ant-table-row-expand-icon-expanded:focus {
        color: ${token.colorPrimary} !important;
      }
      ${SELECTED_REVIEW_ROW_BUTTON_STYLE}
      .review-table-with-expand-icon .review-action-column .ant-btn {
        background: ${token.colorBgContainer} !important;
        border-color: ${token.colorBorder} !important;
        border-radius: 50%;
      }
    `}</style>
  );
};

const AssignmentReview = ({
  userData,
  tableType,
  actionRef,
  actionFrom,
  hideReviewButton = false,
  onOpenQualityDiagnostic,
}: AssignmentReviewProps) => {
  // const intl = useIntl();
  const { locale } = useIntl();
  const lang = getLang(locale);
  const [tableLoading, setTableLoading] = useState(false);
  const [selectedRootReviewIds, setSelectedRootReviewIds] = useState<React.Key[]>([]);
  const [manualSelectedReferenceIds, setManualSelectedReferenceIds] = useState<string[]>([]);
  const [excludedAutoReferenceIds, setExcludedAutoReferenceIds] = useState<string[]>([]);
  const [autoReferenceIdsByRoot, setAutoReferenceIdsByRoot] = useState<Record<string, string[]>>(
    {},
  );
  const [selectionLoadingRootIds, setSelectionLoadingRootIds] = useState<string[]>([]);
  const [selectionFailedRootIds, setSelectionFailedRootIds] = useState<string[]>([]);
  const [displayMode, setDisplayMode] = useState<ReviewDisplayMode>('all');
  const [targetTable, setTargetTable] = useState<ReviewSubmitDatasetTable>();
  const intl = useIntl();
  const defaultTableAlertOptionRender = renderTableSelectionClearAction(
    <FormattedMessage id='pages.searchTable.clearSelection' defaultMessage='Clear selection' />,
  );

  const [expandedRowKeys, setExpandedRowKeys] = useState<React.Key[]>([]);
  const [subTableData, setSubTableData] = useState<Record<string, RootReviewReferenceProgress[]>>(
    {},
  );
  const [subTableLoading, setSubTableLoading] = useState<Record<string, boolean>>({});
  const selectedRootReviewIdsRef = useRef<Set<string>>(new Set());
  const mainReviewRowsRef = useRef<Record<string, ReviewsTable>>({});
  const subTableDataRef = useRef<Record<string, RootReviewReferenceProgress[]>>({});
  const subTableRequestRef = useRef<
    Record<string, Promise<RootReviewReferenceProgress[]> | undefined>
  >({});
  const subTableLoadErrorIdsRef = useRef<Set<string>>(new Set());
  const [keyword, setKeyword] = useState('');
  const [searchRevision, setSearchRevision] = useState(0);
  const [queryFailed, setQueryFailed] = useState(false);
  const requestEpochRef = useRef(0);
  const viewEpochRef = useRef(0);
  const requestScope = JSON.stringify([
    keyword,
    searchRevision,
    lang,
    tableType,
    displayMode,
    targetTable,
    userData?.user_id,
    userData?.role,
  ]);
  const requestScopeRef = useRef(requestScope);
  if (requestScopeRef.current !== requestScope) {
    requestScopeRef.current = requestScope;
    requestEpochRef.current += 1;
    viewEpochRef.current += 1;
  }
  const childActionRef = useRef<{ reload: () => void }>({} as { reload: () => void });

  const isReferenceMatchingCurrentTab = (record: RootReviewReferenceProgress) =>
    isReferenceMatchingReviewTab(record, tableType);
  const supportsBatchSelection = ['unassigned', 'in-progress', 'assigned', 'pending'].includes(
    tableType,
  );

  const renderDatasetViewButton = (
    targetTable: ReviewSubmitDatasetTable | undefined,
    id: string | undefined,
    version: string | undefined,
  ) => {
    if (!targetTable || !id || !version) return null;
    const tooltipTitle = intl.formatMessage({
      id: 'pages.review.actions.viewData',
      defaultMessage: 'View data',
    });

    switch (targetTable) {
      case 'contacts':
        return (
          <ContactView
            id={id}
            version={version}
            lang={lang}
            buttonType='icon'
            tooltipTitle={tooltipTitle}
          />
        );
      case 'sources':
        return (
          <SourceView
            id={id}
            version={version}
            lang={lang}
            buttonType='icon'
            tooltipTitle={tooltipTitle}
          />
        );
      case 'unitgroups':
        return (
          <UnitGroupView
            id={id}
            version={version}
            lang={lang}
            buttonType='icon'
            tooltipTitle={tooltipTitle}
          />
        );
      case 'flowproperties':
        return (
          <FlowpropertyView
            id={id}
            version={version}
            lang={lang}
            buttonType='icon'
            tooltipTitle={tooltipTitle}
          />
        );
      case 'flows':
        return (
          <FlowView
            id={id}
            version={version}
            lang={lang}
            buttonType='icon'
            tooltipTitle={tooltipTitle}
          />
        );
      case 'processes':
        return (
          <ProcessView
            id={id}
            version={version}
            lang={lang}
            buttonType='icon'
            disabled={false}
            buttonTypeProp='text'
            tooltipTitle={tooltipTitle}
          />
        );
      case 'lifecyclemodels':
        return (
          <LifeCycleModelView
            id={id}
            version={version}
            lang={lang}
            buttonType='icon'
            buttonTypeProp='text'
            tooltipTitle={tooltipTitle}
          />
        );
      default:
        return null;
    }
  };

  const clearUnifiedSelection = () => {
    selectedRootReviewIdsRef.current = new Set();
    setSelectedRootReviewIds([]);
    setManualSelectedReferenceIds([]);
    setExcludedAutoReferenceIds([]);
    setAutoReferenceIdsByRoot({});
    setSelectionLoadingRootIds([]);
    setSelectionFailedRootIds([]);
  };
  const tableAlertOptionRender = (args: {
    onCleanSelected?: () => void;
    selectedRowKeys?: React.Key[];
  }) =>
    defaultTableAlertOptionRender({
      ...args,
      onCleanSelected: () => {
        args.onCleanSelected?.();
        clearUnifiedSelection();
      },
    });

  const resetReviewViewState = () => {
    viewEpochRef.current += 1;
    mainReviewRowsRef.current = {};
    clearUnifiedSelection();
    setExpandedRowKeys([]);
    setSubTableData({});
    setSubTableLoading({});
    subTableDataRef.current = {};
    subTableRequestRef.current = {};
    subTableLoadErrorIdsRef.current = new Set();
  };

  const reloadAfterChildAction = (failedReviewIds: string[] = []) => {
    requestEpochRef.current += 1;
    if (failedReviewIds.length === 0) {
      resetReviewViewState();
    } else {
      const failed = new Set(failedReviewIds);
      const knownReferenceIds = new Set(
        Object.values(subTableDataRef.current)
          .flat()
          .map((item) => item.reference_review_id),
      );
      const referenceIds = failedReviewIds.filter(
        (id) =>
          mainReviewRowsRef.current[id]?.reviewKind === 'reference' || knownReferenceIds.has(id),
      );
      const rootIds = failedReviewIds.filter((id) => !referenceIds.includes(id));
      selectedRootReviewIdsRef.current = new Set(rootIds);
      setSelectedRootReviewIds(rootIds);
      setManualSelectedReferenceIds(referenceIds);
      setExcludedAutoReferenceIds((current) => current.filter((id) => failed.has(id)));
      setAutoReferenceIdsByRoot({});
    }
    actionRef.current?.reload?.();
  };
  childActionRef.current.reload = reloadAfterChildAction;

  useEffect(() => {
    resetReviewViewState();
    setQueryFailed(false);
    actionRef.current?.setPageInfo?.({ current: 1 });
  }, [actionRef, requestScope]);

  const handleDisplayModeChange = (nextDisplayMode: ReviewDisplayMode) => {
    setDisplayMode(nextDisplayMode);
    setTargetTable((currentTargetTable) =>
      isReviewTargetTableCompatible(nextDisplayMode, currentTargetTable)
        ? currentTargetTable
        : undefined,
    );
  };

  const handleTargetTableChange = (nextTargetTable: ReviewSubmitDatasetTable | 'all') => {
    setTargetTable(nextTargetTable === 'all' ? undefined : nextTargetTable);
  };

  const reviewQueueFilters: ReviewQueueFilters | undefined =
    displayMode === 'all' && !targetTable && !keyword
      ? undefined
      : {
          displayMode,
          ...(keyword ? { query: keyword } : {}),
          ...(targetTable ? { targetTable } : {}),
        };

  const displayModeOptions = [
    {
      value: 'all',
      label: intl.formatMessage({
        id: 'pages.review.filters.displayMode.all',
        defaultMessage: 'All reviews',
      }),
    },
    {
      value: 'model_process',
      label: intl.formatMessage({
        id: 'pages.review.filters.displayMode.modelProcess',
        defaultMessage: 'Process and model reviews',
      }),
    },
    {
      value: 'other',
      label: intl.formatMessage({
        id: 'pages.review.filters.displayMode.other',
        defaultMessage: 'Other reviews',
      }),
    },
  ];

  const targetTableOptionCandidates: Array<{
    value: ReviewSubmitDatasetTable;
    label: string;
  }> = [
    {
      value: 'processes',
      label: intl.formatMessage({ id: 'menu.processes' }),
    },
    {
      value: 'lifecyclemodels',
      label: intl.formatMessage({ id: 'menu.lifeCycleModels' }),
    },
    {
      value: 'flows',
      label: intl.formatMessage({ id: 'menu.mydata.flows' }),
    },
    {
      value: 'flowproperties',
      label: intl.formatMessage({ id: 'menu.mydata.flowproperties' }),
    },
    {
      value: 'unitgroups',
      label: intl.formatMessage({ id: 'menu.mydata.unitgroups' }),
    },
    {
      value: 'sources',
      label: intl.formatMessage({ id: 'menu.mydata.sources' }),
    },
    {
      value: 'contacts',
      label: intl.formatMessage({ id: 'menu.mydata.contacts' }),
    },
  ];

  const targetTableOptions = [
    {
      value: 'all',
      label: intl.formatMessage({
        id: 'pages.review.filters.dataType.all',
        defaultMessage: 'All data types',
      }),
    },
    ...targetTableOptionCandidates.filter(({ value }) =>
      isReviewTargetTableCompatible(displayMode, value),
    ),
  ];
  const onSearch: SearchProps['onSearch'] = (value) => {
    requestEpochRef.current += 1;
    resetReviewViewState();
    setQueryFailed(false);
    actionRef.current?.setPageInfo?.({ current: 1 });
    setKeyword(value.trim());
    setSearchRevision((revision) => revision + 1);
  };

  useEffect(
    () => () => {
      requestEpochRef.current += 1;
      viewEpochRef.current += 1;
    },
    [],
  );

  const loadSubTableData = async (rootReviewId: string) => {
    if (Object.prototype.hasOwnProperty.call(subTableDataRef.current, rootReviewId)) {
      return subTableDataRef.current[rootReviewId];
    }
    if (subTableRequestRef.current[rootReviewId]) {
      return subTableRequestRef.current[rootReviewId];
    }

    const viewEpoch = viewEpochRef.current;
    const rowKey = rootReviewId;
    subTableLoadErrorIdsRef.current.delete(rootReviewId);
    setSubTableLoading((prev) => ({ ...prev, [rowKey]: true }));
    const request = (async () => {
      try {
        const result = await getRootReviewReferenceProgress(rootReviewId);
        if (viewEpoch !== viewEpochRef.current) return [];
        if (result.error) throw result.error;
        const currentTabData = result.data.filter(isReferenceMatchingCurrentTab);
        subTableLoadErrorIdsRef.current.delete(rootReviewId);
        subTableDataRef.current = {
          ...subTableDataRef.current,
          [rowKey]: currentTabData,
        };
        setSubTableData((prev) => ({ ...prev, [rowKey]: currentTabData }));
        return currentTabData;
      } catch (error) {
        if (viewEpoch !== viewEpochRef.current) return [];
        console.error('Failed to load reference review data:', error);
        subTableLoadErrorIdsRef.current.add(rootReviewId);
        const remainingSubTableData = { ...subTableDataRef.current };
        delete remainingSubTableData[rowKey];
        subTableDataRef.current = remainingSubTableData;
        setSubTableData((prev) => ({ ...prev, [rowKey]: [] }));
        return [];
      } finally {
        if (viewEpoch === viewEpochRef.current) {
          delete subTableRequestRef.current[rowKey];
          setSubTableLoading((prev) => ({ ...prev, [rowKey]: false }));
        }
      }
    })();
    subTableRequestRef.current[rootReviewId] = request;
    return request;
  };

  const handleRootSelectionChange = (keys: React.Key[]) => {
    const viewEpoch = viewEpochRef.current;
    const nextRootIds = keys.map(String);
    const previousRootIds = selectedRootReviewIdsRef.current;
    const nextRootIdSet = new Set(nextRootIds);
    const addedRootIds = nextRootIds.filter((id) => !previousRootIds.has(id));
    const removedRootIds = [...previousRootIds].filter((id) => !nextRootIdSet.has(id));

    selectedRootReviewIdsRef.current = nextRootIdSet;
    setSelectedRootReviewIds(keys);

    if (removedRootIds.length > 0) {
      const nextAutoReferenceIdsByRoot = Object.fromEntries(
        Object.entries(autoReferenceIdsByRoot).filter(([rootId]) => nextRootIdSet.has(rootId)),
      );
      const remainingAutoReferenceIds = new Set(Object.values(nextAutoReferenceIdsByRoot).flat());
      setAutoReferenceIdsByRoot(nextAutoReferenceIdsByRoot);
      setExcludedAutoReferenceIds((current) =>
        current.filter((referenceId) => remainingAutoReferenceIds.has(referenceId)),
      );
      setSelectionFailedRootIds((current) => current.filter((rootId) => nextRootIdSet.has(rootId)));
    }

    addedRootIds
      .filter((rootReviewId) => isExpandableRootReview(mainReviewRowsRef.current[rootReviewId]))
      .forEach((rootReviewId) => {
        setSelectionFailedRootIds((current) => current.filter((id) => id !== rootReviewId));
        setSelectionLoadingRootIds((current) => Array.from(new Set([...current, rootReviewId])));
        void loadSubTableData(rootReviewId)
          .then((references) => {
            if (viewEpoch !== viewEpochRef.current) return;
            if (!selectedRootReviewIdsRef.current.has(rootReviewId)) return;
            if (subTableLoadErrorIdsRef.current.has(rootReviewId)) {
              setSelectionFailedRootIds((current) =>
                Array.from(new Set([...current, rootReviewId])),
              );
              return;
            }
            const referenceIds = references.map((item) => item.reference_review_id);
            setAutoReferenceIdsByRoot((current) => ({
              ...current,
              [rootReviewId]: referenceIds,
            }));
            setExcludedAutoReferenceIds((current) =>
              current.filter((referenceId) => !referenceIds.includes(referenceId)),
            );
          })
          .finally(() => {
            if (viewEpoch !== viewEpochRef.current) return;
            setSelectionLoadingRootIds((current) => current.filter((id) => id !== rootReviewId));
          });
      });
  };

  const autoSelectedReferenceIds = new Set(Object.values(autoReferenceIdsByRoot).flat());
  const effectiveSelectedReferenceIds = Array.from(
    new Set([
      ...manualSelectedReferenceIds,
      ...[...autoSelectedReferenceIds].filter(
        (referenceId) => !excludedAutoReferenceIds.includes(referenceId),
      ),
    ]),
  );
  const effectiveSelectedReferenceIdSet = new Set(effectiveSelectedReferenceIds);
  const selectedReviewIds = Array.from(
    new Set([...selectedRootReviewIds.map(String), ...effectiveSelectedReferenceIds]),
  );

  const handleReferenceSelectionChange = (
    references: RootReviewReferenceProgress[],
    selectedKeys: React.Key[],
  ) => {
    const selectedReferenceIds = new Set(selectedKeys.map(String));
    const currentTableReferenceIds = references.map((item) => item.reference_review_id);
    const newlySelectedIds = currentTableReferenceIds.filter(
      (id) => selectedReferenceIds.has(id) && !effectiveSelectedReferenceIdSet.has(id),
    );
    const newlyDeselectedIds = currentTableReferenceIds.filter(
      (id) => !selectedReferenceIds.has(id) && effectiveSelectedReferenceIdSet.has(id),
    );

    if (newlySelectedIds.length > 0 || newlyDeselectedIds.length > 0) {
      setManualSelectedReferenceIds((current) =>
        Array.from(
          new Set([
            ...current.filter((id) => !newlyDeselectedIds.includes(id)),
            ...newlySelectedIds,
          ]),
        ),
      );
      setExcludedAutoReferenceIds((current) =>
        Array.from(
          new Set([
            ...current.filter((id) => !newlySelectedIds.includes(id)),
            ...newlyDeselectedIds.filter((id) => autoSelectedReferenceIds.has(id)),
          ]),
        ),
      );
    }
  };

  const handleMainSelectionChange = (keys: React.Key[]) => {
    const selectedIds = new Set(keys.map(String));
    const visibleRecords = Object.values(mainReviewRowsRef.current);
    const visibleRootIds = new Set(
      visibleRecords.filter((record) => record.reviewKind === 'root').map((record) => record.id),
    );
    const nextRootIds = [
      ...[...selectedRootReviewIdsRef.current].filter(
        (id) => !visibleRootIds.has(id) || selectedIds.has(id),
      ),
      ...visibleRecords
        .filter((record) => record.reviewKind === 'root' && selectedIds.has(record.id))
        .map((record) => record.id),
    ];
    handleRootSelectionChange(Array.from(new Set(nextRootIds)));

    const visibleReferences = visibleRecords
      .filter((record) => record.reviewKind === 'reference')
      .map((record) => ({ reference_review_id: record.id }) as RootReviewReferenceProgress);
    handleReferenceSelectionChange(
      visibleReferences,
      visibleReferences
        .filter((record) => selectedIds.has(record.reference_review_id))
        .map((record) => record.reference_review_id),
    );
  };

  const handleExpand = async (expanded: boolean, record: ReviewsTable) => {
    setExpandedRowKeys((currentKeys) =>
      expanded
        ? Array.from(new Set([...currentKeys, record.id]))
        : currentKeys.filter((key) => key !== record.id),
    );
    if (expanded && isExpandableRootReview(record)) {
      await loadSubTableData(record.id);
    }
  };

  const subColumns: any[] = [
    {
      title: (
        <FormattedMessage id='pages.review.table.column.dataName' defaultMessage='Data name' />
      ),
      dataIndex: 'data_name',
      key: 'data_name',
      width: 420,
      render: (dataName: any, record: RootReviewReferenceProgress) => (
        <Space size='small' wrap style={{ maxWidth: '100%', overflowWrap: 'anywhere' }}>
          {genProcessName(dataName ?? {}, lang)}
          {renderDatasetViewButton(record.target_table, record.data_id, record.data_version)}
        </Space>
      ),
    },
    {
      title: <FormattedMessage id='pages.review.reference.table' defaultMessage='Data type' />,
      dataIndex: 'target_table',
      key: 'target_table',
      width: 140,
    },
    {
      title: <FormattedMessage id='pages.review.reference.version' defaultMessage='Data version' />,
      dataIndex: 'data_version',
      key: 'data_version',
      width: 140,
    },
    {
      title: <FormattedMessage id='pages.review.table.status' defaultMessage='Status' />,
      dataIndex: 'state_code',
      key: 'state_code',
      width: 140,
      render: (stateCode: number) => {
        const status =
          stateCode === 2
            ? {
                color: 'success',
                text: intl.formatMessage({
                  id: 'pages.review.reference.status.approved',
                  defaultMessage: 'Approved',
                }),
              }
            : stateCode === -1
              ? {
                  color: 'error',
                  text: intl.formatMessage({
                    id: 'pages.review.reference.status.rejected',
                    defaultMessage: 'Rejected',
                  }),
                }
              : stateCode === 1
                ? {
                    color: 'processing',
                    text: intl.formatMessage({
                      id: 'pages.review.reference.status.inReview',
                      defaultMessage: 'In review',
                    }),
                  }
                : {
                    color: 'default',
                    text: intl.formatMessage({
                      id: 'pages.review.reference.status.unassigned',
                      defaultMessage: 'Unassigned',
                    }),
                  };
        return <Tag color={status.color}>{status.text}</Tag>;
      },
    },
    {
      title: (
        <FormattedMessage id='pages.review.progress.button' defaultMessage='Review Progress' />
      ),
      key: 'progress',
      width: 120,
      render: (_: unknown, record: RootReviewReferenceProgress) =>
        `${record.completed_reviewer_count}/${record.reviewer_count}`,
    },
  ];

  if (!hideReviewButton) {
    subColumns.push({
      title: <FormattedMessage id='pages.review.actions' defaultMessage='Actions' />,
      key: 'actions',
      className: 'review-action-column',
      align: 'center',
      width: 168,
      fixed: 'right',
      render: (_: unknown, record: RootReviewReferenceProgress) => {
        if (tableType === 'unassigned') {
          return [
            <Space key={record.reference_review_id}>
              <SelectReviewer
                tabType='unassigned'
                actionRef={childActionRef}
                reviewIds={[record.reference_review_id]}
              />
              <RejectReview
                reviewId={record.reference_review_id}
                dataId={record.data_id}
                dataVersion={record.data_version}
                isModel={record.target_table === 'lifecyclemodels'}
                targetTable={record.target_table}
                actionRef={childActionRef}
              />
            </Space>,
          ];
        }

        if (tableType === 'in-progress' || tableType === 'assigned') {
          return [
            <Space key={record.reference_review_id}>
              <SelectReviewer
                tabType='assigned'
                actionRef={childActionRef}
                reviewIds={[record.reference_review_id]}
              />
              <SimpleReviewActions
                reviewId={record.reference_review_id}
                targetTable={record.target_table}
                role='admin'
                actionRef={childActionRef}
                approveDisabledReason={
                  record.reviewer_count === 0
                    ? intl.formatMessage({
                        id: 'pages.review.approve.disabled.noReviewers',
                        defaultMessage: 'Assign at least one reviewer before final approval.',
                      })
                    : record.completed_reviewer_count < record.reviewer_count
                      ? intl.formatMessage(
                          {
                            id: 'pages.review.approve.disabled.pendingOpinions',
                            defaultMessage: '{count} reviewer opinions are still pending.',
                          },
                          {
                            count: record.reviewer_count - record.completed_reviewer_count,
                          },
                        )
                      : undefined
                }
                dataVersion={record.data_version}
              />
            </Space>,
          ];
        }

        if (tableType === 'pending') {
          return [
            <SimpleReviewActions
              key={record.reference_review_id}
              reviewId={record.reference_review_id}
              targetTable={record.target_table}
              role='reviewer'
              actionRef={childActionRef}
            />,
          ];
        }

        return [];
      },
    });
  }

  const isSimpleReview = (record: ReviewsTable) =>
    record.reviewKind === 'reference' ||
    (record.reviewKind === 'root' &&
      Boolean(record.targetTable) &&
      !['processes', 'lifecyclemodels'].includes(record.targetTable as string));

  const getApproveDisabledReason = (record: ReviewsTable) => {
    const reviewerCount = record.reviewerCount ?? 0;
    const completedReviewerCount = record.completedReviewerCount ?? 0;
    if (reviewerCount === 0) {
      return intl.formatMessage({
        id: 'pages.review.approve.disabled.noReviewers',
        defaultMessage: 'Assign at least one reviewer before final approval.',
      });
    }
    if (completedReviewerCount < reviewerCount) {
      return intl.formatMessage(
        {
          id: 'pages.review.approve.disabled.pendingOpinions',
          defaultMessage: '{count} reviewer opinions are still pending.',
        },
        { count: reviewerCount - completedReviewerCount },
      );
    }
    return undefined;
  };

  const columns: ProColumns<ReviewsTable>[] = [
    {
      title: <FormattedMessage id='pages.table.title.index' defaultMessage='Index' />,
      dataIndex: 'index',
      valueType: 'index',
      search: false,
      width: 72,
    },
    {
      title: (
        <FormattedMessage id='pages.review.table.column.dataName' defaultMessage='Data name' />
      ),
      dataIndex: 'processName',
      sorter: false,
      search: false,
      width: 420,
      render: (_, row) => {
        const targetTable = row.targetTable as ReviewSubmitDatasetTable | undefined;
        const canOpenRootData = row.rootCanRead !== false;
        return [
          <Space key={0} orientation='vertical' size={0} align='start'>
            <ReviewTaskDetail
              record={row}
              dataView={
                canOpenRootData
                  ? renderDatasetViewButton(
                      targetTable,
                      row.json?.data?.id,
                      row.json?.data?.version,
                    )
                  : undefined
              }
            />
            <Space size={4} wrap>
              <Tag>{targetTable ?? '-'}</Tag>
              <Tag>{row.json?.data?.version ?? '-'}</Tag>
              <Tag>{row.reviewKind ?? '-'}</Tag>
            </Space>
          </Space>,
        ];
      },
    },
    {
      title: (
        <FormattedMessage id='pages.review.table.column.userName' defaultMessage='User Name' />
      ),
      dataIndex: 'userName',
      sorter: false,
      search: false,
      width: 220,
      render: (_, row) => {
        return [
          <span key={0} style={{ overflowWrap: 'anywhere' }}>
            {row.userName}
            <AccountView userId={row.json?.user?.id} buttonType='icon' buttonTypeProp='text' />
          </span>,
        ];
      },
    },
    {
      title: (
        <FormattedMessage id='pages.review.table.column.createAt' defaultMessage='Submitted at' />
      ),
      dataIndex: 'createAt',
      sorter: false,
      search: false,
      valueType: 'dateTime',
      width: 180,
    },
    {
      title: <FormattedMessage id='pages.review.table.column.deadline' defaultMessage='Deadline' />,
      dataIndex: 'deadline',
      sorter: false,
      search: false,
      valueType: 'dateTime',
      width: 180,
    },
    {
      title:
        userData?.role === 'review-member' && tableType !== 'completed' ? (
          <FormattedMessage id='pages.review.myOpinion' defaultMessage='My opinion' />
        ) : (
          <FormattedMessage id='pages.review.table.status' defaultMessage='Status' />
        ),
      dataIndex: 'stateCode',
      sorter: false,
      search: false,
      width: 140,
      render: (_: unknown, record: ReviewsTable) => {
        if (tableType === 'completed') {
          return record.stateCode === 2 ? (
            <Tag color='success'>
              <FormattedMessage id='pages.review.result.approved' defaultMessage='Approved' />
            </Tag>
          ) : (
            <Tag color='error'>
              <FormattedMessage id='pages.review.result.returned' defaultMessage='Returned' />
            </Tag>
          );
        }
        if (userData?.role === 'review-member') {
          if (record.actorCommentStateCode === 1) {
            return (
              <Tag color='success'>
                <FormattedMessage id='pages.review.opinion.approve' defaultMessage='Approve' />
              </Tag>
            );
          }
          if (record.actorCommentStateCode === -3) {
            return (
              <Tag color='error'>
                <FormattedMessage id='pages.review.opinion.reject' defaultMessage='Reject' />
              </Tag>
            );
          }
          return (
            <Tag color='processing'>
              <FormattedMessage id='pages.review.opinion.pending' defaultMessage='Pending' />
            </Tag>
          );
        }
        return tableType === 'unassigned' ? (
          <Tag>
            <FormattedMessage id='pages.review.tabs.unassigned' defaultMessage='Unassigned Task' />
          </Tag>
        ) : (
          <Tag color='processing'>
            <FormattedMessage id='pages.review.tabs.inProgress' defaultMessage='In Progress' />
          </Tag>
        );
      },
    },
  ];

  if (tableType === 'unassigned') {
    columns.push({
      title: <FormattedMessage id='pages.review.actions' defaultMessage='Actions' />,
      dataIndex: 'actions',
      className: 'review-action-column',
      search: false,
      align: 'center',
      width: 168,
      fixed: 'right',
      render: (_, record) => {
        if (record.rootMatchesStatus === false) return [];
        return [
          <Space key={0}>
            <SelectReviewer tabType='unassigned' actionRef={actionRef} reviewIds={[record.id]} />
            <RejectReview
              isModel={record.isFromLifeCycle}
              dataId={record.json?.data?.id}
              dataVersion={record.json?.data?.version}
              reviewId={record.id}
              targetTable={record.targetTable as ReviewSubmitDatasetTable | undefined}
              actionRef={actionRef}
            />
          </Space>,
        ];
      },
    });
  }
  if (tableType === 'in-progress' || tableType === 'assigned') {
    columns.push(
      ...[
        {
          title: (
            <FormattedMessage id='pages.review.progress.button' defaultMessage='Review Progress' />
          ),
          dataIndex: 'progress',
          sorter: false,
          search: false,
          width: 120,
          render: (_: any, record: ReviewsTable) => {
            const reviewerCount = record.reviewerCount ?? 0;
            const completedReviewerCount = record.completedReviewerCount ?? 0;
            const progress = `${completedReviewerCount}/${reviewerCount}`;
            if (tableType !== 'in-progress' || userData?.role !== 'review-admin') {
              return progress;
            }

            const opinionSummary =
              reviewerCount === 0
                ? intl.formatMessage({
                    id: 'pages.review.progress.noReviewers',
                    defaultMessage: 'No reviewers assigned yet.',
                  })
                : intl.formatMessage(
                    {
                      id: 'pages.review.detail.opinionSummary',
                      defaultMessage: 'Approve: {approve}; reject: {reject}; pending: {pending}.',
                    },
                    {
                      approve: record.approveOpinionCount ?? 0,
                      reject: record.rejectOpinionCount ?? 0,
                      pending: Math.max(0, reviewerCount - completedReviewerCount),
                    },
                  );
            const tooltipText = `${intl.formatMessage({
              id: 'pages.review.detail.opinions',
              defaultMessage: 'Reviewer opinions',
            })}: ${opinionSummary}`;

            return (
              <Tooltip title={tooltipText}>
                <span tabIndex={0} aria-label={`${progress}; ${tooltipText}`}>
                  {progress}
                </span>
              </Tooltip>
            );
          },
        },
        {
          title: <FormattedMessage id='pages.review.actions' defaultMessage='Actions' />,
          dataIndex: 'actions',
          className: 'review-action-column',
          search: false,
          align: 'center' as const,
          width: 168,
          fixed: 'right' as const,
          render: (_: any, record: ReviewsTable) => {
            if (record.rootMatchesStatus === false) return [];
            return [
              <Space key={0}>
                <SelectReviewer tabType='assigned' actionRef={actionRef} reviewIds={[record.id]} />
                <SimpleReviewActions
                  reviewId={record.id}
                  targetTable={record.targetTable as ReviewSubmitDatasetTable}
                  role='admin'
                  actionRef={actionRef}
                  approveDisabledReason={getApproveDisabledReason(record)}
                  dataVersion={record.json?.data?.version}
                  approveOpinionCount={record.approveOpinionCount}
                  rejectOpinionCount={record.rejectOpinionCount}
                />
                {!isSimpleReview(record) && (
                  <ReviewProgress
                    actionRef={actionRef}
                    tabType='assigned'
                    reviewId={record.id}
                    dataId={record.json?.data?.id}
                    dataVersion={record.json?.data?.version}
                    actionType={record.isFromLifeCycle ? 'model' : 'process'}
                  />
                )}
              </Space>,
            ];
          },
        },
      ],
    );
  }

  if (tableType === 'submitted' || tableType === 'reviewed' || tableType === 'pending') {
    columns.push(
      ...[
        {
          title: <FormattedMessage id='pages.review.actions' defaultMessage='Actions' />,
          dataIndex: 'actions',
          className: 'review-action-column',
          search: false,
          align: 'center' as const,
          width: 168,
          fixed: 'right' as const,
          render: (_: any, record: ReviewsTable) => {
            if (record.rootMatchesStatus === false) return [];
            if (isSimpleReview(record)) {
              return tableType === 'pending' && record.targetTable
                ? [
                    <SimpleReviewActions
                      key={0}
                      reviewId={record.id}
                      targetTable={record.targetTable as ReviewSubmitDatasetTable}
                      role='reviewer'
                      actionRef={actionRef}
                    />,
                  ]
                : [];
            }
            return [
              <Space key={0}>
                {record.isFromLifeCycle ? (
                  <ReviewLifeCycleModelsDetail
                    type={hideReviewButton ? 'view' : 'edit'}
                    id={record.json?.data?.id}
                    version={record.json?.data?.version}
                    lang={lang}
                    reviewId={record.id}
                    tabType='review'
                    actionRef={actionRef}
                  />
                ) : (
                  <ReviewProcessDetail
                    tabType='review'
                    type={hideReviewButton ? 'view' : 'edit'}
                    hideButton={hideReviewButton}
                    actionRef={actionRef}
                    id={record.json?.data?.id}
                    version={record.json?.data?.version}
                    lang={lang}
                    reviewId={record.id}
                  />
                )}
              </Space>,
            ];
          },
        },
      ],
    );
  }

  if (
    tableType === 'completed' ||
    tableType === 'reviewer-rejected' ||
    tableType === 'admin-rejected'
  ) {
    columns.push(
      ...[
        {
          title: <FormattedMessage id='pages.review.actions' defaultMessage='Actions' />,
          dataIndex: 'actions',
          className: 'review-action-column',
          search: false,
          align: 'center' as const,
          width: 168,
          fixed: 'right' as const,
          render: (_: any, record: ReviewsTable) => {
            if (record.rootMatchesStatus === false) return [];
            if (isSimpleReview(record)) return [];
            return [
              <Space key={0}>
                {record.isFromLifeCycle ? (
                  <ReviewLifeCycleModelsDetail
                    reviewId={record.id}
                    tabType={
                      userData?.role === 'review-admin' ? 'admin-rejected' : 'reviewer-rejected'
                    }
                    type='view'
                    id={record.json?.data?.id}
                    version={record.json?.data?.version}
                    lang={lang}
                    actionRef={actionRef}
                  />
                ) : (
                  <ReviewProcessDetail
                    hideButton={true}
                    tabType={
                      userData?.role === 'review-admin' ? 'admin-rejected' : 'reviewer-rejected'
                    }
                    type='view'
                    actionRef={actionRef}
                    id={record.json?.data?.id}
                    version={record.json?.data?.version}
                    lang={lang}
                    reviewId={record.id}
                  />
                )}
              </Space>,
            ];
          },
        },
      ],
    );
  }

  const getSubTitle = () => {
    switch (tableType) {
      case 'unassigned':
        return (
          <FormattedMessage id='pages.review.tabs.unassigned' defaultMessage='Unassigned Task' />
        );
      case 'assigned':
      case 'in-progress':
        return <FormattedMessage id='pages.review.tabs.assigned' defaultMessage='Assigned Task' />;
      case 'reviewed':
      case 'submitted':
        return <FormattedMessage id='pages.review.tabs.reviewed' defaultMessage='Reviewed' />;
      case 'pending':
        return <FormattedMessage id='pages.review.tabs.pending' defaultMessage='Pending Review' />;
      case 'reviewer-rejected':
        return <FormattedMessage id='pages.review.tabs.rejected' defaultMessage='Rejected' />;
      case 'admin-rejected':
      case 'completed':
        return <FormattedMessage id='pages.review.tabs.completed' defaultMessage='Completed' />;
      default:
    }
  };

  const getReviewsTableData = async (
    params: {
      pageSize: number;
      current: number;
    },
    sort: Record<string, SortOrder>,
  ) => {
    if (
      tableType === 'unassigned' ||
      tableType === 'in-progress' ||
      tableType === 'completed' ||
      tableType === 'assigned' ||
      tableType === 'admin-rejected'
    ) {
      const adminTableType =
        tableType === 'completed' && userData?.role !== 'review-admin' ? undefined : tableType;
      if (!adminTableType) {
        // A reviewer completed tab is routed to the member queue below.
      } else {
        return reviewQueueFilters
          ? getReviewsTableDataOfReviewAdmin(params, sort, adminTableType, lang, reviewQueueFilters)
          : getReviewsTableDataOfReviewAdmin(params, sort, adminTableType, lang);
      }
    }

    if (
      tableType === 'pending' ||
      tableType === 'submitted' ||
      tableType === 'reviewed' ||
      tableType === 'reviewer-rejected' ||
      (tableType === 'completed' && userData?.role !== 'review-admin')
    ) {
      const scopedUserData =
        actionFrom === 'reviewMember' ? { user_id: userData?.user_id } : undefined;
      return reviewQueueFilters
        ? getReviewsTableDataOfReviewMember(
            params,
            sort,
            tableType,
            lang,
            scopedUserData,
            reviewQueueFilters,
          )
        : getReviewsTableDataOfReviewMember(params, sort, tableType, lang, scopedUserData);
    }

    return Promise.resolve({
      success: true,
      data: [],
      total: 0,
    });
  };

  return (
    <>
      {!actionFrom && (
        <Card>
          <Row align={'middle'}>
            <Col flex='auto' style={{ marginRight: '10px' }}>
              <Search
                size={'large'}
                placeholder={intl.formatMessage({ id: 'pages.search.keyWord' })}
                onSearch={onSearch}
                allowClear
                maxLength={1000}
                enterButton
              />
            </Col>
          </Row>
        </Card>
      )}
      {queryFailed && (
        <Alert
          type='error'
          showIcon
          title={intl.formatMessage({ id: 'component.request.failed' })}
        />
      )}
      <ProTable<ReviewsTable, Partial<ListPagination> & { scope: string }>
        loading={tableLoading}
        dataSource={queryFailed ? [] : undefined}
        params={{ scope: requestScope }}
        columns={columns}
        rowKey='id'
        search={false}
        className='review-table-with-expand-icon'
        style={{ maxWidth: '100%' }}
        tableLayout='fixed'
        scroll={{ x: 'max-content' }}
        pagination={{
          pageSize: 50,
          showSizeChanger: true,
          showQuickJumper: true,
        }}
        expandable={{
          expandedRowKeys,
          onExpand: handleExpand,
          rowExpandable: isExpandableRootReview,
          expandedRowRender: (record) => {
            if (subTableLoading[record.id]) {
              return (
                <div style={{ textAlign: 'center', padding: 20 }}>
                  <Spin />
                </div>
              );
            }
            return (
              <div
                style={{
                  boxSizing: 'border-box',
                  minWidth: 0,
                  paddingInline: 'clamp(12px, 3vw, 48px)',
                }}
              >
                <Table
                  columns={subColumns}
                  dataSource={subTableData[record.id]}
                  pagination={false}
                  rowKey='reference_review_id'
                  rowSelection={
                    supportsBatchSelection
                      ? {
                          selectedRowKeys: (subTableData[record.id] ?? [])
                            .map((item) => item.reference_review_id)
                            .filter((id) => effectiveSelectedReferenceIdSet.has(id)),
                          onChange: (keys) =>
                            handleReferenceSelectionChange(subTableData[record.id] ?? [], keys),
                        }
                      : undefined
                  }
                  size='small'
                  tableLayout='fixed'
                  scroll={{ x: 'max-content' }}
                />
              </div>
            );
          },
        }}
        toolBarRender={() => {
          const qualityDiagnosticLabel = intl.formatMessage({
            id: 'pages.review.qualityDiagnostic.run',
            defaultMessage: 'Run quality diagnostic',
          });
          const qualityDiagnosticAction =
            userData?.role === 'review-admin' &&
            tableType !== 'completed' &&
            tableType !== 'admin-rejected' &&
            onOpenQualityDiagnostic ? (
              <Tooltip key='review-quality-diagnostic' title={qualityDiagnosticLabel}>
                <Button
                  type='text'
                  aria-label={qualityDiagnosticLabel}
                  icon={<ExperimentOutlined />}
                  onClick={onOpenQualityDiagnostic}
                />
              </Tooltip>
            ) : null;
          const filterControls = (
            <Space key='review-list-filters' wrap>
              <Select<ReviewDisplayMode>
                aria-label={intl.formatMessage({
                  id: 'pages.review.filters.displayMode.label',
                  defaultMessage: 'Display mode',
                })}
                value={displayMode}
                options={displayModeOptions}
                labelRender={({ label }) => <ReviewFilterLabel label={label} />}
                onChange={handleDisplayModeChange}
                style={{ width: REVIEW_DISPLAY_MODE_FILTER_WIDTH }}
              />
              <Select<ReviewSubmitDatasetTable | 'all'>
                aria-label={intl.formatMessage({
                  id: 'pages.review.filters.dataType.label',
                  defaultMessage: 'Data type',
                })}
                value={targetTable ?? 'all'}
                options={targetTableOptions}
                labelRender={({ label }) => <ReviewFilterLabel label={label} />}
                onChange={handleTargetTableChange}
                style={{ width: REVIEW_DATA_TYPE_FILTER_WIDTH }}
              />
            </Space>
          );
          if (selectedReviewIds.length > 0 && supportsBatchSelection) {
            return [
              filterControls,
              <Space key='batch-assignment-selection'>
                {selectionFailedRootIds.length > 0 && (
                  <span>
                    <FormattedMessage
                      id='pages.review.selection.loadError'
                      defaultMessage='Failed to load referenced reviews. Reselect the root review to retry.'
                    />
                  </span>
                )}
                {tableType === 'unassigned' && (
                  <SelectReviewer
                    tabType='unassigned'
                    actionRef={actionRef}
                    reviewIds={selectedReviewIds}
                    disabled={
                      selectionLoadingRootIds.length > 0 || selectionFailedRootIds.length > 0
                    }
                  />
                )}
                <BatchReviewActions
                  role={tableType === 'pending' ? 'reviewer' : 'admin'}
                  reviewIds={selectedReviewIds}
                  allowApprove={
                    tableType === 'in-progress' ||
                    tableType === 'assigned' ||
                    tableType === 'pending'
                  }
                  disabled={selectionLoadingRootIds.length > 0 || selectionFailedRootIds.length > 0}
                  onFinished={reloadAfterChildAction}
                />
              </Space>,
              qualityDiagnosticAction,
            ];
          }
          return [filterControls, qualityDiagnosticAction];
        }}
        headerTitle={
          <>
            {!actionFrom && (
              <>
                <FormattedMessage id='menu.review' defaultMessage='Review Management' /> /{' '}
                {getSubTitle()}
              </>
            )}
          </>
        }
        request={async (
          params: {
            pageSize?: number;
            current?: number;
            scope?: string;
          },
          sort,
        ) => {
          if (params.scope !== undefined && params.scope !== requestScopeRef.current) {
            return { data: [], success: false, total: 0 };
          }
          const requestEpoch = ++requestEpochRef.current;
          const isCurrentRequest = () => requestEpoch === requestEpochRef.current;
          try {
            if (!userData?.role) {
              return {
                data: [],
                success: true,
                total: 0,
              };
            }
            setTableLoading(true);
            setQueryFailed(false);
            const result = await getReviewsTableData(
              { current: params.current ?? 1, pageSize: params.pageSize ?? 50 },
              sort,
            );
            if (!isCurrentRequest()) return { data: [], success: false, total: 0 };
            if (result.success === false) {
              mainReviewRowsRef.current = {};
              setQueryFailed(true);
              return { data: [], success: false, total: 0 };
            }
            mainReviewRowsRef.current = Object.fromEntries(
              (result.data ?? []).map((record) => [record.id, record]),
            );
            return result;
          } catch (_error) {
            if (isCurrentRequest()) {
              mainReviewRowsRef.current = {};
              setQueryFailed(true);
            }
            return { data: [], success: false, total: 0 };
          } finally {
            if (isCurrentRequest()) setTableLoading(false);
          }
        }}
        actionRef={actionRef}
        tableAlertRender={({ intl: tableIntl, selectedRowKeys = [] }) => (
          <Space>
            <span>
              {tableIntl.getMessage('alert.selected', 'Selected')} {selectedRowKeys.length}{' '}
              {tableIntl.getMessage('alert.item', 'items')}
            </span>
            <span>
              <FormattedMessage
                id='pages.review.selection.summary'
                defaultMessage='Selected {rootCount} root reviews and {referenceCount} reference reviews'
                values={{
                  rootCount: selectedRootReviewIds.length,
                  referenceCount: effectiveSelectedReferenceIds.length,
                }}
              />
            </span>
          </Space>
        )}
        tableAlertOptionRender={tableAlertOptionRender}
        rowSelection={
          supportsBatchSelection
            ? {
                selectedRowKeys: selectedReviewIds,
                preserveSelectedRowKeys: true,
                onChange: handleMainSelectionChange,
                getCheckboxProps: (record: ReviewsTable) => ({
                  disabled: record.rootMatchesStatus === false,
                }),
              }
            : undefined
        }
      />
      <ExpandIconStyle />
    </>
  );
};

export default AssignmentReview;
