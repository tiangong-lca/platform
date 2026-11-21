import {
  FileType,
  getBase64,
  getOriginalFileUrl,
  isImage,
  type StorageFilePreview,
} from '@/services/supabase/storage';
import { resolveFileLocator } from '@/services/supabase/fileLocator';
import { filePreviewLabel } from '@/components/FileViewer/preview';
import fileViewerStyles from '@/components/FileViewer/sourceUpload.module.less';
import { Button, Card, Form, Image, Input, Select, Space, Upload, UploadFile } from 'antd';
import { FC, useMemo, useState } from 'react';

import DatasetCreateVersionFormItem from '@/components/DatasetCreateVersionFormItem';
import { UploadButton } from '@/components/FileViewer/upload';
import LangTextItemForm from '@/components/LangTextItem/form';
import LevelTextItemForm from '@/components/LevelTextItem/form';
import RequiredMark from '@/components/RequiredMark';
import ContactSelectForm from '@/pages/Contacts/Components/select/form';
import SourceSelectForm from '@/pages/Sources/Components/select/form';
import { getRules } from '@/pages/Utils';
import type { ValidationIssueSdkDetail } from '@/pages/Utils/review';
import { useDatasetSdkValidationFormSupport } from '@/pages/Utils/validation/formSupport';
import { ProFormInstance } from '@ant-design/pro-components';
import { theme } from 'antd';
import { RcFile } from 'antd/es/upload';
import { FormattedMessage, useIntl } from 'umi';
import schema from '../sources_schema.json';
import { publicationTypeOptions } from './optiondata';

const SOURCE_SCHEMA_PATH_PREFIX = ['sourceDataSet'];

type Props = {
  lang: string;
  activeTabKey: string;
  formRef: React.RefObject<ProFormInstance | undefined>;
  onData: () => void;
  onTabChange: (key: string) => void;
  loadFiles: RcFile[];
  setLoadFiles: React.Dispatch<React.SetStateAction<RcFile[]>>;
  fileList: UploadFile[];
  setFileList: React.Dispatch<React.SetStateAction<UploadFile[]>>;
  formType?: string;
  showRules?: boolean;
  sdkValidationDetails?: ValidationIssueSdkDetail[];
  sdkValidationFocus?: ValidationIssueSdkDetail | null;
  validationIssueTabNames?: string[];
};

