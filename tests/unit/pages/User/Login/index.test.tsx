// @ts-nocheck
let mockBrand = 'tiangong';
jest.mock('../../../../../config/brandProfile', () => ({
  ...jest.requireActual('../../../../../config/brandProfile'),
  get brandProfile() {
    return jest.requireActual('../../../../../config/brandProfile').resolveBrandProfile(mockBrand);
  },
}));

import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const toText = (node: any): string => {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(toText).join('');
  if (node?.props?.defaultMessage) return node.props.defaultMessage;
  if (node?.props?.id) return node.props.id;
  if (node?.props?.children) return toText(node.props.children);
  return '';
};

// eslint-disable-next-line no-var
var mockHistory: any = { push: jest.fn() };
// eslint-disable-next-line no-var
var mockLocation = { pathname: '/', search: '' };
// eslint-disable-next-line no-var
var mockLogin: jest.Mock = jest.fn();
// eslint-disable-next-line no-var
var mockMessageApi: any = {
  open: jest.fn(),
  success: jest.fn(),
  error: jest.fn(),
};
// eslint-disable-next-line no-var
var mockUseModelState: any = {
  initialState: {
    fetchUserInfo: jest.fn(),
  },
  setInitialState: undefined,
};
// eslint-disable-next-line no-var
var mockSetInitialState: jest.Mock = jest.fn((updater: any) => {
  if (typeof updater === 'function') {
    mockUseModelState = updater(mockUseModelState);
  } else {
    mockUseModelState = updater;
  }
});
// eslint-disable-next-line no-var
var mockSignUp: jest.Mock = jest.fn();
// eslint-disable-next-line no-var
var mockPasswordFields: Record<string, any> = {};
// eslint-disable-next-line no-var
var mockGetLocalizedAppTitle: jest.Mock = jest.fn();
// eslint-disable-next-line no-var
var mockGetLocalizedLoginSubtitle: jest.Mock = jest.fn();
// eslint-disable-next-line no-var
var mockLocale = 'en-US';

mockUseModelState.setInitialState = (...args: any[]) => mockSetInitialState(...args);

jest.mock('umi', () => {
  const React = require('react');

  return {
    __esModule: true,
    Helmet: ({ children }: any) => <>{children}</>,
    Link: ({ children, to, ...props }: any) => (
      <a data-umi-to={to} href={to} {...props}>
        {toText(children)}
      </a>
    ),
    history: mockHistory,
    useLocation: () => mockLocation,
    useIntl: () => ({
      locale: mockLocale,
      formatMessage: ({ defaultMessage, id }: any) => {
        const germanMessages: Record<string, string> = {
          'pages.login.termsOfUse.englishFallbackLabel': 'Nutzungsbedingungen (Englisch)',
          'pages.login.privacyNotice.englishFallbackLabel': 'Datenschutzhinweis (Englisch)',
        };
        const frenchMessages: Record<string, string> = {
          'pages.login.termsOfUse.englishFallbackLabel': 'Conditions d’utilisation (en anglais)',
          'pages.login.privacyNotice.englishFallbackLabel': 'Avis de confidentialité (en anglais)',
        };
        return (
          (mockLocale === 'de-DE' ? germanMessages[id] : undefined) ??
          (mockLocale === 'fr-FR' ? frenchMessages[id] : undefined) ??
          defaultMessage ??
          id
        );
      },
    }),
    useModel: () => mockUseModelState,
  };
});

jest.mock('@umijs/max', () => ({
  __esModule: true,
  Helmet: ({ children }: any) => <>{children}</>,
  Link: ({ children, to, ...props }: any) => (
    <a data-umi-to={to} href={to} {...props}>
      {toText(children)}
    </a>
  ),
  FormattedMessage: ({ defaultMessage, id, values }: any) => {
    const React = require('react');
    const baseText = defaultMessage ?? id;
    if (!values) {
      return baseText;
    }

    const placeholderPattern = new RegExp(
      `(${Object.keys(values)
        .map((key) => `\\{${key}\\}`)
        .join('|')})`,
      'gu',
    );
    const children = baseText.split(placeholderPattern).map((part: string, index: number) => {
      const key = part.startsWith('{') && part.endsWith('}') ? part.slice(1, -1) : undefined;
      return key && key in values
        ? React.createElement(React.Fragment, { key: `${key}-${index}` }, values[key])
        : part;
    });

    return React.createElement(React.Fragment, null, ...children);
  },
  history: mockHistory,
  useLocation: () => mockLocation,
  useIntl: () => ({
    locale: mockLocale,
    formatMessage: ({ defaultMessage, id }: any) => {
      const germanMessages: Record<string, string> = {
        'pages.login.termsOfUse.englishFallbackLabel': 'Nutzungsbedingungen (Englisch)',
        'pages.login.privacyNotice.englishFallbackLabel': 'Datenschutzhinweis (Englisch)',
      };
      const frenchMessages: Record<string, string> = {
        'pages.login.termsOfUse.englishFallbackLabel': 'Conditions d’utilisation (en anglais)',
        'pages.login.privacyNotice.englishFallbackLabel': 'Avis de confidentialité (en anglais)',
      };
      return (
        (mockLocale === 'de-DE' ? germanMessages[id] : undefined) ??
        (mockLocale === 'fr-FR' ? frenchMessages[id] : undefined) ??
        defaultMessage ??
        id
      );
    },
  }),
  useModel: () => mockUseModelState,
}));

