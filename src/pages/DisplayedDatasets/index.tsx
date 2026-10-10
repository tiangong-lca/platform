import { getLang } from '@/services/general/util';
import AlignedNumber from '@/components/AlignedNumber';
import type {
  PublishedLciaExactValue,
  PublishedLciaProcessSelection,
} from '@/services/dataProducts';
import {
  getPublishedClimateResults,
  publishedProcessKey,
} from '@/services/dataProducts/publishedClimate';
import {
  listDatasetDisplay,
  datasetDisplayKey,
  type DatasetDisplayRow,
  type DatasetKindFilter as Kind,
} from '@/services/datasetDisplay/api';
import DatasetKindFilter, { datasetKindMessage } from '@/components/DatasetKindFilter';
import { dataListIndexColumn, responsiveDataListTableProps } from '@/components/ResponsiveDataList';
import { PageContainer, ProTable, type ProColumns } from '@ant-design/pro-components';
import { Alert, Spin, Tooltip } from 'antd';
import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import { FormattedMessage, useIntl } from 'umi';

const DisplayedDatasets: FC = () => {
  const intl = useIntl();
  const lang = getLang(intl.locale);
  const epoch = useRef(0);
  const [datasetKind, setDatasetKind] = useState<Kind>('all');
  const [listFailed, setListFailed] = useState(false);
  const mounted = useRef(true);
  const [resultState, setResultState] = useState<{
    status: 'idle' | 'loading' | 'ready' | 'error';
    values: Map<string, PublishedLciaExactValue>;
  }>({ status: 'idle', values: new Map() });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      epoch.current += 1;
    };
  }, [intl.locale]);

  const loadResults = useCallback(
    async (processes: PublishedLciaProcessSelection[], token: number) => {
      setResultState({ status: processes.length ? 'loading' : 'idle', values: new Map() });
      if (!processes.length) return;
      try {
        const values = await getPublishedClimateResults(processes);
        if (mounted.current && epoch.current === token) setResultState({ status: 'ready', values });
      } catch {
        if (mounted.current && epoch.current === token)
          setResultState({ status: 'error', values: new Map() });
      }
    },
    [],
  );

  const requestProcesses = useCallback(
    async (params: { current?: number; pageSize?: number }) => {
      const token = ++epoch.current;
      setResultState({ status: 'loading', values: new Map() });
      const result = await listDatasetDisplay({ ...params, datasetKind }, lang);
      if (mounted.current && epoch.current === token) {
        setListFailed(!result.success);
        const processes = result.success
          ? result.data
              .filter((row) => row.datasetKind === 'process')
              .map(({ id, version }) => ({ id, version }))
          : [];
        void loadResults(processes, token);
      }
      return result;
    },
    [lang, datasetKind, loadResults],
  );
  const columns: ProColumns<DatasetDisplayRow>[] = [
    {
      align: 'center',
      search: false,
      ...dataListIndexColumn<DatasetDisplayRow>(),
      title: <FormattedMessage id='pages.table.title.index' defaultMessage='Index' />,
      valueType: 'index',
    },
    {
      dataIndex: 'name',
      ellipsis: true,
      search: false,
      title: <FormattedMessage id='pages.table.title.name' defaultMessage='Name' />,
    },
    {
      dataIndex: 'version',
      search: false,
      width: 120,
      title: <FormattedMessage id='pages.table.title.version' defaultMessage='Version' />,
    },
    {
      dataIndex: 'datasetKind',
      search: false,
      width: 150,
      title: (
        <FormattedMessage id='pages.datasetUuidMention.entityKind' defaultMessage='Data type' />
      ),
      render: (_, record) => intl.formatMessage(datasetKindMessage(record.datasetKind)),
    },
    {
      dataIndex: 'calculationResult',
      search: false,
      title: (
        <FormattedMessage
          id='pages.process.published.table.calculationResult'
          defaultMessage='Calculation result ({unit})'
          values={{ unit: 'kg CO2 Equivalents' }}
        />
      ),
      width: 260,
      render: (_, record) => {
        if (record.datasetKind !== 'process') return '—';
        if (resultState.status === 'loading') return <Spin size='small' />;
        if (resultState.status === 'error')
          return (
            <FormattedMessage
              id='pages.process.published.climate.error'
              defaultMessage='Failed to load'
            />
          );
        const result = resultState.values.get(publishedProcessKey(record));
        if (!result || result.status === 'missing') {
          return (
            <Tooltip
              title={
                <FormattedMessage
                  id='pages.process.published.climate.missing'
                  defaultMessage='No result for this version in the current publication'
                />
              }
            >
              <span>—</span>
            </Tooltip>
          );
        }
        return <AlignedNumber value={result.value} />;
      },
    },
  ];

  return (
    <PageContainer header={{ breadcrumb: {}, title: false }}>
      {listFailed && (
        <Alert
          type='error'
          showIcon
          title={
            <FormattedMessage
              id='pages.datasetDisplay.loadError'
              defaultMessage='Failed to load datasets. Please refresh.'
            />
          }
        />
      )}
      <ProTable<DatasetDisplayRow>
        {...responsiveDataListTableProps}
        columns={columns}
        headerTitle={
          <FormattedMessage id='pages.datasetDisplay.title' defaultMessage='Displayed datasets' />
        }
        options={{ fullScreen: true }}
        pagination={{ pageSize: 10, showSizeChanger: false }}
        params={{ locale: intl.locale, datasetKind }}
        toolBarRender={() => [
          <DatasetKindFilter
            key='dataset-kind'
            value={datasetKind}
            onChange={(kind) => {
              epoch.current += 1;
              setDatasetKind(kind);
              setResultState({ status: 'idle', values: new Map() });
            }}
          />,
        ]}
        request={requestProcesses}
        rowKey={datasetDisplayKey}
        search={false}
      />
    </PageContainer>
  );
};

export default DisplayedDatasets;
