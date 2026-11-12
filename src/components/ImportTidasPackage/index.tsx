import HeaderActionIcon from '@/components/HeaderActionIcon';
import { useAntdAppApi } from '@/contexts/AntdAppContext';
import {
  getTidasPackageTaskGeneration,
  getTidasPackageTaskOwnerId,
  submitTidasPackageImportTask,
} from '@/services/tidasPackage/taskCenter';
import { getDocumentationUrl } from '@/services/general/runtimeLocale';
import { CloudUploadOutlined, InboxOutlined } from '@ant-design/icons';
import { Alert, Button, Flex, Modal, Typography, Upload, theme } from 'antd';
import type { RcFile, UploadProps } from 'antd/es/upload';
import type { FC } from 'react';
import { useRef, useState } from 'react';
import { FormattedMessage, useIntl } from 'umi';

type Props = {
  onImported?: () => void;
  embedded?: boolean;
};

const TIDAS_PACKAGE_IMPORT_DOCS_PATH = '/docs/openapi/tidas-package-import';

const getDocsUrl = (locale?: string | null) =>
  `${getDocumentationUrl(locale)}${TIDAS_PACKAGE_IMPORT_DOCS_PATH}`;

const ImportTidasPackage: FC<Props> = ({ onImported, embedded = false }) => {
  const { message } = useAntdAppApi();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const importSequenceRef = useRef(0);
  const [fileList, setFileList] = useState<RcFile[]>([]);
  const intl = useIntl();
  const { token } = theme.useToken();
  const docsUrl = getDocsUrl(intl.locale);

  const handleImport = async () => {
    if (fileList.length === 0) {
      message.warning(
        intl.formatMessage({
          id: 'component.tidasPackage.import.noFile',
          defaultMessage: 'Please select a ZIP package to import',
        }),
      );
      return;
    }

    const generation = getTidasPackageTaskGeneration();
    const ownerId = getTidasPackageTaskOwnerId();
    const sequence = ++importSequenceRef.current;
    const isCurrent = () =>
      sequence === importSequenceRef.current &&
      generation === getTidasPackageTaskGeneration() &&
      ownerId === getTidasPackageTaskOwnerId();
    try {
      setLoading(true);
      await submitTidasPackageImportTask(fileList[0], onImported);
      if (!isCurrent()) return;
      message.success(
        intl.formatMessage({
          id: 'component.tidasPackage.import.queued',
          defaultMessage: 'Import submitted. View progress and results in Task Center.',
        }),
      );
      setOpen(false);
      setFileList([]);
    } catch (_error) {
      if (!isCurrent()) return;
      message.error(
        intl.formatMessage({
          id: 'component.tidasPackage.import.error',
          defaultMessage: 'Failed to import TIDAS package',
        }),
      );
    } finally {
      if (sequence === importSequenceRef.current) setLoading(false);
    }
  };

  const uploadProps: UploadProps = {
    accept: '.zip',
    multiple: false,
    maxCount: 1,
    fileList: fileList as any,
    beforeUpload: (file) => {
      if (!file.name.toLowerCase().endsWith('.zip')) {
        message.error(
          intl.formatMessage({
            id: 'component.tidasPackage.import.fileTypeError',
            defaultMessage: 'Only ZIP packages are supported',
          }),
        );
        return false;
      }

      setFileList([file]);
      return false;
    },
    onRemove: () => {
      setFileList([]);
    },
  };

  const content = (
    <Flex vertical gap={token.marginMD}>
      <Upload.Dragger {...uploadProps} prefixCls='tg-tidas-import-upload'>
        <p className='tg-tidas-import-upload-drag-icon'>
          <InboxOutlined />
        </p>
        <p className='tg-tidas-import-upload-text'>
          <FormattedMessage
            id='component.tidasPackage.import.uploadText'
            defaultMessage='Click or drag a ZIP package to this area to upload'
          />
        </p>
        <p className='tg-tidas-import-upload-hint'>
          <FormattedMessage
            id='component.tidasPackage.import.uploadHint'
            defaultMessage='The package will be validated before any data is imported'
          />
        </p>
      </Upload.Dragger>
      <Alert
        description={
          <Flex vertical gap={token.marginXXS}>
            <Typography.Text>
              <FormattedMessage
                id='component.tidasPackage.import.apiGuide.summary'
                defaultMessage='See the English API import documentation for the full request flow and integration details.'
              />
            </Typography.Text>
            <Typography.Link href={docsUrl} rel='noreferrer' target='_blank'>
              <FormattedMessage
                id='component.tidasPackage.import.apiGuide.docs'
                defaultMessage='Open English API import docs'
              />
            </Typography.Link>
          </Flex>
        }
        title={
          <FormattedMessage
            id='component.tidasPackage.import.apiGuide.title'
            defaultMessage='API import'
          />
        }
        showIcon
        type='info'
      />
    </Flex>
  );
  if (embedded)
    return (
      <Flex vertical gap={token.marginMD}>
        {content}
        <Button type='primary' loading={loading} disabled={!fileList.length} onClick={handleImport}>
          {intl.formatMessage({
            id: 'component.tidasPackage.import.confirm',
            defaultMessage: 'Import',
          })}
        </Button>
      </Flex>
    );

  return (
    <>
      <HeaderActionIcon
        aria-label={intl.formatMessage({
          id: 'component.tidasPackage.import.tooltip',
          defaultMessage: 'Import TIDAS ZIP Package',
        })}
        title={
          <FormattedMessage
            id='component.tidasPackage.import.tooltip'
            defaultMessage='Import TIDAS ZIP Package'
          />
        }
        icon={<CloudUploadOutlined />}
        onClick={() => setOpen(true)}
      />
      <Modal
        title={intl.formatMessage({
          id: 'component.tidasPackage.import.title',
          defaultMessage: 'Import TIDAS ZIP Package',
        })}
        open={open}
        confirmLoading={loading}
        onOk={handleImport}
        onCancel={() => {
          if (!loading) {
            setOpen(false);
            setFileList([]);
          }
        }}
        okText={intl.formatMessage({
          id: 'component.tidasPackage.import.confirm',
          defaultMessage: 'Import',
        })}
        cancelText={intl.formatMessage({
          id: 'component.tidasPackage.cancel',
          defaultMessage: 'Cancel',
        })}
      >
        {content}
      </Modal>
    </>
  );
};

export default ImportTidasPackage;
