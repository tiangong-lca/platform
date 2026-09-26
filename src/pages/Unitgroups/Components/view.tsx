import { toSuperscript } from '@/components/AlignedNumber';
import LangTextItemDescription from '@/components/LangTextItem/description';
import LevelTextItemDescription from '@/components/LevelTextItem/description';
import QuantitativeReferenceIcon from '@/components/QuantitativeReferenceIcon';
import ContactSelectDescription from '@/pages/Contacts/Components/select/description';
import SourceSelectDescription from '@/pages/Sources/Components/select/description';
import UnitGroupDescription from '@/pages/Unitgroups/Components/select/description';
import { getClassificationValues } from '@/pages/Utils';
import { ListPagination } from '@/services/general/data';
import { jsonToList } from '@/services/general/util';
import { getUnitGroupDetail } from '@/services/unitgroups/api';
import {
  UnitGroupDetailResponse,
  UnitGroupFormState,
  UnitItem,
  UnitTable,
} from '@/services/unitgroups/data';
import { genUnitGroupFromData, genUnitTableData } from '@/services/unitgroups/util';
import { CloseOutlined, ProfileOutlined } from '@ant-design/icons';
import { ActionType, ProColumns, ProTable } from '@ant-design/pro-components';
import { Button, Card, Descriptions, Divider, Drawer, Space, Spin, Tooltip } from 'antd';
import type { FC } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { FormattedMessage } from 'umi';
import UnitView from './Unit/view';
import { complianceOptions } from './optiondata';

type Props = {
  id: string;
  version: string;
  lang: string;
  buttonType: string;
  tooltipTitle?: string;
  actionRef?: React.RefObject<ActionType | undefined>;
  autoOpen?: boolean;
  onDrawerClose?: () => void;
};

const getComplianceLabel = (value: string) => {
  const option = complianceOptions.find((opt) => opt.value === value);
  return option ? option.label : '-';
};

