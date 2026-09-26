import LangTextItemDescription from '@/components/LangTextItem/description';
import LevelTextItemDescription from '@/components/LevelTextItem/description';
import LocationTextItemDescription from '@/components/LocationTextItem/description';
import ContactSelectDescription from '@/pages/Contacts/Components/select/description';
import SourceSelectDescription from '@/pages/Sources/Components/select/description';
// import ReferenceUnit from '@/pages/Unitgroups/Components/Unit/reference';
import QuantitativeReferenceIcon from '@/components/QuantitativeReferenceIcon';
import { getFlowDetail } from '@/services/flows/api';
import {
  FlowDataSetObjectKeys,
  FlowDetailResponse,
  FlowPropertyData,
  FlowpropertyTabTable,
  FormFlowWithId,
} from '@/services/flows/data';
import { genFlowFromData, genFlowPropertyTabTableData } from '@/services/flows/util';
import { ListPagination, ReferenceItem } from '@/services/general/data';
import { getLangText, getUnitData } from '@/services/general/util';
import { CloseOutlined, ProfileOutlined } from '@ant-design/icons';
import type { ActionType } from '@ant-design/pro-components';
import { ProColumns, ProTable } from '@ant-design/pro-components';
import { Button, Card, Descriptions, Divider, Drawer, Space, Spin, Tooltip } from 'antd';
import type { FC } from 'react';
import { useEffect, useRef, useState } from 'react';
import { FormattedMessage } from 'umi';
import { complianceOptions, flowTypeOptions } from './optiondata';
import PropertyView from './Property/view';
import FlowsSelectDescription from './select/description';
type Props = {
  id: string;
  version: string;
  lang: string;
  buttonType: string;
  tooltipTitle?: string;
  actionRef?: React.RefObject<ActionType | undefined>;
};

const getComplianceLabel = (value: string) => {
  const option = complianceOptions.find((opt) => opt.value === value);
  return option ? option.label : '-';
};