jest.mock('@/services/auth', () => {
  return {
    __esModule: true,
    login: (...args: any[]) => mockLogin(...args),
    signUp: (...args: any[]) => mockSignUp(...args),
  };
});

jest.mock('../../../../../config/branding', () => ({
  __esModule: true,
  getBrandTheme: (isDarkMode: boolean) => ({
    colorPrimary: isDarkMode ? '#111111' : '#1677ff',
    logo: isDarkMode ? 'dark-logo' : 'light-logo',
  }),
}));

jest.mock('../../../../../config/defaultSettings', () => ({
  __esModule: true,
  defaultAppTitle: 'Tiangong LCA',
  defaultLoginSubtitle: 'Sustainable life cycle data',
  getLocalizedAppTitle: (...args: any[]) => mockGetLocalizedAppTitle(...args),
  getLocalizedLoginSubtitle: (...args: any[]) => mockGetLocalizedLoginSubtitle(...args),
}));

jest.mock('@/components', () => ({
  __esModule: true,
  Footer: () => <div data-testid='footer' />,
}));

jest.mock('@/contexts/AntdThemeSync', () => ({
  __esModule: true,
  AntdThemeSync: () => null,
}));

jest.mock('@/pages/User/Login/Components/LoginTopActions', () => ({
  __esModule: true,
  default: ({ isDarkMode, onDarkModeToggle }: any) => (
    <div data-testid='login-top-actions'>
      <span>{isDarkMode ? 'dark' : 'light'}</span>
      <button type='button' onClick={onDarkModeToggle}>
        toggle-dark-mode
      </button>
    </div>
  ),
}));

jest.mock('@ant-design/icons', () => ({
  __esModule: true,
  LockOutlined: () => <span>lock-icon</span>,
  MailOutlined: () => <span>mail-icon</span>,
}));

jest.mock('@ant-design/pro-components', () => {
  const React = require('react');

  const LoginForm = ({
    children,
    onFinish,
    submitter,
    initialValues,
    formRef,
    title,
    subTitle,
  }: any) => {
    React.useEffect(() => {
      if (formRef) {
        formRef.current = {
          validateFields: jest.fn().mockResolvedValue({
            email: 'user@test.com',
            password: 'Secret123!',
            confirmPassword: 'Secret123!',
            autoLogin: true,
          }),
        };
      }
    }, [formRef]);

    return (
      <div data-testid='login-form'>
        <div data-testid='initial-values'>{JSON.stringify(initialValues)}</div>
        <div data-testid='login-title'>{toText(title)}</div>
        <div data-testid='login-subtitle'>{toText(subTitle)}</div>
        {children}
        {submitter !== false ? (
          <button
            type='button'
            data-testid='login-submit'
            disabled={submitter?.submitButtonProps?.loading}
            onClick={() =>
              onFinish?.({
                email: 'user@test.com',
                password: 'Secret123!',
                autoLogin: true,
              })
            }
          >
            submit-login
          </button>
        ) : null}
      </div>
    );
  };

  const ProConfigProvider = ({ children }: any) => <div>{children}</div>;
  const ProFormCheckbox = ({ children }: any) => <label>{children}</label>;
  const ProFormText = ({ placeholder }: any) => <input placeholder={toText(placeholder)} />;
  ProFormText.Password = (props: any) => {
    if (props?.name) {
      mockPasswordFields[props.name] = props;
    }
    return <input placeholder={toText(props.placeholder)} type='password' />;
  };
  const ProLayout = ({ children }: any) => <div>{children}</div>;

  return {
    __esModule: true,
    LoginForm,
    ProConfigProvider,
    ProFormCheckbox,
    ProFormText,
    ProLayout,
  };
});

