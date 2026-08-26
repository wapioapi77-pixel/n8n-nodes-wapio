import type {
  ILoadOptionsFunctions,
  INodeListSearchItems,
  INodeListSearchResult,
} from 'n8n-workflow';

import { wapioApiRequest } from '../shared/transport';

type GroupSummary = {
  id?: string;
  jid?: string;
  name?: string;
  subject?: string;
};

type GroupsResponse = {
  data?: GroupSummary[];
};

export async function getGroups(
  this: ILoadOptionsFunctions,
  filter?: string,
): Promise<INodeListSearchResult> {
  const sessionId = this.getNodeParameter('sessionId', undefined, {
    extractValue: true,
  }) as string | undefined;

  if (!sessionId) {
    return { results: [] };
  }

  const responseData = (await wapioApiRequest.call(
    this,
    'wapioApi',
    'GET',
    '/api/groups',
    {
      qs: { session_id: sessionId },
      headers: { 'x-session-id': sessionId },
    },
  )) as GroupsResponse;

  const groups = Array.isArray(responseData.data)
    ? responseData.data
    : Array.isArray(responseData)
      ? (responseData as unknown as GroupSummary[])
      : [];

  const results: INodeListSearchItems[] = groups
    .map((group) => {
      const jid = String(group.jid ?? group.id ?? '');
      const name = group.name ?? group.subject ?? jid;
      return {
        name: `${name} (${jid})`,
        value: jid,
      };
    })
    .filter((item) => {
      if (!item.value) return false;
      if (!filter) return true;
      const term = filter.toLowerCase();
      return item.name.toLowerCase().includes(term) || item.value.toLowerCase().includes(term);
    });

  return { results };
}