const ContactView: FC<Props> = ({
  id,
  version,
  lang,
  buttonType,
  tooltipTitle,
  autoOpen = false,
  onDrawerClose,
}) => {
  const [drawerVisible, setDrawerVisible] = useState(false);
  // const [footerButtons, setFooterButtons] = useState<JSX.Element>();
  const [spinning, setSpinning] = useState(false);
  const [initData, setInitData] = useState<UnitGroupFormState>({} as UnitGroupFormState);
  const [unitDataSource, setUnitDataSource] = useState<UnitItem[]>([]);

  const [activeTabKey, setActiveTabKey] = useState<string>('unitGroupInformation');
  const onTabChange = (key: string) => {
    setActiveTabKey(key);
  };

  const unitColumns: ProColumns<UnitTable>[] = [
    {
      title: (
        <FormattedMessage id='pages.table.title.index' defaultMessage='Index'></FormattedMessage>
      ),
      valueType: 'index',
      search: false,
    },
    // {
    //   title: <FormattedMessage id="pages.unitgroup.unit.dataSetInternalID" defaultMessage="DataSet Internal ID"></FormattedMessage>,
    //   dataIndex: 'dataSetInternalID',
    //   search: false,
    // },
    {
      title: (
        <FormattedMessage id='pages.table.title.name' defaultMessage='Name'></FormattedMessage>
      ),
      dataIndex: 'name',
      search: false,
      render: (_, row) => {
        return [<span key={0}>{toSuperscript(row.name)}</span>];
      },
    },
    {
      title: (
        <FormattedMessage
          id='pages.unitgroup.unit.generalComment'
          defaultMessage='Comment'
        ></FormattedMessage>
      ),
      dataIndex: 'generalComment',
      search: false,
    },
    {
      title: (
        <FormattedMessage
          id='pages.unitgroup.unit.meanValue'
          defaultMessage='Mean value (of unit)'
        ></FormattedMessage>
      ),
      dataIndex: 'meanValue',
      search: false,
    },
    {
      title: (
        <FormattedMessage
          id='pages.unitgroup.unit.quantitativeReference'
          defaultMessage='Quantitative reference'
        />
      ),
      dataIndex: 'quantitativeReference',
      sorter: false,
      search: false,
      render: (_, row) => {
        return <QuantitativeReferenceIcon value={row.quantitativeReference} />;
      },
    },
    {
      title: <FormattedMessage id='pages.table.title.option' defaultMessage='Actions' />,
      dataIndex: 'option',
      search: false,
      render: (_, row) => {
        return (
          <UnitView key={0} id={row.dataSetInternalID} data={unitDataSource} buttonType={'icon'} />
        );

        // if (dataSource === 'my') {
        //   return [
        // <Space size={'small'} key={0}>
        //   <ProcessExchangeView
        //     id={row.dataSetInternalID}
        //     data={exchangeDataSource}
        //     dataSource={'my'}
        //     buttonType={'icon'}
        //     lang={lang}
        //     actionRef={actionRefExchangeTable}
        //   />
        //   <ProcessEdit
        //     id={row.id}
        //     lang={lang}
        //     buttonType={'icon'}
        //     actionRef={actionRef}
        //     setViewDrawerVisible={() => { }}
        //   />
        //   <ProcessDelete
        //     id={row.id}
        //     buttonType={'icon'}
        //     actionRef={actionRef}
        //     setViewDrawerVisible={() => { }}
        //   />
        // </Space>,
        //   ];
        // }
        // return [
        //   <Space size={'small'} key={0}>
        //     <ProcessExchangeView
        //       id={row.dataSetInternalID}
        //       data={exchangeDataSource}
        //       lang={lang}
        //       dataSource={'tg'}
        //       buttonType={'icon'}
        //       actionRef={actionRefExchangeTable}
        //     />
        //   </Space>,
        // ];
      },
    },
  ];

  const tabList = [
    {
      key: 'unitGroupInformation',
      tab: (
        <FormattedMessage
          id='pages.unitgroup.unitGroupInformation'
          defaultMessage='Unit group information'
        />
      ),
    },
    {
      key: 'modellingAndValidation',
      tab: (
        <FormattedMessage
          id='pages.unitgroup.modellingAndValidation'
          defaultMessage='Modelling and validation'
        />
      ),
    },
    {
      key: 'administrativeInformation',
      tab: (
        <FormattedMessage
          id='pages.unitgroup.administrativeInformation'
          defaultMessage='Administrative information'
        />
      ),
    },
    { key: 'units', tab: <FormattedMessage id='pages.unitgroup.units' defaultMessage='Units' /> },
  ];

  const classificationValues = getClassificationValues(
    initData.unitGroupInformation?.dataSetInformation?.classificationInformation?.[
      'common:classification'
    ]?.['common:class'],
  );
  const complianceRecord = initData.modellingAndValidation?.complianceDeclarations?.compliance as
    Record<string, unknown> | undefined;

  const contentList: Record<string, React.ReactNode> = {
    unitGroupInformation: (
      <>
        <Descriptions
          bordered
          size={'small'}
          column={1}
          items={[
            {
              key: 0,
              label: <FormattedMessage id='pages.unitgroup.id' defaultMessage='ID' />,
              styles: {
                label: {
                  width: '100px',
                },
              },
              children: initData.unitGroupInformation?.dataSetInformation?.['common:UUID'] ?? '-',
            },
          ]}
        />
        <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
          <FormattedMessage id='pages.unitgroup.name' defaultMessage='Name of unit group' />
        </Divider>
        <LangTextItemDescription
          data={initData.unitGroupInformation?.dataSetInformation?.['common:name'] ?? {}}
        />
        <br />
        <LevelTextItemDescription
          data={classificationValues}
          lang={lang}
          categoryType={'UnitGroup'}
        />
        <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
          <FormattedMessage
            id='pages.unitgroup.unitGroupInformation.generalComment'
            defaultMessage='General comment'
          />
        </Divider>
        <LangTextItemDescription
          data={initData.unitGroupInformation?.dataSetInformation?.['common:generalComment']}
        />
      </>
    ),
    modellingAndValidation: (
      <>
        <SourceSelectDescription
          title={
            <FormattedMessage
              id='pages.unitgroup.referenceToComplianceSystem'
              defaultMessage='Compliance system name'
            />
          }
          data={
            (complianceRecord?.['common:referenceToComplianceSystem'] as
              Record<string, unknown> | undefined) ?? {}
          }
          lang={lang}
        />
        <br />
        <Descriptions
          bordered
          size={'small'}
          column={1}
          items={[
            {
              key: 0,
              label: (
                <FormattedMessage
                  id='pages.unitgroup.approvalOfOverallCompliance'
                  defaultMessage='Approval of overall compliance'
                />
              ),
              styles: {
                label: {
                  width: '240px',
                },
              },
              children: getComplianceLabel(
                (complianceRecord?.['common:approvalOfOverallCompliance'] as string | undefined) ??
                  '-',
              ),
            },
          ]}
        />
      </>
    ),
    administrativeInformation: (
      <>
        <Descriptions
          bordered
          size={'small'}
          column={1}
          items={[
            {
              key: 0,
              label: (
                <FormattedMessage
                  id='pages.unitgroup.timeStamp'
                  defaultMessage='Time stamp (last saved)'
                />
              ),
              styles: {
                label: {
                  width: '200px',
                },
              },
              children:
                initData.administrativeInformation?.dataEntryBy?.['common:timeStamp'] ?? '-',
            },
          ]}
        />
        <br />
        <SourceSelectDescription
          title={
            <FormattedMessage
              id='pages.unitgroup.referenceToDataSetFormat'
              defaultMessage='Data set format(s)'
            />
          }
          data={
            initData.administrativeInformation?.dataEntryBy?.['common:referenceToDataSetFormat'] ??
            {}
          }
          lang={lang}
        />
        <br />
        <Descriptions
          bordered
          size={'small'}
          column={1}
          items={[
            {
              key: 0,
              label: (
                <FormattedMessage
                  id='pages.unitgroup.dataSetVersion'
                  defaultMessage='Data set version'
                />
              ),
              styles: {
                label: {
                  width: '140px',
                },
              },
              children: (
                <Space>
                  {initData.administrativeInformation?.publicationAndOwnership?.[
                    'common:dataSetVersion'
                  ] ?? '-'}
                </Space>
              ),
            },
          ]}
        />
        <br />
        <ContactSelectDescription
          data={
            initData.administrativeInformation?.publicationAndOwnership?.[
              'common:referenceToOwnershipOfDataSet'
            ]
          }
          lang={lang}
          title={
            <FormattedMessage
              id='pages.unitgroup.referenceToOwnershipOfDataSet'
              defaultMessage='Owner of data set'
            />
          }
        ></ContactSelectDescription>
        <br />
        <UnitGroupDescription
          lang={lang}
          title={
            <FormattedMessage
              id='pages.unitgroup.referenceToPrecedingDataSetVersion'
              defaultMessage='Preceding data set version'
            />
          }
          data={
            initData.administrativeInformation?.publicationAndOwnership?.[
              'common:referenceToPrecedingDataSetVersion'
            ] ?? {}
          }
        />
        <br />
        <Descriptions
          bordered
          size={'small'}
          column={1}
          items={[
            {
              key: 0,
              label: (
                <FormattedMessage
                  id='pages.unitgroup.permanentDataSetURI'
                  defaultMessage='Permanent data set URI'
                />
              ),
              styles: {
                label: {
                  width: '220px',
                },
              },
              children:
                initData.administrativeInformation?.publicationAndOwnership?.[
                  'common:permanentDataSetURI'
                ] ?? '-',
            },
          ]}
        />
      </>
    ),
    units: (
      <>
        <ProTable<UnitTable, ListPagination>
          search={false}
          pagination={{
            showSizeChanger: false,
            pageSize: 10000,
          }}
          toolBarRender={() => {
            return [];
          }}
          dataSource={genUnitTableData(unitDataSource, lang)}
          columns={unitColumns}
        />
      </>
    ),
  };

  const onView = useCallback(() => {
    console.log('onView', id, version);
    setDrawerVisible(true);
    setSpinning(true);
    getUnitGroupDetail(id, version).then(async (result: UnitGroupDetailResponse) => {
      const parsedData = genUnitGroupFromData(result.data?.json?.unitGroupDataSet ?? {});
      setInitData({ ...parsedData });
      const parsedUnits = parsedData?.units?.unit;
      setUnitDataSource(jsonToList(parsedUnits) as UnitItem[]);
      // if (dataSource === 'my') {
      //   setFooterButtons(
      //     <>
      //       {/* <ContactDelete
      //         id={id}
      //         buttonType={'text'}
      //         actionRef={actionRef}
      //         setViewDrawerVisible={setDrawerVisible}
      //       />
      //       <ContactEdit
      //         id={id}
      //         buttonType={'text'}
      //         actionRef={actionRef}
      //         setViewDrawerVisible={setDrawerVisible}
      //       /> */}
      //     </>,
      //   );
      // } else {
      //   setFooterButtons(<></>);
      // }
      setSpinning(false);
    });
  }, [id, version]);

  useEffect(() => {
    if (autoOpen && id && version) {
      onView();
    }
  }, [autoOpen, id, onView, version]);

  const handleClose = () => {
    setDrawerVisible(false);
    onDrawerClose?.();
  };

  return (
    <>
      {!autoOpen &&
        (buttonType === 'icon' ? (
          <Tooltip
            title={
              tooltipTitle ?? (
                <FormattedMessage id='pages.button.view' defaultMessage='View'></FormattedMessage>
              )
            }
          >
            <Button shape='circle' icon={<ProfileOutlined />} size='small' onClick={onView} />
          </Tooltip>
        ) : (
          <Button onClick={onView}>
            <FormattedMessage id='pages.button.view' defaultMessage='View' />
          </Button>
        ))}

      <Drawer
        getContainer={() => document.body}
        title={
          <FormattedMessage
            id='pages.unitgroup.drawer.title.view'
            defaultMessage='View Unit group'
          ></FormattedMessage>
        }
        size='90%'
        closable={false}
        extra={
          <Button icon={<CloseOutlined />} style={{ border: 0 }} onClick={handleClose}></Button>
        }
        // footer={
        //   <Space size={'middle'} className={styles.footer_right}>
        //     {footerButtons}
        //   </Space>
        // }
        mask={{ closable: true }}
        open={drawerVisible}
        onClose={handleClose}
      >
        <Spin spinning={spinning}>
          <Card
            style={{ width: '100%' }}
            tabList={tabList}
            activeTabKey={activeTabKey}
            onTabChange={onTabChange}
          >
            {contentList[activeTabKey]}
          </Card>
        </Spin>
      </Drawer>
    </>
  );
};

export default ContactView;