jest.mock('antd', () => {
  const React = require('react');

  const Alert = ({ title }: any) => <div role='alert'>{title}</div>;
  const App = ({ children }: any) => <div>{children}</div>;
  App.useApp = () => ({ message: mockMessageApi, modal: {}, notification: {} });
  const Button = ({ children, onClick, disabled, loading }: any) => (
    <button
      type='button'
      disabled={disabled || loading}
      onClick={() => {
        if (!disabled && !loading) {
          onClick?.();
        }
      }}
    >
      {toText(children)}
    </button>
  );
  const ConfigProvider = ({ children }: any) => <div>{children}</div>;
  const Tabs = ({ items = [], activeKey, onChange }: any) => (
    <div data-testid='tabs'>
      {items.map((item: any) => (
        <button key={item.key} type='button' onClick={() => onChange?.(item.key)}>
          {item.key === activeKey ? `[active] ${toText(item.label)}` : toText(item.label)}
        </button>
      ))}
    </div>
  );
  const Typography = {
    Link: ({ children, href, ...props }: any) => (
      <a href={href} {...props}>
        {toText(children)}
      </a>
    ),
  };
  const message = {
    useMessage: () => [mockMessageApi, <div key='holder' data-testid='message-holder' />],
  };
  const theme = {
    darkAlgorithm: 'dark',
    defaultAlgorithm: 'default',
    useToken: () => ({
      token: {
        borderRadius: 8,
        colorError: '#ff4d4f',
        colorSuccess: '#52c41a',
        colorWarning: '#faad14',
      },
    }),
  };

  return {
    __esModule: true,
    Alert,
    App,
    Button,
    ConfigProvider,
    Tabs,
    Typography,
    message,
    theme,
  };
});

const LoginPage = require('@/pages/User/Login').default;

