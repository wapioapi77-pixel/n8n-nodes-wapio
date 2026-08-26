import type { INodeProperties } from 'n8n-workflow';

import { showFor } from '../../shared/descriptions';

export const sessionDescription: INodeProperties[] = [
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    noDataExpression: true,
    displayOptions: showFor('session'),
    options: [
      {
        name: 'Get Current Session Status',
        value: 'getStatus',
        action: 'Get current session connection status',
      },
      {
        name: 'Get Current Session User Info',
        value: 'getUserInfo',
        action: 'Get connected whats app profile and user info',
      },
      {
        name: 'Send Presence Update',
        value: 'sendPresenceUpdate',
        action: 'Send presence status update typing recording available',
      },
    ],
    default: 'getStatus',
  },
  {
    displayName: 'Presence Status',
    name: 'presence',
    type: 'options',
    options: [
      { name: 'Available (Online)', value: 'available' },
      { name: 'Composing (Typing...)', value: 'composing' },
      { name: 'Paused', value: 'paused' },
      { name: 'Recording Audio...', value: 'recording' },
      { name: 'Unavailable (Offline)', value: 'unavailable' },
    ],
    default: 'composing',
    required: true,
    displayOptions: showFor('session', ['sendPresenceUpdate']),
    description: 'The presence status to broadcast',
  },
  {
    displayName: 'Recipient JID / Phone',
    name: 'to',
    type: 'string',
    default: '',
    displayOptions: showFor('session', ['sendPresenceUpdate']),
    description:
      'Optional specific recipient or group JID to send the presence update to (e.g. 1234567890@s.whatsapp.net). Leave empty for global available/unavailable.',
  },
];
