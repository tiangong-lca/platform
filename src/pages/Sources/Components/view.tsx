import FileGallery from '@/components/FileViewer/gallery';
import LangTextItemDescription from '@/components/LangTextItem/description';
import LevelTextItemDescription from '@/components/LevelTextItem/description';
import ContactSelectDescription from '@/pages/Contacts/Components/select/description';
import { getClassificationValues } from '@/pages/Utils';
import { isValidURL } from '@/services/general/util';
import { getSourceDetail } from '@/services/sources/api';
import { FormSource, SourceDataSetObjectKeys, SourceDetailResponse } from '@/services/sources/data';
import { genSourceFromData } from '@/services/sources/util';
import { CloseOutlined, LinkOutlined, ProfileOutlined } from '@ant-design/icons';
import { ActionType } from '@ant-design/pro-components';
import { Button, Card, Descriptions, Divider, Drawer, Space, Spin, Tooltip } from 'antd';
import type { FC, ReactNode } from 'react';
import { useState } from 'react';
import { FormattedMessage } from 'umi';
import { getPublicationTypeLabel } from './optiondata';
import SourceSelectDescription from './select/description';

type Props = {
  id: string;
  version: string;
  // dataSource: string;
  buttonType: string;
  tooltipTitle?: string;
  actionRef?: React.RefObject<ActionType | undefined>;
  lang: string;
};

