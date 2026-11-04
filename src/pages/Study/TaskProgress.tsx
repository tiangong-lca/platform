import { core, expectType, type CoreRequest } from '@/services/study/api';
import {
  progressFractionFromWorkerValue,
  taskRunStateFromRawStatus,
} from '@/services/taskCenter/types';
import { Button, Card, Progress, Space, Tag } from 'antd';
import { QueryState, useStudyQuery, useStudyText } from './shared';

type TaskResource = Extract<CoreRequest, { operation: 'task.read' }>['resource'];

/** Reuse the Task Center's status/progress presentation semantics without inventing a shell feed. */
export default function StudyTaskProgress({
  studyId,
  resource,
}: {
  studyId: string;
  resource: TaskResource;
}) {
  const t = useStudyText();
  const query = useStudyQuery(
    `${studyId}:${resource.type}:${resource.id}`,
    async () => expectType(await core({ operation: 'task.read', studyId, resource }), 'task').value,
  );
  const task = query.data;
  const progress = progressFractionFromWorkerValue(task?.execution.progress);
  return (
    <Card title={t('task')} extra={<Button onClick={query.refresh}>{t('refresh')}</Button>}>
      <QueryState {...query} retry={query.refresh}>
        {task && (
          <Space orientation='vertical' style={{ width: '100%' }}>
            <Tag>{taskRunStateFromRawStatus(task.execution.status)}</Tag>
            <span>{task.resource.id}</span>
            <span>{task.execution.jobId}</span>
            {progress !== undefined && <Progress percent={Math.round(progress * 100)} />}
            {task.execution.phase && <span>{task.execution.phase}</span>}
            {task.errorCode && <code>{task.errorCode}</code>}
          </Space>
        )}
      </QueryState>
    </Card>
  );
}
