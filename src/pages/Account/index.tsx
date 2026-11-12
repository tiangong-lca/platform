import accountPageStyles from '@/components/AccountPage/index.less';
import { resolveBrandMessage } from '@/locales/brandMessages';
import { changeEmail, changePassword, getAccountProfile, setProfile } from '@/services/auth';
import { useAntdAppApi } from '@/contexts/AntdAppContext';
import {
  BankOutlined,
  CheckCircleOutlined,
  IdcardOutlined,
  InfoCircleOutlined,
  LockOutlined,
  MailOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { PageContainer, ProForm, ProFormInstance, ProFormText } from '@ant-design/pro-components';
import { FormattedMessage, useIntl, useModel } from '@umijs/max';
import {
  Avatar,
  Flex,
  Form,
  Grid,
  Input,
  Progress,
  Spin,
  Steps,
  Tabs,
  Tag,
  Typography,
  theme,
} from 'antd';
import { useEffect, useRef, useState, type CSSProperties, type FC, type ReactNode } from 'react';
import { formatAccountRole } from './roleMessage';
import OAuthConnections from './OAuthConnections';
import styles from './index.less';

export const ACCOUNT_FORM_CONTAINER_STYLE: CSSProperties = {
  width: '100%',
  maxWidth: 1000,
  minWidth: 0,
};

export const getAccountTabPlacement = (isMobile: boolean) => (isMobile ? 'top' : 'start');

const AccountContentPanel: FC<{
  children: ReactNode;
  className?: string;
  description: ReactNode;
  title: ReactNode;
}> = ({ children, className, description, title }) => (
  <section className={[styles.contentPanel, className].filter(Boolean).join(' ')}>
    <header className={styles.contentHeader}>
      <Typography.Title className={styles.contentTitle} level={3}>
        {title}
      </Typography.Title>
      <Typography.Paragraph className={styles.contentDescription} type='secondary'>
        {description}
      </Typography.Paragraph>
    </header>
    <div className={styles.formSection} style={ACCOUNT_FORM_CONTAINER_STYLE}>
      {children}
    </div>
  </section>
);

const Profile: FC = () => {
  const { message } = useAntdAppApi();
  const [activeTabKey, setActiveTabKey] = useState('baseInfo');
  const [spinning, setSpinning] = useState(false);
  const formRefEdit = useRef<ProFormInstance | undefined>(undefined);
  const [initData, setInitData] = useState<Auth.CurrentUser | null>(null);
  const [roleValue, setRoleValue] = useState<string>('');
  const intl = useIntl();
  const { token } = theme.useToken();
  const { setInitialState } = useModel('@@initialState');
  const useBreakpoint = Grid?.useBreakpoint ?? (() => ({}));
  const screens = useBreakpoint();
  const isMobile = screens.md === false;
  const profileName =
    initData?.name?.trim() ||
    initData?.email?.split('@')[0] ||
    resolveBrandMessage(
      intl.locale,
      'pages.account.profile.fallbackName',
      intl.formatMessage({
        id: 'pages.account.profile.fallbackName',
        defaultMessage: 'TianGong user',
      }),
    );
  const profileInitial = Array.from(profileName)[0]?.toUpperCase() ?? 'T';

  const onTabChange = (key: string) => setActiveTabKey(key);

  const renderBaseForm = () => (
    <AccountContentPanel
      description={
        <FormattedMessage
          id='pages.account.baseInfo.description'
          defaultMessage='Complete your profile so teammates can recognize you more easily.'
        />
      }
      title={<FormattedMessage id='pages.account.baseInfo' defaultMessage='Basic Information' />}
    >
      <div className={styles.profileSummary}>
        <Avatar className={styles.profileAvatar}>{profileInitial}</Avatar>
        <div className={styles.profileSummaryText}>
          <Typography.Title className={styles.profileName} level={4}>
            {profileName}
          </Typography.Title>
          <div className={styles.profileMeta}>
            <Typography.Text type='secondary'>{initData?.email ?? ''}</Typography.Text>
            {roleValue ? <Tag className={styles.roleTag}>{roleValue}</Tag> : null}
          </div>
        </div>
      </div>
      <ProForm
        formRef={formRefEdit}
        layout='vertical'
        submitter={{
          resetButtonProps: false,
          searchConfig: {
            submitText: intl.formatMessage({
              id: 'pages.account.profile.save',
              defaultMessage: 'Save changes',
            }),
          },
          render: (_, dom) => <div className={styles.submitRow}>{dom}</div>,
        }}
        onFinish={async (values) => {
          setSpinning(true);
          try {
            const msg = await setProfile(values);
            if (msg.status === 'ok') {
              const organization = values.organization?.trim() ?? '';
              formRefEdit.current?.setFieldsValue({ organization });
              setInitData((current) =>
                current ? { ...current, ...values, organization } : current,
              );
              message.success(
                intl.formatMessage({
                  id: 'pages.account.editsuccess',
                  defaultMessage: 'Profile updated successfully.',
                }),
              );
              setInitialState((s) => ({
                ...s,
                currentUser: {
                  ...s?.currentUser,
                  name: values.name,
                  organization,
                },
              }));
            } else {
              message.error(msg?.message);
            }
          } catch (error) {
            message.error(
              intl.formatMessage({
                id: 'pages.account.updateError',
                defaultMessage: 'An error occurred while updating the profile.',
              }),
            );
          } finally {
            setSpinning(false);
          }
        }}
      >
        <div className={styles.profileFormGrid}>
          <Form.Item
            label={<FormattedMessage id='pages.account.profile.email' defaultMessage='Email' />}
            name={'email'}
          >
            <Input prefix={<MailOutlined />} disabled={true} />
          </Form.Item>
          <Form.Item
            label={<FormattedMessage id='pages.account.profile.role' defaultMessage='Role' />}
            name={'role'}
          >
            <Input prefix={<IdcardOutlined />} value={roleValue} disabled={true} />
          </Form.Item>
          <Form.Item
            label={
              <FormattedMessage id='pages.account.profile.nickName' defaultMessage='Nickname' />
            }
            name={'name'}
            tooltip={
              <FormattedMessage
                id='pages.account.profile.nickName.tooltip'
                defaultMessage='The name you prefer to be called'
              />
            }
          >
            <Input prefix={<UserOutlined />} />
          </Form.Item>
          <Form.Item
            label={
              <FormattedMessage
                id='pages.account.profile.organization'
                defaultMessage='Organization'
              />
            }
            name={'organization'}
            tooltip={
              <FormattedMessage
                id='pages.account.profile.organization.tooltip'
                defaultMessage='The organization or institution you belong to'
              />
            }
            rules={[
              {
                max: 200,
                message: (
                  <FormattedMessage
                    id='pages.account.profile.organization.maxLength'
                    defaultMessage='Organization must not exceed 200 characters'
                  />
                ),
              },
            ]}
          >
            <Input
              prefix={<BankOutlined />}
              maxLength={200}
              placeholder={intl.formatMessage({
                id: 'pages.account.profile.organization.placeholder',
                defaultMessage: 'Enter your organization',
              })}
            />
          </Form.Item>
        </div>
      </ProForm>
    </AccountContentPanel>
  );

  const renderPasswordStrength = (value?: string) => {
    const getStatus = () => {
      if (value && value.length > 12) {
        return {
          color: token.colorSuccess,
          label: intl.formatMessage({
            id: 'pages.account.password.strength.strong',
            defaultMessage: 'Strong',
          }),
          percent: 100,
        };
      }
      if (value && value.length > 8) {
        return {
          color: token.colorWarning,
          label: intl.formatMessage({
            id: 'pages.account.password.strength.medium',
            defaultMessage: 'Medium',
          }),
          percent: 67,
        };
      }
      return {
        color: token.colorError,
        label: intl.formatMessage({
          id: 'pages.account.password.strength.weak',
          defaultMessage: 'Weak',
        }),
        percent: 34,
      };
    };
    const status = getStatus();
    return (
      <div className={styles.passwordStrength} role='status' aria-live='polite'>
        <Typography.Text type='secondary'>
          <FormattedMessage
            id='pages.account.password.strengthLabel'
            defaultMessage='Password strength'
          />
        </Typography.Text>
        <Progress percent={status.percent} showInfo={false} steps={3} strokeColor={status.color} />
        <Typography.Text style={{ color: status.color }}>{status.label}</Typography.Text>
      </div>
    );
  };

  const renderChangePasswordForm = () => (
    <AccountContentPanel
      description={
        <FormattedMessage
          id='pages.account.password.description'
          defaultMessage='Set a secure, memorable new password for your account.'
        />
      }
      title={
        <FormattedMessage id='pages.account.changePassword' defaultMessage='Change Password' />
      }
    >
      <ProForm
        className={styles.passwordForm}
        formRef={formRefEdit}
        layout='vertical'
        submitter={{
          searchConfig: {
            resetText: intl.formatMessage({
              id: 'pages.account.action.reset',
              defaultMessage: 'Reset',
            }),
            submitText: intl.formatMessage({
              id: 'pages.account.password.submit',
              defaultMessage: 'Update password',
            }),
          },
          render: (props, doms) => {
            return (
              <div className={`${styles.submitRow} ${styles.passwordSubmitRow}`}>
                <Flex gap='middle'>{doms}</Flex>
              </div>
            );
          },
        }}
        onFinish={async (value) => {
          setSpinning(true);
          try {
            const msg = await changePassword(value);
            if (msg.status === 'ok') {
              formRefEdit.current?.resetFields();
              message.success(
                intl.formatMessage({
                  id: 'pages.account.password.changed.success',
                  defaultMessage: 'Password changed successfully!',
                }),
              );
            } else if (msg.status === 'error') {
              if (msg.message === 'User not found') {
                message.error(
                  intl.formatMessage({
                    id: 'pages.account.userNotFound',
                    defaultMessage: 'User not found',
                  }),
                );
              } else if (msg.message === 'Password incorrect') {
                message.error(
                  intl.formatMessage({
                    id: 'pages.account.currentPassword.invalid',
                    defaultMessage: 'Invalid password',
                  }),
                );
              } else {
                message.error(msg.message);
              }
            }
          } catch (error) {
            message.error(
              intl.formatMessage({
                id: 'pages.account.password.changeError',
                defaultMessage:
                  'A system error occurred while changing the password. Please try again later.',
              }),
            );
          } finally {
            setSpinning(false);
          }
        }}
      >
        <Form.Item name={'email'} initialValue={initData?.email} style={{ display: 'none' }}>
          <Input />
        </Form.Item>

        <div className={styles.passwordLayout}>
          <div className={styles.passwordFormColumn}>
            <Form.Item
              name='currentPassword'
              label={
                <FormattedMessage
                  id='pages.account.password.currentPassword'
                  defaultMessage='Current Password'
                />
              }
              tooltip={
                <FormattedMessage
                  id='pages.account.password.currentPassword.tooltip'
                  defaultMessage='Please enter your current account password to verify your identity.'
                />
              }
              rules={[
                {
                  required: true,
                  message: (
                    <FormattedMessage
                      id='pages.account.currentPassword.required'
                      defaultMessage='Please input the current password!'
                    />
                  ),
                },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder={intl.formatMessage({
                  id: 'pages.account.currentPassword.placeholder',
                  defaultMessage: 'Current Password',
                })}
              />
            </Form.Item>

            <ProFormText.Password
              name='newPassword'
              label={
                <FormattedMessage
                  id='pages.account.password.newPassword'
                  defaultMessage='New Password'
                />
              }
              fieldProps={{
                prefix: <LockOutlined />,
              }}
              placeholder={intl.formatMessage({
                id: 'pages.account.newPassword.placeholder',
                defaultMessage: 'New Password',
              })}
              rules={[
                {
                  required: true,
                  message: (
                    <FormattedMessage
                      id='pages.account.newPassword.required'
                      defaultMessage='Please input the new password!'
                    />
                  ),
                },
                {
                  pattern:
                    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])[a-zA-Z0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]{8,}$/,
                  message: (
                    <FormattedMessage
                      id='pages.account.newPassword.validation'
                      defaultMessage='Password is invalid!'
                    />
                  ),
                },
                {
                  validator: (_, value) => {
                    const currentPassword = formRefEdit.current?.getFieldValue('currentPassword');
                    if (value && value === currentPassword) {
                      return Promise.reject(
                        new Error(
                          intl.formatMessage({
                            id: 'pages.account.newPassword.sameAsOld',
                            defaultMessage:
                              'New password should be different from the current password.',
                          }),
                        ),
                      );
                    }
                    return Promise.resolve();
                  },
                },
              ]}
            />

            <Form.Item
              noStyle
              shouldUpdate={(previous, current) => previous.newPassword !== current.newPassword}
            >
              {({ getFieldValue }) => renderPasswordStrength(getFieldValue('newPassword'))}
            </Form.Item>

            <Form.Item
              name='confirmNewPassword'
              label={
                <FormattedMessage
                  id='pages.account.password.confirmNewPassword'
                  defaultMessage='Confirm New Password'
                />
              }
              rules={[
                {
                  required: true,
                  message: (
                    <FormattedMessage
                      id='pages.account.confirmNewPassword.required'
                      defaultMessage='Please input the new password again!'
                    />
                  ),
                },
                {
                  validator: (_, value) => {
                    if (!value || formRefEdit.current?.getFieldValue('newPassword') === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(
                      new Error(
                        intl.formatMessage({
                          id: 'pages.account.passwordsDoNotMatch',
                          defaultMessage: 'The two passwords that you entered do not match!',
                        }),
                      ),
                    );
                  },
                },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder={intl.formatMessage({
                  id: 'pages.account.confirmNewPassword.placeholder',
                  defaultMessage: 'Confirm New Password',
                })}
              />
            </Form.Item>
          </div>

          <aside className={styles.passwordGuide}>
            <div className={styles.passwordGuideHeading}>
              <SafetyCertificateOutlined className={styles.guideIcon} />
              <Typography.Title level={5}>
                <FormattedMessage
                  id='pages.account.password.guideTitle'
                  defaultMessage='Password tips'
                />
              </Typography.Title>
            </div>
            <ul className={styles.guideList}>
              <li>
                <CheckCircleOutlined />
                <FormattedMessage
                  id='pages.account.password.guide.length'
                  defaultMessage='At least 8 characters'
                />
              </li>
              <li>
                <CheckCircleOutlined />
                <FormattedMessage
                  id='pages.account.password.guide.letters'
                  defaultMessage='Include uppercase and lowercase letters'
                />
              </li>
              <li>
                <CheckCircleOutlined />
                <FormattedMessage
                  id='pages.account.password.guide.numberSymbol'
                  defaultMessage='Include numbers and symbols'
                />
              </li>
            </ul>
          </aside>
        </div>
      </ProForm>
    </AccountContentPanel>
  );

  const renderChangeEmailForm = () => (
    <AccountContentPanel
      className={styles.emailPanel}
      description={
        <FormattedMessage
          id='pages.account.email.description'
          defaultMessage='Enter a new email address and verify it to complete the change.'
        />
      }
      title={<FormattedMessage id='pages.account.changeEmail' defaultMessage='Change Email' />}
    >
      <div className={styles.emailLayout}>
        <ProForm
          className={styles.emailForm}
          formRef={formRefEdit}
          layout='vertical'
          submitter={{
            searchConfig: {
              resetText: intl.formatMessage({
                id: 'pages.account.action.reset',
                defaultMessage: 'Reset',
              }),
              submitText: intl.formatMessage({
                id: 'pages.account.email.submit',
                defaultMessage: 'Send verification email',
              }),
            },
            render: (props, doms) => {
              return (
                <div className={styles.submitRow}>
                  <Flex gap='middle'>{doms}</Flex>
                </div>
              );
            },
          }}
          onFinish={async (value) => {
            setSpinning(true);
            try {
              const msg = await changeEmail(value);
              if (msg.status === 'ok') {
                formRefEdit.current?.resetFields();
                message.success(
                  intl.formatMessage({
                    id: 'pages.account.email.changed.success',
                    defaultMessage:
                      'Verification email sent successfully! Please update your email via the email link.',
                  }),
                );
              } else {
                message.error(msg.message);
              }
            } catch (error) {
              message.error('An error occurred while changing the email.');
            } finally {
              setSpinning(false);
            }
          }}
        >
          <div className={styles.emailFormColumn}>
            <Form.Item name={'email'} initialValue={initData?.email} style={{ display: 'none' }}>
              <Input disabled={true} />
            </Form.Item>
            <dl className={styles.emailCurrent}>
              <dt>
                <FormattedMessage
                  id='pages.account.email.currentEmail'
                  defaultMessage='Current Email'
                />
              </dt>
              <dd>
                <MailOutlined />
                <span>{initData?.email}</span>
              </dd>
            </dl>

            <ProFormText
              name='newEmail'
              label={<FormattedMessage id='pages.account.newEmail' defaultMessage='New Email' />}
              fieldProps={{
                prefix: <MailOutlined />,
              }}
              placeholder={intl.formatMessage({
                id: 'pages.account.email.newAddress.placeholder',
                defaultMessage: 'Enter your new email address',
              })}
              rules={[
                {
                  type: 'email',
                  message: (
                    <FormattedMessage
                      id='pages.account.newEmail.wrong-format'
                      defaultMessage='The email format is incorrect!'
                    />
                  ),
                },
                {
                  required: true,
                  message: (
                    <FormattedMessage
                      id='pages.account.newEmail.required'
                      defaultMessage='Please input the new email!'
                    />
                  ),
                },
              ]}
              hasFeedback
            />

            <Form.Item
              name='confirmNewEmail'
              label={
                <FormattedMessage
                  id='pages.account.email.confirmNewEmail'
                  defaultMessage='Confirm New Email'
                />
              }
              rules={[
                {
                  required: true,
                  message: (
                    <FormattedMessage
                      id='pages.account.confirmNewEmail.required'
                      defaultMessage='Please input the new email again!'
                    />
                  ),
                },
                {
                  validator: (_, value) => {
                    if (!value || formRefEdit.current?.getFieldValue('newEmail') === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(
                      new Error(
                        intl.formatMessage({
                          id: 'pages.account.emailsDoNotMatch',
                          defaultMessage: 'The two emails that you entered do not match!',
                        }),
                      ),
                    );
                  },
                },
              ]}
              hasFeedback
            >
              <Input
                prefix={<MailOutlined />}
                placeholder={intl.formatMessage({
                  id: 'pages.account.email.confirmAddress.placeholder',
                  defaultMessage: 'Enter your new email address again',
                })}
              />
            </Form.Item>

            <div className={styles.emailNote} role='note'>
              <InfoCircleOutlined />
              <span>
                <FormattedMessage
                  id='pages.account.email.currentLoginHint'
                  defaultMessage='You can continue signing in with your current email until verification is complete.'
                />
              </span>
            </div>
          </div>
        </ProForm>
        <aside className={styles.emailGuide}>
          <Typography.Title className={styles.emailGuideTitle} level={5}>
            <FormattedMessage id='pages.account.email.guideTitle' defaultMessage='How it works' />
          </Typography.Title>
          <Steps
            className={styles.emailSteps}
            classNames={{
              item: styles.emailStep,
              itemTitle: styles.emailStepTitle,
              itemContent: styles.emailStepContent,
            }}
            styles={{
              itemContent: { color: token.colorTextSecondary },
              itemRail: { borderColor: token.colorBorder },
            }}
            current={0}
            orientation='vertical'
            items={[
              {
                title: intl.formatMessage({
                  id: 'pages.account.email.step.enter',
                  defaultMessage: 'Enter new email',
                }),
                content: intl.formatMessage({
                  id: 'pages.account.email.step.enterHint',
                  defaultMessage: 'Make sure your email address is correct',
                }),
              },
              {
                title: intl.formatMessage({
                  id: 'pages.account.email.step.verify',
                  defaultMessage: 'Check verification email',
                }),
                content: intl.formatMessage({
                  id: 'pages.account.email.step.verifyHint',
                  defaultMessage: 'Open your new inbox and follow the verification instructions',
                }),
              },
              {
                title: intl.formatMessage({
                  id: 'pages.account.email.step.complete',
                  defaultMessage: 'Complete change',
                }),
                content: intl.formatMessage({
                  id: 'pages.account.email.step.completeHint',
                  defaultMessage: 'Once verified, sign in with your new email',
                }),
              },
            ]}
          />
        </aside>
      </div>
    </AccountContentPanel>
  );

  useEffect(() => {
    let active = true;

    const loadCurrentUser = async () => {
      setSpinning(true);
      try {
        const res = await getAccountProfile();
        if (!active) {
          return;
        }
        setInitData(res);
        const localizedRole = formatAccountRole(intl, res?.role);
        setRoleValue(localizedRole);
        formRefEdit.current?.setFieldsValue({
          ...res,
          role: localizedRole,
        });
      } catch (error) {
        if (active) {
          message.error(
            intl.formatMessage({
              id: 'pages.account.loadError',
              defaultMessage: 'An error occurred while loading the account profile.',
            }),
          );
        }
      } finally {
        if (active) {
          setSpinning(false);
        }
      }
    };

    void loadCurrentUser();

    return () => {
      active = false;
    };
  }, [intl]);

  return (
    <PageContainer
      className={`${styles.accountPage} ${accountPageStyles.page}`}
      title={<FormattedMessage id='menu.account.profile' defaultMessage='Account Profile' />}
    >
      <Spin spinning={spinning}>
        <Tabs
          activeKey={activeTabKey}
          onChange={onTabChange}
          tabPlacement={getAccountTabPlacement(isMobile)}
          items={[
            {
              key: 'baseInfo',
              label: intl.formatMessage({
                id: 'pages.account.baseInfo',
                defaultMessage: 'Basic Information',
              }),
              children: renderBaseForm(),
            },
            {
              key: 'changePassword',
              label: intl.formatMessage({
                id: 'pages.account.changePassword',
                defaultMessage: 'Change Password',
              }),
              children: renderChangePasswordForm(),
            },
            {
              key: 'changeEmail',
              label: intl.formatMessage({
                id: 'pages.account.changeEmail',
                defaultMessage: 'Change Email',
              }),
              children: renderChangeEmailForm(),
            },
            {
              key: 'oauthConnections',
              label: intl.formatMessage({
                id: 'pages.account.oauth.tab',
                defaultMessage: 'Connected apps',
              }),
              children: <OAuthConnections />,
            },
          ]}
        ></Tabs>
      </Spin>
    </PageContainer>
  );
};

export default Profile;
