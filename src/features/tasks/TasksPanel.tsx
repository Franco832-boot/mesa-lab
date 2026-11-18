import { useLocale } from '../../locales/useLocale';
import { useGetTasksQuery } from '../../services/api/tasksApi';
import { apiErrorMessage } from '../../services/api/errors';
export function TasksPanel() {
  const { t } = useLocale();
  const result = useGetTasksQuery();
  return <details className="account-tasks"><summary>{t('accountTasks')}</summary>
    {result.isFetching && <p role="status">{t('apiLoading')}</p>}
    {result.isError && <p role="alert">{t(apiErrorMessage(result.error))}</p>}
    {result.data?.length === 0 && <p>{t('tasksEmpty')}</p>}
    <ul>{result.data?.map(task => <li key={task.id}>{task.title} · {t(task.completed ? 'taskCompleted' : 'taskPending')}</li>)}</ul>
  </details>;
}
