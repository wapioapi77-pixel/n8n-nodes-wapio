import type { INodeProperties } from 'n8n-workflow';

export function showFor(
  resource: string,
  operations?: string[],
): { show: Record<string, string[]> } {
  return operations
    ? { show: { resource: [resource], operation: operations } }
    : { show: { resource: [resource] } };
}

export const sessionIdSelect: INodeProperties = {
  displayName: 'Session',
  name: 'sessionId',
  type: 'resourceLocator',
  default: { mode: 'list', value: '' },
  required: true,
  modes: [
    {
      displayName: 'From List',
      name: 'list',
      type: 'list',
      placeholder: 'Select a session...',
      typeOptions: {
        searchListMethod: 'getSessions',
        searchable: true,
        searchFilterRequired: false,
      },
    },
    {
      displayName: 'By ID',
      name: 'id',
      type: 'string',
      placeholder: 'e.g. sess_abc123 or 1',
    },
  ],
};

export const contactJidSelect: INodeProperties = {
  displayName: 'Contact',
  name: 'contactJid',
  type: 'resourceLocator',
  default: { mode: 'list', value: '' },
  required: true,
  typeOptions: {
    loadOptionsDependsOn: ['sessionId.value'],
  },
  modes: [
    {
      displayName: 'From List',
      name: 'list',
      type: 'list',
      placeholder: 'Select a contact...',
      typeOptions: {
        searchListMethod: 'getContacts',
        searchable: true,
        searchFilterRequired: false,
      },
    },
    {
      displayName: 'By Phone / JID',
      name: 'id',
      type: 'string',
      placeholder: 'e.g. 1234567890 or 1234567890@s.whatsapp.net',
    },
  ],
};

export const groupJidSelect: INodeProperties = {
  displayName: 'Group',
  name: 'groupJid',
  type: 'resourceLocator',
  default: { mode: 'list', value: '' },
  required: true,
  typeOptions: {
    loadOptionsDependsOn: ['sessionId.value'],
  },
  modes: [
    {
      displayName: 'From List',
      name: 'list',
      type: 'list',
      placeholder: 'Select a group...',
      typeOptions: {
        searchListMethod: 'getGroups',
        searchable: true,
        searchFilterRequired: false,
      },
    },
    {
      displayName: 'By Group JID',
      name: 'id',
      type: 'string',
      placeholder: 'e.g. 123456789-987654@g.us',
    },
  ],
};

export const requestRetryOptions: INodeProperties = {
  displayName: 'Retry on Failure',
  name: 'retryOnFail',
  type: 'boolean',
  default: true,
  description: 'Whether to retry automatically on rate limits (429) or transient 5xx server errors',
};

export function createStringListField(
  displayName: string,
  name: string,
  placeholder: string,
  description: string,
  displayOptions?: INodeProperties['displayOptions'],
): INodeProperties {
  return {
    displayName,
    name,
    type: 'string',
    typeOptions: {
      multipleValues: true,
      multipleValueButtonText: 'Add Item',
    },
    default: [],
    placeholder,
    description,
    displayOptions,
  };
}