describe('Login page', () => {
  beforeEach(() => {
    mockBrand = 'tiangong';
    jest.clearAllMocks();
    mockPasswordFields = {};
    mockGetLocalizedAppTitle.mockReset();
    mockGetLocalizedLoginSubtitle.mockReset();
    mockGetLocalizedAppTitle.mockReturnValue('Tiangong LCA');
    mockGetLocalizedLoginSubtitle.mockReturnValue('Sustainable life cycle data');
    mockLocale = 'en-US';
    window.localStorage.clear();
    window.localStorage.setItem('isDarkMode', 'false');
    mockLocation = { pathname: '/', search: '' };
    mockLogin.mockResolvedValue({ status: 'ok' });
    mockSignUp.mockResolvedValue({ status: 'ok' });
    mockUseModelState.initialState = {
      fetchUserInfo: jest.fn().mockResolvedValue({ name: 'Current User' }),
    };
    mockUseModelState.setInitialState = (...args: any[]) => mockSetInitialState(...args);
  });

  it('uses the Atlas split presentation while retaining the shared login flow', async () => {
    mockBrand = 'atlas';
    const { container } = render(<LoginPage />);
    expect(container.querySelector('.atlas-login')).toBeInTheDocument();
    expect(container.querySelector('.atlas-login-form')).toBeInTheDocument();
    expect(container.querySelector('.atlas-introduction')).toHaveTextContent('ATLAS');
    expect(container.querySelector('.atlas-introduction')).not.toHaveTextContent(/TianGong|天工/);
    fireEvent.click(screen.getByTestId('login-submit'));
    await waitFor(() =>
      expect(mockLogin).toHaveBeenCalledWith({
        email: 'user@test.com',
        password: 'Secret123!',
        autoLogin: true,
        type: 'login',
      }),
    );
    await waitFor(() => expect(mockHistory.push).toHaveBeenCalledWith('/'));
  });

  it('submits the login flow successfully and redirects after fetching user info', async () => {
    render(<LoginPage />);

    fireEvent.click(screen.getByTestId('login-submit'));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        email: 'user@test.com',
        password: 'Secret123!',
        autoLogin: true,
        type: 'login',
      });
      expect(mockMessageApi.success).toHaveBeenCalledWith('Login successful!');
      expect(mockUseModelState.initialState.fetchUserInfo).toHaveBeenCalled();
      expect(mockHistory.push).toHaveBeenCalledWith('/');
    });
  });

  it('preserves the success feedback lifetime until user hydration and redirect', async () => {
    let resolveUserInfo: (value: { name: string }) => void;
    mockUseModelState.initialState.fetchUserInfo.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveUserInfo = resolve;
      }),
    );
    render(<LoginPage />);
    fireEvent.click(screen.getByTestId('login-submit'));

    await waitFor(() => expect(mockUseModelState.initialState.fetchUserInfo).toHaveBeenCalled());
    expect(mockMessageApi.success).not.toHaveBeenCalled();
    expect(mockHistory.push).not.toHaveBeenCalled();

    resolveUserInfo({ name: 'Delayed User' });
    await waitFor(() => expect(mockMessageApi.success).toHaveBeenCalledWith('Login successful!'));
    expect(mockHistory.push).toHaveBeenCalledWith('/');
    expect(mockHistory.push.mock.invocationCallOrder[0]).toBeLessThan(
      mockMessageApi.success.mock.invocationCallOrder[0],
    );
    expect(mockMessageApi.success).toHaveBeenCalledTimes(1);
  });

  it('redirects to the redirect query parameter after a successful login', async () => {
    window.history.pushState({}, '', '/login?redirect=%2Ftedata%2Fprocesses');
    mockLocation = { pathname: '/login', search: '?redirect=%2Ftedata%2Fprocesses' };

    render(<LoginPage />);

    fireEvent.click(screen.getByTestId('login-submit'));

    await waitFor(() => {
      expect(mockHistory.push).toHaveBeenCalledWith('/tedata/processes');
    });

    window.history.pushState({}, '', '/');
    mockLocation = { pathname: '/', search: '' };
  });

  it('rejects an external redirect query after a successful login', async () => {
    mockLocation = {
      pathname: '/login',
      search: '?redirect=https%3A%2F%2Fevil.example%2Fcallback',
    };

    render(<LoginPage />);
    fireEvent.click(screen.getByTestId('login-submit'));

    await waitFor(() => expect(mockHistory.push).toHaveBeenCalledWith('/'));
    expect(mockHistory.push).not.toHaveBeenCalledWith('https://evil.example/callback');
  });

  it('shows the login error alert when the login service returns an error status', async () => {
    mockLogin.mockResolvedValueOnce({
      status: 'error',
      type: 'login',
      errorCode: 'invalid_credentials',
    });

    render(<LoginPage />);

    fireEvent.click(screen.getByTestId('login-submit'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect username/password');
    expect(mockHistory.push).not.toHaveBeenCalled();
  });

  it.each([
    ['email_not_confirmed', 'Confirm your email before signing in.'],
    ['over_request_rate_limit', 'Too many login attempts. Wait a moment and try again.'],
    ['unexpected_failure', 'Login failed, please try again!'],
  ])('maps stable login error code %s to a safe message', async (errorCode, expectedMessage) => {
    mockLogin.mockResolvedValueOnce({ status: 'error', type: 'login', errorCode });

    render(<LoginPage />);
    fireEvent.click(screen.getByTestId('login-submit'));

    expect(await screen.findByRole('alert')).toHaveTextContent(expectedMessage);
  });

  it('renders the forgot-password link as an Umi app route', () => {
    render(<LoginPage />);

    expect(screen.getByText('Forgot password?').closest('a')).toHaveAttribute(
      'data-umi-to',
      '/user/login/password_forgot',
    );
  });

  it('submits the register flow and shows a success toast', async () => {
    render(<LoginPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith({
        email: 'user@test.com',
        password: 'Secret123!',
        confirmPassword: 'Secret123!',
        autoLogin: true,
        type: 'register',
      });
      expect(mockMessageApi.open).toHaveBeenCalledWith({
        type: 'success',
        content:
          'Validation email has been sent successfully. Please check your inbox and follow the link to complete the process.',
        duration: 10,
      });
    });
  });

  it('shows the existed-account register toast and disables the sign-up button', async () => {
    mockSignUp.mockResolvedValueOnce({ status: 'existed' });

    render(<LoginPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));

    await waitFor(() => {
      expect(mockMessageApi.open).toHaveBeenCalledWith({
        type: 'error',
        content: 'This email is already registered. Try Login, or Forgot Password?',
        duration: 10,
      });
    });
    expect(screen.getByRole('button', { name: 'Sign Up' })).toBeDisabled();
  });

  it('shows the register validation alert when sign-up returns a generic error status', async () => {
    mockSignUp.mockResolvedValueOnce({ status: 'error', type: 'register' });

    render(<LoginPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Validation email failed to send.');
    expect(mockMessageApi.open).not.toHaveBeenCalled();
  });

  it('shows a generic login failure toast when the login request throws', async () => {
    mockLogin.mockRejectedValueOnce(new Error('network down'));

    render(<LoginPage />);

    fireEvent.click(screen.getByTestId('login-submit'));

    await waitFor(() => {
      expect(mockMessageApi.error).toHaveBeenCalledWith('Login failed, please try again!');
    });
    expect(mockHistory.push).not.toHaveBeenCalled();
  });

  it('toggles dark mode from the top actions and persists the updated preference', async () => {
    render(<LoginPage />);

    expect(screen.getByText('light')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'toggle-dark-mode' }));

    await waitFor(() => {
      expect(window.localStorage.getItem('isDarkMode')).toBe('true');
      expect(mockSetInitialState).toHaveBeenCalled();
    });
  });

  it('returns the previous state when dark mode toggle receives an empty initial state', async () => {
    mockSetInitialState.mockImplementationOnce((updater: any) => {
      if (typeof updater === 'function') {
        return updater(undefined);
      }
      return updater;
    });

    render(<LoginPage />);

    fireEvent.click(screen.getByRole('button', { name: 'toggle-dark-mode' }));

    await waitFor(() => {
      expect(window.localStorage.getItem('isDarkMode')).toBe('true');
      expect(mockSetInitialState).toHaveBeenCalled();
    });
  });

  it('renders weak, medium, and strong password strength states in register mode', () => {
    render(<LoginPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));

    const passwordField = mockPasswordFields.password;

    expect(toText(passwordField.fieldProps.statusRender('short'))).toContain('Strength: Weak');
    expect(toText(passwordField.fieldProps.statusRender('123456789'))).toContain(
      'Strength: Medium',
    );
    expect(toText(passwordField.fieldProps.statusRender('1234567890123'))).toContain(
      'Strength: Strong',
    );
  });

  it('validates confirm password by allowing empty or matching values and rejecting mismatches', async () => {
    render(<LoginPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));

    const confirmPasswordField = mockPasswordFields.confirmPassword;
    const validatorFactory = confirmPasswordField.rules[1];
    const validator = validatorFactory({
      getFieldValue: () => 'Secret123!',
    }).validator;

    await expect(validator(undefined, '')).resolves.toBeUndefined();
    await expect(validator(undefined, 'Secret123!')).resolves.toBeUndefined();
    await expect(validator(undefined, 'Mismatch123!')).rejects.toThrow(
      'The two passwords do not match!',
    );
  });

  it('falls back to default localized title and subtitle when branding helpers return null', () => {
    mockGetLocalizedAppTitle.mockReturnValueOnce(undefined);
    mockGetLocalizedLoginSubtitle.mockReturnValueOnce(undefined);

    render(<LoginPage />);

    expect(screen.getByTestId('login-title')).toHaveTextContent('Tiangong LCA');
    expect(screen.getByTestId('login-subtitle')).toHaveTextContent('Sustainable life cycle data');
  });

  it('uses the non-fallback legal labels when the runtime locale is unsupported', () => {
    mockLocale = 'es-ES';

    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));

    expect(screen.getByRole('link', { name: 'Terms of Use' })).not.toHaveAttribute('title');
    expect(screen.getByRole('link', { name: 'Privacy Notice' })).not.toHaveAttribute('title');
  });

  it('labels English-only legal documents explicitly for the German app locale', () => {
    mockLocale = 'de-DE';

    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));

    const termsLink = screen.getByRole('link', { name: 'Nutzungsbedingungen (Englisch)' });
    const privacyLink = screen.getByRole('link', { name: 'Datenschutzhinweis (Englisch)' });
    expect(termsLink).toHaveAttribute('href', '/terms_of_use.html');
    expect(termsLink).toHaveAttribute('hreflang', 'en');
    expect(termsLink).toHaveAttribute('title', 'Nutzungsbedingungen (Englisch)');
    expect(privacyLink).toHaveAttribute('href', '/privacy_notice.html');
    expect(privacyLink).toHaveAttribute('hreflang', 'en');
    expect(privacyLink).toHaveAttribute('title', 'Datenschutzhinweis (Englisch)');
  });

  it('labels English-only legal documents explicitly for the French app locale', () => {
    mockLocale = 'fr-FR';

    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));

    const termsLink = screen.getByRole('link', {
      name: 'Conditions d’utilisation (en anglais)',
    });
    const privacyLink = screen.getByRole('link', {
      name: 'Avis de confidentialité (en anglais)',
    });
    expect(termsLink).toHaveAttribute('href', '/terms_of_use.html');
    expect(termsLink).toHaveAttribute('hreflang', 'en');
    expect(termsLink).toHaveAttribute('title', 'Conditions d’utilisation (en anglais)');
    expect(privacyLink).toHaveAttribute('href', '/privacy_notice.html');
    expect(privacyLink).toHaveAttribute('hreflang', 'en');
    expect(privacyLink).toHaveAttribute('title', 'Avis de confidentialité (en anglais)');
  });
});
