import { baseApi, clientError } from './baseApi';
import { isJsonObject, isProject, uuid, validProjectVersion } from './contracts';
import type { CreateProjectOperation, ProjectResponse, UpdateProjectOperation } from './contracts';
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
        if (!ownedProjects(result.data, apiRuntime(api.extra).userId)) return { error: clientError('invalid-project-response', { httpStatus: 200 }) };
        return { data: result.data };
      },
      providesTags: ['Projects'],
    }),
    getProject: build.query<ProjectResponse, string>({
      async queryFn(id, api, _options, query) {
        const result = await query(`/projects/${encodeURIComponent(id)}`);
        if (result.error) return { error: result.error };
        if (!isProject(result.data) || result.data.id !== id || result.data.userId !== apiRuntime(api.extra).userId) {
          return { error: clientError('invalid-project-response', { httpStatus: 200 }) };
        }
        return { data: result.data };
      },
    }),
    createProject: build.mutation<ProjectResponse, CreateProjectOperation>({
      async queryFn({ key, body }, api, _options, query) {
        const invalid = validateWrite(key, body);
        if (invalid) return { error: clientError(invalid) };
        const result = await query({ url: '/projects', method: 'POST', headers: { 'Idempotency-Key': key }, body });
        if (result.error) return { error: result.error };
        if (!isProject(result.data) || result.data.userId !== apiRuntime(api.extra).userId
          || result.data.name !== body.name || canonicalJson(result.data.data) !== canonicalJson(body.data)) {
          return { error: clientError('save-uncertain') };
        }
        return { data: result.data };
      },
      invalidatesTags: (_result, error) => error ? [] : ['Projects'],
    }),
    updateProject: build.mutation<ProjectResponse, UpdateProjectOperation>({
      async queryFn({ key, id, body }, api, _options, query) {
        const invalid = validateWrite(key, body);
        if (invalid || !uuid(id) || !validProjectVersion(body.version)) return { error: clientError(invalid ?? 'invalid-document') };
        // The published backend compares body.version atomically; it does not implement If-Match.
        const result = await query({ url: `/projects/${id}`, method: 'PATCH', headers: { 'Idempotency-Key': key }, body });
        if (result.error) return { error: result.error };
        if (!isProject(result.data) || result.data.id !== id || result.data.userId !== apiRuntime(api.extra).userId
          || result.data.version !== body.version + 1 || result.data.name !== body.name
          || canonicalJson(result.data.data) !== canonicalJson(body.data)) return { error: clientError('save-uncertain') };
        return { data: result.data };
      },
      invalidatesTags: (_result, error) => error ? [] : ['Projects'],
    }),
  }),
});
function validateWrite(key: string, body: { name: string; data: unknown }): string | null {
  if (!uuid(key) || !isJsonObject(body.data) || !body.name.trim() || body.name !== body.name.trim() || body.name.length > 120) return 'invalid-document';
  return cloudDocumentSize(body.data) > MAX_CLOUD_DOCUMENT_BYTES ? 'project-too-large' : null;
}
export const { useGetProjectsQuery, useLazyGetProjectQuery } = projectsApi;
