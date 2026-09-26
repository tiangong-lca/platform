import LangTextItemDescription from '@/components/LangTextItem/description';
import LevelTextItemDescription from '@/components/LevelTextItem/description';
import ContactSelectDescription from '@/pages/Contacts/Components/select/description';
import SourcesDescription from '@/pages/Sources/Components/select/description';
import UnitGroupDescription from '@/pages/Unitgroups/Components/select/description';
import { getClassificationValues } from '@/pages/Utils';
import { getFlowpropertyDetail } from '@/services/flowproperties/api';
import {
  FlowPropertyDataSetObjectKeys,
  FlowpropertyDetailResponse,
  FlowpropertyReference,
  FormFlowProperty,
} from '@/services/flowproperties/data';
import { genFlowpropertyFromData } from '@/services/flowproperties/util';
import type { ReferenceItem } from '@/services/general/data';
import { listToJson } from '@/services/general/util';
import { CloseOutlined, ProfileOutlined } from '@ant-design/icons';
import { ActionType } from '@ant-design/pro-components';
import { Button, Card, Descriptions, Divider, Drawer, Space, Spin, Tooltip } from 'antd';
import type { FC } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { FormattedMessage } from 'umi';
import { complianceOptions } from './optiondata';
import FlowpropertiesSelectDescription from './select/description';
type Props = {
  id: string;
  version: string;
  actionRef?: React.RefObject<ActionType | undefined>;
  buttonType: string;
  tooltipTitle?: string;
  lang: string;
  autoOpen?: boolean;
  onDrawerClose?: () => void;
};

const getComplianceLabel = (value: string) => {
  const option = complianceOptions.find((opt) => opt.value === value);
  return option ? option.label : '-';
};

