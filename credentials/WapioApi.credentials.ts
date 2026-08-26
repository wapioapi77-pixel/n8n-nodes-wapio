import type {
  IAuthenticateGeneric,
  ICredentialTestRequest,
  ICredentialType,
  Icon,
  INodeProperties,
} from 'n8n-workflow';

export class WapioApi implements ICredentialType {
  name = 'wapioApi';

  displayName = 'Wapio API';

  icon: Icon = {
    light: 'file:../icons/wapio.svg',
    dark: 'file:../icons/wapio.dark.svg',
  };

  documentationUrl = 'https://www.wapio.io';

  properties: INodeProperties[] = [
    {
      displayName: 'API Key / Token',
      name: 'apiKey',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      required: true,
      description:
        'Your Wapio Personal Access Token (bps_pat_...) for full account management or a Session API Key (bps_sk_...) for session-scoped operations',
    },
    {
      displayName: 'Webhook Signing Secret',
      name: 'webhookSigningSecret',
      type: 'string',
      typeOptions: { password: true },
      default: '',
      required: false,
      description:
        'Required only for Wapio Trigger. Choose a secret of at least 16 characters; it is stored encrypted by n8n and used to verify incoming Wapio webhooks.',
    },
    {
      displayName: 'Base URL',
      name: 'baseUrl',
      type: 'string',
      default: 'https://api.wapio.io',
      required: false,
      description:
        'Wapio API base URL. Use https://api.wapio.io for production, or your custom host for self-hosted or development setups.',
    },
  ];

  authenticate: IAuthenticateGeneric = {
    type: 'generic',
    properties: {
      headers: {
        Authorization: '=Bearer {{$credentials.apiKey}}',
      },
    },
  };

  test: ICredentialTestRequest = {
    request: {
      baseURL: '={{($credentials.baseUrl || "https://api.wapio.io").replace(/\\/+$/, "")}}',
      url: '/v1/whatsapp-sessions',
      method: 'GET',
    },
  };
}
