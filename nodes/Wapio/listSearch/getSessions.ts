import type {
  ILoadOptionsFunctions,
  INodeListSearchItems,
  INodeListSearchResult,
} from 'n8n-workflow';

import { wapioApiRequest } from '../shared/transport';

type SessionSummary = {
  session_id?: string | number;
  name?: string;
  phone_number?: string;
  status?: string;
};

type SessionsResponse = {
  data?: SessionSummary[];
};

export async function getSessions(
  this: ILoadOptionsFunctions,
  filter?: string,
): Promise<INodeListSearchResult> {
  const responseData = (await wapioApiRequest.call(
    this,
    'wapioApi',
    'GET',
    '/v1/whatsapp-sessions',
  )) as SessionsResponse;

  const sessions = Array.isArray(responseData.data)
    ? responseData.data
    : Array.isArray(responseData)
      ? (responseData as unknown as SessionSummary[])
      : [];

  const results: INodeListSearchItems[] = sessions
    .filter((session) => {
      if (!filter) return true;
      const term = filter.toLowerCase();
      const name = String(session.name ?? '').toLowerCase();
      const phone = String(session.phone_number ?? '').toLowerCase();
      const id = String(session.session_id ?? '').toLowerCase();
      return name.includes(term) || phone.includes(term) || id.includes(term);
    })
    .map((session) => {
      const id = String(session.session_id ?? '');
      const name = session.name ? `${session.name}` : `Session ${id}`;
      const phone = session.phone_number ? ` (${session.phone_number})` : '';
      const status = session.status ? ` [${session.status}]` : '';

      return {
        name: `${name}${phone}${status}`,
        value: id,
      };
    })
    .filter((session) => session.value.length > 0);

  return { results };
}
