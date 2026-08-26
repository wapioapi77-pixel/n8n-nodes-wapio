import type { INodeProperties } from 'n8n-workflow';

import { showFor } from '../../shared/descriptions';

export const accountDescription: INodeProperties[] = [
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    noDataExpression: true,
    displayOptions: showFor('account'),
    options: [
      {
        name: 'Connect Session',
        value: 'connect',
        action: 'Connect session and get QR code',
      },
      {
        name: 'Create Session',
        value: 'create',
        action: 'Create a new whats app session',
      },
      {
        name: 'Delete Session',
        value: 'delete',
        action: 'Delete a whats app session',
      },
      {
        name: 'Disconnect Session',
        value: 'disconnect',
        action: 'Disconnect a whats app session',
      },
      {
        name: 'Get Many',
        value: 'getAll',
        action: 'Get many whats app sessions',
      },
      {
        name: 'Get QR Code',
        value: 'getQrCode',
        action: 'Get QR code for session pairing',
      },
      {
        name: 'Get Session',
        value: 'get',
        action: 'Get session details',
      },
      {
        name: 'Regenerate Session Key',
        value: 'regenerateKey',
        action: 'Regenerate session API key',
      },
      {
        name: 'Restart Session',
        value: 'restart',
        action: 'Restart a whats app session',
      },
      {
        name: 'Update Session',
        value: 'update',
        action: 'Update whats app session settings',
      },
    ],
    default: 'getAll',
  },
  {
    displayName: 'Session Name',
    name: 'name',
    type: 'string',
    default: '',
    required: true,
    displayOptions: showFor('account', ['create']),
    description: 'A friendly name for the new WhatsApp session',
  },
  {
    displayName: 'Session Name',
    name: 'name',
    type: 'string',
    default: '',
    displayOptions: showFor('account', ['update']),
    description: 'Updated name for the WhatsApp session',
  },
  {
    displayName: 'Proxy URL',
    name: 'proxyUrl',
    type: 'string',
    default: '',
    displayOptions: showFor('account', ['create', 'update']),
    description: 'Optional proxy URL (e.g. http://user:pass@host:port or socks5://host:port)',
  },
];
