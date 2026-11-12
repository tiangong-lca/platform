import accountPageStyles from '@/components/AccountPage/index.less';
import LangTextItemForm from '@/components/LangTextItem/form';
import { useAntdAppApi } from '@/contexts/AntdAppContext';
import RequiredMark from '@/components/RequiredMark';
import { ListPagination } from '@/services/general/data';
import { resolveRouteViewState } from '@/services/general/routeViewState';
import {
  createTeamMessage,
  delRoleApi,
  getUserRoles,
  reInvitedApi,
  updateRoleApi,
} from '@/services/roles/api';
import {
  FileType,
  getBase64,
  getThumbFileUrls,
  isImage,
  removeLogoApi,
  uploadLogoApi,
} from '@/services/supabase/storage';
import { editTeamMessage, getTeamMembersApi, getTeamMessageApi } from '@/services/teams/api';
import { TeamMemberTable } from '@/services/teams/data';
import { reloadBrowserPage } from '@/utils/browserNavigation';
import {
  CrownOutlined,
  DeleteOutlined,
  EyeOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  UserAddOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  PageContainer,
  ProColumns,
  ProForm,
  ProFormInstance,
  ProTable,
} from '@ant-design/pro-components';
import { FormattedMessage, history, useIntl, useLocation } from '@umijs/max';
import {
  Button,
  Flex,
  Form,
  Grid,
  Spin,
  Switch,
  Tabs,
  theme,
  Tooltip,
  Typography,
  Upload,
} from 'antd';
import { Children, useEffect, useRef, useState } from 'react';
import { v4 } from 'uuid';
import AddMemberModal from './Components/AddMemberModal';
import './index.less';

const DEFAULT_CREATE_TEAM_RANK = -1;
const DEFAULT_CREATE_TEAM_IS_PUBLIC = false;

