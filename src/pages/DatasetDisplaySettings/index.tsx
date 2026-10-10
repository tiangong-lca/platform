import { useEffect, useRef, useState, type Key } from 'react';
import { App, Button, Card, Input, Result, Select, Row, Col, Tag, theme } from 'antd';
import {
  PageContainer,
  ProTable,
  type ActionType,
  type ProColumns,
} from '@ant-design/pro-components';
import { FormattedMessage, useIntl, useModel } from 'umi';
import DatasetKindFilter, { datasetKindMessage } from '@/components/DatasetKindFilter';
import {
  dataListIndexColumn,
  responsiveDataListTableProps,
  responsiveSearchCardClassName,
  responsiveSearchRowProps,
  responsiveSearchPrimaryColProps,
} from '@/components/ResponsiveDataList';
import { getLang } from '@/services/general/util';
import {
  datasetDisplayKey,
  listDatasetDisplay,
  setDatasetDisplay,
  type DatasetDisplayRow,
  type DatasetKindFilter as Kind,
  type VisibilityFilter,
} from '@/services/datasetDisplay/api';

export default function DatasetDisplaySettings() {
  const intl = useIntl();
  const { token } = theme.useToken();
  const lang = getLang(intl.locale);
  const { message, modal } = App.useApp();
  const { initialState } = useModel('@@initialState');
  const canConfigure = initialState?.currentUser?.access === 'data_product_manager';
  const actionRef = useRef<ActionType | undefined>(undefined);
  const epoch = useRef(0);
  const mounted = useRef(true);
  const [datasetKind, setDatasetKind] = useState<Kind>('all');
  const [visibility, setVisibility] = useState<VisibilityFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<Key[]>([]);
  const [selectedRows, setSelectedRows] = useState<DatasetDisplayRow[]>([]);
  const [pending, setPending] = useState(false);
  const clearSelection = () => {
    setSelectedKeys([]);
    setSelectedRows([]);
  };
  useEffect(() => {
    mounted.current = true;
    epoch.current += 1;
    clearSelection();
    return () => {
      mounted.current = false;
      epoch.current += 1;
    };
  }, [intl.locale, canConfigure]);
  const change = async (isVisible: boolean) => {
    if (!canConfigure || pending || !selectedRows.length) return;
    setPending(true);
    try {
      const result = await setDatasetDisplay(
        selectedRows.map(({ datasetKind: kind, id, version }) => ({
          datasetKind: kind,
          id,
          version,
        })),
        isVisible,
      );
      if (mounted.current) {
        message.success(
          intl.formatMessage(
            {
              id: 'pages.datasetDisplay.success',
              defaultMessage: 'Updated {count} items; {unchanged} were already configured.',
            },
            { count: result.changedCount, unchanged: result.unchangedCount },
          ),
        );
        clearSelection();
        actionRef.current?.reload();
      }
    } catch {
      if (mounted.current)
        message.error(
          intl.formatMessage({
            id: 'pages.datasetDisplay.updateError',
            defaultMessage: 'Failed to update display settings. Please retry.',
          }),
        );
    } finally {
      if (mounted.current) setPending(false);
    }
  };
  if (!canConfigure) return <Result status='403' title='403' />;
  const columns: ProColumns<DatasetDisplayRow>[] = [
    {
      ...dataListIndexColumn<DatasetDisplayRow>(),
      title: <FormattedMessage id='pages.table.title.index' defaultMessage='Index' />,
      valueType: 'index',
      search: false,
    },
    {
      dataIndex: 'name',
      title: <FormattedMessage id='pages.table.title.name' defaultMessage='Name' />,
      ellipsis: true,
      search: false,
    },
    {
      dataIndex: 'version',
      title: <FormattedMessage id='pages.table.title.version' defaultMessage='Version' />,
      width: 120,
      search: false,
    },
    {
      dataIndex: 'datasetKind',
      title: (
        <FormattedMessage id='pages.datasetUuidMention.entityKind' defaultMessage='Data type' />
      ),
      width: 150,
      search: false,
      render: (_, row) => intl.formatMessage(datasetKindMessage(row.datasetKind)),
    },
    {
      dataIndex: 'isVisible',
      title: <FormattedMessage id='pages.datasetDisplay.visibility' defaultMessage='Visibility' />,
      width: 120,
      search: false,
      render: (_, row) => (
        <Tag color={row.isVisible ? 'purple' : undefined}>
          <FormattedMessage
            id={row.isVisible ? 'pages.datasetDisplay.visible' : 'pages.datasetDisplay.hidden'}
            defaultMessage={row.isVisible ? 'Displayed' : 'Not displayed'}
          />
        </Tag>
      ),
    },
  ];
  return (
    <PageContainer header={{ breadcrumb: {}, title: false }}>
      <Card className={responsiveSearchCardClassName} style={{ marginBottom: 0 }}>
        <Row
          {...responsiveSearchRowProps}
          // Match the catalog search row height without adding its optional controls.
          style={{ minHeight: token.fontSize * token.lineHeight * 2 }}
        >
          <Col {...responsiveSearchPrimaryColProps} style={{ marginRight: 0, marginBottom: 0 }}>
            <Input.Search
              size='large'
              aria-label={intl.formatMessage({
                id: 'pages.datasetDisplay.search',
                defaultMessage: 'Search by name or UUID',
              })}
              placeholder={intl.formatMessage({
                id: 'pages.datasetDisplay.search',
                defaultMessage: 'Search by name or UUID',
              })}
              allowClear
              disabled={pending}
              maxLength={128}
              enterButton
              onSearch={(value) => {
                epoch.current += 1;
                clearSelection();
                setQuery(value.trim());
                actionRef.current?.reloadAndRest?.();
              }}
            />
          </Col>
        </Row>
      </Card>
      <ProTable<DatasetDisplayRow>
        {...responsiveDataListTableProps}
        actionRef={actionRef}
        columns={columns}
        headerTitle={
          <FormattedMessage id='pages.datasetDisplay.settings' defaultMessage='Display settings' />
        }
        options={{ fullScreen: true }}
        pagination={{ pageSize: 10, showSizeChanger: false }}
        params={{ datasetKind, visibility, query, locale: intl.locale }}
        rowKey={datasetDisplayKey}
        search={false}
        request={async (params) => {
          const token = ++epoch.current;
          const result = await listDatasetDisplay(
            {
              current: params.current,
              pageSize: params.pageSize,
              datasetKind,
              visibility,
              query,
            },
            lang,
            true,
          ).catch(() => ({ data: [], success: false, total: 0 }));
          if (!mounted.current || epoch.current !== token)
            return { data: [], success: false, total: 0 };
          if (result.success) return result;
          clearSelection();
          modal.error({
            title: intl.formatMessage({
              id: 'pages.datasetDisplay.loadError',
              defaultMessage: 'Failed to load datasets. Please refresh.',
            }),
          });
          // ProTable retains prior rows when success is false. Report the error above,
          // then let the table consume the empty result and reset its total.
          return { data: [], success: true, total: 0 };
        }}
        rowSelection={{
          selectedRowKeys: selectedKeys,
          preserveSelectedRowKeys: false,
          onChange: (keys, rows) => {
            setSelectedKeys(keys);
            setSelectedRows(rows);
          },
          getCheckboxProps: () => ({ disabled: pending }),
        }}
        onChange={() => clearSelection()}
        toolBarRender={() => [
          <DatasetKindFilter
            key='kind'
            value={datasetKind}
            disabled={pending}
            onChange={(kind) => {
              epoch.current += 1;
              clearSelection();
              setDatasetKind(kind);
            }}
          />,
          <Select<VisibilityFilter>
            key='visibility'
            aria-label={intl.formatMessage({
              id: 'pages.datasetDisplay.visibility',
              defaultMessage: 'Visibility',
            })}
            style={{ minWidth: 150 }}
            value={visibility}
            disabled={pending}
            options={[
              {
                value: 'all',
                label: intl.formatMessage({
                  id: 'pages.datasetDisplay.allVisibility',
                  defaultMessage: 'All',
                }),
              },
              {
                value: 'visible',
                label: intl.formatMessage({
                  id: 'pages.datasetDisplay.visible',
                  defaultMessage: 'Displayed',
                }),
              },
              {
                value: 'hidden',
                label: intl.formatMessage({
                  id: 'pages.datasetDisplay.hidden',
                  defaultMessage: 'Not displayed',
                }),
              },
            ]}
            onChange={(value) => {
              epoch.current += 1;
              clearSelection();
              setVisibility(value);
            }}
          />,
          <Button
            key='show'
            type='primary'
            loading={pending}
            disabled={!selectedRows.length || pending}
            onClick={() => void change(true)}
          >
            <FormattedMessage
              id='pages.datasetDisplay.showSelected'
              defaultMessage='Show selected ({count})'
              values={{ count: selectedRows.length }}
            />
          </Button>,
          <Button
            key='hide'
            disabled={!selectedRows.length || pending}
            onClick={() => void change(false)}
          >
            <FormattedMessage
              id='pages.datasetDisplay.hideSelected'
              defaultMessage='Hide selected ({count})'
              values={{ count: selectedRows.length }}
            />
          </Button>,
        ]}
      />
    </PageContainer>
  );
}
