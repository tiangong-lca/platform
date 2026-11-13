import DatasetCreateVersionFormItem from '@/components/DatasetCreateVersionFormItem';
import LangTextItemForm from '@/components/LangTextItem/form';
import LevelTextItemForm from '@/components/LevelTextItem/form';
import RequiredMark from '@/components/RequiredMark';
import ContactSelectForm from '@/pages/Contacts/Components/select/form';
import schema from '@/pages/Contacts/contacts_schema.json';
import SourceSelectForm from '@/pages/Sources/Components/select/form';
import { getRules } from '@/pages/Utils';
import type { ValidationIssueSdkDetail } from '@/pages/Utils/review';
import { useDatasetSdkValidationFormSupport } from '@/pages/Utils/validation/formSupport';
import { ProFormInstance } from '@ant-design/pro-components';
import { Card, Form, Input, Space, theme } from 'antd';
import { FC, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'umi';

const CONTACT_SCHEMA_PATH_PREFIX = ['contactDataSet'];

type Props = {
  lang: string;
  activeTabKey: string;
  formRef: React.RefObject<ProFormInstance | undefined>;
  onData: () => void;
  onTabChange: (key: string) => void;
  formType?: string;
  showRules?: boolean;
  sdkValidationDetails?: ValidationIssueSdkDetail[];
  sdkValidationFocus?: ValidationIssueSdkDetail | null;
  validationIssueTabNames?: string[];
  lockOwnership?: boolean;
};

export const ContactForm: FC<Props> = ({
  lang,
  activeTabKey,
  formRef,
  onData,
  onTabChange,
  formType,
  showRules = false,
  sdkValidationDetails = [],
  sdkValidationFocus = null,
  validationIssueTabNames = [],
  lockOwnership = false,
}) => {
  const { token } = theme.useToken();
  const intl = useIntl();
  const [showShortNameError, setShowShortNameError] = useState(false);
  const [showNameError, setShowNameError] = useState(false);
  const { sdkValidationCountsByTab } = useDatasetSdkValidationFormSupport({
    activeTabKey,
    formRef,
    intl,
    sdkValidationDetails,
    sdkValidationFocus,
    schemaPathPrefix: CONTACT_SCHEMA_PATH_PREFIX,
    schemaRoot: schema,
    showRules,
  });
  const validationIssueTabs = useMemo(
    () => new Set(validationIssueTabNames),
    [validationIssueTabNames],
  );

  const tabLabels = {
    administrativeInformation: (
      <FormattedMessage
        id='pages.contact.administrativeInformation'
        defaultMessage='Administrative information'
      />
    ),
    contactInformation: (
      <FormattedMessage
        id='pages.contact.contactInformation'
        defaultMessage='Contact information'
      />
    ),
  } as const;

  const renderTabLabel = (key: keyof typeof tabLabels) => {
    const hasIssue = (sdkValidationCountsByTab[key] ?? 0) > 0 || validationIssueTabs.has(key);

    return (
      <span
        style={
          hasIssue
            ? {
                color: token.colorError ?? token.colorPrimary,
                fontWeight: token.fontWeightStrong,
              }
            : undefined
        }
      >
        {tabLabels[key]}
      </span>
    );
  };

  const tabList = [
    {
      key: 'contactInformation',
      tab: renderTabLabel('contactInformation'),
    },
    {
      key: 'administrativeInformation',
      tab: renderTabLabel('administrativeInformation'),
    },
  ];
  const tabContent: { [key: string]: React.JSX.Element } = {
    contactInformation: (
      <>
        <Space orientation='vertical' style={{ width: '100%' }}>
          <Card
            size='small'
            title={
              <RequiredMark
                showError={showShortNameError}
                label={
                  <FormattedMessage
                    id='pages.contact.shortName'
                    defaultMessage='Short name for contact'
                  />
                }
              />
            }
          >
            <LangTextItemForm
              formRef={formRef}
              setRuleErrorState={setShowShortNameError}
              name={['contactInformation', 'dataSetInformation', 'common:shortName']}
              label={
                <FormattedMessage
                  id='pages.contact.shortName'
                  defaultMessage='Short name for contact'
                />
              }
              autoExpandRequired={(
                schema['contactDataSet']['contactInformation']['dataSetInformation'][
                  'common:shortName'
                ]['rules'] ?? []
              ).some((rule) => rule.required)}
              rules={
                showRules
                  ? getRules(
                      schema['contactDataSet']['contactInformation']['dataSetInformation'][
                        'common:shortName'
                      ]['rules'] ?? [],
                    )
                  : []
              }
            />
          </Card>
          <br />
          <Card
            size='small'
            title={
              <RequiredMark
                showError={showNameError}
                label={
                  <FormattedMessage id='pages.contact.name' defaultMessage='Name of contact' />
                }
              />
            }
          >
            <LangTextItemForm
              formRef={formRef}
              setRuleErrorState={setShowNameError}
              name={['contactInformation', 'dataSetInformation', 'common:name']}
              label={<FormattedMessage id='pages.contact.name' defaultMessage='Name of contact' />}
              autoExpandRequired={(
                schema['contactDataSet']['contactInformation']['dataSetInformation']['common:name'][
                  'rules'
                ] ?? []
              ).some((rule) => rule.required)}
              rules={
                showRules
                  ? getRules(
                      schema['contactDataSet']['contactInformation']['dataSetInformation'][
                        'common:name'
                      ]['rules'] ?? [],
                    )
                  : []
              }
            />
          </Card>
          <br />
          <LevelTextItemForm
            name={[
              'contactInformation',
              'dataSetInformation',
              'classificationInformation',
              'common:classification',
              'common:class',
            ]}
            lang={lang}
            dataType={'Contact'}
            formRef={formRef}
            onData={onData}
            showRules={showRules}
            rules={
              showRules
                ? getRules(
                    schema['contactDataSet']['contactInformation']['dataSetInformation'][
                      'classificationInformation'
                    ]['common:classification']['common:class'][0]['@classId']['rules'] ?? [],
                  )
                : []
            }
          />
          <Card
            size='small'
            title={
              <FormattedMessage
                id='pages.contact.contactAddress'
                defaultMessage='Contact address'
              />
            }
          >
            <LangTextItemForm
              name={['contactInformation', 'dataSetInformation', 'contactAddress']}
              label={
                <FormattedMessage
                  id='pages.contact.contactAddress'
                  defaultMessage='Contact address'
                />
              }
              rules={
                showRules
                  ? getRules(
                      schema['contactDataSet']['contactInformation']['dataSetInformation'][
                        'contactAddress'
                      ]['rules'] ?? [],
                    )
                  : []
              }
            />
          </Card>
          <br />
          <Form.Item
            label={<FormattedMessage id='pages.contact.telephone' defaultMessage='Telephone' />}
            name={['contactInformation', 'dataSetInformation', 'telephone']}
            rules={
              showRules
                ? getRules(
                    schema['contactDataSet']['contactInformation']['dataSetInformation'][
                      'telephone'
                    ]['rules'] ?? [],
                  )
                : []
            }
          >
            <Input />
          </Form.Item>
          <Form.Item
            label={<FormattedMessage id='pages.contact.telefax' defaultMessage='Telefax' />}
            name={['contactInformation', 'dataSetInformation', 'telefax']}
            rules={
              showRules
                ? getRules(
                    schema['contactDataSet']['contactInformation']['dataSetInformation']['telefax'][
                      'rules'
                    ] ?? [],
                  )
                : []
            }
          >
            <Input />
          </Form.Item>
          <Form.Item
            label={<FormattedMessage id='pages.contact.email' defaultMessage='E-mail' />}
            name={['contactInformation', 'dataSetInformation', 'email']}
            rules={
              showRules
                ? getRules(
                    schema['contactDataSet']['contactInformation']['dataSetInformation']['email'][
                      'rules'
                    ] ?? [],
                  )
                : []
            }
          >
            <Input />
          </Form.Item>
          <Form.Item
            label={<FormattedMessage id='pages.contact.WWWAddress' defaultMessage='WWW-Address' />}
            name={['contactInformation', 'dataSetInformation', 'WWWAddress']}
            rules={
              showRules
                ? getRules(
                    schema['contactDataSet']['contactInformation']['dataSetInformation'][
                      'WWWAddress'
                    ]['rules'] ?? [],
                  )
                : []
            }
          >
            <Input />
          </Form.Item>
          <Card
            size='small'
            title={
              <FormattedMessage
                id='pages.contact.centralContactPoint'
                defaultMessage='Central contact point'
              />
            }
          >
            <LangTextItemForm
              name={['contactInformation', 'dataSetInformation', 'centralContactPoint']}
              label={
                <FormattedMessage
                  id='pages.contact.centralContactPoint'
                  defaultMessage='Central contact point'
                />
              }
              rules={
                showRules
                  ? getRules(
                      schema['contactDataSet']['contactInformation']['dataSetInformation'][
                        'centralContactPoint'
                      ]['rules'] ?? [],
                    )
                  : []
              }
            />
          </Card>
          <br />
          <Card
            size='small'
            title={
              <FormattedMessage
                id='pages.contact.contactDescriptionOrComment'
                defaultMessage='Contact description or comment'
              />
            }
          >
            <LangTextItemForm
              name={['contactInformation', 'dataSetInformation', 'contactDescriptionOrComment']}
              label={
                <FormattedMessage
                  id='pages.contact.contactDescriptionOrComment'
                  defaultMessage='Contact description or comment'
                />
              }
              rules={
                showRules
                  ? getRules(
                      schema['contactDataSet']['contactInformation']['dataSetInformation'][
                        'contactDescriptionOrComment'
                      ]['rules'] ?? [],
                    )
                  : []
              }
            />
          </Card>
          <br />
          <ContactSelectForm
            label={
              <FormattedMessage
                id='pages.contact.referenceToContact'
                defaultMessage='Belongs to:'
              />
            }
            name={['contactInformation', 'dataSetInformation', 'referenceToContact']}
            lang={lang}
            formRef={formRef}
            onData={onData}
          />
          <br />
          <SourceSelectForm
            label={
              <FormattedMessage
                id='pages.contact.referenceToLogo'
                defaultMessage='Logo of organisation or source'
              />
            }
            name={['contactInformation', 'dataSetInformation', 'referenceToLogo']}
            lang={lang}
            formRef={formRef}
            onData={onData}
          />
        </Space>
      </>
    ),
    administrativeInformation: (
      <>
        <Space orientation='vertical' style={{ width: '100%' }}>
          <Card
            size='small'
            title={
              <FormattedMessage id='pages.contact.dataEntryBy' defaultMessage='Data entry by' />
            }
          >
            <Form.Item
              required={false}
              label={
                <RequiredMark
                  showError={false}
                  label={
                    <FormattedMessage
                      id='pages.contact.timeStamp'
                      defaultMessage='Time stamp (last saved)'
                    />
                  }
                />
              }
              rules={
                showRules
                  ? getRules(
                      schema['contactDataSet']['administrativeInformation']['dataEntryBy'][
                        'common:timeStamp'
                      ]['rules'] ?? [],
                    )
                  : []
              }
              name={['administrativeInformation', 'dataEntryBy', 'common:timeStamp']}
            >
              <Input disabled={true} style={{ color: token.colorTextDescription }} />
            </Form.Item>
            <SourceSelectForm
              defaultSourceName={formType === 'create' ? 'ILCD format' : undefined}
              label={
                <FormattedMessage
                  id='pages.contact.referenceToDataSetFormat'
                  defaultMessage='Data set format(s)'
                />
              }
              showRequiredLabel={true}
              rules={
                showRules
                  ? getRules(
                      schema['contactDataSet']['administrativeInformation']['dataEntryBy'][
                        'common:referenceToDataSetFormat'
                      ]['@refObjectId']['rules'] ?? [],
                    )
                  : []
              }
              name={['administrativeInformation', 'dataEntryBy', 'common:referenceToDataSetFormat']}
              lang={lang}
              formRef={formRef}
              onData={onData}
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
            <DatasetCreateVersionFormItem
              createVersion={formType === 'createVersion'}
              label={
                <RequiredMark
                  showError={false}
                  label={
                    <FormattedMessage
                      id='pages.contact.dataSetVersion'
                      defaultMessage='Data set version'
                    />
                  }
                />
              }
              name={[
                'administrativeInformation',
                'publicationAndOwnership',
                'common:dataSetVersion',
              ]}
              rules={getRules(
                schema['contactDataSet']['administrativeInformation']['publicationAndOwnership'][
                  'common:dataSetVersion'
                ]['rules'] ?? [],
              )}
            >
              <Input disabled={formType === 'edit'} />
            </DatasetCreateVersionFormItem>
            {!lockOwnership && (
              <ContactSelectForm
                label={
                  <FormattedMessage
                    id='pages.contact.referenceToOwnershipOfDataSet'
                    defaultMessage='Owner of data set'
                  />
                }
                showRequiredLabel={true}
                rules={
                  showRules
                    ? getRules(
                        schema['contactDataSet']['administrativeInformation'][
                          'publicationAndOwnership'
                        ]['common:referenceToOwnershipOfDataSet']['@refObjectId']['rules'] ?? [],
                      )
                    : []
                }
                name={[
                  'administrativeInformation',
                  'publicationAndOwnership',
                  'common:referenceToOwnershipOfDataSet',
                ]}
                lang={lang}
                formRef={formRef}
                onData={onData}
              />
            )}
            <br />
            {/* <ContactSelectForm
              label={
                <FormattedMessage
                  id='pages.contact.referenceToPrecedingDataSetVersion'
                  defaultMessage='Preceding data set version'
                />
              }
              name={[
                'administrativeInformation',
                'publicationAndOwnership',
                'common:referenceToPrecedingDataSetVersion',
              ]}
              lang={lang}
              formRef={formRef}
              onData={onData}
            />
            <br /> */}
            <Form.Item
              label={
                <FormattedMessage
                  id='pages.contact.permanentDataSetURI'
                  defaultMessage='Permanent data set URI'
                />
              }
              name={[
                'administrativeInformation',
                'publicationAndOwnership',
                'common:permanentDataSetURI',
              ]}
            >
              <Input disabled={true} />
            </Form.Item>
          </Card>
        </Space>
      </>
    ),
  };

  return (
    <>
      <Card
        style={{ width: '100%' }}
        tabList={tabList}
        activeTabKey={activeTabKey}
        onTabChange={onTabChange}
      >
        {Object.keys(tabContent).map((key) => (
          <div key={key} style={{ display: key === activeTabKey ? 'block' : 'none' }}>
            {tabContent[key]}
          </div>
        ))}
      </Card>
      {/* <Form.Item name="id" hidden>
        <Input />
      </Form.Item> */}
    </>
  );
};
