import AlignedNumber from '@/components/AlignedNumber';
import QuantitativeReferenceIcon from '@/components/QuantitativeReferenceIcon';
import { getFolwypeOfDataSetOptions } from '@/pages/LifeCycleModels/Components/toolbar/Exchange/ioPortSelect';
import { getLangText } from '@/services/general/util';
import { ProcessExchangeTable } from '@/services/processes/data';
import { ProColumns } from '@ant-design/pro-components';
import { FormattedMessage } from '@umijs/max';
import { Tooltip } from 'antd';

export const PROCESS_EXCHANGE_TABLE_SCROLL = { x: 'max-content' };

export function getExchangeColumns(lang: string): ProColumns<ProcessExchangeTable>[] {
  return [
    {
      title: <FormattedMessage id='pages.table.title.index' defaultMessage='Index' />,
      dataIndex: 'index',
      valueType: 'index',
      width: 64,
      search: false,
    },
    // {
    //   title: <FormattedMessage id="processExchange.dataSetInternalID" defaultMessage="DataSet Internal ID" />,
    //   dataIndex: 'dataSetInternalID',
    //   search: false,
    // },
    // {
    //   title: (
    //     <FormattedMessage
    //       id="pages.process.exchange.exchangeDirection"
    //       defaultMessage="Direction"
    //     />
    //   ),
    //   dataIndex: 'exchangeDirection',
    //   sorter: false,
    //   search: false,
    // },
    {
      title: <FormattedMessage id='processExchange.referenceToFlowDataSet' defaultMessage='Flow' />,
      dataIndex: 'referenceToFlowDataSet',
      sorter: false,
      search: false,
      width: 220,
      render: (_, row) => [
        <Tooltip key={0} placement='topLeft' title={row.generalComment}>
          {row.referenceToFlowDataSet}
        </Tooltip>,
      ],
    },
    {
      title: <FormattedMessage id='processExchange.typeOfDataSet' defaultMessage='Flow type' />,
      dataIndex: 'typeOfDataSet',
      sorter: false,
      search: false,
      width: 110,
      render: (_, row) => {
        return getFolwypeOfDataSetOptions(row.typeOfDataSet ?? '');
      },
    },
    {
      title: (
        <FormattedMessage id='pages.table.title.classification' defaultMessage='Classification' />
      ),
      dataIndex: 'classification',
      search: false,
      width: 240,
      render: (_, row) => {
        return row?.classification && row?.classification !== 'undefined'
          ? row.classification
          : '-';
      },
    },
    {
      title: <FormattedMessage id='pages.table.title.version' defaultMessage='Version' />,
      dataIndex: 'referenceToFlowDataSetVersion',
      sorter: false,
      search: false,
      width: 110,
    },
    {
      title: (
        <FormattedMessage id='pages.process.exchange.meanAmount' defaultMessage='Mean amount' />
      ),
      dataIndex: 'meanAmount',
      align: 'right',
      sorter: false,
      search: false,
      width: 140,
      render: (_, record) => {
        return <AlignedNumber value={record.meanAmount} />;
      },
    },
    {
      title: (
        <FormattedMessage
          id='pages.process.exchange.resultingAmount'
          defaultMessage='Resulting amount'
        />
      ),
      dataIndex: 'resultingAmount',
      align: 'right',
      sorter: false,
      search: false,
      width: 140,
      render: (_, record) => {
        return <AlignedNumber value={record.resultingAmount} />;
      },
    },
    {
      title: (
        <FormattedMessage
          id='pages.flowproperty.referenceToReferenceUnitGroup'
          defaultMessage='Reference unit'
        />
      ),
      dataIndex: 'refUnitGroup',
      sorter: false,
      search: false,
      width: 150,
      render: (_, row) => {
        return [
          // <ReferenceUnit
          //   key={0}
          //   id={row.referenceToFlowDataSetId}
          //   version={row.referenceToFlowDataSetVersion}
          //   idType={'flow'}
          //   lang={lang}
          // />,
          <span key={1}>
            {getLangText(row.refUnitRes?.name, lang)} (
            <Tooltip
              placement='topLeft'
              title={getLangText(row.refUnitRes?.refUnitGeneralComment, lang)}
            >
              {row.refUnitRes?.refUnitName}
            </Tooltip>
            )
          </span>,
        ];
      },
    },

    {
      title: (
        <FormattedMessage
          id='pages.process.exchange.dataDerivationTypeStatus'
          defaultMessage='Data derivation type / status'
        />
      ),
      dataIndex: 'dataDerivationTypeStatus',
      sorter: false,
      search: false,
      width: 190,
    },
    {
      title: (
        <FormattedMessage
          id='pages.process.exchange.quantitativeReference'
          defaultMessage='Quantitative reference'
        />
      ),
      dataIndex: 'quantitativeReference',
      sorter: false,
      search: false,
      width: 150,
      render: (_, row) => {
        return <QuantitativeReferenceIcon value={row.quantitativeReference} />;
      },
    },
    {
      title: (
        <FormattedMessage id='pages.process.exchange.reviewType' defaultMessage='Review type' />
      ),
      dataIndex: 'reviewType',
      sorter: false,
      search: false,
      width: 100,
      render: (_, row) => {
        return (
          <>
            {row?.stateCode === 100 || row?.stateCode === 200 ? (
              <FormattedMessage
                id='pages.process.exchange.reviewType.reviewed'
                defaultMessage='Reviewed'
              />
            ) : typeof row?.stateCode === 'number' ? (
              <FormattedMessage
                id='pages.process.exchange.reviewType.unreviewed'
                defaultMessage='Unreviewed'
              />
            ) : (
              '-'
            )}
          </>
        );
      },
    },
  ];
}
