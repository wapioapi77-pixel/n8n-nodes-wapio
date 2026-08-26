import type {
  IDataObject,
  IHookFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  IWebhookFunctions,
  IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { getSessions } from '../Wapio/listSearch/getSessions';
import { requestRetryOptions, sessionIdSelect } from '../Wapio/shared/descriptions';
import { wapioApiRequest } from '../Wapio/shared/transport';
import { verifyWapioWebhookSignature } from './webhook-signature';

type WapioResponse = IDataObject;
type WebhookConfig = {
  target_url?: string;
  subscribed_events?: string[];
  is_active?: boolean;
};

type WapioCredentials = {
  apiKey?: string;
  webhookSigningSecret?: string;
};

type RawBodyRequest = {
  rawBody?: Buffer;
  readRawBody?: () => Promise<void>;
};

const webhookEventOptions = [
  { name: 'Call Event', value: 'call' },
  { name: 'Chat Deleted', value: 'chats.delete' },
  { name: 'Chat Updated', value: 'chats.update' },
  { name: 'Chat Upserted', value: 'chats.upsert' },
  { name: 'Contact Updated', value: 'contacts.update' },
  { name: 'Contact Upserted', value: 'contacts.upsert' },
  { name: 'Group Message Received', value: 'messages-group.received' },
  { name: 'Group Participants Update', value: 'group-participants.update' },
  { name: 'Group Update', value: 'groups.update' },
  { name: 'Group Upsert', value: 'groups.upsert' },
  { name: 'Message Deleted', value: 'messages.delete' },
  { name: 'Message Reaction', value: 'messages.reaction' },
  { name: 'Message Receipt Update', value: 'message-receipt.update' },
  { name: 'Message Received (Direct / All)', value: 'messages.received' },
  { name: 'Message Sent', value: 'message.sent' },
  { name: 'Message Status Update (Delivered / Read)', value: 'messages.update' },
  { name: 'Message Upsert', value: 'messages.upsert' },
  { name: 'Newsletter Message Received', value: 'messages-newsletter.received' },
  { name: 'Personal Message Received', value: 'messages-personal.received' },
  { name: 'Poll Results Update', value: 'poll.results' },
  { name: 'QR Code Updated', value: 'qrcode.updated' },
  { name: 'Session Status Changed', value: 'session.status' },
];

export class WapioTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Wapio Trigger',
    name: 'wapioTrigger',
    icon: {
      light: 'file:../../icons/wapio.svg',
      dark: 'file:../../icons/wapio.dark.svg',
    },
    group: ['trigger'],
    version: 1,
    subtitle: '={{$parameter["sessionId"]}}',
    description: 'Start workflows from Wapio WhatsApp webhook events',
    eventTriggerDescription: 'Trigger events from your WhatsApp session in real-time',
    activationMessage: 'Webhook successfully registered on the selected Wapio session.',
    defaults: { name: 'Wapio Trigger' },
    inputs: [],
    outputs: [NodeConnectionTypes.Main],
    credentials: [{ name: 'wapioApi', required: true }],
    webhooks: [
      {
        name: 'default',
        httpMethod: 'POST',
        responseMode: 'onReceived',
        path: 'webhook',
      },
    ],
    properties: [
      sessionIdSelect,
      {
        displayName: 'Events',
        name: 'events',
        type: 'multiOptions',
        options: webhookEventOptions,
        default: ['messages.received', 'messages-personal.received', 'messages-group.received'],
        description: 'The WhatsApp events to listen for',
      },
      requestRetryOptions,
    ],
  };

  methods = {
    listSearch: {
      getSessions,
    },
  };

  webhookMethods = {
    default: {
      async checkExists(this: IHookFunctions): Promise<boolean> {
        const webhookData = this.getWorkflowStaticData('node');
        const sessionId = getTriggerSessionId.call(this);
        const webhookUrl = this.getNodeWebhookUrl('default');

        try {
          const response = (await wapioApiRequest.call(
            this,
            'wapioApi',
            'GET',
            `/v1/whatsapp-sessions/${encodeURIComponent(sessionId)}/webhook`,
          )) as WapioResponse;

          const config = response as WebhookConfig | null;
          const currentUrl = config?.target_url ?? '';
          const currentEvents = config?.subscribed_events ?? [];
          const selectedEvents = this.getNodeParameter('events', []) as string[];

          if (currentUrl === webhookUrl && sameEvents(currentEvents, selectedEvents)) {
            webhookData.webhookRegistered = true;
            webhookData.sessionId = sessionId;
            webhookData.webhookUrl = webhookUrl;
            webhookData.events = selectedEvents;
            return true;
          }
        } catch (error) {
          throw new NodeOperationError(this.getNode(), `Failed to check the Wapio webhook: ${(error as Error).message}`);
        }

        return false;
      },

      async create(this: IHookFunctions): Promise<boolean> {
        const webhookData = this.getWorkflowStaticData('node');
        const sessionId = getTriggerSessionId.call(this);
        const webhookUrl = this.getNodeWebhookUrl('default');
        const events = this.getNodeParameter('events', []) as string[];
        const credentials = (await this.getCredentials('wapioApi')) as WapioCredentials;
        const signingSecret = credentials.webhookSigningSecret?.trim();

        if (!webhookUrl) throw new NodeOperationError(this.getNode(), 'n8n did not provide a webhook URL');
        if (!credentials.apiKey?.startsWith('bps_pat_')) {
          throw new NodeOperationError(this.getNode(), 'Wapio Trigger requires a Personal Access Token (bps_pat_*)');
        }
        if (!signingSecret || signingSecret.length < 16) {
          throw new NodeOperationError(this.getNode(), 'Set a webhook signing secret of at least 16 characters in the Wapio API credential');
        }

        const existingConfig = await getWebhookConfig.call(this, sessionId);
        if (existingConfig?.target_url && existingConfig.target_url !== webhookUrl) {
          throw new NodeOperationError(
            this.getNode(),
            'This Wapio session already has a webhook configured elsewhere. Remove it or use a different session before activating this trigger.',
          );
        }

        const body: IDataObject = {
          target_url: webhookUrl,
          subscribed_events: events,
          signing_secret: signingSecret,
          is_active: true,
        };

        try {
          await wapioApiRequest.call(
            this,
            'wapioApi',
            'PUT',
            `/v1/whatsapp-sessions/${encodeURIComponent(sessionId)}/webhook`,
            { body },
          );

          webhookData.webhookRegistered = true;
          webhookData.sessionId = sessionId;
          webhookData.webhookUrl = webhookUrl;
          webhookData.events = events;
          return true;
        } catch (error) {
          throw new NodeOperationError(
            this.getNode(),
            `Failed to register webhook on Wapio session ${sessionId}: ${(error as Error).message}`,
          );
        }
      },

      async delete(this: IHookFunctions): Promise<boolean> {
        const webhookData = this.getWorkflowStaticData('node');
        const sessionId = String(webhookData.sessionId ?? getTriggerSessionId.call(this));
        const webhookUrl = String(webhookData.webhookUrl ?? '');
        const events = Array.isArray(webhookData.events) ? (webhookData.events as string[]) : [];

        if (!webhookUrl || events.length === 0) return true;
        const existingConfig = await getWebhookConfig.call(this, sessionId);
        if (!existingConfig || existingConfig.target_url !== webhookUrl || !sameEvents(existingConfig.subscribed_events ?? [], events)) {
          throw new NodeOperationError(this.getNode(), 'Wapio webhook changed after this trigger was activated, so n8n will not delete it');
        }

        try {
          await wapioApiRequest.call(
            this,
            'wapioApi',
            'DELETE',
            `/v1/whatsapp-sessions/${encodeURIComponent(sessionId)}/webhook`,
          );
        } catch (error) {
          throw new NodeOperationError(this.getNode(), `Failed to remove the Wapio webhook: ${(error as Error).message}`);
        }

        delete webhookData.webhookRegistered;
        delete webhookData.sessionId;
        delete webhookData.webhookUrl;
        delete webhookData.events;
        return true;
      },
    },
  };

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const headers = this.getHeaderData() as IDataObject;
    const request = this.getRequestObject() as RawBodyRequest;
    const credentials = (await this.getCredentials('wapioApi')) as WapioCredentials;
    const rawBody = await getRawBody(request, this);
    const signatureHeader = getHeaderValue(headers, 'x-webhook-signature');

    if (!verifyWapioWebhookSignature(credentials.webhookSigningSecret ?? '', signatureHeader, rawBody)) {
      const response = this.getResponseObject();
      response.status(401).send('Invalid Wapio webhook signature');
      return { noWebhookResponse: true };
    }

    const bodyData = this.getBodyData() as IDataObject;
    const selectedEvents = this.getNodeParameter('events', []) as string[];

    const event = String(
      bodyData.event ??
      bodyData.event_type ??
      bodyData.type ??
      headers['x-webhook-event'] ??
      '',
    );

    // If events filter is specified, check if event matches
    if (selectedEvents.length > 0 && event && !selectedEvents.includes(event)) {
      return {
        noWebhookResponse: true,
      };
    }

    const sessionId = getTriggerSessionId.call(this);
    const returnData: INodeExecutionData[] = [
      {
        json: {
          ...bodyData,
          selectedSessionId: sessionId,
        },
      },
    ];

    return {
      workflowData: [returnData],
    };
  }
}

function getTriggerSessionId(this: IHookFunctions | IWebhookFunctions): string {
  const value = this.getNodeParameter('sessionId', undefined, { extractValue: true });
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

async function getWebhookConfig(this: IHookFunctions, sessionId: string): Promise<WebhookConfig | null> {
  return (await wapioApiRequest.call(
    this,
    'wapioApi',
    'GET',
    `/v1/whatsapp-sessions/${encodeURIComponent(sessionId)}/webhook`,
  )) as WebhookConfig | null;
}

async function getRawBody(request: RawBodyRequest, context: IWebhookFunctions): Promise<Buffer> {
  if (!request.rawBody && request.readRawBody) await request.readRawBody();
  if (!request.rawBody) {
    throw new NodeOperationError(context.getNode(), 'n8n did not retain the webhook raw body required for signature verification');
  }
  return request.rawBody;
}

function getHeaderValue(headers: IDataObject, name: string): string | undefined {
  const header = headers[name];
  return Array.isArray(header) ? header[0] : typeof header === 'string' ? header : undefined;
}

function sameEvents(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((event) => right.includes(event));
}
