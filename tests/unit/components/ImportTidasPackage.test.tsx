import ImportTidasPackage from '@/components/ImportTidasPackage';
import { submitTidasPackageImportTask } from '@/services/tidasPackage/taskCenter';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { message } from 'antd';

type ReactNode = import('react').ReactNode;

type MockMessage = Record<'success' | 'error' | 'info' | 'warning' | 'loading', jest.Mock>;

type ModalProps = {
  open?: boolean;
  children?: ReactNode;
  onOk?: () => void;
  onCancel?: () => void;
};

type UploadDraggerProps = {
  beforeUpload?: (file: File) => boolean;
  onRemove?: () => void;
  children?: ReactNode;
};

const OPEN_BUTTON_TEST_ID = 'import-open-button';
const MODAL_OK_TEST_ID = 'import-modal-ok';
const PICK_FILE_TEST_ID = 'import-pick-file';
const PICK_BAD_FILE_TEST_ID = 'import-pick-bad-file';
let mockLocale: string | undefined = 'zh-CN';

jest.mock('@ant-design/icons', () => ({
  CloudUploadOutlined: ({
    onClick,
    style,
  }: {
    onClick?: () => void;
    style?: React.CSSProperties;
  }) => <button type='button' data-testid={OPEN_BUTTON_TEST_ID} onClick={onClick} style={style} />,
  InboxOutlined: () => <span data-testid='inbox-icon' />,
}));

jest.mock('umi', () => ({
  FormattedMessage: ({
    defaultMessage,
    values,
  }: {
    defaultMessage: string;
    values?: Record<string, any>;
  }) => {
    if (!values) {
      return <span>{defaultMessage}</span>;
    }

    const rendered = Object.entries(values).reduce(
      (output, [key, value]) => output.replace(`{${key}}`, String(value)),
      defaultMessage,
    );

    return <span>{rendered}</span>;
  },
  useIntl: () => ({
    locale: mockLocale,
    formatMessage: (
      { defaultMessage }: { defaultMessage: string },
      values?: Record<string, any>,
    ) => {
      if (!values) {
        return defaultMessage;
      }

      return Object.entries(values).reduce(
        (output, [key, value]) => output.replace(`{${key}}`, String(value)),
        defaultMessage,
      );
    },
  }),
}));

jest.mock('antd', () => {
  const actual = jest.requireActual('antd');
  const mockMessage: MockMessage = {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    loading: jest.fn(),
  };

  const modalApi = {
    info: jest.fn(),
    error: jest.fn(),
  };

  const Tooltip = ({ children }: { children?: ReactNode }) => <>{children}</>;
  const ModalComponent = ({ open, children, onOk, onCancel }: ModalProps) =>
    open ? (
      <div data-testid='import-modal'>
        <button type='button' data-testid={MODAL_OK_TEST_ID} onClick={onOk} />
        <button type='button' data-testid='import-modal-cancel' onClick={onCancel} />
        {children}
      </div>
    ) : null;

  const uploadFile = new File(['zip'], 'package.zip', { type: 'application/zip' });
  const badFile = new File(['txt'], 'package.txt', { type: 'text/plain' });
  const Dragger = ({ beforeUpload, onRemove, children }: UploadDraggerProps) => (
    <div>
      <button
        type='button'
        data-testid={PICK_FILE_TEST_ID}
        onClick={() => {
          beforeUpload?.(uploadFile);
        }}
      />
      <button
        type='button'
        data-testid={PICK_BAD_FILE_TEST_ID}
        onClick={() => {
          beforeUpload?.(badFile);
        }}
      />
      <button
        type='button'
        data-testid='remove-file'
        onClick={() => {
          onRemove?.();
        }}
      />
      {children}
    </div>
  );

  const Upload = {
    Dragger,
  };
  const Modal = Object.assign(ModalComponent, modalApi);
  const App = require('../../mocks/antdApp').createAntdAppMock({
    message: mockMessage,
    modal: Modal,
  });

  return {
    ...actual,
    App,
    Modal,
    Tooltip,
    Upload,
    message: mockMessage,
  };
});

jest.mock('@/services/tidasPackage/taskCenter', () => ({
  submitTidasPackageImportTask: jest.fn(),
}));

const mockedImportTidasPackageApi = jest.mocked(submitTidasPackageImportTask);
const mockMessage = message as unknown as MockMessage;

