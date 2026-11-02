import { AtlasLoginIntroduction } from '@/components/BrandPresentation';
import { login, signUp } from '@/services/auth';
import { useAntdAppApi } from '@/contexts/AntdAppContext';
import { AntdThemeSync } from '@/contexts/AntdThemeSync';
import { LockOutlined, MailOutlined } from '@ant-design/icons';
import {
  LoginForm,
  ProConfigProvider,
  ProFormCheckbox,
  ProFormText,
  ProLayout,
} from '@ant-design/pro-components';
import { Alert, Button, Tabs, theme } from 'antd';
import React, { useState } from 'react';
import { Helmet, history, useIntl, useLocation, useModel } from 'umi';

import { Footer } from '@/components';
import { getLocaleFallbackDefinition, hasLocaleFallback } from '@/services/general/localeRegistry';
import { normalizeRuntimeLocale } from '@/services/general/runtimeLocale';
import { resolveSafeLoginRedirect } from '@/services/general/publicRoutePolicy';
import { readBrowserStorage, writeBrowserStorage } from '@/services/general/browserStorage';
import { FormattedMessage, Link } from '@umijs/max';
import { Typography } from 'antd';
import { flushSync } from 'react-dom';
import { getBrandTheme } from '../../../../config/branding';
import { brandProfile } from '../../../../config/brandProfile';
import {
  defaultAppTitle,
  defaultLoginSubtitle,
  getLocalizedAppTitle,
  getLocalizedLoginSubtitle,
} from '../../../../config/defaultSettings';
import LoginTopActions from './Components/LoginTopActions';
import { responsiveLoginFormProps } from './responsive';

const LoginMessage: React.FC<{
  content: string;
}> = ({ content }) => (
  <Alert
    style={{
      marginBottom: 24,
    }}
    title={content}
    type='error'
    showIcon
  />
);

const { Link: TypographyLink } = Typography;

const getPasswordLoginErrorMessage = (
  errorCode: string | undefined,
  formatMessage: (descriptor: { id: string; defaultMessage: string }) => string,
) => {
  switch (errorCode) {
    case 'invalid_credentials':
      return formatMessage({
        id: 'pages.login.passwordLogin.errorMessage',
        defaultMessage: 'Incorrect username/password',
      });
    case 'email_not_confirmed':
      return formatMessage({
        id: 'pages.login.passwordLogin.emailNotConfirmed',
        defaultMessage: 'Confirm your email before signing in.',
      });
    case 'over_request_rate_limit':
      return formatMessage({
        id: 'pages.login.passwordLogin.rateLimited',
        defaultMessage: 'Too many login attempts. Wait a moment and try again.',
      });
    default:
      return formatMessage({
        id: 'pages.login.failure',
        defaultMessage: 'Login failed, please try again!',
      });
  }
};

