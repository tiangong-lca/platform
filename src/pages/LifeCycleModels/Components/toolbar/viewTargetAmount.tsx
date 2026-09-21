import LangTextItemDescription from '@/components/LangTextItem/description';
import FlowsView from '@/pages/Flows/Components/view';
import UnitGroupDescriptionMini from '@/pages/Unitgroups/Components/select/descriptionMini';
import type {
  LifeCycleModelGraphNode,
  LifeCycleModelTargetAmount,
} from '@/services/lifeCycleModels/data';
import { getProcessDetail } from '@/services/processes/api';
import type { ProcessExchangeData, ProcessFormState } from '@/services/processes/data';
import { genProcessFromData } from '@/services/processes/util';
import { RESPONSIVE_DESCRIPTION_ITEM_STYLES } from '@/style/responsiveDescriptions';
import { CloseOutlined, StarOutlined } from '@ant-design/icons';
import { Button, Card, Descriptions, Divider, Drawer, Space, Tooltip } from 'antd';
import type { FC } from 'react';
import { useEffect, useState } from 'react';
import { FormattedMessage } from 'umi';

type Props = {
  refNode: LifeCycleModelGraphNode | null | undefined;
  drawerVisible: boolean;
  lang: string;
  setDrawerVisible: (value: boolean) => void;
  onData: (data: LifeCycleModelTargetAmount) => void;
};
const TargetAmount: FC<Props> = ({ refNode, drawerVisible, lang, setDrawerVisible }) => {
  const [initData, setInitData] = useState<Partial<ProcessFormState>>({});
  const [refExchange, setRefExchange] = useState<ProcessExchangeData | undefined>();
  const refFlow = Array.isArray(refExchange?.referenceToFlowDataSet)
    ? refExchange?.referenceToFlowDataSet[0]
    : refExchange?.referenceToFlowDataSet;

  const onDrawerOpen = () => {
    setDrawerVisible(true);
  };

  const onDrawerClose = () => {
    setDrawerVisible(false);
  };

  useEffect(() => {
    if (!drawerVisible) return;
    if (refNode) {
      const id = refNode?.data?.id;
      const version = refNode?.data?.version;
      getProcessDetail(id ?? '', version ?? '').then(async (result) => {
        const dataSet = genProcessFromData(result.data?.json?.processDataSet ?? {});
        setInitData({ ...dataSet, id: id });
        const quantitativeReference = dataSet?.processInformation?.quantitativeReference;
        const refExc =
          (dataSet?.exchanges?.exchange ?? []).find(
            (item) =>
              item?.['@dataSetInternalID'] === quantitativeReference?.referenceToReferenceFlow,
          ) ?? {};
        setRefExchange(refExc);
      });
    }
  }, [drawerVisible]);

  return (
    <>
      <Tooltip
        title={
          <FormattedMessage id='pages.lifeCycleModel.targetAmount' defaultMessage='Target amount' />
        }
        placement='left'
      >
        <Button
          type='primary'
          size='small'
          icon={<StarOutlined />}
          style={{ boxShadow: 'none' }}
          disabled={!refNode}
          onClick={onDrawerOpen}
        />
      </Tooltip>
      <Drawer
        getContainer={() => document.body}
        title={
          <FormattedMessage id='pages.lifeCycleModel.targetAmount' defaultMessage='Target amount' />
        }
        size='90%'
        closable={false}
        extra={<Button icon={<CloseOutlined />} style={{ border: 0 }} onClick={onDrawerClose} />}
        footer={false}
        mask={{ closable: true }}
        open={drawerVisible}
        onClose={onDrawerClose}
      >
        <Descriptions
          bordered
          size={'small'}
          column={1}
          styles={RESPONSIVE_DESCRIPTION_ITEM_STYLES}
          items={[
            {
              key: 0,
              label: (
                <FormattedMessage
                  id='pages.lifeCycleModel.targetAmount'
                  defaultMessage='Target amount'
                />
              ),
              children: refNode?.data?.targetAmount ?? '-',
            },
          ]}
        />
        <br />
        <Descriptions
          bordered
          size={'small'}
          column={1}
          styles={RESPONSIVE_DESCRIPTION_ITEM_STYLES}
          items={[
            {
              key: 0,
              label: (
                <FormattedMessage
                  id='pages.lifeCycleModel.originalAmount'
                  defaultMessage='Original amount'
                />
              ),
              children: refNode?.data?.originalAmount ?? '-',
            },
          ]}
        />
        <br />
        <Descriptions
          bordered
          size={'small'}
          column={1}
          styles={RESPONSIVE_DESCRIPTION_ITEM_STYLES}
          items={[
            {
              key: 0,
              label: (
                <FormattedMessage
                  id='pages.lifeCycleModel.scalingFactor'
                  defaultMessage='Scaling factor'
                />
              ),
              children: refNode?.data?.scalingFactor ?? '-',
            },
          ]}
        />
        <br />
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.flow.model.drawer.title.refFlow'
              defaultMessage='Reference flow'
            />
          }
        >
          <Space
            orientation='horizontal'
            wrap
            style={{ width: '100%' }}
            styles={{ item: { minWidth: 0, maxWidth: '100%' } }}
          >
            <Descriptions
              bordered
              size={'small'}
              column={1}
              style={{ width: '100%', maxWidth: '450px' }}
              styles={RESPONSIVE_DESCRIPTION_ITEM_STYLES}
              items={[
                {
                  key: 0,
                  label: (
                    <FormattedMessage
                      id='pages.process.view.exchange.refObjectId'
                      defaultMessage='Reference flow dataset identifier'
                    />
                  ),
                  children: refFlow?.['@refObjectId'] ?? '-',
                },
              ]}
            />
            {refFlow?.['@refObjectId'] && (
              <FlowsView
                id={refFlow['@refObjectId']}
                version={refFlow?.['@version'] ?? ''}
                lang={lang}
                buttonType='text'
              />
            )}
          </Space>
          <br />
          <br />
          <Descriptions
            bordered
            size={'small'}
            column={1}
            styles={RESPONSIVE_DESCRIPTION_ITEM_STYLES}
            items={[
              {
                key: 0,
                label: (
                  <FormattedMessage id='pages.process.view.exchange.type' defaultMessage='Type' />
                ),
                children: refFlow?.['@type'] ?? '-',
              },
            ]}
          />
          <br />
          <Descriptions
            bordered
            size={'small'}
            column={1}
            styles={RESPONSIVE_DESCRIPTION_ITEM_STYLES}
            items={[
              {
                key: 0,
                label: (
                  <FormattedMessage id='pages.process.view.exchange.uri' defaultMessage='URI' />
                ),
                children: refFlow?.['@uri'] ?? '-',
              },
            ]}
          />
          <br />
          <Descriptions
            bordered
            size={'small'}
            column={1}
            styles={RESPONSIVE_DESCRIPTION_ITEM_STYLES}
            items={[
              {
                key: 0,
                label: <FormattedMessage id='pages.version' defaultMessage='Version' />,
                children: refFlow?.['@version'] ?? '-',
              },
            ]}
          />
          <Divider styles={{ content: { margin: 0 } }} titlePlacement='start' plain>
            <FormattedMessage
              id='pages.process.view.exchange.shortDescription'
              defaultMessage='Short description'
            />
          </Divider>
          <LangTextItemDescription data={refFlow?.['common:shortDescription']} />
          <br />
          <UnitGroupDescriptionMini
            id={refFlow?.['@refObjectId']}
            version={refFlow?.['@version']}
            idType={'flow'}
          />
        </Card>
        <br />
        <Card
          size='small'
          title={<FormattedMessage id='pages.lifeCycleModel.refNode' defaultMessage='Ref node' />}
        >
          <Divider styles={{ content: { margin: 0 } }} titlePlacement='start' plain>
            <FormattedMessage id='pages.lifeCycleModel.information.name' defaultMessage='Name' />
          </Divider>
          <LangTextItemDescription
            data={initData.processInformation?.dataSetInformation?.name?.baseName}
          />
          <br />
          <Divider styles={{ content: { margin: 0 } }} titlePlacement='start' plain>
            <FormattedMessage
              id='pages.lifeCycleModel.information.generalComment'
              defaultMessage='General comment'
            />
          </Divider>
          <LangTextItemDescription
            data={initData.processInformation?.dataSetInformation?.['common:generalComment']}
          />
        </Card>
      </Drawer>
    </>
  );
};

export default TargetAmount;
