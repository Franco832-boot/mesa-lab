import { baseApi, clientError } from './baseApi';
import { isJsonObject, isProject } from './contracts';
import type { CreateProjectRequest, ProjectResponse } from './contracts';
import { apiRuntime } from './runtime';
import { canonicalJson, cloudDocumentSize, MAX_CLOUD_DOCUMENT_BYTES } from '../../features/cloudProjects/document';

function ownedProjects(data: unknown, userId: string | null): data is ProjectResponse[] {
  return Array.isArray(data) && data.every((project: unknown) => isProject(project) && project.userId === userId);
}
export const projectsApi = baseApi.injectEndpoints({
  endpoints: build => ({
    getProjects: build.query<ProjectResponse[], void>({
      async queryFn(_arg, api, _options, query) {
        const result = await query('/projects');
        if (result.error) return { error: result.error };
        if (!ownedProjects(result.data, apiRuntime(api.extra).userId)) return { error: clientError('invalid-response') };
        return { data: result.data };
      },
      providesTags: ['Projects'],
    }),
    getProject: build.query<ProjectResponse, string>({
      async queryFn(id, api, _options, query) {
        const result = await query(`/projects/${encodeURIComponent(id)}`);
        if (result.error) return { error: result.error };
        if (!isProject(result.data) || result.data.id !== id || result.data.userId !== apiRuntime(api.extra).userId) {
          return { error: clientError('invalid-response') };
        }
        return { data: result.data };
      },
    }),
    createProject: build.mutation<ProjectResponse, CreateProjectRequest>({
      async queryFn(request, api, _options, query) {
        const runtime = apiRuntime(api.extra);
        if (!isJsonObject(request.data) || !request.name.trim() || request.name.trim().length > 120) return { error: clientError('invalid-document') };
        if (cloudDocumentSize(request.data) > MAX_CLOUD_DOCUMENT_BYTES) return { error: clientError('project-too-large') };
        if (runtime.creating) return { error: clientError('create-busy') };
        const epoch = runtime.epoch;
        const name = request.name.trim();
        const documentIdentity = canonicalJson(request.data);
        const identity = `${JSON.stringify(name)}:${documentIdentity}`;
        runtime.creating = true;
        try {
          // A read precedes every explicit create, including a manual attempt after an uncertain result.
          const list = await query('/projects');
          if (list.error) return { error: list.error };
          if (!ownedProjects(list.data, runtime.userId)) return { error: clientError('invalid-response') };
          const existing = list.data.find(project => project.name === name && canonicalJson(project.data) === documentIdentity);
          if (existing) { runtime.uncertainCreates.delete(identity); return { data: existing }; }
          if (runtime.uncertainCreates.has(identity)) return { error: clientError('save-uncertain') };
          if (runtime.epoch !== epoch || api.signal.aborted) return { error: clientError('session-changed') };
          const result = await query({ url: '/projects', method: 'POST', body: { name, data: request.data } });
          if (result.error) {
            // A timeout, dropped response or 5xx does not prove that the write failed.
            if (runtime.epoch === epoch && ![400, 401, 413, 415].includes(Number(result.error.status))) {
              runtime.uncertainCreates.add(identity);
              return { error: clientError('save-uncertain') };
            }
            return { error: result.error };
          }
          if (!isProject(result.data) || result.data.userId !== runtime.userId || result.data.name !== name
            || canonicalJson(result.data.data) !== documentIdentity) {
            runtime.uncertainCreates.add(identity);
            return { error: clientError('save-uncertain') };
          }
          return { data: result.data };
        } finally { if (runtime.epoch === epoch) runtime.creating = false; }
      },
      invalidatesTags: (_result, error) => error ? [] : ['Projects'],
    }),
  }),
});
export const { useGetProjectsQuery, useLazyGetProjectQuery, useCreateProjectMutation } = projectsApi;