describe('ImportTidasPackage Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocale = 'zh-CN';
  });

  it('warns when import is triggered without selecting a file', async () => {
    render(<ImportTidasPackage />);

    expect(screen.getByTestId(OPEN_BUTTON_TEST_ID).style.opacity).toBe('0.5');
    expect(screen.getByTestId(OPEN_BUTTON_TEST_ID).style.fontSize).toBe('16px');

    fireEvent.click(screen.getByTestId(OPEN_BUTTON_TEST_ID));
    fireEvent.click(screen.getByTestId(MODAL_OK_TEST_ID));

    await waitFor(() => {
      expect(mockMessage.warning).toHaveBeenCalledTimes(1);
    });

    expect(mockedImportTidasPackageApi).not.toHaveBeenCalled();
  });

  it('shows API import guidance inside the modal', () => {
    render(<ImportTidasPackage />);

    fireEvent.click(screen.getByTestId(OPEN_BUTTON_TEST_ID));

    expect(screen.getByText('API import')).toBeInTheDocument();
    expect(
      screen.getByText(
        'See the English API import documentation for the full request flow and integration details.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open English API import docs' })).toHaveAttribute(
      'href',
      'https://docs.tiangong.earth/docs/openapi/tidas-package-import',
    );
  });

  it('uses the english API import docs link for english locale', () => {
    mockLocale = 'en-US';

    render(<ImportTidasPackage />);

    fireEvent.click(screen.getByTestId(OPEN_BUTTON_TEST_ID));

    expect(screen.getByRole('link', { name: 'Open English API import docs' })).toHaveAttribute(
      'href',
      'https://docs.tiangong.earth/en/docs/openapi/tidas-package-import',
    );
  });

  it('uses the english API import docs link for german locale', () => {
    mockLocale = 'de-DE';

    render(<ImportTidasPackage />);

    fireEvent.click(screen.getByTestId(OPEN_BUTTON_TEST_ID));

    expect(screen.getByRole('link', { name: 'Open English API import docs' })).toHaveAttribute(
      'href',
      'https://docs.tiangong.earth/en/docs/openapi/tidas-package-import',
    );
  });

  it('uses the english API import docs fallback for french locale', () => {
    mockLocale = 'fr-FR';

    render(<ImportTidasPackage />);

    fireEvent.click(screen.getByTestId(OPEN_BUTTON_TEST_ID));

    expect(screen.getByRole('link', { name: 'Open English API import docs' })).toHaveAttribute(
      'href',
      'https://docs.tiangong.earth/en/docs/openapi/tidas-package-import',
    );
  });

  it('falls back to the default docs link when locale is missing', () => {
    mockLocale = undefined;

    render(<ImportTidasPackage />);

    fireEvent.click(screen.getByTestId(OPEN_BUTTON_TEST_ID));

    expect(screen.getByRole('link', { name: 'Open English API import docs' })).toHaveAttribute(
      'href',
      'https://docs.tiangong.earth/docs/openapi/tidas-package-import',
    );
  });

  it('closes after enqueue and leaves completion notifications to Task Center', async () => {
    const onImported = jest.fn();
    mockedImportTidasPackageApi.mockResolvedValue(undefined);
    render(<ImportTidasPackage onImported={onImported} />);
    fireEvent.click(screen.getByTestId(OPEN_BUTTON_TEST_ID));
    fireEvent.click(screen.getByTestId(PICK_FILE_TEST_ID));
    fireEvent.click(screen.getByTestId(MODAL_OK_TEST_ID));
    await waitFor(() =>
      expect(mockMessage.success).toHaveBeenCalledWith(
        'Import submitted. View progress and results in Task Center.',
      ),
    );
    expect(mockedImportTidasPackageApi).toHaveBeenCalledWith(expect.any(File), onImported);
    expect(onImported).not.toHaveBeenCalled();
    expect(screen.queryByTestId('import-modal')).not.toBeInTheDocument();
  });

  it('rejects non-zip file selections before uploading', async () => {
    render(<ImportTidasPackage />);
    fireEvent.click(screen.getByTestId(OPEN_BUTTON_TEST_ID));
    fireEvent.click(screen.getByTestId(PICK_BAD_FILE_TEST_ID));

    expect(mockMessage.error).toHaveBeenCalledWith('Only ZIP packages are supported');

    fireEvent.click(screen.getByTestId(MODAL_OK_TEST_ID));
    await waitFor(() => {
      expect(mockMessage.warning).toHaveBeenCalledTimes(1);
    });
    expect(mockedImportTidasPackageApi).not.toHaveBeenCalled();
  });

  it('clears selected file on remove and cancel action', async () => {
    render(<ImportTidasPackage />);
    fireEvent.click(screen.getByTestId(OPEN_BUTTON_TEST_ID));
    fireEvent.click(screen.getByTestId(PICK_FILE_TEST_ID));
    fireEvent.click(screen.getByTestId('remove-file'));
    fireEvent.click(screen.getByTestId(MODAL_OK_TEST_ID));

    await waitFor(() => {
      expect(mockMessage.warning).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByTestId('import-modal-cancel'));
    expect(screen.queryByTestId('import-modal')).not.toBeInTheDocument();
  });

  it('keeps the file available when submission fails', async () => {
    mockedImportTidasPackageApi.mockRejectedValue(new Error('upload failed'));
    render(<ImportTidasPackage />);
    fireEvent.click(screen.getByTestId(OPEN_BUTTON_TEST_ID));
    fireEvent.click(screen.getByTestId(PICK_FILE_TEST_ID));
    fireEvent.click(screen.getByTestId(MODAL_OK_TEST_ID));
    await waitFor(() =>
      expect(mockMessage.error).toHaveBeenCalledWith('Failed to import TIDAS package'),
    );
    expect(screen.getByTestId('import-modal')).toBeInTheDocument();
  });
});
