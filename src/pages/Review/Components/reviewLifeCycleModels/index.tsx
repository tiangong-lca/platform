import X6GraphComponent from '@/components/X6Graph';
import { GraphProvider } from '@/contexts/graphContext';
import { AuditOutlined, CloseOutlined, ProfileOutlined } from '@ant-design/icons';
import { ActionType } from '@ant-design/pro-components';
import { Button, Drawer, Layout, theme, Tooltip } from 'antd';
import type { FC } from 'react';
import { useState } from 'react';
import { FormattedMessage } from 'umi';
import ToolbarView from './Components/toolbar/viewIndex';
type Props = {
  type: 'edit' | 'view';
  id: string;
  version: string;
  lang: string;
  actionRef?: React.RefObject<ActionType | undefined>;
  reviewId: string;
  tabType: 'assigned' | 'review' | 'reviewer-rejected' | 'admin-rejected';
};
const ReviewLifeCycleModelsDetail: FC<Props> = ({
  id,
  version,
  lang,
  actionRef,
  type,
  reviewId,
  tabType,
}) => {
  const [drawerVisible, setDrawerVisible] = useState(false);
  const { token } = theme.useToken();

  const { Sider, Content } = Layout;

  const onView = () => {
    setDrawerVisible(true);
  };

  const siderStyle: React.CSSProperties = {
    paddingTop: 8,
    textAlign: 'center',
    backgroundColor: token.colorBgBase,
  };

  const layoutStyle = {
    borderRadius: 8,
    overflow: 'hidden',
    width: 'calc(100%)',
    minWidth: 'calc(100%)',
    maxWidth: 'calc(100%)',
    height: 'calc(100%)',
    minHeight: 'calc(100%)',
    maxHeight: 'calc(100%)',
  };

  return (
    <>
      {type === 'edit' ? (
        <Tooltip
          title={<FormattedMessage id={'pages.review.actions.review'} defaultMessage={'Review'} />}
        >
          <Button shape='circle' icon={<AuditOutlined />} size='small' onClick={onView} />
        </Tooltip>
      ) : (
        <Tooltip
          title={
            <FormattedMessage
              id='pages.review.actions.viewDetails'
              defaultMessage='View review details'
            />
          }
        >
          <Button shape='circle' icon={<ProfileOutlined />} size='small' onClick={onView} />
        </Tooltip>
      )}
      <Drawer
        getContainer={() => document.body}
        title={
          type === 'edit' ? (
            <FormattedMessage
              id={'pages.review.ReviewLifeCycleModelsDetail.edit.title'}
              defaultMessage='Review Model'
            />
          ) : (
            <FormattedMessage
              id={'pages.review.ReviewLifeCycleModelsDetail.view.title'}
              defaultMessage='View Review'
            />
          )
        }
        size='100%'
        closable={false}
        extra={
          <Button
            icon={<CloseOutlined />}
            style={{ border: 0 }}
            onClick={() => {
              setDrawerVisible(false);
            }}
          />
        }
        mask={{ closable: true }}
        open={drawerVisible}
        onClose={() => {
          setDrawerVisible(false);
        }}
      >
        <GraphProvider>
          <Layout style={layoutStyle}>
            <Layout>
              <Content>
                <X6GraphComponent
                  selectOptions={{
                    enabled: true,
                  }}
                  zoomable
                  pannable
                  minScale={0.5}
                  connectionOptions={{
                    router: {
                      name: 'manhattan',
                    },
                    connector: {
                      name: 'rounded',
                    },
                  }}
                  gridOptions={{
                    type: 'dot',
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
                type={type}
                reviewId={reviewId}
                tabType={tabType}
              />
            </Sider>
          </Layout>
        </GraphProvider>
      </Drawer>
    </>
  );
};

export default ReviewLifeCycleModelsDetail;