const SourceView: FC<Props> = ({ id, version, buttonType, lang, tooltipTitle }) => {
  const [activeTabKey, setActiveTabKey] = useState<SourceDataSetObjectKeys>('sourceInformation');
  const [drawerVisible, setDrawerVisible] = useState(false);
  // const [footerButtons, setFooterButtons] = useState<JSX.Element>();
  const [spinning, setSpinning] = useState(false);
  const [initData, setInitData] = useState<Partial<FormSource>>({});
  const tabList: { key: SourceDataSetObjectKeys; tab: ReactNode }[] = [
    {
      key: 'sourceInformation',
      tab: (
        <FormattedMessage
          id='pages.source.view.sourceInformation'
          defaultMessage='Source information'
        />
      ),
    },
    {
      key: 'administrativeInformation',
      tab: (
        <FormattedMessage
          id='pages.source.view.administrativeInformation'
          defaultMessage='Administrative information'
        />
      ),
    },
  ];

  const onTabChange = (key: string) => {
    setActiveTabKey(key as SourceDataSetObjectKeys);
  };

  const classificationValues = getClassificationValues(
    initData.sourceInformation?.dataSetInformation?.classificationInformation?.[
      'common:classification'
    ]?.['common:class'],
  );

  const contentList: Record<SourceDataSetObjectKeys, React.ReactNode> = {
    sourceInformation: (
      <>
        <Descriptions
          bordered
          size={'small'}
          column={1}
          items={[
            {
              key: 0,
              label: (
                <FormattedMessage id='pages.source.view.sourceInformation.id' defaultMessage='ID' />
              ),
              styles: {
                label: {
                  width: '100px',
                },
              },
              children: initData.sourceInformation?.dataSetInformation?.['common:UUID'] ?? '-',
            },
          ]}
        />

        <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
          <FormattedMessage
            id='pages.source.view.sourceInformation.shortName'
            defaultMessage='Short name of source'
          />
        </Divider>
        <LangTextItemDescription
          data={initData.sourceInformation?.dataSetInformation?.['common:shortName']}
        />
        <br />
        <LevelTextItemDescription data={classificationValues} lang={lang} categoryType={'Source'} />
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
                  id='pages.source.view.sourceInformation.sourceCitation'
                  defaultMessage='Source citation'
                />
              ),
              styles: {
                label: {
                  width: '180px',
                },
              },
              children: isValidURL(
                initData.sourceInformation?.dataSetInformation?.sourceCitation ?? '',
              ) ? (
                <Tooltip
                  placement='topLeft'
                  title={initData.sourceInformation?.dataSetInformation?.sourceCitation}
                >
                  <Button
                    type='link'
                    target='blank'
                    href={initData.sourceInformation?.dataSetInformation?.sourceCitation}
                  >
                    <LinkOutlined />
                  </Button>
                </Tooltip>
              ) : (
                (initData.sourceInformation?.dataSetInformation?.sourceCitation ?? '-')
              ),
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
                  id='pages.source.view.sourceInformation.publicationType'
                  defaultMessage='Publication type'
                />
              ),
              styles: {
                label: {
                  width: '180px',
                },
              },
              children: getPublicationTypeLabel(
                initData.sourceInformation?.dataSetInformation?.publicationType ?? '',
              ),
            },
          ]}
        />
        <br />
        <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
          <FormattedMessage
            id='pages.source.view.sourceInformation.sourceDescriptionOrComment'
            defaultMessage='Source description or comment'
          />
        </Divider>
        <LangTextItemDescription
          data={initData.sourceInformation?.dataSetInformation?.sourceDescriptionOrComment}
        />
        <br />
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.source.edit.sourceInformation.referenceToDigitalFile'
              defaultMessage='Link to digital file'
            />
          }
        >
          <FileGallery
            data={initData.sourceInformation?.dataSetInformation?.referenceToDigitalFile}
          />
        </Card>
        <br />
        <ContactSelectDescription
          title={
            <FormattedMessage
              id='pages.source.view.sourceInformation.referenceToContact'
              defaultMessage='Belongs to:'
            />
          }
          lang={lang}
          data={initData.sourceInformation?.dataSetInformation?.referenceToContact}
        />
        <br />
        <SourceSelectDescription
          title={
            <FormattedMessage
              id='pages.source.view.sourceInformation.referenceToLogo'
              defaultMessage='Logo of organisation or source'
            />
          }
          data={initData.sourceInformation?.dataSetInformation?.referenceToLogo}
          lang={lang}
        />
      </>
    ),
    administrativeInformation: (
      <>
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.source.view.administrativeInformation.dataEntryBy'
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
                    id='pages.source.view.administrativeInformation.TimeStamp'
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
                id='pages.source.view.administrativeInformation.referenceToDataSetFormat'
                defaultMessage='Data set format(s)'
              />
            }
            lang={lang}
            data={
              initData.administrativeInformation?.dataEntryBy?.['common:referenceToDataSetFormat']
            }
          />
        </Card>
        <br />
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.source.view.administrativeInformation.publicationAndOwnership'
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
                    id='pages.source.view.administrativeInformation.dataSetVersion'
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
                id='pages.source.view.administrativeInformation.referenceToOwnershipOfDataSet'
                defaultMessage='Owner of data set'
              />
            }
          ></ContactSelectDescription>
          <br />
          <SourceSelectDescription
            title={
              <FormattedMessage
                id='pages.source.view.administrativeInformation.referenceToPrecedingDataSetVersion'
                defaultMessage='Preceding data set version'
              />
            }
            lang={lang}
            data={
              initData.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToPrecedingDataSetVersion'
              ]
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
                    id='pages.source.view.administrativeInformation.permanentDataSetURI'
                    defaultMessage='Permanent data set URI'
                  />
                ),
                styles: {
                  label: {
                    width: '210px',
                  },
                },
                children:
                  initData.administrativeInformation?.publicationAndOwnership?.[
                    'common:permanentDataSetURI'
                  ] ?? '-',
              },
            ]}
          />
        </Card>
      </>
    ),
  };

  const onView = () => {
    setDrawerVisible(true);
    setSpinning(true);
    getSourceDetail(id, version).then(async (result: SourceDetailResponse) => {
      setInitData(genSourceFromData(result.data?.json?.sourceDataSet ?? {}));
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
  };
  return (
    <>
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
        getContainer={() => document.body}
        title={
          <FormattedMessage id='pages.source.drawer.title.view' defaultMessage='View Source' />
        }
        size='90%'
        closable={false}
        extra={
          <Button
            icon={<CloseOutlined />}
            style={{ border: 0 }}
            onClick={() => setDrawerVisible(false)}
          />
        }
        // footer={
        //   <Space size={'middle'} className={styles.footer_right}>
        //     {footerButtons}
        //   </Space>
        // }
        mask={{ closable: true }}
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
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

export default SourceView;
