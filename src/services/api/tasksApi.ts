import { baseApi, clientError } from './baseApi';
import { isTask } from './contracts';
import type { TaskResponse } from './contracts';
import { apiRuntime } from './runtime';
export const tasksApi = baseApi.injectEndpoints({
  endpoints: build => ({
    getTasks: build.query<TaskResponse[], void>({
      async queryFn(_arg, api, _options, query) {
        const result = await query('/tasks');
        if (result.error) return { error: result.error };
        if (!Array.isArray(result.data) || !result.data.every((task: unknown): task is TaskResponse =>
          isTask(task) && task.userId === apiRuntime(api.extra).userId)) return { error: clientError('invalid-response') };
        return { data: result.data };
      },
    }),
  }),
});
export const { useGetTasksQuery } = tasksApi;
