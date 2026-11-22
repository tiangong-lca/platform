// @ts-nocheck
import { lifeCycleModelConnectionOptions } from '@/pages/LifeCycleModels/Components/graphConnectionOptions';
import LifeCycleModelView from '@/pages/LifeCycleModels/Components/view';
import userEvent from '@testing-library/user-event';
import { act, renderWithProviders, screen, waitFor } from '../../../../helpers/testUtils';

const toText = (node: any): string => {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(toText).join('');
  if (node?.props?.defaultMessage) return node.props.defaultMessage;
  if (node?.props?.id) return node.props.id;
  if (node?.props?.children) return toText(node.props.children);
  return '';
};

let latestToolbarProps: any = null;
let latestGraphProps: any = null;
let latestDrawerProps: any = null;
let mockLatestContentStyle: any = null;
let mockLatestLayoutStyles: any[] = [];

jest.mock('umi', () => ({
  __esModule: true,
  FormattedMessage: ({ defaultMessage, id }: any) => defaultMessage ?? id,
}));

jest.mock('@ant-design/icons', () => ({
  __esModule: true,
  AppstoreOutlined: () => <span>appstore-icon</span>,
  CloseOutlined: () => <span>close-icon</span>,
  ProfileOutlined: () => <span>profile-icon</span>,
}));

jest.mock('antd', () => {
  const React = require('react');

  const ConfigProvider = ({ children }: any) => <div>{children}</div>;

  const Button = ({ children, onClick, disabled = false, icon, ...rest }: any) => (
    <button type='button' disabled={disabled} onClick={disabled ? undefined : onClick} {...rest}>
      {icon}
      {toText(children)}
    </button>
  );

  const Tooltip = ({ title, children }: any) => {
    const label = toText(title);
    if (React.isValidElement(children)) {
      return React.cloneElement(children, {
        'aria-label': children.props['aria-label'] ?? label,
      });
    }
    return <span title={label}>{children}</span>;
  };

  const Drawer = ({ open, title, extra, children, onClose, getContainer, ...props }: any) => {
    if (!open) return null;
    latestDrawerProps = props;
    return (
      <section
        role='dialog'
        aria-label={toText(title) || 'drawer'}
        data-container={String(Boolean(getContainer?.()))}
      >
        <header>{extra}</header>
        <div>{children}</div>
        <button type='button' onClick={onClose}>
          mask-close
        </button>
      </section>
    );
  };

  const Layout = ({ children, style }: any) => {
    mockLatestLayoutStyles.push(style);
    return <div>{children}</div>;
  };
  Layout.Sider = ({ children }: any) => <aside>{children}</aside>;
  Layout.Content = ({ children, style }: any) => {
    mockLatestContentStyle = style;
    return <main>{children}</main>;
  };

  const theme = {
    useToken: () => ({
      token: {
        colorBgBase: '#fff',
      },
    }),
  };

  return {
    __esModule: true,
    Button,
    ConfigProvider,
    Drawer,
    Layout,
    Tooltip,
    theme,
  };
});

jest.mock('@/components/X6Graph', () => ({
  __esModule: true,
  default: (props: any) => {
    latestGraphProps = props;
    return <div data-testid='x6-graph'>graph</div>;
  },
}));

jest.mock('@/contexts/graphContext', () => ({
  __esModule: true,
  GraphProvider: ({ children }: any) => <div data-testid='graph-provider'>{children}</div>,
}));

jest.mock('@/pages/LifeCycleModels/Components/toolbar/viewIndex', () => ({
  __esModule: true,
  default: (props: any) => {
    latestToolbarProps = props;
    return <div data-testid='toolbar-view'>toolbar-view</div>;
  },
}));

