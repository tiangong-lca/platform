import { ArrowRightOutlined } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import type { FC } from 'react';
import { useState } from 'react';
import { FormattedMessage } from 'umi';
import EdgeExchangeView from './view';

type Props = {
  lang: string;
  disabled: boolean;
  edge: any;
};
const EdgeExhange: FC<Props> = ({ lang, disabled, edge }) => {
  const [drawerVisible, setDrawerVisible] = useState(false);

  const onDrawerOpen = () => {
    setDrawerVisible(true);
  };

  const onDrawerClose = () => {
    setDrawerVisible(false);
  };

  return (
    <>
      <Tooltip
        title={
          <FormattedMessage
            id='pages.button.model.connection'
            defaultMessage='Connection relation'
          />
        }
        placement='left'
      >
        <Button
          type='primary'
          size='small'
          icon={<ArrowRightOutlined />}
          style={{ boxShadow: 'none' }}
          disabled={disabled}
          onClick={onDrawerOpen}
        />
      </Tooltip>
      <EdgeExchangeView
        lang={lang}
        sourceProcessId={edge?.data?.node?.sourceProcessId ?? ''}
        sourceProcessVersion={edge?.data?.node?.sourceProcessVersion ?? ''}
        targetProcessId={edge?.data?.node?.targetProcessId ?? ''}
        targetProcessVersion={edge?.data?.node?.targetProcessVersion ?? ''}
        sourceOutputFlowID={edge?.data?.connection?.outputExchange?.['@flowUUID'] ?? ''}
        targetInputFlowID={
          edge?.data?.connection?.outputExchange?.downstreamProcess?.['@flowUUID'] ?? ''
        }
        drawerVisible={drawerVisible}
        onDrawerClose={onDrawerClose}
      />
    </>
  );
};

export default EdgeExhange;
