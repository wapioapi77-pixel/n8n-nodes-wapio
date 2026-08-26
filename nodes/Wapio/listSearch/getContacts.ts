import type {
  ILoadOptionsFunctions,
  INodeListSearchItems,
  INodeListSearchResult,
} from 'n8n-workflow';

import { wapioApiRequest } from '../shared/transport';

type ContactSummary = {
  id?: string;
  jid?: string;
  name?: string;
  notify?: string;
  phone_number?: string;
};

type ContactsResponse = {
  data?: ContactSummary[];
};

export async function getContacts(
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
    '/api/contacts',
    {
      qs: { session_id: sessionId },
      headers: { 'x-session-id': sessionId },
    },
  )) as ContactsResponse;

  const contacts = Array.isArray(responseData.data)
    ? responseData.data
    : Array.isArray(responseData)
      ? (responseData as unknown as ContactSummary[])
      : [];

  const results: INodeListSearchItems[] = contacts
    .map((contact) => {
      const jid = String(contact.jid ?? contact.id ?? '');
      const name = contact.name ?? contact.notify ?? contact.phone_number ?? jid;
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