const Login: React.FC = () => {
  const [userLoginState, setUserLoginState] = useState<Auth.LoginResult>({});
  const [type, setType] = useState<string>('login');
  const [loading, setLoading] = useState<boolean>(false);
  const location = useLocation();
  const { initialState, setInitialState } = useModel('@@initialState');
  const [sendComplete, setSendComplete] = useState(false);
  const intl = useIntl();
  const { message: messageApi } = useAntdAppApi();
  const formRefLogin = React.useRef<any>(undefined);
  const { token } = theme.useToken();
  const [isDarkMode, setIsDarkMode] = useState<boolean>(
    () => readBrowserStorage('isDarkMode') === 'true',
  );

  const fetchUserInfo = async () => {
    const userInfo = await initialState?.fetchUserInfo?.();
    if (userInfo) {
      flushSync(() => {
        setInitialState((s) => ({
          ...s,
          currentUser: userInfo,
        }));
      });
    }
  };

  const handleSubmit = async (values: Auth.LoginParams) => {
    try {
      if (type === 'register') {
        setLoading(true);
        const msg = await signUp({ ...values, type });
        setLoading(false);
        if (msg.status === 'ok') {
          setSendComplete(true);
          const defaultSignUpSuccessMessage = intl.formatMessage({
            id: 'pages.login.signUp.success',
            defaultMessage:
              'Validation email has been sent successfully. Please check your inbox and follow the link to complete the process.',
          });
          messageApi.open({
            type: 'success',
            content: defaultSignUpSuccessMessage,
            duration: 10,
          });
          return;
        }
        if (msg.status === 'existed') {
          setSendComplete(true);
          const defaultSignUpExistedMessage = intl.formatMessage({
            id: 'pages.login.signUp.existed',
            defaultMessage: 'This email is already registered. Try Login, or Forgot Password?',
          });
          messageApi.open({
            type: 'error',
            content: defaultSignUpExistedMessage,
            duration: 10,
          });
          return;
        }
        setUserLoginState(msg);
        return;
      } else if (type === 'login') {
        // 登录
        setLoading(true);
        const msg = await login({ ...values, type });
        setLoading(false);
        if (msg.status === 'ok') {
          const defaultLoginSuccessMessage = intl.formatMessage({
            id: 'pages.login.success',
            defaultMessage: 'Login successful!',
          });
          await fetchUserInfo();
          const urlParams = new URLSearchParams(location.search);
          history.push(resolveSafeLoginRedirect(urlParams.get('redirect')));
          messageApi.success(defaultLoginSuccessMessage);
          return;
        }
        // 如果失败去设置用户错误信息
        setUserLoginState(msg);
      }
    } catch (error) {
      const defaultLoginFailureMessage = intl.formatMessage({
        id: 'pages.login.failure',
        defaultMessage: 'Login failed, please try again!',
      });
      messageApi.error(defaultLoginFailureMessage);
    }
  };

  const handleDarkModeToggle = () => {
    setIsDarkMode((prevIsDarkMode) => {
      const nextIsDarkMode = !prevIsDarkMode;
      writeBrowserStorage('isDarkMode', nextIsDarkMode.toString());

      setInitialState?.((prevState: any) => {
        if (!prevState) {
          return prevState;
        }
        return {
          ...prevState,
          isDarkMode: nextIsDarkMode,
          settings: {
            ...(prevState.settings ?? {}),
            ...getBrandTheme(nextIsDarkMode),
          },
        };
      });

      return nextIsDarkMode;
    });
  };

  const splitLogin = brandProfile.presentation?.login === 'split';
  const { status, type: loginType, errorCode } = userLoginState;
  const brandTheme = getBrandTheme(isDarkMode);
  const appTitle =
    getLocalizedAppTitle(intl.locale) ??
    intl.formatMessage({ id: 'pages.name', defaultMessage: defaultAppTitle });
  const loginSubtitle =
    getLocalizedLoginSubtitle(intl.locale) ??
    intl.formatMessage({ id: 'pages.login.subTitle', defaultMessage: defaultLoginSubtitle });
  const normalizedLocale = normalizeRuntimeLocale(intl.locale);
  const legalFallbackDefinition = getLocaleFallbackDefinition(normalizedLocale, 'legalLocale');
  const usesEnglishLegalFallback = hasLocaleFallback(normalizedLocale, 'legalLocale');
  const termsOfServiceLabel = intl.formatMessage({
    id: usesEnglishLegalFallback
      ? 'pages.login.termsOfUse.englishFallbackLabel'
      : 'pages.login.termsOfUse',
    defaultMessage: usesEnglishLegalFallback ? 'Terms of Use (English)' : 'Terms of Use',
  });
  const privacyPolicyLabel = intl.formatMessage({
    id: usesEnglishLegalFallback
      ? 'pages.login.privacyNotice.englishFallbackLabel'
      : 'pages.login.privacyNotice',
    defaultMessage: usesEnglishLegalFallback ? 'Privacy Notice (English)' : 'Privacy Notice',
  });
  const termsOfServiceLink = (
    <TypographyLink
      href={brandProfile.links.terms}
      hrefLang={legalFallbackDefinition?.languageCode}
      target='_blank'
      rel='noopener noreferrer'
      title={usesEnglishLegalFallback ? termsOfServiceLabel : undefined}
    >
      {termsOfServiceLabel}
    </TypographyLink>
  );
  const privacyPolicyLink = (
    <TypographyLink
      href={brandProfile.links.privacy}
      hrefLang={legalFallbackDefinition?.languageCode}
      target='_blank'
      rel='noopener noreferrer'
      title={usesEnglishLegalFallback ? privacyPolicyLabel : undefined}
    >
      {privacyPolicyLabel}
    </TypographyLink>
  );

  return (
    <>
      <AntdThemeSync colorPrimary={brandTheme.colorPrimary} isDarkMode={isDarkMode} />
      <ProConfigProvider hashed={false}>
        <ProLayout
          className={splitLogin ? 'atlas-auth-shell' : undefined}
          menuRender={false}
          menuHeaderRender={false}
          headerRender={false}
          fixedHeader={false}
          fixSiderbar={false}
        >
          <Helmet>
            <title>
              {intl.formatMessage({
                id: 'menu.login',
                defaultMessage: 'Login',
              })}
              - {appTitle}
            </title>
          </Helmet>
          <LoginTopActions isDarkMode={isDarkMode} onDarkModeToggle={handleDarkModeToggle} />
          <div
            className={splitLogin ? 'atlas-login' : undefined}
            style={splitLogin ? undefined : { marginTop: '80px' }}
          >
            {splitLogin && <AtlasLoginIntroduction logo={brandTheme.logo} />}
            <div className={splitLogin ? 'atlas-login-form' : undefined}>
              <LoginForm
                {...responsiveLoginFormProps}
                {...(splitLogin
                  ? { contentStyle: { maxWidth: 380, minWidth: 0, width: '100%' } }
                  : {})}
                formRef={formRefLogin}
                logo={splitLogin ? undefined : brandTheme.logo}
                title={splitLogin ? intl.formatMessage({ id: 'menu.login' }) : appTitle}
                subTitle={loginSubtitle}
                initialValues={{ autoLogin: true }}
                onFinish={async (values) => {
                  if (type === 'login') {
                    await handleSubmit(values as Auth.LoginParams);
                  }
                }}
                submitter={
                  type === 'login'
                    ? {
                        submitButtonProps: {
                          loading: loading,
                          'data-testid': 'docs-capture-login-submit',
                        },
                      }
                    : false
                }
              >
                <Tabs
                  activeKey={type}
                  onChange={setType}
                  centered
                  items={[
                    {
                      key: 'login',
                      label: intl.formatMessage({
                        id: 'pages.login.login.tab',
                        defaultMessage: 'Login',
                      }),
                    },
                    {
                      key: 'register',
                      label: intl.formatMessage({
                        id: 'pages.login.register.tab',
                        defaultMessage: 'Sign Up',
                      }),
                    },
                  ]}
                />
                {status === 'error' && loginType === 'login' && (
                  <LoginMessage
                    content={getPasswordLoginErrorMessage(errorCode, intl.formatMessage)}
                  />
                )}
                {status === 'error' && loginType === 'register' && (
                  <LoginMessage
                    content={intl.formatMessage({
                      id: 'pages.login.signUp.errorMessage',
                      defaultMessage: 'Validation email failed to send.',
                    })}
                  />
                )}
                {type === 'login' && (
                  <>
                    <ProFormText
                      name='email'
                      fieldProps={{
                        size: 'middle',
                        prefix: <MailOutlined />,
                        'data-testid': 'docs-capture-login-email',
                      }}
                      placeholder={intl.formatMessage({
                        id: 'pages.login.email.placeholder',
                        defaultMessage: 'Email',
                      })}
                      rules={[
                        {
                          type: 'email',
                          message: (
                            <FormattedMessage
                              id='pages.login.email.wrong-format'
                              defaultMessage='The email format is incorrect!'
                            />
                          ),
                        },
                        {
                          required: true,
                          message: (
                            <FormattedMessage
                              id='pages.login.email.required'
                              defaultMessage='Please input your email!'
                            />
                          ),
                        },
                      ]}
                    />
                    <ProFormText.Password
                      name='password'
                      fieldProps={{
                        size: 'middle',
                        prefix: <LockOutlined />,
                        'data-testid': 'docs-capture-login-password',
                      }}
                      placeholder={intl.formatMessage({
                        id: 'pages.login.password.placeholder',
                        defaultMessage: 'Password',
                      })}
                      rules={[
                        {
                          required: true,
                          message: (
                            <FormattedMessage
                              id='pages.login.password.required'
                              defaultMessage='Please input your password!'
                            />
                          ),
                        },
                      ]}
                    />
                    <div
                      style={{
                        marginBottom: 24,
                      }}
                    >
                      <ProFormCheckbox noStyle name='autoLogin'>
                        <FormattedMessage
                          id='pages.login.rememberMe'
                          defaultMessage='Remember me'
                        />
                      </ProFormCheckbox>
                      <Link
                        style={{
                          float: 'right',
                        }}
                        to='/user/login/password_forgot'
                      >
                        <FormattedMessage
                          id='pages.login.forgotPassword'
                          defaultMessage='Forgot password?'
                        />
                      </Link>
                    </div>
                  </>
                )}
                {type === 'register' && (
                  <>
                    <ProFormText
                      name='email'
                      fieldProps={{
                        size: 'middle',
                        prefix: <MailOutlined />,
                      }}
                      placeholder={intl.formatMessage({
                        id: 'pages.login.email.placeholder',
                        defaultMessage: 'Email',
                      })}
                      rules={[
                        {
                          type: 'email',
                          message: (
                            <FormattedMessage
                              id='pages.login.email.wrong-format'
                              defaultMessage='The email format is incorrect!'
                            />
                          ),
                        },
                        {
                          required: true,
                          message: (
                            <FormattedMessage
                              id='pages.login.email.required'
                              defaultMessage='Please input your email!'
                            />
                          ),
                        },
                      ]}
                    />
                    <ProFormText.Password
                      name='password'
                      fieldProps={{
                        size: 'middle',
                        prefix: <LockOutlined />,
                        strengthText: (
                          <FormattedMessage
                            id='pages.login.password.strengthText'
                            defaultMessage='Password must contain at least 8 characters, including lowercase and uppercase letters, digits, and symbols.'
                          />
                        ),
                        statusRender: (value) => {
                          const getStatus = () => {
                            if (value && value.length > 12) {
                              return 'ok';
                            }
                            if (value && value.length > 8) {
                              return 'pass';
                            }
                            return 'poor';
                          };
                          const pwdStatus = getStatus();
                          if (pwdStatus === 'pass') {
                            return (
                              <div style={{ color: token.colorWarning }}>
                                <FormattedMessage
                                  id='pages.login.password.strengthMedium'
                                  defaultMessage='Strength: Medium'
                                />
                              </div>
                            );
                          }
                          if (pwdStatus === 'ok') {
                            return (
                              <div style={{ color: token.colorSuccess }}>
                                <FormattedMessage
                                  id='pages.login.password.strengthStrong'
                                  defaultMessage='Strength: Strong'
                                />
                              </div>
                            );
                          }
                          return (
                            <div style={{ color: token.colorError }}>
                              <FormattedMessage
                                id='pages.login.password.strengthWeak'
                                defaultMessage='Strength: Weak'
                              />
                            </div>
                          );
                        },
                      }}
                      placeholder={intl.formatMessage({
                        id: 'pages.login.password.placeholder',
                        defaultMessage: 'Password',
                      })}
                      rules={[
                        {
                          required: true,
                          message: (
                            <FormattedMessage
                              id='pages.login.password.required'
                              defaultMessage='Please input your password!'
                            />
                          ),
                        },
                        {
                          pattern:
                            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])[a-zA-Z0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]{8,}$/,
                          message: (
                            <FormattedMessage
                              id='pages.login.password.validation'
                              defaultMessage='Password is invalid!'
                            />
                          ),
                        },
                      ]}
                      hasFeedback
                    />
                    <ProFormText.Password
                      name='confirmPassword'
                      fieldProps={{
                        size: 'middle',
                        prefix: <LockOutlined />,
                      }}
                      dependencies={['password']}
                      hasFeedback
                      placeholder={intl.formatMessage({
                        id: 'pages.login.confirmPassword.placeholder',
                        defaultMessage: 'Confirm Password',
                      })}
                      rules={[
                        {
                          required: true,
                          message: (
                            <FormattedMessage
                              id='pages.login.confirmPassword.required'
                              defaultMessage='Please confirm your password!'
                            />
                          ),
                        },
                        ({ getFieldValue }) => ({
                          validator(_, value) {
                            if (!value || getFieldValue('password') === value) {
                              return Promise.resolve();
                            }
                            return Promise.reject(
                              new Error(
                                intl.formatMessage({
                                  id: 'pages.login.password.confirm.error',
                                  defaultMessage: 'The two passwords do not match!',
                                }),
                              ),
                            );
                          },
                        }),
                      ]}
                    />
                    <div
                      style={{
                        marginBottom: 24,
                        justifyContent: 'center',
                        textAlign: 'center',
                      }}
                    >
                      <FormattedMessage
                        id='pages.login.terms'
                        defaultMessage='By signing up, you agree to our {termsOfService} and {privacyPolicy}'
                        values={{
                          termsOfService: termsOfServiceLink,
                          privacyPolicy: privacyPolicyLink,
                        }}
                      />
                    </div>
                    <div
                      style={{
                        marginBottom: 24,
                      }}
                    >
                      <Button
                        block
                        type='primary'
                        size='large'
                        loading={loading}
                        disabled={sendComplete}
                        onClick={async () => {
                          const values = await formRefLogin.current?.validateFields();
                          await handleSubmit(values);
                        }}
                      >
                        <FormattedMessage
                          id='pages.login.register.submit'
                          defaultMessage='Sign Up'
                        />
                      </Button>
                    </div>
                  </>
                )}
              </LoginForm>
            </div>
          </div>
          <Footer />
        </ProLayout>
      </ProConfigProvider>
    </>
  );
};

export default Login;