const Team = () => {
  const { message, modal } = useAntdAppApi();
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const [activeTabKey, setActiveTabKey] = useState('info');
  const [teamId, setTeamId] = useState('');
  const [userRole, setUserRole] = useState('');

  const formRefEdit = useRef<ProFormInstance | undefined>(undefined);

  const [lightLogo, setLightLogo] = useState<FileType[]>([]);
  const [lightLogoPreviewUrl, setLightLogoPreviewUrl] = useState('');
  const [lightLogoError, setLightLogoError] = useState(false);
  const [beforeLightLogoPath, setBeforeLightLogoPath] = useState<string>('');

  const [darkLogo, setDarkLogo] = useState<FileType[]>([]);
  const [darkLogoPreviewUrl, setDarkLogoPreviewUrl] = useState('');
  const [darkLogoError, setDarkLogoError] = useState(false);
  const [beforeDarkLogoPath, setBeforeDarkLogoPath] = useState<string>('');

  const [teamInfoSpinning, setTeamInfoSpinning] = useState(false);

  const [membersLoading, setMembersLoading] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);

  const [titleError, setTitleError] = useState(false);
  const [descriptionError, setDescriptionError] = useState(false);

  const [rank, setRank] = useState(-1);
  const actionRef = useRef<any>(null);
  const location = useLocation();
  const action = resolveRouteViewState(
    'team-action',
    new URLSearchParams(location.search).get('action'),
  );

  const intl = useIntl();

  const initialUseTeamId = async () => {
    const { data, success } = await getUserRoles();
    if (success && data.length) {
      setTeamId(data[0].team_id);
      setUserRole(data[0].role);
    }
  };

  useEffect(() => {
    if (action === 'edit') {
      void initialUseTeamId();
    }
  }, [action]);

  const getTeamInfo = async (id: string) => {
    setTeamInfoSpinning(true);
    const { data, error } = await getTeamMessageApi(id);
    if (error) {
      message.error(
        intl.formatMessage({
          id: 'pages.team.getDetailError',
          defaultMessage: 'Failed to get details, please refresh!',
        }),
      );
    } else if (data.length > 0) {
      const { title, description } = data[0]?.json ?? {};
      setRank(data[0]?.rank);

      const formData: any = {
        title: title || [],
        description: description || [],
        rank: data[0]?.rank,
        is_public: data[0]?.is_public,
        lightLogo: data[0]?.json?.lightLogo,
        darkLogo: data[0]?.json?.darkLogo,
      };

      setBeforeLightLogoPath(data[0]?.json?.lightLogo);
      setBeforeDarkLogoPath(data[0]?.json?.darkLogo);

      getThumbFileUrls([{ '@uri': `${data[0]?.json?.lightLogo}` }]).then((res) => {
        if (res[0]?.status === 'done') {
          setLightLogoPreviewUrl(res[0]?.thumbUrl);
        }
      });
      if (data[0]?.json?.lightLogo) {
        setLightLogo(
          Array.isArray(data[0]?.json?.lightLogo)
            ? data[0]?.json?.lightLogo
            : [data[0]?.json?.lightLogo],
        );
      } else {
        setLightLogo([]);
      }

      getThumbFileUrls([{ '@uri': `${data[0]?.json?.darkLogo}` }]).then((res) => {
        if (res[0]?.status === 'done') {
          setDarkLogoPreviewUrl(res[0]?.thumbUrl);
        }
      });
      if (data[0]?.json?.darkLogo) {
        setDarkLogo(
          Array.isArray(data[0]?.json?.darkLogo)
            ? data[0]?.json?.darkLogo
            : [data[0]?.json?.darkLogo],
        );
      } else {
        setDarkLogo([]);
      }

      formRefEdit.current?.setFieldsValue({
        ...formData,
      });
    }
    setTeamInfoSpinning(false);
  };

  useEffect(() => {
    if (teamId && userRole !== 'rejected') {
      getTeamInfo(teamId);
      actionRef.current?.reload();
    }
  }, [teamId, userRole]);

  const onTabChange = (key: string) => {
    setActiveTabKey(key);
  };

  const renderTeamInfoForm = () => {
    const hasLightLogoPreview =
      lightLogo.length > 0 && lightLogoPreviewUrl && lightLogoPreviewUrl !== '.';
    const hasDarkLogoPreview =
      darkLogo.length > 0 && darkLogoPreviewUrl && darkLogoPreviewUrl !== '.';

    const getParams = (input: Record<string, any>) => {
      const result: Record<string, any> = {};

      Object.entries(input).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          result[key] = value;
        } else if (key !== 'rank' && key !== 'lightLogo' && key !== 'darkLogo') {
          const [field, lang] = key.split('-');

          if (!result[field]) {
            result[field] = [];
          }

          result[field].push({
            '#text': value,
            '@xml:lang': lang,
          });
        } else {
          result[key] = value;
        }
      });

      return result;
    };

    const removeLogo = async (type: 'lightLogo' | 'darkLogo') => {
      if (type === 'lightLogo') {
        setLightLogo([]);
        setLightLogoPreviewUrl('');
      } else {
        setDarkLogo([]);
        setDarkLogoPreviewUrl('');
      }
    };

    const editTeamInfo = async (values: any) => {
      const { rank, is_public } = values;
      delete values.rank;
      delete values.is_public;
      const params = getParams(values);
      const { error } = await editTeamMessage(teamId, { ...params }, rank, is_public);
      if (error) {
        message.error(
          intl.formatMessage({
            id: 'pages.team.updateError',
            defaultMessage: 'Failed to update team information.',
          }),
        );
      } else {
        message.success(
          intl.formatMessage({
            id: 'pages.team.editsuccess',
            defaultMessage: 'Team updated successfully.',
          }),
        );
      }
    };

    const createTeamInfo = async (values: any) => {
      const { rank, is_public } = values;
      const normalizedRank = typeof rank === 'number' ? rank : DEFAULT_CREATE_TEAM_RANK;
      const normalizedIsPublic =
        typeof is_public === 'boolean' ? is_public : DEFAULT_CREATE_TEAM_IS_PUBLIC;
      delete values.rank;
      delete values.is_public;
      const params = getParams(values);
      const error = await createTeamMessage(
        v4(),
        { ...params },
        normalizedRank,
        normalizedIsPublic,
      );
      if (error) {
        message.error(
          intl.formatMessage({
            id: 'pages.team.updateError',
            defaultMessage: 'Failed to update team information.',
          }),
        );
      } else {
        message.success(
          intl.formatMessage({
            id: 'pages.team.createSuccess',
            defaultMessage: 'Team created successfully.',
          }),
        );
        history.replace(`/team?action=edit`);
        reloadBrowserPage(window.location);
      }
    };

    const uploadLogo = async (fileList: FileType[], type: 'lightLogo' | 'darkLogo') => {
      if (fileList.length > 0) {
        const file = fileList[0];
        if (file) {
          if (!isImage(file)) {
            message.error(
              intl.formatMessage({
                id: 'teams.logo.typeError',
                defaultMessage: 'Only image files can be uploaded!',
              }),
            );
            if (type === 'lightLogo') {
              setLightLogo([]);
            } else {
              setDarkLogo([]);
            }
            return null;
          }

          try {
            const suffix: string = file.name.split('.').pop() || '';
            const { data } = await uploadLogoApi(file.name, file, suffix);
            if (!data?.path) {
              message.error(
                intl.formatMessage({
                  id: 'teams.logo.uploadError',
                  defaultMessage: 'Failed to upload team logo.',
                }),
              );
              return null;
            }
            if (type === 'lightLogo') {
              setLightLogoError(false);
              setBeforeLightLogoPath(data?.path);
              return data.path;
            } else {
              setDarkLogoError(false);
              setBeforeDarkLogoPath(data?.path);
              return data.path;
            }
          } catch (error) {
            console.log('upload error', error);
            message.error(
              intl.formatMessage({
                id: 'teams.logo.uploadError',
                defaultMessage: 'Failed to upload team logo.',
              }),
            );
            return null;
          }
        }
      }
      return null;
    };

    const handleRemoveLogo = async (type: 'lightLogo' | 'darkLogo') => {
      if (type === 'lightLogo') {
        setLightLogo([]);
        setLightLogoPreviewUrl('');
        await removeLogoApi([beforeLightLogoPath]);
      } else {
        setDarkLogo([]);
        setDarkLogoPreviewUrl('');
        await removeLogoApi([beforeDarkLogoPath]);
      }
    };

    const submitTeamInfo = async (values: any) => {
      try {
        if (!lightLogo.length || !darkLogo.length) {
          const currentRank = typeof values.rank === 'number' ? values.rank : rank;
          if (currentRank === 0) {
            setLightLogoError(!lightLogo.length);
            setDarkLogoError(!darkLogo.length);
            return;
          } else {
            if (!lightLogo.length && beforeLightLogoPath) {
              await handleRemoveLogo('lightLogo');
            }
            if (!darkLogo.length && beforeDarkLogoPath) {
              await handleRemoveLogo('darkLogo');
            }
          }
        }

        setTeamInfoSpinning(true);

        const needsLightLogoUpload = lightLogo.length > 0 && typeof lightLogo[0] !== 'string';
        const needsDarkLogoUpload = darkLogo.length > 0 && typeof darkLogo[0] !== 'string';
        const lightLogoPath =
          typeof lightLogo[0] === 'string'
            ? lightLogo[0]
            : await uploadLogo(lightLogo, 'lightLogo');
        if (needsLightLogoUpload && !lightLogoPath) {
          return;
        }
        const darkLogoPath =
          typeof darkLogo[0] === 'string' ? darkLogo[0] : await uploadLogo(darkLogo, 'darkLogo');
        if (needsDarkLogoUpload && !darkLogoPath) {
          return;
        }
        values.lightLogo =
          typeof lightLogo[0] === 'string'
            ? lightLogo[0]
            : lightLogoPath
              ? `../sys-files/${lightLogoPath}`
              : null;
        values.darkLogo =
          typeof darkLogo[0] === 'string'
            ? darkLogo[0]
            : darkLogoPath
              ? `../sys-files/${darkLogoPath}`
              : null;

        if (action === 'edit') {
          if (!teamId) return;
          await editTeamInfo(values);
        }
        if (action === 'create') {
          await createTeamInfo(values);
        }
      } catch (error) {
        console.log(error);
      } finally {
        setTeamInfoSpinning(false);
      }
    };

    return (
      <Spin spinning={teamInfoSpinning}>
        <ProForm
          className='team-info-form'
          prefixCls='team-form'
          disabled={
            (userRole !== 'admin' && userRole !== 'owner' && action !== 'create') || rank > 0
          }
          formRef={formRefEdit}
          submitter={{
            resetButtonProps: false,
            render: (_, dom) => <div className='team-info-submitter'>{Children.toArray(dom)}</div>,
          }}
          onFinish={(values) => submitTeamInfo(values)}
          initialValues={{
            rank: DEFAULT_CREATE_TEAM_RANK,
            is_public: DEFAULT_CREATE_TEAM_IS_PUBLIC,
          }}
        >
          <section className='team-info-card team-info-card-basic'>
            <Typography.Title className='team-info-section-title' level={5}>
              <FormattedMessage
                id='pages.team.info.section.basic'
                defaultMessage='Basic Information'
              />
            </Typography.Title>
            <div className='team-info-basic-grid'>
              <div className='team-info-basic-fields'>
                <Form.Item
                  className='team-lang-field'
                  label={
                    <RequiredMark
                      label={
                        <FormattedMessage id='pages.team.info.title' defaultMessage='Team Name' />
                      }
                      showError={titleError}
                    />
                  }
                  style={{ marginBottom: 0 }}
                >
                  <LangTextItemForm
                    name='title'
                    label={
                      <FormattedMessage id='pages.team.info.title' defaultMessage='Team Name' />
                    }
                    rules={[
                      {
                        required: true,
                        message: (
                          <FormattedMessage
                            id='pages.team.info.title.required'
                            defaultMessage='Please input team name!'
                          />
                        ),
                      },
                    ]}
                    setRuleErrorState={setTitleError}
                  />
                </Form.Item>
                <Form.Item
                  className='team-lang-field'
                  label={
                    <RequiredMark
                      label={
                        <FormattedMessage
                          id='pages.team.info.description'
                          defaultMessage='Team Description'
                        />
                      }
                      showError={descriptionError}
                    />
                  }
                  style={{ marginBottom: 0 }}
                >
                  <LangTextItemForm
                    name='description'
                    label={
                      <FormattedMessage
                        id='pages.team.info.description'
                        defaultMessage='Team Description'
                      />
                    }
                    rules={[
                      {
                        required: true,
                        message: (
                          <FormattedMessage
                            id='pages.team.info.description.required'
                            defaultMessage='Please input team description!'
                          />
                        ),
                      },
                    ]}
                    setRuleErrorState={setDescriptionError}
                  />
                </Form.Item>
              </div>
            </div>
          </section>

          <section className='team-info-card'>
            <Typography.Title className='team-info-section-title' level={5}>
              <FormattedMessage
                id='pages.team.info.section.visibility'
                defaultMessage='Team visibility and display'
              />
            </Typography.Title>
            <div className='team-switch-grid'>
              <Form.Item
                className='team-switch-item'
                name='is_public'
                label={
                  <>
                    <FormattedMessage
                      id='pages.team.info.public'
                      defaultMessage='Public team information'
                    />
                    <Tooltip title={intl.formatMessage({ id: 'pages.team.info.public.tooltip' })}>
                      <QuestionCircleOutlined style={{ marginLeft: 4 }} />
                    </Tooltip>
                  </>
                }
                valuePropName='checked'
              >
                <Switch
                  disabled={
                    (userRole !== 'admin' && userRole !== 'owner' && action !== 'create') ||
                    rank > 0
                  }
                />
              </Form.Item>
              <Form.Item
                className='team-switch-item'
                name='rank'
                label={
                  <>
                    <FormattedMessage
                      id='pages.team.info.showInHome'
                      defaultMessage='Apply to display on the homepage'
                    />
                    <Tooltip
                      title={intl.formatMessage({ id: 'pages.team.info.showInHome.tooltip' })}
                    >
                      <QuestionCircleOutlined style={{ marginLeft: 4 }} />
                    </Tooltip>
                  </>
                }
                valuePropName='checked'
                getValueProps={(value) => ({
                  checked: value === 0,
                })}
                normalize={(value) => {
                  return value ? 0 : -1;
                }}
              >
                <Switch
                  disabled={
                    (userRole !== 'admin' && userRole !== 'owner' && action !== 'create') ||
                    rank > 0
                  }
                  onChange={(checked) => {
                    setRank(checked ? 0 : -1);
                    setLightLogoError(false);
                    setDarkLogoError(false);
                  }}
                />
              </Form.Item>
            </div>
          </section>

          <section className='team-info-card team-logo-card'>
            <Typography.Title className='team-info-section-title' level={5}>
              <FormattedMessage id='pages.team.info.section.logo' defaultMessage='Team Logo' />
            </Typography.Title>
            <div className='team-logo-grid'>
              <Form.Item
                className='team-logo-form-item'
                name='lightLogo'
                label={
                  <FormattedMessage id='pages.team.info.lightLogo' defaultMessage='Light Logo' />
                }
                rules={[
                  {
                    required: rank === 0,
                    message: (
                      <FormattedMessage
                        id='pages.team.info.lightLogo.required'
                        defaultMessage='Please upload light logo!'
                      />
                    ),
                  },
                ]}
                validateStatus={lightLogoError ? 'error' : undefined}
                help={
                  lightLogoError ? (
                    <FormattedMessage
                      id='pages.team.info.lightLogo.required'
                      defaultMessage='Please upload light logo!'
                    />
                  ) : undefined
                }
              >
                <div className='team-logo-upload team-logo-upload-light'>
                  <Upload
                    prefixCls='team-logo-upload-slot'
                    classNames={{
                      root: 'team-logo-upload-root',
                      list: 'team-logo-upload-list',
                      item: 'team-logo-upload-item',
                      trigger: 'team-logo-upload-trigger',
                    }}
                    disabled={
                      (userRole !== 'admin' && userRole !== 'owner' && action !== 'create') ||
                      rank > 0
                    }
                    beforeUpload={(file) => {
                      getBase64(file as FileType).then((url) => {
                        setLightLogoPreviewUrl(url);
                        setLightLogo([file]);
                        setLightLogoError(false);
                      });

                      return false;
                    }}
                    onChange={({ fileList }) => {
                      if (fileList.length === 0) {
                        setLightLogo([]);
                        setLightLogoPreviewUrl('');
                      }
                    }}
                    onRemove={() => removeLogo('lightLogo')}
                    maxCount={1}
                    isImageUrl={() => true}
                    listType='picture-card'
                    showUploadList={{
                      previewIcon: (
                        <EyeOutlined className='team-logo-action-icon team-logo-preview-icon' />
                      ),
                      removeIcon: (
                        <DeleteOutlined className='team-logo-action-icon team-logo-delete-icon' />
                      ),
                    }}
                    fileList={
                      hasLightLogoPreview
                        ? [
                            {
                              uid: '-1',
                              name: 'logo.png',
                              status: 'done',
                              thumbUrl: lightLogoPreviewUrl,
                              url: lightLogoPreviewUrl,
                            },
                          ]
                        : []
                    }
                  >
                    {!hasLightLogoPreview && <PlusOutlined className='team-logo-upload-plus' />}
                  </Upload>
                </div>
              </Form.Item>

              <Form.Item
                className='team-logo-form-item'
                name='darkLogo'
                label={
                  <FormattedMessage id='pages.team.info.darkLogo' defaultMessage='Dark Logo' />
                }
                rules={[
                  {
                    required: rank === 0,
                    message: (
                      <FormattedMessage
                        id='pages.team.info.darkLogo.required'
                        defaultMessage='Please upload dark logo!'
                      />
                    ),
                  },
                ]}
                validateStatus={darkLogoError ? 'error' : undefined}
                help={
                  darkLogoError ? (
                    <FormattedMessage
                      id='pages.team.info.darkLogo.required'
                      defaultMessage='Please upload dark logo!'
                    />
                  ) : undefined
                }
              >
                <div
                  className={[
                    'team-logo-upload',
                    'team-logo-upload-dark',
                    hasDarkLogoPreview ? 'team-logo-upload-has-file' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <Upload
                    prefixCls='team-logo-upload-slot'
                    classNames={{
                      root: 'team-logo-upload-root',
                      list: 'team-logo-upload-list',
                      item: 'team-logo-upload-item',
                      trigger: 'team-logo-upload-trigger',
                    }}
                    disabled={
                      (userRole !== 'admin' && userRole !== 'owner' && action !== 'create') ||
                      rank > 0
                    }
                    beforeUpload={(file) => {
                      getBase64(file as FileType).then((url) => {
                        setDarkLogoPreviewUrl(url);
                        setDarkLogo([file]);
                        setDarkLogoError(false);
                      });
                      return false;
                    }}
                    onChange={({ fileList }) => {
                      if (fileList.length === 0) {
                        setDarkLogo([]);
                        setDarkLogoPreviewUrl('');
                      }
                    }}
                    onRemove={() => removeLogo('darkLogo')}
                    maxCount={1}
                    isImageUrl={() => true}
                    listType='picture-card'
                    showUploadList={{
                      previewIcon: (
                        <EyeOutlined className='team-logo-action-icon team-logo-preview-icon' />
                      ),
                      removeIcon: (
                        <DeleteOutlined className='team-logo-action-icon team-logo-delete-icon' />
                      ),
                    }}
                    fileList={
                      hasDarkLogoPreview
                        ? [
                            {
                              uid: '-1',
                              name: 'logo.png',
                              status: 'done',
                              thumbUrl: darkLogoPreviewUrl,
                              url: darkLogoPreviewUrl,
                            },
                          ]
                        : []
                    }
                  >
                    {!hasDarkLogoPreview && <PlusOutlined className='team-logo-upload-plus' />}
                  </Upload>
                </div>
              </Form.Item>
            </div>
            <div className='team-logo-helper'>
              <QuestionCircleOutlined />
              <FormattedMessage
                id='pages.team.info.logo.helper'
                defaultMessage='Transparent PNG or SVG is recommended for the best display effect.'
              />
            </div>
          </section>
        </ProForm>
      </Spin>
    );
  };

  const renderTeamMembersForm = () => {
    const updateRole = async (teamId: string, userId: string, role: 'admin' | 'member') => {
      try {
        const { error } = await updateRoleApi(teamId, userId, role);
        if (error) {
          message.error(
            intl.formatMessage({
              id: 'teams.members.actionError',
              defaultMessage: 'Action failed!',
            }),
          );
        } else {
          message.success(
            intl.formatMessage({
              id: 'teams.members.actionSuccess',
              defaultMessage: 'Action success!',
            }),
          );
          actionRef.current?.reload();
        }
      } catch (error) {
        console.error(error);
      }
    };

    const columns: ProColumns<TeamMemberTable>[] = [
      {
        title: <FormattedMessage id='teams.members.email' defaultMessage='Email' />,
        dataIndex: 'email',
        key: 'email',
      },
      {
        title: <FormattedMessage id='teams.members.memberName' defaultMessage='Member Name' />,
        dataIndex: 'display_name',
        key: 'display_name',
      },
      {
        title: <FormattedMessage id='teams.members.role' defaultMessage='Role' />,
        dataIndex: 'role',
        key: 'role',
        render: (_, record) => (
          <span>
            {record.role === 'admin' ? (
              <FormattedMessage id='teams.members.role.admin' defaultMessage='Admin' />
            ) : record.role === 'is_invited' ? (
              <FormattedMessage id='teams.members.role.invited' defaultMessage='Invited' />
            ) : record.role === 'owner' ? (
              <FormattedMessage id='teams.members.role.owner' defaultMessage='Owner' />
            ) : record.role === 'rejected' ? (
              <FormattedMessage id='teams.members.role.rejected' defaultMessage='Rejected' />
            ) : (
              <FormattedMessage id='teams.members.role.member' defaultMessage='Member' />
            )}
          </span>
        ),
      },
      {
        title: <FormattedMessage id='teams.members.actions' defaultMessage='Actions' />,
        key: 'actions',
        render: (_: any, record: TeamMemberTable) => (
          <Flex gap='small'>
            {
              <Tooltip
                title={
                  <FormattedMessage id='teams.members.delete' defaultMessage='Remove Member' />
                }
              >
                <Button
                  disabled={
                    !(record.role !== 'owner' && (userRole === 'owner' || userRole === 'admin'))
                  }
                  shape='circle'
                  size='small'
                  icon={<DeleteOutlined />}
                  onClick={() => {
                    modal.confirm({
                      okButtonProps: {
                        type: 'primary',
                        style: { backgroundColor: token.colorPrimary },
                      },
                      cancelButtonProps: {
                        style: { borderColor: token.colorPrimary, color: token.colorPrimary },
                      },
                      title: intl.formatMessage({ id: 'teams.members.deleteConfirm.title' }),
                      content: intl.formatMessage({ id: 'teams.members.deleteConfirm.content' }),
                      onOk: async () => {
                        try {
                          const { error } = await delRoleApi(
                            record.team_id,
                            record.user_id,
                            record.role,
                          );
                          if (error) {
                            message.error(
                              intl.formatMessage({
                                id: 'teams.members.actionError',
                                defaultMessage: 'Action failed!',
                              }),
                            );
                          } else {
                            message.success(
                              intl.formatMessage({
                                id: 'teams.members.actionSuccess',
                                defaultMessage: 'Action success!',
                              }),
                            );
                          }
                          actionRef.current?.reload();
                        } catch (error) {
                          console.error(error);
                        }
                      },
                    });
                  }}
                />
              </Tooltip>
            }
            {
              <Tooltip
                title={
                  <FormattedMessage id='teams.members.setAdmin' defaultMessage='Set as Admin' />
                }
              >
                <Button
                  shape='circle'
                  size='small'
                  disabled={!(record.role === 'member' && userRole === 'owner')}
                  icon={<CrownOutlined />}
                  onClick={() => updateRole(record?.team_id, record?.user_id, 'admin')}
                />
              </Tooltip>
            }
            {
              <Tooltip
                title={
                  <FormattedMessage id='teams.members.setMember' defaultMessage='Set as Member' />
                }
              >
                <Button
                  disabled={!(record.role === 'admin' && userRole === 'owner')}
                  shape='circle'
                  size='small'
                  icon={<UserOutlined />}
                  onClick={() => updateRole(record?.team_id, record?.user_id, 'member')}
                />
              </Tooltip>
            }
            {
              <Tooltip
                title={<FormattedMessage id='teams.members.reInvite' defaultMessage='Re-invite' />}
              >
                <Button
                  disabled={
                    !(record.role === 'rejected' && (userRole === 'admin' || userRole === 'owner'))
                  }
                  shape='circle'
                  size='small'
                  icon={<UserAddOutlined />}
                  onClick={async () => {
                    const error = await reInvitedApi(record?.user_id, record?.team_id);
                    if (error) {
                      message.error(
                        intl.formatMessage({
                          id: 'teams.members.actionError',
                          defaultMessage: 'Action failed!',
                        }),
                      );
                    } else {
                      actionRef.current?.reload();
                      message.success(
                        intl.formatMessage({
                          id: 'teams.members.actionSuccess',
                          defaultMessage: 'Action success!',
                        }),
                      );
                    }
                  }}
                />
              </Tooltip>
            }
          </Flex>
        ),
      },
    ];

    return (
      <>
        <ProTable<TeamMemberTable, ListPagination>
          headerTitle={
            <>
              <FormattedMessage id='menu.account.team' defaultMessage='My Team' /> /{' '}
              <FormattedMessage id='pages.team.tabs.members' defaultMessage='Team Members' />
            </>
          }
          toolBarRender={() => {
            return [
              <Tooltip
                key={0}
                title={<FormattedMessage id='teams.members.add' defaultMessage='Add Member' />}
              >
                <Button
                  type='text'
                  disabled={!(userRole === 'admin' || userRole === 'owner')}
                  icon={<PlusOutlined />}
                  onClick={() => setAddModalVisible(true)}
                />
              </Tooltip>,
            ];
          }}
          loading={membersLoading}
          columns={columns}
          rowKey='email'
          search={false}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
          }}
          request={async (
            params: {
              pageSize: number;
              current: number;
            },
            sort,
          ) => {
            try {
              if (!teamId || userRole === 'rejected') {
                return {
                  data: [],
                  success: true,
                  total: 0,
                };
              }
              setMembersLoading(true);
              const { data, success } = await getTeamMembersApi(params, sort, teamId);

              return {
                data: data || [],
                success: success || false,
                total: data?.length || 0,
              };
            } catch (error) {
              console.error(error);
              return {
                data: [],
                success: false,
                total: 0,
              };
            } finally {
              setMembersLoading(false);
            }
          }}
          actionRef={actionRef}
        />
        <AddMemberModal
          open={addModalVisible}
          onCancel={() => setAddModalVisible(false)}
          teamId={teamId}
          onSuccess={() => {
            actionRef.current?.reload();
          }}
        />
      </>
    );
  };

  const tabs = [
    {
      key: 'info',
      label: <FormattedMessage id='pages.team.tabs.info' defaultMessage='Team Information' />,
      children: renderTeamInfoForm(),
    },
  ];
  if (action === 'edit') {
    tabs.splice(1, 0, {
      key: 'members',
      label: <FormattedMessage id='pages.team.tabs.members' defaultMessage='Team Members' />,
      children: renderTeamMembersForm(),
    });
  }

  return (
    <PageContainer
      className={accountPageStyles.page}
      title={<FormattedMessage id='menu.account.team' defaultMessage='My Team' />}
    >
      <Tabs
        activeKey={activeTabKey}
        className='team-page-tabs'
        classNames={{ item: 'team-page-tabs-item' }}
        onChange={onTabChange}
        tabPlacement={screens.lg === false ? 'top' : 'start'}
        items={tabs}
      />
    </PageContainer>
  );
};

export default Team;