const FlowsView: FC<Props> = ({ id, version, buttonType, lang, tooltipTitle }) => {
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [activeTabKey, setActiveTabKey] = useState<FlowDataSetObjectKeys>('flowInformation');
  const [spinning, setSpinning] = useState(false);
  const [initData, setInitData] = useState<FormFlowWithId>();
  const [propertyDataSource, setPropertyDataSource] = useState<FlowPropertyData[]>([]);
  const [dataSource, setDataSource] = useState<FlowpropertyTabTable[]>([]);
  const propertyResolutionEpochRef = useRef(0);

  const tabList = [
    {
      key: 'flowInformation',
      tab: (
        <FormattedMessage id='pages.flow.view.flowInformation' defaultMessage='Flow information' />
      ),
    },
    {
      key: 'modellingAndValidation',
      tab: (
        <FormattedMessage
          id='pages.flow.view.modellingAndValidation'
          defaultMessage='Modelling and validation'
        />
      ),
    },
    {
      key: 'administrativeInformation',
      tab: (
        <FormattedMessage
          id='pages.flow.view.administrativeInformation'
          defaultMessage='Administrative information'
        />
      ),
    },
    {
      key: 'flowProperties',
      tab: <FormattedMessage id='pages.flow.view.flowProperty' defaultMessage='Flow property' />,
    },
  ];

  const onTabChange = (key: FlowDataSetObjectKeys) => {
    setActiveTabKey(key);
  };

  const compliance = Array.isArray(
    initData?.modellingAndValidation?.complianceDeclarations?.compliance,
  )
    ? initData?.modellingAndValidation?.complianceDeclarations?.compliance?.[0]
    : initData?.modellingAndValidation?.complianceDeclarations?.compliance;

  const ecNumber = (
    initData?.flowInformation?.dataSetInformation?.['common:other'] as
      { 'ecn:ECNumber'?: string } | undefined
  )?.['ecn:ECNumber'];

  const toFlowPropertyList = (
    flowProperty: FormFlowWithId['flowProperties']['flowProperty'] | undefined,
  ): FlowPropertyData[] => {
    if (!flowProperty) {
      return [];
    }
    return Array.isArray(flowProperty)
      ? (flowProperty as FlowPropertyData[])
      : [flowProperty as FlowPropertyData];
  };

  useEffect(() => {
    const resolutionEpoch = propertyResolutionEpochRef.current + 1;
    propertyResolutionEpochRef.current = resolutionEpoch;
    setDataSource([]);

    void getUnitData('flowproperty', genFlowPropertyTabTableData(propertyDataSource, lang)).then(
      (res) => {
        if (propertyResolutionEpochRef.current !== resolutionEpoch) {
          return;
        }
        setDataSource((res ?? []) as FlowpropertyTabTable[]);
      },
    );

    return () => {
      if (propertyResolutionEpochRef.current === resolutionEpoch) {
        propertyResolutionEpochRef.current += 1;
      }
    };
  }, [lang, propertyDataSource]);

  const propertyColumns: ProColumns<FlowpropertyTabTable>[] = [
    {
      title: <FormattedMessage id='pages.table.title.index' defaultMessage='Index' />,
      dataIndex: 'index',
      valueType: 'index',
      search: false,
    },
    {
      title: (
        <FormattedMessage
          id='pages.flow.view.flowProperties.referenceToFlowPropertyDataSet'
          defaultMessage='Flow property'
        />
      ),
      dataIndex: 'referenceToFlowPropertyDataSet',
      sorter: false,
      search: false,
    },
    {
      title: (
        <FormattedMessage
          id='pages.flow.view.flowProperties.meanValue'
          defaultMessage='Mean value (of flow property)'
        />
      ),
      dataIndex: 'meanValue',
      sorter: false,
      search: false,
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
      render: (_, row) => {
        return [
          // <ReferenceUnit
          //   key={0}
          //   id={row.referenceToFlowPropertyDataSetId}
          //   version={row.referenceToFlowPropertyDataSetVersion}
          //   idType={'flowproperty'}
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
          id='pages.process.exchange.quantitativeReference'
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
        return [
          <Space size={'small'} key={0}>
            <PropertyView
              id={row.dataSetInternalID}
              data={propertyDataSource}
              lang={lang}
              buttonType={'icon'}
            />
            {/*<ProcessExchangeEdit
              id={row.dataSetInternalID}
              data={exchangeDataSource}
              lang={lang}
              buttonType={'icon'}
              actionRef={actionRefExchangeTable}
              onData={onExchangeData}
              setViewDrawerVisible={() => { }}
            />
            <ProcessExchangeDelete
              id={row.dataSetInternalID}
              data={exchangeDataSource}
              buttonType={'icon'}
              actionRef={actionRefExchangeTable}
              setViewDrawerVisible={() => { }}
              onData={onPropertyData}
            /> */}
          </Space>,
        ];
      },
    },
  ];
  const contentList: Record<FlowDataSetObjectKeys, React.ReactNode> = {
    flowInformation: (
      <>
        <Descriptions
          bordered
          size={'small'}
          column={1}
          items={[
            {
              key: 0,
              label: (
                <FormattedMessage id='pages.flow.view.flowInformation.id' defaultMessage='ID' />
              ),
              styles: {
                label: {
                  width: '100px',
                },
              },
              children: initData?.flowInformation?.dataSetInformation?.['common:UUID'] ?? '-',
            },
          ]}
        />
        <br />
        <Card
          size='small'
          title={
            <FormattedMessage id='pages.flow.view.flowInformation.name' defaultMessage='Name' />
          }
        >
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.flow.view.flowInformation.baseName'
              defaultMessage='Base name'
            />
          </Divider>
          <LangTextItemDescription
            data={initData?.flowInformation?.dataSetInformation?.['name']?.['baseName']}
          />
          <br />
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.flow.view.flowInformation.treatmentStandardsRoutes'
              defaultMessage='Treatment, standards, routes'
            />
          </Divider>
          <LangTextItemDescription
            data={
              initData?.flowInformation?.dataSetInformation?.name?.treatmentStandardsRoutes ?? '-'
            }
          />
          <br />
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.flow.view.flowInformation.mixAndLocationTypes'
              defaultMessage='Mix and location types'
            />
          </Divider>
          <LangTextItemDescription
            data={initData?.flowInformation?.dataSetInformation?.name?.mixAndLocationTypes ?? '-'}
          />
          <br />
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.flow.view.flowInformation.flowProperties'
              defaultMessage='Quantitative flow properties'
            />
          </Divider>
          <LangTextItemDescription
            data={initData?.flowInformation?.dataSetInformation?.name?.flowProperties ?? '-'}
          />
        </Card>
        <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
          <FormattedMessage
            id='pages.flow.view.flowInformation.synonyms'
            defaultMessage='Synonyms'
          />
        </Divider>
        <LangTextItemDescription
          data={initData?.flowInformation?.dataSetInformation?.['common:synonyms']}
        />
        <br />
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.flow.view.flowInformation.classificationInformation'
              defaultMessage='Category and classification information'
            />
          }
        >
          <Descriptions
            bordered
            size={'small'}
            column={1}
            items={[
              {
                key: 0,
                label: (
                  <FormattedMessage
                    id='pages.flow.view.modellingAndValidation.typeOfDataSet'
                    defaultMessage='Type of flow'
                  />
                ),
                styles: {
                  label: {
                    width: '160px',
                  },
                },
                children:
                  flowTypeOptions.find(
                    (i) => i.value === initData?.modellingAndValidation?.LCIMethod?.typeOfDataSet,
                  )?.label ??
                  initData?.modellingAndValidation?.LCIMethod?.typeOfDataSet ??
                  '-',
              },
            ]}
          />
          <br />
          <LevelTextItemDescription
            data={
              initData?.modellingAndValidation?.LCIMethod?.typeOfDataSet === 'Elementary flow'
                ? initData?.flowInformation?.dataSetInformation?.classificationInformation?.[
                    'common:elementaryFlowCategorization'
                  ]?.['common:category']?.['value']
                : initData?.flowInformation?.dataSetInformation?.classificationInformation?.[
                    'common:classification'
                  ]?.['common:class']?.['value']
            }
            lang={lang}
            categoryType={'Flow'}
            flowType={initData?.modellingAndValidation?.LCIMethod?.typeOfDataSet}
          />
        </Card>
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
                  id='pages.flow.view.flowInformation.CASNumber'
                  defaultMessage='CAS Number'
                />
              ),
              styles: {
                label: {
                  width: '140px',
                },
              },
              children: initData?.flowInformation?.dataSetInformation?.['CASNumber'] ?? '-',
            },
          ]}
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
                  id='pages.flow.view.flowInformation.sumFormula'
                  defaultMessage='Sum formula'
                />
              ),
              styles: {
                label: {
                  width: '140px',
                },
              },
              children: initData?.flowInformation?.dataSetInformation?.['sumFormula'] ?? '-',
            },
          ]}
        />

        <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
          <FormattedMessage
            id='pages.flow.view.flowInformation.generalComment'
            defaultMessage='General comment on data set'
          />
        </Divider>
        <LangTextItemDescription
          data={initData?.flowInformation?.dataSetInformation?.['common:generalComment']}
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
                  id='pages.flow.view.flowInformation.ECNumber'
                  defaultMessage='EC Number'
                />
              ),
              styles: {
                label: {
                  width: '140px',
                },
              },
              children: ecNumber ?? '-',
            },
          ]}
        />
        <br />

        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.flow.view.flowInformation.geography'
              defaultMessage='Geography'
            />
          }
        >
          <LocationTextItemDescription
            lang={lang}
            data={initData?.flowInformation?.geography?.locationOfSupply ?? '-'}
            label={
              <FormattedMessage
                id='pages.flow.view.flowInformation.locationOfSupply'
                defaultMessage='Location of supply'
              />
            }
            styles={{ label: { width: '150px' } }}
          />
        </Card>
        <br />
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.flow.view.flowInformation.technology'
              defaultMessage='Technological representativeness'
            />
          }
        >
          <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
            <FormattedMessage
              id='pages.flow.view.flowInformation.technologicalApplicability'
              defaultMessage='Technical purpose of product or waste'
            />
          </Divider>
          <LangTextItemDescription
            data={initData?.flowInformation?.technology?.technologicalApplicability ?? '-'}
          />
          <br />
          <SourceSelectDescription
            title={
              <FormattedMessage
                id='pages.flow.view.flowInformation.referenceToTechnicalSpecification'
                defaultMessage='Technical specification'
              />
            }
            data={
              (initData?.flowInformation?.technology?.referenceToTechnicalSpecification as
                ReferenceItem | ReferenceItem[] | undefined) ?? undefined
            }
            lang={lang}
          />
        </Card>
      </>
    ),
    modellingAndValidation: (
      <>
        {/* <Card
          size="small"
          title={
            <FormattedMessage
              id="pages.flow.view.modellingAndValidation.complianceDeclarations"
              defaultMessage="Compliance Declarations"
            />
          }
        > */}
        <SourceSelectDescription
          data={
            (compliance?.['common:referenceToComplianceSystem'] as
              ReferenceItem | ReferenceItem[]) ?? undefined
          }
          title={
            <FormattedMessage
              id='pages.flow.view.modellingAndValidation.referenceToComplianceSystem'
              defaultMessage='Compliance system name'
            />
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
                  id='pages.flow.view.modellingAndValidation.approvalOfOverallCompliance'
                  defaultMessage='Approval of overall compliance'
                />
              ),
              styles: {
                label: {
                  width: '260px',
                },
              },
              children: getComplianceLabel(
                (compliance?.['common:approvalOfOverallCompliance'] as string) ?? '-',
              ),
            },
          ]}
        />
        {/* <br />
        </Card> */}
      </>
    ),
    administrativeInformation: (
      <>
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.flow.view.administrativeInformation.dataEntryBy'
              defaultMessage='Data entry by'
            />
          }
        >
          <Descriptions
            bordered
            size={'small'}
            column={1}
            items={[
              {
                key: 0,
                label: (
                  <FormattedMessage
                    id='pages.flow.view.administrativeInformation.timeStamp'
                    defaultMessage='Time stamp (last saved)'
                  />
                ),
                styles: {
                  label: {
                    width: '200px',
                  },
                },
                children:
                  initData?.administrativeInformation?.dataEntryBy?.['common:timeStamp'] ?? '-',
              },
            ]}
          />
          <br />
          <SourceSelectDescription
            data={
              initData?.administrativeInformation?.dataEntryBy?.['common:referenceToDataSetFormat']
            }
            title={
              <FormattedMessage
                id='pages.flow.view.administrativeInformation.referenceToDataSetFormat'
                defaultMessage='Data set format(s)'
              />
            }
            lang={lang}
          />
          <br />
          <ContactSelectDescription
            data={
              initData?.administrativeInformation?.dataEntryBy?.[
                'common:referenceToPersonOrEntityEnteringTheData'
              ]
            }
            title={
              <FormattedMessage
                id='pages.flow.view.administrativeInformation.referenceToPersonOrEntityEnteringTheData'
                defaultMessage='Data entry by:'
              />
            }
            lang={lang}
          />
        </Card>
        <br />
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.flow.view.administrativeInformation.publicationAndOwnership'
              defaultMessage='Publication and ownership'
            />
          }
        >
          <Descriptions
            bordered
            size={'small'}
            column={1}
            items={[
              {
                key: 0,
                label: (
                  <FormattedMessage
                    id='pages.flow.view.administrativeInformation.dataSetVersion'
                    defaultMessage='Data set version'
                  />
                ),
                styles: {
                  label: {
                    width: '160px',
                  },
                },
                children: (
                  <Space>
                    {initData?.administrativeInformation?.publicationAndOwnership?.[
                      'common:dataSetVersion'
                    ] ?? '-'}
                  </Space>
                ),
              },
            ]}
          />
          <br />
          <FlowsSelectDescription
            title={
              <FormattedMessage
                id='pages.flow.view.administrativeInformation.referenceToPrecedingDataSetVersion'
                defaultMessage='Preceding data set version'
              />
            }
            data={
              (initData?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToPrecedingDataSetVersion'
              ] as ReferenceItem | undefined) ?? null
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
                    id='pages.flow.view.administrativeInformation.permanentDataSetURI'
                    defaultMessage='Permanent data set URI'
                  />
                ),
                styles: {
                  label: {
                    width: '220px',
                  },
                },
                children:
                  initData?.administrativeInformation?.publicationAndOwnership?.[
                    'common:permanentDataSetURI'
                  ] ?? '-',
              },
            ]}
          />
          <br />
          <ContactSelectDescription
            data={
              initData?.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToOwnershipOfDataSet'
              ]
            }
            title={
              <FormattedMessage
                id='pages.flow.view.administrativeInformation.referenceToOwnershipOfDataSet'
                defaultMessage='Owner of data set'
              />
            }
            lang={lang}
          />
        </Card>
      </>
    ),
    flowProperties: (
      <ProTable<FlowpropertyTabTable, ListPagination>
        search={false}
        pagination={{
          showSizeChanger: false,
          pageSize: 10,
        }}
        columns={propertyColumns}
        // dataSource={genFlowPropertyTabTableData(propertyDataSource, lang)}
        dataSource={dataSource}
      />
    ),
  };

  const onView = () => {
    setDrawerVisible(true);
    setSpinning(true);
    getFlowDetail(id, version).then(async (result: FlowDetailResponse) => {
      const fromData = genFlowFromData(result.data?.json?.flowDataSet ?? {});
      setInitData({ ...fromData, id: id });
      setPropertyDataSource(toFlowPropertyList(fromData?.flowProperties?.flowProperty));
      setSpinning(false);
    });
  };

  return (
    <>
      {/* <Button shape="circle" icon={<ProfileOutlined />} size="small" onClick={onView} /> */}
      {buttonType === 'icon' ? (
        <Tooltip
          title={tooltipTitle ?? <FormattedMessage id='pages.button.view' defaultMessage='View' />}
        >
          <Button shape='circle' icon={<ProfileOutlined />} size='small' onClick={onView} />
        </Tooltip>
      ) : (
        <Button onClick={onView}>
          <FormattedMessage id='pages.button.view' defaultMessage='View' />
        </Button>
      )}

      <Drawer
        classNames={{ section: 'tg-dataset-view-drawer' }}
        getContainer={() => document.body}
        title={<FormattedMessage id='pages.flow.drawer.title.view' defaultMessage='View Flow' />}
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
        <Spin spinning={spinning}>
          <Card
            style={{ width: '100%' }}
            tabList={tabList}
            activeTabKey={activeTabKey}
            onTabChange={(key) => onTabChange(key as FlowDataSetObjectKeys)}
          >
            {contentList[activeTabKey]}
          </Card>
        </Spin>
      </Drawer>
    </>
  );
};

export default FlowsView;
