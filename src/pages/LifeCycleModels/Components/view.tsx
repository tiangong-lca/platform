import X6GraphComponent from '@/components/X6Graph';
import { GraphProvider } from '@/contexts/graphContext';
import { AppstoreOutlined, CloseOutlined, ProfileOutlined } from '@ant-design/icons';
import { ActionType } from '@ant-design/pro-components';
import { Button, Drawer, Layout, theme, Tooltip } from 'antd';
import type { ButtonType } from 'antd/es/button';
import type { FC } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { FormattedMessage } from 'umi';
import { lifeCycleModelConnectionOptions } from './graphConnectionOptions';
import ToolbarView from './toolbar/viewIndex';
type Props = {
  id: string;
  version: string;
  buttonType: string;
  lang: string;
  actionRef?: React.RefObject<ActionType | undefined>;
  buttonTypeProp?: ButtonType;
  tooltipTitle?: string;
  disabled?: boolean;
  autoOpen?: boolean;
  onDrawerClose?: () => void;
};
const LifeCycleModelView: FC<Props> = ({
  id,
  version,
  buttonType,
  lang,
  actionRef,
  buttonTypeProp = 'default',
  tooltipTitle,
  disabled = false,
  autoOpen = false,
  onDrawerClose,
}) => {
  const [drawerVisible, setDrawerVisible] = useState(false);
  const { token } = theme.useToken();

  const { Sider, Content } = Layout;

  const onView = useCallback(() => {
    setDrawerVisible(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerVisible(false);
    onDrawerClose?.();
  }, [onDrawerClose]);

  useEffect(() => {
    if (autoOpen && id && version) {
      onView();
    }
  }, [autoOpen, id, onView, version]);

  const siderStyle: React.CSSProperties = {
    paddingTop: 8,
    textAlign: 'center',
    backgroundColor: token.colorBgBase,
  };

  const layoutStyle = {
    borderRadius: 8,
    flex: '1 1 auto',
    overflow: 'hidden',
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
    height: 'auto',
    minHeight: 0,
    maxHeight: '100%',
  };

  return (
    <>
      {!autoOpen && buttonType === 'toolIcon' ? (
        <Tooltip
          title={
            <FormattedMessage
              id='pages.lifeCycleModel.view.lifeCycleModelInformation'
              defaultMessage='Life cycle model information'
            ></FormattedMessage>
          }
          placement='left'
        >
          <Button
            type='primary'
            size='small'
            style={{ boxShadow: 'none' }}
            icon={<ProfileOutlined />}
            onClick={onView}
            disabled={disabled}
          />
        </Tooltip>
      ) : !autoOpen && buttonType === 'icon' ? (
        <Tooltip
          title={tooltipTitle ?? <FormattedMessage id='pages.button.view' defaultMessage='View' />}
        >
          <Button
            shape='circle'
            type={buttonTypeProp}
            icon={<ProfileOutlined />}
            size='small'
            onClick={onView}
          />
        </Tooltip>
      ) : !autoOpen && buttonType === 'iconModel' ? (
        <Tooltip
          title={<FormattedMessage id='pages.button.view.model' defaultMessage='View Model' />}
        >
          <Button
            disabled={disabled}
            shape='circle'
            type={buttonTypeProp}
            icon={<AppstoreOutlined />}
            size='small'
            onClick={onView}
          />
        </Tooltip>
      ) : !autoOpen ? (
        <Button onClick={onView}>
          <FormattedMessage id='pages.button.view' defaultMessage='View' />
        </Button>
      ) : null}
      <Drawer
        classNames={{
          body: 'tg-lifecycle-model-drawer-body',
          section: 'tg-lifecycle-model-drawer-section',
          wrapper: 'tg-lifecycle-model-drawer-wrapper',
        }}
        destroyOnHidden
        getContainer={() => document.body}
        title={
          <FormattedMessage id='pages.flow.model.drawer.title.view' defaultMessage='View Model' />
        }
        size='100vw'
        closable={false}
        extra={<Button icon={<CloseOutlined />} style={{ border: 0 }} onClick={closeDrawer} />}
        mask={{ closable: true }}
        open={drawerVisible}
        onClose={closeDrawer}
        rootStyle={{ maxWidth: '100vw', overflow: 'hidden' }}
        styles={{
          body: { display: 'flex', minHeight: 0, minWidth: 0, overflow: 'hidden' },
          section: { minWidth: 0, overflow: 'hidden', width: '100%' },
          wrapper: { maxWidth: '100vw', overflow: 'hidden', width: '100vw' },
        }}
      >
        <GraphProvider>
          <Layout style={layoutStyle}>
            <Layout style={{ height: '100%', minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
              <Content
                style={{
                  height: '100%',
                  minHeight: 0,
                  minWidth: 0,
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <X6GraphComponent
                  selectOptions={{
                    enabled: true,
                  }}
                  zoomable
                  pannable
                  minScale={0.5}
                  connectionOptions={lifeCycleModelConnectionOptions}
                  gridOptions={{
                    type: 'dot',
                    color: undefined,
                    thickness: 1,
                    visible: true,
                  }}
                  transformOptions={{
                    resizing: {
                      enabled: true,
                      orthogonal: false,
                    },
                  }}
                />
              </Content>
            </Layout>
            <Sider width='50px' style={siderStyle}>
              <ToolbarView
                id={id}
                version={version}
                lang={lang}
                drawerVisible={drawerVisible}
                actionRef={actionRef}
              />
            </Sider>
          </Layout>
        </GraphProvider>
      </Drawer>
    </>
  );
};

export default LifeCycleModelView;
