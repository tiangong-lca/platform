import {
  AuditOutlined,
  LogoutOutlined,
  SettingOutlined,
  TeamOutlined,
  SwapOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { history, useIntl, useLocation, useModel } from '@umijs/max';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { logout } from '@/services/auth';
import { useAntdAppApi } from '@/contexts/AntdAppContext';
import { getReviewUserRoleApi, getSystemUserRoleApi, getUserRoles } from '@/services/roles/api';
import { reloadBrowserPage } from '@/utils/browserNavigation';
import { Button, Modal, Spin, theme } from 'antd';
import type { MenuProps } from 'antd';
import { flushSync } from 'react-dom';
import { FormattedMessage } from 'umi';
import AllTeams from '../AllTeams';
import HeaderDropdown from '../HeaderDropdown';

export type GlobalHeaderRightProps = {
  menu?: boolean;
  children?: React.ReactNode;
};

export const AvatarName = () => {
  const { initialState } = useModel('@@initialState');
  const { currentUser } = initialState || {};
  const { token } = theme.useToken();
  const displayName = currentUser?.name ?? '';
  return (
    <span
      className='tg-global-header-avatar-name'
      style={{
        color: token.colorText,
      }}
    >
      <UserOutlined />
      <span className='tg-global-header-avatar-name-text' title={displayName}>
        {displayName}
      </span>
    </span>
  );
};

export const AvatarDropdown: React.FC<GlobalHeaderRightProps> = ({ children }) => {
  const { modal } = useAntdAppApi();
  const intl = useIntl();
  const location = useLocation();
  const { token } = theme.useToken();
  const [isLoadingHovered, setIsLoadingHovered] = useState(false);
  // const [isUserInTeam, setIsUserInTeam] = useState(false);
  const [showAllTeamsModal, setShowAllTeamsModal] = useState(false);
  const [systemUserData, setSystemUserData] = useState<{
    user_id: string;
    role: string;
  } | null>(null);
  const [reviewUserData, setReviewUserData] = useState<{
    user_id: string;
    role: string;
  } | null>(null);

  const getUserRole = async () => {
    const { data } = await getUserRoles();

    if (data && data?.length && data[0].role !== 'rejected') {
      // setIsUserInTeam(true);
      return true;
    } else {
      // setIsUserInTeam(false);
      return false;
    }
  };

  const getMenuUserRoles = async () => {
    const [systemUserData, reviewUserData] = await Promise.all([
      getSystemUserRoleApi(),
      getReviewUserRoleApi(),
    ]);
    setSystemUserData(systemUserData);
    setReviewUserData(reviewUserData);
  };

  useEffect(() => {
    // getUserRole();
    getMenuUserRoles();
  }, []);
  /**
   * Logout and save the current URL
   */
  const loginOut = useCallback(async () => {
    await logout();
    const { pathname, search } = location;
    const urlParams = new URLSearchParams(search);
    /** This method will redirect to the location specified by the redirect parameter */
    const redirect = urlParams.get('redirect');
    // Note: There may be security issues, please note
    if (pathname !== '/user/login' && !redirect) {
      const params = new URLSearchParams();
      params.set('redirect', pathname + search);
      history.replace({
        pathname: '/user/login',
        search: params.toString(),
      });
    }
  }, [location]);
  const { initialState, setInitialState } = useModel('@@initialState');

  const onMenuClick = useCallback(
    async (event: Parameters<NonNullable<MenuProps['onClick']>>[0]) => {
      const { key } = event;
      if (key === 'logout') {
        flushSync(() => {
          setInitialState((s) => ({ ...s, currentUser: undefined }));
        });
        loginOut();
        return;
      }
      if (key === 'data-transfer') {
        history.push('/data-transfer');
        return;
      }
      if (key === 'system') {
        history.push(`/manageSystem`);

        return;
      }
      if (key === 'review') {
        history.push(`/review`);
        return;
      }
      if (key === 'team') {
        const isUserInTeam = await getUserRole();
        if (isUserInTeam) {
          history.push(`/team?action=edit`);
        } else {
          const confirmModal = modal.confirm({
            okButtonProps: {
              type: 'primary',
              style: { backgroundColor: token.colorPrimary },
            },
            cancelButtonProps: {
              style: { borderColor: token.colorPrimary, color: token.colorPrimary },
            },
            title: intl.formatMessage({
              id: 'teams.modal.noTeam.title',
              defaultMessage: 'You are not in any team',
            }),
            content: intl.formatMessage({
              id: 'teams.modal.noTeam.content',
              defaultMessage: 'You can create a team or join an existing team.',
            }),
            closable: true,
            footer: () => (
              <>
                <Button
                  style={{ borderColor: token.colorPrimary, color: token.colorPrimary }}
                  onClick={() => {
                    setShowAllTeamsModal(true);
                    confirmModal.destroy();
                  }}
                >
                  {intl.formatMessage({
                    id: 'teams.modal.noTeam.join',
                    defaultMessage: 'Join Team',
                  })}
                  {/* <FormattedMessage id="" defaultMessage="" /> */}
                </Button>
                <Button
                  type='primary'
                  style={{ backgroundColor: token.colorPrimary }}
                  onClick={() => {
                    confirmModal.destroy();
                    if (location.pathname === '/team') {
                      const searchParams = new URLSearchParams(location.search);
                      searchParams.set('action', 'create');
                      history.replace({
                        pathname: location.pathname,
                        search: searchParams.toString(),
                      });
                      reloadBrowserPage(window.location);
                    } else {
                      history.push('/team?action=create');
                    }
                  }}
                >
                  {/* <FormattedMessage id="teams.modal.noTeam.create" defaultMessage="Create Team" /> */}
                  {intl.formatMessage({
                    id: 'teams.modal.noTeam.create',
                    defaultMessage: 'Create Team',
                  })}
                </Button>
              </>
            ),
          });
        }
        return;
      }
      history.push(`/account`);
    },
    [
      intl,
      location.pathname,
      location.search,
      loginOut,
      modal,
      setInitialState,
      token.colorPrimary,
    ],
  );

  const loadingContainerStyle = useMemo(
    () => ({
      display: 'flex',
      height: '48px',
      marginLeft: 'auto',
      overflow: 'hidden',
      alignItems: 'center',
      padding: '0 8px',
      cursor: 'pointer',
      borderRadius: token.borderRadius,
    }),
    [token.borderRadius],
  );

  const loading = (
    <span
      style={{
        ...loadingContainerStyle,
        backgroundColor: isLoadingHovered ? token.colorBgTextHover : undefined,
      }}
      onMouseEnter={() => setIsLoadingHovered(true)}
      onMouseLeave={() => setIsLoadingHovered(false)}
    >
      <Spin
        size='small'
        style={{
          marginLeft: 8,
          marginRight: 8,
        }}
      />
    </span>
  );

  if (!initialState) {
    return loading;
  }

  const { currentUser } = initialState;

  if (!currentUser || !currentUser.name) {
    return loading;
  }

  const canViewSystemManagement = ['admin', 'owner', 'member'].includes(systemUserData?.role ?? '');
  const canViewReviewManagement = ['review-admin', 'review-member'].includes(
    reviewUserData?.role ?? '',
  );

  const menuItems: MenuProps['items'] = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: <FormattedMessage id='menu.account.profile' defaultMessage='Account Profile' />,
    },
    {
      key: 'team',
      icon: <TeamOutlined />,
      label: <FormattedMessage id='menu.account.team' defaultMessage='My Team' />,
    },
    {
      key: 'data-transfer',
      icon: <SwapOutlined />,
      label: <FormattedMessage id='menu.dataTransfer' defaultMessage='Import and export' />,
    },
    ...(canViewSystemManagement
      ? [
          {
            key: 'system',
            icon: <SettingOutlined />,
            label: <FormattedMessage id='menu.manageSystem' defaultMessage='System Management' />,
          },
        ]
      : []),
    ...(canViewReviewManagement
      ? [
          {
            key: 'review',
            icon: <AuditOutlined />,
            label: <FormattedMessage id='menu.account.review' defaultMessage='Review Management' />,
          },
        ]
      : []),
    {
      type: 'divider' as const,
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: <FormattedMessage id='menu.account.logout' defaultMessage='Logout' />,
    },
  ];

  return (
    <>
      <HeaderDropdown
        trigger={['hover', 'click']}
        styles={{
          root: {
            width: 'max-content',
            maxWidth: 'min(220px, calc(100vw - 24px))',
          },
          itemContent: {
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          },
        }}
        menu={{
          selectedKeys: [],
          onClick: onMenuClick,
          items: menuItems,
        }}
      >
        {children}
      </HeaderDropdown>
      <Modal
        title={<FormattedMessage id='component.allTeams.table.title' defaultMessage='All Teams' />}
        closable
        width={'90%'}
        styles={{ body: { height: 'min(70dvh, 720px)', minHeight: 0, overflow: 'hidden' } }}
        open={showAllTeamsModal}
        onCancel={() => setShowAllTeamsModal(false)}
        footer={null}
      >
        <AllTeams tableType='joinTeam' />
      </Modal>
    </>
  );
};