const FlowpropertyView: FC<Props> = ({
  id,
  version,
  buttonType,
  tooltipTitle,
  lang,
  autoOpen = false,
  onDrawerClose,
}) => {
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [activeTabKey, setActiveTabKey] = useState<FlowPropertyDataSetObjectKeys>(
    'flowPropertiesInformation',
  );
  const [spinning, setSpinning] = useState(false);
  const [initData, setInitData] = useState<Partial<FormFlowProperty>>({});
  const onTabChange = (key: string) => {
    setActiveTabKey(key as FlowPropertyDataSetObjectKeys);
  };

  const tabList = [
    {
      key: 'flowPropertiesInformation',
      tab: (
        <FormattedMessage
          id='pages.FlowProperties.view.flowPropertiesInformation'
          defaultMessage='Flow property information'
        />
      ),
    },
    {
      key: 'modellingAndValidation',
      tab: (
        <FormattedMessage
          id='pages.FlowProperties.view.modellingAndValidation'
          defaultMessage='Modelling and validation'
        />
      ),
    },
    {
      key: 'administrativeInformation',
      tab: (
        <FormattedMessage
          id='pages.FlowProperties.view.administrativeInformation'
          defaultMessage='Administrative information'
        />
      ),
    },
  ];

  const classificationValues =
    getClassificationValues(
      initData.flowPropertiesInformation?.dataSetInformation?.classificationInformation?.[
        'common:classification'
      ]?.['common:class'],
    ) ?? [];

  const compliance = listToJson(
    initData?.modellingAndValidation?.complianceDeclarations?.compliance,
  ) as {
    'common:referenceToComplianceSystem'?: FlowpropertyReference;
    'common:approvalOfOverallCompliance'?: string;
  };
  const precedingDataSetVersionRef = listToJson(
    initData?.administrativeInformation?.publicationAndOwnership?.[
      'common:referenceToPrecedingDataSetVersion'
    ],
  ) as ReferenceItem;

  const contentList: Partial<Record<FlowPropertyDataSetObjectKeys, React.ReactNode>> = {
    flowPropertiesInformation: (
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
                  id='pages.FlowProperties.view.flowPropertiesInformation.id'
                  defaultMessage='ID'
                />
              ),
              styles: {
                label: {
                  width: '100px',
                },
              },
              children:
                initData?.flowPropertiesInformation?.dataSetInformation?.['common:UUID'] ?? '-',
            },
          ]}
        />
        <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
          <FormattedMessage
            id='pages.FlowProperties.view.flowPropertiesInformation.name'
            defaultMessage='Name of flow property'
          />
        </Divider>
        <LangTextItemDescription
          data={initData?.flowPropertiesInformation?.dataSetInformation?.['common:name']}
        />
        <LangTextItemDescription
          data={initData?.flowPropertiesInformation?.dataSetInformation?.['common:synonyms']}
        />
        <br />
        <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
          <FormattedMessage
            id='pages.FlowProperties.view.flowPropertiesInformation.generalComment'
            defaultMessage='General comment on data set'
          />
        </Divider>
        <LangTextItemDescription
          data={initData?.flowPropertiesInformation?.dataSetInformation?.['common:generalComment']}
        />

        <br />
        <LevelTextItemDescription
          data={classificationValues}
          lang={lang}
          categoryType={'FlowProperty'}
        />
        <br />
        <UnitGroupDescription
          lang={lang}
          title={
            <FormattedMessage
              id='pages.FlowProperties.view.flowPropertiesInformation.referenceToReferenceUnitGroup'
              defaultMessage='Reference unit'
            />
          }
          data={
            initData.flowPropertiesInformation?.quantitativeReference
              ?.referenceToReferenceUnitGroup ?? {}
          }
        />
      </>
    ),
    modellingAndValidation: (
      <>
        <SourcesDescription
          data={
            initData?.modellingAndValidation?.dataSourcesTreatmentAndRepresentativeness
              ?.referenceToDataSource
          }
          title={
            <FormattedMessage
              id='pages.FlowProperties.view.modellingAndValidation.referenceToDataSource'
              defaultMessage='Data source'
            />
          }
          lang={lang}
        />
        <br />
        <SourcesDescription
          data={compliance?.['common:referenceToComplianceSystem']}
          title={
            <FormattedMessage
              id='pages.FlowProperties.view.modellingAndValidation.referenceToComplianceSystem'
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
                  id='pages.FlowProperties.view.modellingAndValidation.approvalOfOverallCompliance'
                  defaultMessage='Approval of overall compliance'
                />
              ),
              styles: {
                label: {
                  width: '240px',
                },
              },
              children: getComplianceLabel(
                compliance?.['common:approvalOfOverallCompliance'] ?? '-',
              ),
            },
          ]}
        />
      </>
    ),
    administrativeInformation: (
      <>
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.FlowProperties.view.modellingAndValidation.dataEntryBy'
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
                    id='pages.FlowProperties.view.modellingAndValidation.timeStamp'
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
          <SourcesDescription
            data={
              initData?.administrativeInformation?.dataEntryBy?.['common:referenceToDataSetFormat']
            }
            title={
              <FormattedMessage
                id='pages.FlowProperties.view.modellingAndValidation.referenceToDataSetFormat'
                defaultMessage='Data set format(s)'
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
              id='pages.FlowProperties.view.modellingAndValidation.publicationAndOwnership'
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
                    id='pages.FlowProperties.view.modellingAndValidation.dataSetVersion'
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
                    {initData?.administrativeInformation?.publicationAndOwnership?.[
                      'common:dataSetVersion'
                    ] ?? '-'}
                  </Space>
                ),
              },
            ]}
          />
          <br />
          <FlowpropertiesSelectDescription
            data={precedingDataSetVersionRef}
            lang={lang}
            title={
              <FormattedMessage
                id='pages.FlowProperties.view.administrativeInformation.referenceToPrecedingDataSetVersion'
                defaultMessage='Preceding data set version'
              />
            }
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
                id='pages.FlowProperties.view.administrativeInformation.referenceToOwnershipOfDataSet'
                defaultMessage='Owner of data set'
              />
            }
          ></ContactSelectDescription>
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
                    id='pages.FlowProperties.view.administrativeInformation.permanentDataSetURI'
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
        </Card>
      </>
    ),
  };

  const onView = useCallback(() => {
    setDrawerVisible(true);
    setSpinning(true);
    getFlowpropertyDetail(id, version).then(async (result: FlowpropertyDetailResponse) => {
      setInitData(genFlowpropertyFromData(result.data?.json?.flowPropertyDataSet ?? {}));
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
      {/* <Button shape="circle" icon={<ProfileOutlined />} size="small" onClick={onView} /> */}
      {!autoOpen &&
        (buttonType === 'icon' ? (
          <Tooltip
            title={
              tooltipTitle ?? <FormattedMessage id='pages.button.view' defaultMessage='View' />
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
        classNames={{ section: 'tg-dataset-view-drawer' }}
        getContainer={() => document.body}
        title={
          <FormattedMessage
            id='pages.flowproperty.drawer.title.view'
            defaultMessage='View Flow property'
          />
        }
        size='90%'
        closable={false}
        extra={<Button icon={<CloseOutlined />} style={{ border: 0 }} onClick={handleClose} />}
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

export default FlowpropertyView;
