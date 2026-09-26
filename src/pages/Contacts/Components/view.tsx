import LangTextItemDescription from '@/components/LangTextItem/description';
import LevelTextItemDescription from '@/components/LevelTextItem/description';
import SourceSelectDescription from '@/pages/Sources/Components/select/description';
import { getClassificationValues } from '@/pages/Utils';
import { getContactDetail } from '@/services/contacts/api';
import {
  ContactDataSetObjectKeys,
  ContactDetailResponse,
  FormContact,
} from '@/services/contacts/data';
import { genContactFromData } from '@/services/contacts/util';
import { CloseOutlined, ProfileOutlined } from '@ant-design/icons';
import { ActionType } from '@ant-design/pro-components';
import { Button, Card, Descriptions, Divider, Drawer, Space, Spin, Tooltip } from 'antd';
import type { FC, ReactNode } from 'react';
import { useState } from 'react';
import { FormattedMessage } from 'umi';
import ContractDescription from './select/description';
type Props = {
  id: string;
  version: string;
  lang: string;
  buttonType: string;
  tooltipTitle?: string;
  actionRef?: React.RefObject<ActionType | undefined>;
};

const ContactView: FC<Props> = ({ id, version, lang, buttonType, tooltipTitle }) => {
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [initData, setInitData] = useState<Partial<FormContact>>({});
  const [activeTabKey, setActiveTabKey] = useState<ContactDataSetObjectKeys>('contactInformation');
  const tabList: { key: ContactDataSetObjectKeys; tab: ReactNode }[] = [
    {
      key: 'contactInformation',
      tab: (
        <FormattedMessage
          id='pages.contact.contactInformation'
          defaultMessage='Contact information'
        />
      ),
    },
    {
      key: 'administrativeInformation',
      tab: (
        <FormattedMessage
          id='pages.contact.administrativeInformation'
          defaultMessage='Administrative information'
        />
      ),
    },
  ];

  const onTabChange = (key: string) => {
    setActiveTabKey(key as ContactDataSetObjectKeys);
  };

  const classificationValues = getClassificationValues(
    initData.contactInformation?.dataSetInformation?.classificationInformation?.[
      'common:classification'
    ]?.['common:class'],
  );

  const contactList: Record<ContactDataSetObjectKeys, React.ReactNode> = {
    contactInformation: (
      <>
        <Descriptions
          bordered
          size={'small'}
          column={1}
          items={[
            {
              key: 0,
              label: <FormattedMessage id='pages.contact.id' defaultMessage='ID' />,
              styles: {
                label: {
                  width: '100px',
                },
              },
              children: initData.contactInformation?.dataSetInformation?.['common:UUID'] ?? '-',
            },
          ]}
        />
        <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
          <FormattedMessage id='pages.contact.name' defaultMessage='Name of contact' />
        </Divider>
        <LangTextItemDescription
          data={initData.contactInformation?.dataSetInformation?.['common:name']}
        />
        <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
          <FormattedMessage id='pages.contact.shortName' defaultMessage='Short name for contact' />
        </Divider>
        <LangTextItemDescription
          data={initData.contactInformation?.dataSetInformation?.['common:shortName']}
        />
        <br />
        <LevelTextItemDescription
          data={classificationValues}
          lang={lang}
          categoryType={'Contact'}
        />
        <br />
        <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
          <FormattedMessage id='pages.contact.contactAddress' defaultMessage='Contact address' />
        </Divider>
        <LangTextItemDescription
          data={initData.contactInformation?.dataSetInformation?.['contactAddress']}
        />
        <br />
        <Descriptions
          bordered
          size={'small'}
          column={1}
          items={[
            {
              key: 0,
              label: <FormattedMessage id='pages.contact.telephone' defaultMessage='Telephone' />,
              styles: {
                label: {
                  width: '100px',
                },
              },
              children: initData.contactInformation?.dataSetInformation?.telephone ?? '-',
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
              label: <FormattedMessage id='pages.contact.telefax' defaultMessage='Telefax' />,
              styles: {
                label: {
                  width: '100px',
                },
              },
              children: initData.contactInformation?.dataSetInformation?.telefax ?? '-',
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
              label: <FormattedMessage id='pages.contact.email' defaultMessage='E-mail' />,
              styles: {
                label: {
                  width: '100px',
                },
              },
              children: initData.contactInformation?.dataSetInformation?.email ?? '-',
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
                <FormattedMessage id='pages.contact.WWWAddress' defaultMessage='WWW-Address' />
              ),
              styles: {
                label: {
                  width: '140px',
                },
              },
              children: initData.contactInformation?.dataSetInformation?.WWWAddress ?? '-',
            },
          ]}
        />
        <br />
        <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
          <FormattedMessage
            id='pages.contact.centralContactPoint'
            defaultMessage='Central contact point'
          />
        </Divider>
        <LangTextItemDescription
          data={initData.contactInformation?.dataSetInformation?.['centralContactPoint']}
        />
        <br />
        <Divider titlePlacement='start' styles={{ content: { margin: 0 } }} plain>
          <FormattedMessage
            id='pages.contact.contactDescriptionOrComment'
            defaultMessage='Contact description or comment'
          />
        </Divider>
        <LangTextItemDescription
          data={initData.contactInformation?.dataSetInformation?.['contactDescriptionOrComment']}
        />
        <br />
        <ContractDescription
          data={initData.contactInformation?.dataSetInformation?.referenceToContact}
          lang={lang}
          title={
            <FormattedMessage id='pages.contact.referenceToContact' defaultMessage='Belongs to:' />
          }
        ></ContractDescription>
        <br />

        <SourceSelectDescription
          title={
            <FormattedMessage
              id='pages.contact.referenceToLogo'
              defaultMessage='Logo of organisation or source'
            />
          }
          data={initData.contactInformation?.dataSetInformation?.referenceToLogo}
          lang={lang}
        />
      </>
    ),
    administrativeInformation: (
      <>
        <Card
          size='small'
          title={<FormattedMessage id='pages.contact.dataEntryBy' defaultMessage='Data entry by' />}
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
                    id='pages.contact.timeStamp'
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
                id='pages.contact.referenceToDataSetFormat'
                defaultMessage='Data set format(s)'
              />
            }
            data={
              initData.administrativeInformation?.dataEntryBy?.['common:referenceToDataSetFormat']
            }
            lang={lang}
          />
        </Card>
        <br />
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.contact.publicationAndOwnership'
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
                    id='pages.contact.dataSetVersion'
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
          <ContractDescription
            data={
              initData.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToOwnershipOfDataSet'
              ]
            }
            lang={lang}
            title={
              <FormattedMessage
                id='pages.contact.referenceToOwnershipOfDataSet'
                defaultMessage='Owner of data set'
              />
            }
          ></ContractDescription>
          <br />
          <ContractDescription
            data={
              initData.administrativeInformation?.publicationAndOwnership?.[
                'common:referenceToPrecedingDataSetVersion'
              ]
            }
            lang={lang}
            title={
              <FormattedMessage
                id='pages.contact.referenceToPrecedingDataSetVersion'
                defaultMessage='Preceding data set version'
              />
            }
          ></ContractDescription>
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
                    id='pages.contact.permanentDataSetURI'
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
        </Card>
      </>
    ),
  };

  const onView = () => {
    setDrawerVisible(true);
    setSpinning(true);
    getContactDetail(id, version).then(async (result: ContactDetailResponse) => {
      const contactData = genContactFromData(result.data?.json?.contactDataSet ?? {});
      setInitData(contactData ? { ...contactData } : {});
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
          <FormattedMessage id='pages.contact.drawer.title.view' defaultMessage='View Contact' />
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
            {contactList[activeTabKey]}
          </Card>
        </Spin>
      </Drawer>
    </>
  );
};

export default ContactView;