describe('LifeCycleModelView', () => {
  beforeEach(() => {
    latestToolbarProps = null;
    latestGraphProps = null;
    latestDrawerProps = null;
    mockLatestContentStyle = null;
    mockLatestLayoutStyles = [];
  });

  it('shows the requested model identity and retries a failed read', async () => {
    renderWithProviders(
      <LifeCycleModelView id='model-1' version='01.01.023' lang='en' buttonType='icon' autoOpen />,
    );
    await waitFor(() => expect(latestToolbarProps).toBeTruthy());
    act(() => latestToolbarProps.onReadProblem('unavailable'));
    expect(screen.getByRole('alert')).toHaveTextContent('01.01.023');
    expect(screen.getByRole('alert')).toHaveTextContent('model-1');
    expect(screen.queryByTestId('x6-graph')).not.toBeInTheDocument();
    act(() => latestToolbarProps.onReadProblem('failed'));
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(latestToolbarProps.readAttempt).toBe(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not open the tool icon entry when disabled', async () => {
    renderWithProviders(
      <LifeCycleModelView
        id='model-tool'
        version='1.0.0'
        buttonType='toolIcon'
        lang='en'
        disabled
      />,
    );

    const trigger = screen.getByRole('button', { name: /life cycle model information/i });
    expect(trigger).toBeDisabled();

    await userEvent.click(trigger);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not open the iconModel entry when disabled', async () => {
    renderWithProviders(
      <LifeCycleModelView id='model-1' version='1.0.0' buttonType='iconModel' lang='en' disabled />,
    );

    const trigger = screen.getByRole('button', { name: /view/i });
    expect(trigger).toBeDisabled();

    await userEvent.click(trigger);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the drawer and forwards view props to toolbar', async () => {
    const actionRef = { current: { reload: jest.fn() } };

    renderWithProviders(
      <LifeCycleModelView
        id='model-1'
        version='1.0.0'
        buttonType='icon'
        lang='en'
        actionRef={actionRef as any}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /view/i }));

    expect(screen.getByRole('dialog', { name: /view model/i })).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: /view model/i })).toHaveAttribute(
      'data-container',
      'true',
    );
    expect(screen.getByTestId('graph-provider')).toBeInTheDocument();
    expect(screen.getByTestId('x6-graph')).toBeInTheDocument();
    expect(latestDrawerProps).toMatchObject({
      classNames: {
        body: 'tg-lifecycle-model-drawer-body',
        section: 'tg-lifecycle-model-drawer-section',
        wrapper: 'tg-lifecycle-model-drawer-wrapper',
      },
      rootStyle: { maxWidth: '100vw', overflow: 'hidden' },
      size: '100vw',
      styles: {
        body: { display: 'flex', minHeight: 0, minWidth: 0, overflow: 'hidden' },
        section: { minWidth: 0, overflow: 'hidden', width: '100%' },
        wrapper: { maxWidth: '100vw', overflow: 'hidden', width: '100vw' },
      },
    });
    expect(mockLatestLayoutStyles).toContainEqual(
      expect.objectContaining({
        flex: '1 1 auto',
        height: 'auto',
        maxHeight: '100%',
        minHeight: 0,
        overflow: 'hidden',
      }),
    );
    expect(mockLatestLayoutStyles).toContainEqual({
      height: '100%',
      minHeight: 0,
      minWidth: 0,
      overflow: 'hidden',
    });
    expect(mockLatestContentStyle).toEqual({
      height: '100%',
      minHeight: 0,
      minWidth: 0,
      overflow: 'hidden',
      position: 'relative',
    });
    expect(latestGraphProps?.transformOptions).toEqual({
      resizing: {
        enabled: true,
        orthogonal: false,
      },
    });
    expect(latestGraphProps?.connectionOptions).toEqual(lifeCycleModelConnectionOptions);

    await waitFor(() =>
      expect(latestToolbarProps).toMatchObject({
        id: 'model-1',
        version: '1.0.0',
        lang: 'en',
        drawerVisible: true,
        actionRef,
      }),
    );

    await userEvent.click(screen.getByRole('button', { name: /close-icon/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens from the tool icon entry when enabled', async () => {
    renderWithProviders(
      <LifeCycleModelView id='model-2' version='2.0.0' buttonType='toolIcon' lang='en' />,
    );

    await userEvent.click(screen.getByRole('button', { name: /life cycle model information/i }));

    expect(screen.getByRole('dialog', { name: /view model/i })).toBeInTheDocument();
    await waitFor(() =>
      expect(latestToolbarProps).toMatchObject({
        id: 'model-2',
        version: '2.0.0',
      }),
    );
  });

  it('opens from the iconModel entry when enabled', async () => {
    renderWithProviders(
      <LifeCycleModelView id='model-3' version='3.0.0' buttonType='iconModel' lang='en' />,
    );

    await userEvent.click(screen.getByRole('button', { name: /view/i }));

    expect(screen.getByRole('dialog', { name: /view model/i })).toBeInTheDocument();
    await waitFor(() =>
      expect(latestToolbarProps).toMatchObject({
        id: 'model-3',
        version: '3.0.0',
      }),
    );
  });

  it('opens from the default text button entry', async () => {
    renderWithProviders(
      <LifeCycleModelView id='model-4' version='4.0.0' buttonType='text' lang='en' />,
    );

    await userEvent.click(screen.getByRole('button', { name: /^view$/i }));

    expect(screen.getByRole('dialog', { name: /view model/i })).toBeInTheDocument();
    await waitFor(() =>
      expect(latestToolbarProps).toMatchObject({
        id: 'model-4',
        version: '4.0.0',
      }),
    );
  });

  it('opens automatically without rendering a trigger when autoOpen is enabled', async () => {
    const onDrawerClose = jest.fn();

    renderWithProviders(
      <LifeCycleModelView
        id='model-auto'
        version='6.0.0'
        buttonType='icon'
        lang='en'
        autoOpen
        onDrawerClose={onDrawerClose}
      />,
    );

    expect(screen.queryByRole('button', { name: /^view$/i })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: /view model/i })).toBeInTheDocument(),
    );
    expect(latestToolbarProps).toMatchObject({
      id: 'model-auto',
      version: '6.0.0',
      drawerVisible: true,
    });

    await userEvent.click(screen.getByRole('button', { name: /mask-close/i }));
    expect(onDrawerClose).toHaveBeenCalledTimes(1);
  });

  it('closes through the drawer mask-close action', async () => {
    renderWithProviders(
      <LifeCycleModelView id='model-5' version='5.0.0' buttonType='text' lang='en' />,
    );

    await userEvent.click(screen.getByRole('button', { name: /^view$/i }));
    expect(screen.getByRole('dialog', { name: /view model/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /mask-close/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