export const SourceForm: FC<Props> = ({
  lang,
  activeTabKey,
  formRef,
  onData,
  onTabChange,
  loadFiles,
  setLoadFiles,
  fileList,
  setFileList,
  formType,
  showRules = false,
  sdkValidationDetails = [],
  sdkValidationFocus = null,
  validationIssueTabNames = [],
}) => {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState('');
  const [showShortNameError, setShowShortNameError] = useState(false);
  const { token } = theme.useToken();
  const intl = useIntl();
  const { sdkValidationCountsByTab } = useDatasetSdkValidationFormSupport({
    activeTabKey,
    formRef,
    intl,
    sdkValidationDetails,
    sdkValidationFocus,
    schemaPathPrefix: SOURCE_SCHEMA_PATH_PREFIX,
    schemaRoot: schema,
    showRules,
  });
  const validationIssueTabs = useMemo(
    () => new Set(validationIssueTabNames),
    [validationIssueTabNames],
  );
  const handlePreview = async (file: UploadFile) => {
    if (file.originFileObj && isImage(file)) {
      const preview = file.preview || (await getBase64(file.originFileObj as FileType));
      setPreviewImage(preview);
      setPreviewOpen(true);
      return;
    }
    const locator = resolveFileLocator(file.uid);
    if (locator.kind === 'external') {
      window.open(locator.url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (locator.kind !== 'managed') return;
    const result = await getOriginalFileUrl(file.uid, file.name);
    setFileList((files) =>
      files.map((entry) =>
        entry.uid === file.uid
          ? {
              ...entry,
              ...result,
            }
          : entry,
      ),
    );
    if (!result.url) return;
    if (isImage(file)) {
      setPreviewImage(result.url);
      setPreviewOpen(true);
    } else {
      window.open(result.url, '_blank', 'noopener,noreferrer');
    }
  };

  const tabLabels = {
    administrativeInformation: (
      <FormattedMessage
        id='pages.source.edit.administrativeInformation'
        defaultMessage='Administrative information'
      />
    ),
    sourceInformation: (
      <FormattedMessage
        id='pages.source.edit.sourceInformation'
        defaultMessage='Source information'
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
      key: 'sourceInformation',
      tab: renderTabLabel('sourceInformation'),
    },
    {
      key: 'administrativeInformation',
      tab: renderTabLabel('administrativeInformation'),
    },
  ];
  const tabContent: { [key: string]: React.JSX.Element } = {
    sourceInformation: (
      <Space orientation='vertical' style={{ width: '100%' }}>
        <Card
          size='small'
          title={
            <RequiredMark
              showError={showShortNameError}
              label={
                <FormattedMessage
                  id='pages.source.edit.sourceInformation.shortName'
                  defaultMessage='Short name of source'
                />
              }
            />
          }
        >
          <LangTextItemForm
            name={['sourceInformation', 'dataSetInformation', 'common:shortName']}
            label={
              <FormattedMessage
                id='pages.source.edit.sourceInformation.shortName'
                defaultMessage='Short name of source'
              />
            }
            setRuleErrorState={setShowShortNameError}
            autoExpandRequired={(
              schema['sourceDataSet']['sourceInformation']['dataSetInformation'][
                'common:shortName'
              ]['rules'] ?? []
            ).some((rule) => rule.required)}
            rules={
              showRules
                ? getRules(
                    schema['sourceDataSet']['sourceInformation']['dataSetInformation'][
                      'common:shortName'
                    ]['rules'] ?? [],
                  )
                : []
            }
          />
        </Card>
        <br />
        <LevelTextItemForm
          name={[
            'sourceInformation',
            'dataSetInformation',
            'classificationInformation',
            'common:classification',
            'common:class',
          ]}
          formRef={formRef}
          lang={lang}
          dataType={'Source'}
          onData={onData}
          showRules={showRules}
          rules={
            showRules
              ? getRules(
                  schema['sourceDataSet']['sourceInformation']['dataSetInformation'][
                    'classificationInformation'
                  ]['common:classification']['common:class']['@classId']['rules'] ?? [],
                )
              : []
          }
        />
        <Form.Item
          label={
            <FormattedMessage
              id='pages.source.edit.sourceInformation.sourceCitation'
              defaultMessage='Source citation'
            />
          }
          name={['sourceInformation', 'dataSetInformation', 'sourceCitation']}
          rules={
            showRules
              ? getRules(
                  schema['sourceDataSet']['sourceInformation']['dataSetInformation'][
                    'sourceCitation'
                  ]['rules'] ?? [],
                )
              : []
          }
        >
          <Input />
        </Form.Item>
        <Form.Item
          label={
            <FormattedMessage
              id='pages.source.edit.sourceInformation.publicationType'
              defaultMessage='Publication type'
            />
          }
          name={['sourceInformation', 'dataSetInformation', 'publicationType']}
        >
          <Select options={publicationTypeOptions} />
        </Form.Item>
        {/* <br /> */}
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.source.edit.sourceInformation.sourceDescriptionOrComment'
              defaultMessage='Source description or comment'
            />
          }
        >
          <LangTextItemForm
            name={['sourceInformation', 'dataSetInformation', 'sourceDescriptionOrComment']}
            label={
              <FormattedMessage
                id='pages.source.edit.sourceInformation.sourceDescriptionOrComment'
                defaultMessage='Source description or comment'
              />
            }
          />
        </Card>
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
          <Upload
            name='avatar'
            className={fileViewerStyles.sourceUpload}
            styles={{ item: { height: 104 } }}
            isImageUrl={(file) =>
              (Boolean(file.originFileObj) || resolveFileLocator(file.uid).kind === 'managed') &&
              isImage(file)
            }
            showUploadList={{
              showPreviewIcon: (file) =>
                (Boolean(file.originFileObj) && isImage(file)) ||
                resolveFileLocator(file.uid).kind !== 'opaque',
            }}
            itemRender={(node, file) => {
              const state = (file as StorageFilePreview).previewState;
              const needsManagedAction =
                resolveFileLocator(file.uid).kind === 'managed' &&
                (state === 'unavailable' || (!file.url && !file.thumbUrl));
              const actionLabel =
                state === 'unavailable'
                  ? intl.formatMessage({
                      id: 'pages.file.preview.retry',
                      defaultMessage: 'Retry preview',
                    })
                  : intl.formatMessage({
                      id: 'pages.file.preview.open',
                      defaultMessage: 'Open file',
                    });
              return (
                <div>
                  {node}
                  <div style={{ position: 'relative', zIndex: 2, flex: 'none' }}>
                    <div>{filePreviewLabel(state, intl.formatMessage)}</div>
                    {needsManagedAction && (
                      <Button
                        type='link'
                        size='small'
                        aria-label={`${actionLabel}: ${file.name}`}
                        style={{
                          maxWidth: '100%',
                          height: 'auto',
                          whiteSpace: 'normal',
                          paddingInline: 0,
                        }}
                        onClick={() => void handlePreview(file)}
                      >
                        {actionLabel}
                      </Button>
                    )}
                  </div>
                </div>
              );
            }}
            listType='picture-card'
            fileList={fileList}
            onPreview={handlePreview}
            beforeUpload={(file) => {
              setLoadFiles([...loadFiles, file]);
              return false;
            }}
            onChange={({ fileList: newFileList }) => {
              setFileList(newFileList);
            }}
          >
            <UploadButton />
          </Upload>
          {previewImage && (
            <Image
              alt=''
              styles={{ root: { display: 'none' } }}
              preview={{
                open: previewOpen,
                onOpenChange: (open) => setPreviewOpen(open),
                afterOpenChange: (visible) => !visible && setPreviewImage(''),
              }}
              src={previewImage}
            />
          )}
        </Card>
        {/* <Form.Item
            label={
              <FormattedMessage
                id="pages.source.edit.sourceInformation.referenceToDigitalFile"
                defaultMessage="Reference To Digital File"
              />
            }
            name={['sourceInformation', 'dataSetInformation', 'referenceToDigitalFile', '@uri']}
          >
            <Input disabled={false} />
          </Form.Item> */}
        <br />
        <ContactSelectForm
          name={['sourceInformation', 'dataSetInformation', 'referenceToContact']}
          label={
            <FormattedMessage
              id='pages.source.edit.sourceInformation.referenceToContact'
              defaultMessage='Belongs to:'
            />
          }
          lang={lang}
          formRef={formRef}
          onData={onData}
        />
        <br />
        <SourceSelectForm
          label={
            <FormattedMessage
              id='pages.source.edit.sourceInformation.referenceToLogo'
              defaultMessage='Logo of organisation or source'
            />
          }
          name={['sourceInformation', 'dataSetInformation', 'referenceToLogo']}
          lang={lang}
          formRef={formRef}
          onData={onData}
        />
      </Space>
    ),
    administrativeInformation: (
      <Space orientation='vertical' style={{ width: '100%' }}>
        <Card
          size='small'
          title={
            <FormattedMessage
              id='pages.source.edit.administrativeInformation.dataEntryBy'
              defaultMessage='Data entry by'
            />
          }
        >
          <Form.Item
            required={false}
            label={
              <RequiredMark
                showError={false}
                label={
                  <FormattedMessage
                    id='pages.source.edit.administrativeInformation.timeStamp'
                    defaultMessage='Time stamp'
                  />
                }
              />
            }
            name={['administrativeInformation', 'dataEntryBy', 'common:timeStamp']}
            rules={
              showRules
                ? getRules(
                    schema['sourceDataSet']['administrativeInformation']['dataEntryBy'][
                      'common:timeStamp'
                    ]['rules'] ?? [],
                  )
                : []
            }
          >
            <Input disabled={true} style={{ color: token.colorTextDescription }} />
          </Form.Item>
          <SourceSelectForm
            defaultSourceName={formType === 'create' ? 'ILCD format' : undefined}
            name={['administrativeInformation', 'dataEntryBy', 'common:referenceToDataSetFormat']}
            label={
              <FormattedMessage
                id='pages.source.edit.administrativeInformation.referenceToDataSetFormat'
                defaultMessage='Data set format(s)'
              />
            }
            lang={lang}
            formRef={formRef}
            onData={onData}
            showRequiredLabel={true}
            rules={
              showRules
                ? getRules(
                    schema['sourceDataSet']['administrativeInformation']['dataEntryBy'][
                      'common:referenceToDataSetFormat'
                    ]['@refObjectId']['rules'] ?? [],
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
              id='pages.source.edit.administrativeInformation.publicationAndOwnership'
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
                    id='pages.source.edit.administrativeInformation.dataSetVersion'
                    defaultMessage='Data set version'
                  />
                }
              />
            }
            name={['administrativeInformation', 'publicationAndOwnership', 'common:dataSetVersion']}
            rules={getRules(
              schema['sourceDataSet']['administrativeInformation']['publicationAndOwnership'][
                'common:dataSetVersion'
              ]['rules'] ?? [],
            )}
          >
            <Input disabled={formType === 'edit'} />
          </DatasetCreateVersionFormItem>
          <ContactSelectForm
            label={
              <FormattedMessage
                id='pages.source.edit.administrativeInformation.referenceToOwnershipOfDataSet'
                defaultMessage='Owner of data set'
              />
            }
            name={[
              'administrativeInformation',
              'publicationAndOwnership',
              'common:referenceToOwnershipOfDataSet',
            ]}
            lang={lang}
            formRef={formRef}
            onData={onData}
            showRequiredLabel={true}
            rules={
              showRules
                ? getRules(
                    schema['sourceDataSet']['administrativeInformation']['publicationAndOwnership'][
                      'common:referenceToOwnershipOfDataSet'
                    ]['@refObjectId']['rules'] ?? [],
                  )
                : []
            }
          />
          <br />
          {/* <SourceSelectForm
            label={
              <FormattedMessage
                id='pages.source.edit.administrativeInformation.referenceToPrecedingDataSetVersion'
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
                id='pages.source.edit.administrativeInformation.permanentDataSetURI'
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
    ),
  };

  return (
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
  );
};
