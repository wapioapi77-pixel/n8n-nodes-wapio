import type {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { accountDescription } from './resources/account';
import { contactDescription } from './resources/contact';
import { groupDescription } from './resources/group';
import { messageDescription } from './resources/message';
import { sessionDescription } from './resources/session';
import { getContacts } from './listSearch/getContacts';
import { getGroups } from './listSearch/getGroups';
import { getSessions } from './listSearch/getSessions';
import { requestRetryOptions, sessionIdSelect } from './shared/descriptions';
import { renderQrCodeBuffer } from './shared/qrcode';
import { wapioApiRequest } from './shared/transport';

type WapioResource = 'account' | 'session' | 'message' | 'contact' | 'group';
type WapioResponse = IDataObject;

interface NodeExecutionDataResult {
  __executionData: INodeExecutionData[];
}

export class Wapio implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Wapio',
    name: 'wapio',
    icon: {
      light: 'file:../../icons/wapio.svg',
      dark: 'file:../../icons/wapio.dark.svg',
    },
    group: ['output'],
    version: 1,
    subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
    description: 'Manage Wapio WhatsApp sessions, messages, contacts, and groups',
    defaults: { name: 'Wapio' },
    usableAsTool: true,
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    credentials: [{ name: 'wapioApi', required: true }],
    properties: [
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Account', value: 'account' },
          { name: 'Contact', value: 'contact' },
          { name: 'Group', value: 'group' },
          { name: 'Message', value: 'message' },
          { name: 'Session', value: 'session' },
        ],
        default: 'message',
      },
      {
        ...sessionIdSelect,
        required: false,
        description:
          'Optional when the input item includes selectedSessionId; select a session here if you want contact or group lists in the editor',
        displayOptions: {
          show: {
            resource: ['session', 'message', 'contact', 'group'],
          },
        },
      },
      {
        displayName: 'Auto Selected Session ID',
        name: 'autoSelectedSessionId',
        type: 'hidden',
        default: '={{$json.selectedSessionId ?? $json.selectedSession?.id ?? $json.session_id ?? $json.sessionId ?? ""}}',
        displayOptions: {
          show: {
            resource: ['session', 'message', 'contact', 'group'],
          },
        },
      },
      {
        displayName: 'Has Auto Selected Session',
        name: 'hasAutoSelectedSession',
        type: 'hidden',
        default: '={{Boolean($json.selectedSessionId ?? $json.selectedSession?.id ?? $json.session_id ?? $json.sessionId ?? "")}}',
        displayOptions: {
          show: {
            resource: ['session', 'message', 'contact', 'group'],
          },
        },
      },
      {
        displayName:
          'This node will use the session from the incoming item automatically unless you choose another session below.',
        name: 'autoSelectedSessionNotice',
        type: 'notice',
        default: '',
        displayOptions: {
          show: {
            resource: ['session', 'message', 'contact', 'group'],
            hasAutoSelectedSession: [true],
          },
        },
      },
      ...accountDescription,
      ...sessionDescription,
      ...messageDescription,
      ...contactDescription,
      ...groupDescription,
      requestRetryOptions,
    ],
  };

  methods = {
    listSearch: {
      getSessions,
      getContacts,
      getGroups,
    },
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      try {
        const resource = this.getNodeParameter('resource', itemIndex) as WapioResource;
        const operation = this.getNodeParameter('operation', itemIndex) as string;

        const responseData = await executeOperation.call(this, resource, operation, itemIndex);

        if (isNodeExecutionDataResult(responseData)) {
          returnData.push(...responseData.__executionData);
          continue;
        }

        returnData.push(...toExecutionData(responseData, itemIndex));
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: {
              error: (error as Error).message,
            },
            pairedItem: { item: itemIndex },
          });
          continue;
        }

        throw new NodeOperationError(this.getNode(), error as Error, { itemIndex });
      }
    }

    return [returnData];
  }
}

async function executeOperation(
  this: IExecuteFunctions,
  resource: WapioResource,
  operation: string,
  itemIndex: number,
): Promise<unknown | NodeExecutionDataResult> {
  switch (resource) {
    case 'account':
      return await executeAccountOperation.call(this, operation, itemIndex);
    case 'session':
      return await executeSessionOperation.call(this, operation, itemIndex);
    case 'message':
      return await executeMessageOperation.call(this, operation, itemIndex);
    case 'contact':
      return await executeContactOperation.call(this, operation, itemIndex);
    case 'group':
      return await executeGroupOperation.call(this, operation, itemIndex);
    default:
      throw new NodeOperationError(this.getNode(), `Unsupported resource: ${resource}`);
  }
}

async function executeAccountOperation(
  this: IExecuteFunctions,
  operation: string,
  itemIndex: number,
): Promise<unknown> {
  switch (operation) {
    case 'getAll': {
      const response = (await wapioApiRequest.call(
        this,
        'wapioApi',
        'GET',
        '/v1/whatsapp-sessions',
      )) as WapioResponse;
      return extractResponsePayload(response);
    }
    case 'create': {
      const name = this.getNodeParameter('name', itemIndex, '') as string;
      const proxyUrl = this.getNodeParameter('proxyUrl', itemIndex, '') as string;
      const body: IDataObject = { name };
      if (proxyUrl) body.proxy_url = proxyUrl;

      const response = (await wapioApiRequest.call(
        this,
        'wapioApi',
        'POST',
        '/v1/whatsapp-sessions',
        { body },
      )) as WapioResponse;
      return extractResponsePayload(response);
    }
    case 'get': {
      const sessionId = getSessionId.call(this, itemIndex);
      const response = (await wapioApiRequest.call(
        this,
        'wapioApi',
        'GET',
        `/v1/whatsapp-sessions/${encodeURIComponent(sessionId)}`,
      )) as WapioResponse;
      return extractResponsePayload(response);
    }
    case 'update': {
      const sessionId = getSessionId.call(this, itemIndex);
      const name = this.getNodeParameter('name', itemIndex, '') as string;
      const proxyUrl = this.getNodeParameter('proxyUrl', itemIndex, '') as string;
      const body: IDataObject = {};
      if (name) body.name = name;
      if (proxyUrl) body.proxy_url = proxyUrl;

      const response = (await wapioApiRequest.call(
        this,
        'wapioApi',
        'PATCH',
        `/v1/whatsapp-sessions/${encodeURIComponent(sessionId)}`,
        { body },
      )) as WapioResponse;
      return extractResponsePayload(response);
    }
    case 'delete': {
      const sessionId = getSessionId.call(this, itemIndex);
      const response = (await wapioApiRequest.call(
        this,
        'wapioApi',
        'DELETE',
        `/v1/whatsapp-sessions/${encodeURIComponent(sessionId)}`,
      )) as WapioResponse;
      return extractResponsePayload(response);
    }
    case 'connect':
    case 'disconnect':
    case 'restart':
    case 'regenerateKey': {
      const sessionId = getSessionId.call(this, itemIndex);
      const endpointByOperation: Record<string, string> = {
        connect: 'connect',
        disconnect: 'disconnect',
        restart: 'restart',
        regenerateKey: 'regenerate-key',
      };

      const response = (await wapioApiRequest.call(
        this,
        'wapioApi',
        'POST',
        `/v1/whatsapp-sessions/${encodeURIComponent(sessionId)}/${endpointByOperation[operation]}`,
      )) as WapioResponse;

      const payload = extractResponsePayload(response);
      if (operation === 'connect') {
        const binaryResult = await createQrCodeBinaryData.call(
          this,
          payload,
          itemIndex,
          `session-${sessionId}-connect-qrcode.png`,
        );
        if (binaryResult) return binaryResult;
      }

      return payload;
    }
    case 'getQrCode': {
      const sessionId = getSessionId.call(this, itemIndex);
      const response = (await wapioApiRequest.call(
        this,
        'wapioApi',
        'GET',
        `/v1/whatsapp-sessions/${encodeURIComponent(sessionId)}/qrcode`,
      )) as WapioResponse;

      const payload = extractResponsePayload(response);
      const binaryResult = await createQrCodeBinaryData.call(
        this,
        payload,
        itemIndex,
        `session-${sessionId}-qrcode.png`,
      );
      return binaryResult ?? payload;
    }
    default:
      throw new NodeOperationError(this.getNode(), `Unsupported account operation: ${operation}`);
  }
}

async function executeSessionOperation(
  this: IExecuteFunctions,
  operation: string,
  itemIndex: number,
): Promise<unknown> {
  const sessionId = getSessionId.call(this, itemIndex);

  switch (operation) {
    case 'getStatus': {
      const response = (await wapioApiRequest.call(
        this,
        'wapioApi',
        'GET',
        '/api/status',
        { qs: { session_id: sessionId }, headers: { 'x-session-id': sessionId } },
      )) as WapioResponse;
      return extractResponsePayload(response);
    }
    case 'getUserInfo': {
      const response = (await wapioApiRequest.call(
        this,
        'wapioApi',
        'GET',
        '/api/user',
        { qs: { session_id: sessionId }, headers: { 'x-session-id': sessionId } },
      )) as WapioResponse;
      return extractResponsePayload(response);
    }
    case 'sendPresenceUpdate': {
      const presence = this.getNodeParameter('presence', itemIndex) as string;
      const to = this.getNodeParameter('to', itemIndex, '') as string;
      const body: IDataObject = { session_id: sessionId, presence };
      if (to) body.to = to;

      const response = (await wapioApiRequest.call(
        this,
        'wapioApi',
        'POST',
        '/api/send-presence-update',
        { body, headers: { 'x-session-id': sessionId } },
      )) as WapioResponse;
      return extractResponsePayload(response);
    }
    default:
      throw new NodeOperationError(this.getNode(), `Unsupported session operation: ${operation}`);
  }
}

async function executeMessageOperation(
  this: IExecuteFunctions,
  operation: string,
  itemIndex: number,
): Promise<unknown | NodeExecutionDataResult> {
  const sessionId = getSessionId.call(this, itemIndex, false);

  switch (operation) {
    case 'sendText': {
      const to = this.getNodeParameter('to', itemIndex) as string;
      const text = this.getNodeParameter('text', itemIndex) as string;
      const replyTo = this.getNodeParameter('replyTo', itemIndex, '') as string;
      const mentions = this.getNodeParameter('mentions', itemIndex, []) as string[];

      const body: IDataObject = { to, text };
      if (sessionId) body.session_id = sessionId;
      if (replyTo) body.replyTo = replyTo;
      if (mentions.length > 0) body.mentions = mentions;

      const response = (await wapioApiRequest.call(
        this,
        'wapioApi',
        'POST',
        '/api/send-message',
        { body, headers: sessionId ? { 'x-session-id': sessionId } : {} },
      )) as WapioResponse;
      return extractResponsePayload(response);
    }
    case 'sendImage':
    case 'sendVideo':
    case 'sendAudio':
    case 'sendDocument':
    case 'sendSticker': {
      const to = this.getNodeParameter('to', itemIndex) as string;
      const replyTo = this.getNodeParameter('replyTo', itemIndex, '') as string;
      const mentions = this.getNodeParameter('mentions', itemIndex, []) as string[];

      const body: IDataObject = { to };
      if (sessionId) body.session_id = sessionId;
      if (replyTo) body.replyTo = replyTo;
      if (mentions.length > 0) body.mentions = mentions;

      if (operation === 'sendImage') {
        body.imageUrl = this.getNodeParameter('imageUrl', itemIndex) as string;
        const caption = this.getNodeParameter('caption', itemIndex, '') as string;
        const viewOnce = this.getNodeParameter('viewOnce', itemIndex, false) as boolean;
        if (caption) body.caption = caption;
        if (viewOnce) body.viewOnce = true;
      } else if (operation === 'sendVideo') {
        body.videoUrl = this.getNodeParameter('videoUrl', itemIndex) as string;
        const caption = this.getNodeParameter('caption', itemIndex, '') as string;
        const viewOnce = this.getNodeParameter('viewOnce', itemIndex, false) as boolean;
        if (caption) body.caption = caption;
        if (viewOnce) body.viewOnce = true;
      } else if (operation === 'sendAudio') {
        body.audioUrl = this.getNodeParameter('audioUrl', itemIndex) as string;
        const ptt = this.getNodeParameter('ptt', itemIndex, false) as boolean;
        if (ptt) body.ptt = true;
      } else if (operation === 'sendDocument') {
        body.documentUrl = this.getNodeParameter('documentUrl', itemIndex) as string;
        const fileName = this.getNodeParameter('fileName', itemIndex, '') as string;
        const caption = this.getNodeParameter('caption', itemIndex, '') as string;
        if (fileName) body.fileName = fileName;
        if (caption) body.caption = caption;
      } else if (operation === 'sendSticker') {
        body.stickerUrl = this.getNodeParameter('stickerUrl', itemIndex) as string;
      }

      const mimeType = this.getNodeParameter('mimeType', itemIndex, '') as string;
      if (mimeType) body.mimeType = mimeType;

      const response = (await wapioApiRequest.call(
        this,
        'wapioApi',
        'POST',
        '/api/send-message',
        { body, headers: sessionId ? { 'x-session-id': sessionId } : {} },
      )) as WapioResponse;
      return extractResponsePayload(response);
    }
    case 'sendLocation': {
      const to = this.getNodeParameter('to', itemIndex) as string;
      const latitude = this.getNodeParameter('latitude', itemIndex) as number;
      const longitude = this.getNodeParameter('longitude', itemIndex) as number;
      const name = this.getNodeParameter('locationName', itemIndex, '') as string;
      const address = this.getNodeParameter('locationAddress', itemIndex, '') as string;

      const body: IDataObject = {
        to,
        location: { latitude, longitude, ...(name ? { name } : {}), ...(address ? { address } : {}) },
      };
      if (sessionId) body.session_id = sessionId;

      const response = (await wapioApiRequest.call(
        this,
        'wapioApi',
        'POST',
        '/api/send-message',
        { body, headers: sessionId ? { 'x-session-id': sessionId } : {} },
      )) as WapioResponse;
      return extractResponsePayload(response);
    }
    case 'sendContact': {
      const to = this.getNodeParameter('to', itemIndex) as string;
      const fullName = this.getNodeParameter('contactName', itemIndex) as string;
      const phoneNumber = this.getNodeParameter('contactPhone', itemIndex) as string;

      const body: IDataObject = {
        to,
        contact: { fullName, phoneNumber },
      };
      if (sessionId) body.session_id = sessionId;

      const response = (await wapioApiRequest.call(
        this,
        'wapioApi',
        'POST',
        '/api/send-message',
        { body, headers: sessionId ? { 'x-session-id': sessionId } : {} },
      )) as WapioResponse;
      return extractResponsePayload(response);
    }
    case 'sendPoll': {
      const to = this.getNodeParameter('to', itemIndex) as string;
      const question = this.getNodeParameter('pollQuestion', itemIndex) as string;
      const options = this.getNodeParameter('pollOptions', itemIndex, []) as string[];
      const multiSelect = this.getNodeParameter('pollMultiSelect', itemIndex, false) as boolean;

      const body: IDataObject = {
        to,
        poll: { question, options, multiSelect },
      };
      if (sessionId) body.session_id = sessionId;

      const response = (await wapioApiRequest.call(
        this,
        'wapioApi',
        'POST',
        '/api/send-message',
        { body, headers: sessionId ? { 'x-session-id': sessionId } : {} },
      )) as WapioResponse;
      return extractResponsePayload(response);
    }
    case 'markAsRead': {
      const messageId = this.getNodeParameter('messageId', itemIndex) as string;
      const chatJid = this.getNodeParameter('chatJid', itemIndex, '') as string;
      const body: IDataObject = { message_ids: [messageId] };
      if (chatJid) body.chat_jid = chatJid;
      if (sessionId) body.session_id = sessionId;

      const response = (await wapioApiRequest.call(
        this,
        'wapioApi',
        'POST',
        '/api/messages/read',
        { body, headers: sessionId ? { 'x-session-id': sessionId } : {} },
      )) as WapioResponse;
      return extractResponsePayload(response);
    }
    case 'edit': {
      const messageId = this.getNodeParameter('targetMessageId', itemIndex) as string;
      const text = this.getNodeParameter('editText', itemIndex) as string;
      const body: IDataObject = { text };
      if (sessionId) body.session_id = sessionId;

      const response = (await wapioApiRequest.call(
        this,
        'wapioApi',
        'POST',
        `/api/messages/${encodeURIComponent(messageId)}/edit`,
        { body, headers: sessionId ? { 'x-session-id': sessionId } : {} },
      )) as WapioResponse;
      return extractResponsePayload(response);
    }
    case 'delete': {
      const messageId = this.getNodeParameter('messageId', itemIndex) as string;
      const response = (await wapioApiRequest.call(
        this,
        'wapioApi',
        'DELETE',
        `/api/messages/${encodeURIComponent(messageId)}`,
        { headers: sessionId ? { 'x-session-id': sessionId } : {} },
      )) as WapioResponse;
      return extractResponsePayload(response);
    }
    case 'getInfo': {
      const messageId = this.getNodeParameter('messageId', itemIndex) as string;
      const response = (await wapioApiRequest.call(
        this,
        'wapioApi',
        'GET',
        `/api/messages/${encodeURIComponent(messageId)}/info`,
        { headers: sessionId ? { 'x-session-id': sessionId } : {} },
      )) as WapioResponse;
      return extractResponsePayload(response);
    }
    case 'resend': {
      const messageId = this.getNodeParameter('messageId', itemIndex) as string;
      const response = (await wapioApiRequest.call(
        this,
        'wapioApi',
        'POST',
        `/api/messages/${encodeURIComponent(messageId)}/resend`,
        { headers: sessionId ? { 'x-session-id': sessionId } : {} },
      )) as WapioResponse;
      return extractResponsePayload(response);
    }
    case 'decryptMedia': {
      const rawPayload = this.getNodeParameter('decryptPayload', itemIndex) as IDataObject | string;
      const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex, 'data') as string;
      const payloadObj = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;

      const body: IDataObject = { ...payloadObj };
      if (sessionId) body.session_id = sessionId;

      const response = (await wapioApiRequest.call(
        this,
        'wapioApi',
        'POST',
        '/v1/media/decrypt',
        { body, headers: sessionId ? { 'x-session-id': sessionId } : {} },
      )) as {
        success?: boolean;
        download_url?: string;
        public_url?: string;
      };

      const downloadUrl = response.download_url ?? response.public_url;
      if (!downloadUrl) throw new NodeOperationError(this.getNode(), 'Wapio did not return a decrypted media URL');

      const binaryBuffer = await downloadMediaBuffer.call(this, downloadUrl);
      const fileName = getDecryptFileName(payloadObj);
      const mimeType = getDecryptMimeType(payloadObj);
      const binaryData = await this.helpers.prepareBinaryData(
        binaryBuffer,
        fileName,
        mimeType,
      );

      return {
        __executionData: [
          {
            json: {
              success: true,
              fileName,
              mimeType,
              fileSize: binaryBuffer.length,
            },
            binary: {
              [binaryPropertyName]: binaryData,
            },
            pairedItem: { item: itemIndex },
          },
        ],
      };
    }
    default:
      throw new NodeOperationError(this.getNode(), `Unsupported message operation: ${operation}`);
  }
}

async function executeContactOperation(
  this: IExecuteFunctions,
  operation: string,
  itemIndex: number,
): Promise<unknown> {
  const sessionId = getSessionId.call(this, itemIndex);

  switch (operation) {
    case 'getAll': {
      const response = (await wapioApiRequest.call(
        this,
        'wapioApi',
        'GET',
        '/api/contacts',
        { qs: { session_id: sessionId }, headers: { 'x-session-id': sessionId } },
      )) as WapioResponse;
      return extractResponsePayload(response);
    }
    case 'get': {
      const contactJid = getResourceLocatorValue.call(this, 'contactJid', itemIndex);
      const response = (await wapioApiRequest.call(
        this,
        'wapioApi',
        'GET',
        `/api/contacts/${encodeURIComponent(contactJid)}`,
        { qs: { session_id: sessionId }, headers: { 'x-session-id': sessionId } },
      )) as WapioResponse;
      return extractResponsePayload(response);
    }
    case 'getProfilePicture': {
      const contactJid = getResourceLocatorValue.call(this, 'contactJid', itemIndex);
      const response = (await wapioApiRequest.call(
        this,
        'wapioApi',
        'GET',
        `/api/contacts/${encodeURIComponent(contactJid)}/picture`,
        { qs: { session_id: sessionId }, headers: { 'x-session-id': sessionId } },
      )) as WapioResponse;
      return extractResponsePayload(response);
    }
    case 'block':
    case 'unblock': {
      const contactJid = getResourceLocatorValue.call(this, 'contactJid', itemIndex);
      const endpoint = operation === 'block' ? 'block' : 'unblock';
      const response = (await wapioApiRequest.call(
        this,
        'wapioApi',
        'POST',
        `/api/contacts/${encodeURIComponent(contactJid)}/${endpoint}`,
        { body: { session_id: sessionId }, headers: { 'x-session-id': sessionId } },
      )) as WapioResponse;
      return extractResponsePayload(response);
    }
    case 'checkOnWhatsApp': {
      const phoneNumber = this.getNodeParameter('phoneNumber', itemIndex) as string;
      const response = (await wapioApiRequest.call(
        this,
        'wapioApi',
        'GET',
        `/api/on-whatsapp/${encodeURIComponent(phoneNumber)}`,
        { qs: { session_id: sessionId }, headers: { 'x-session-id': sessionId } },
      )) as WapioResponse;
      return extractResponsePayload(response);
    }
    default:
      throw new NodeOperationError(this.getNode(), `Unsupported contact operation: ${operation}`);
  }
}

async function executeGroupOperation(
  this: IExecuteFunctions,
  operation: string,
  itemIndex: number,
): Promise<unknown> {
  const sessionId = getSessionId.call(this, itemIndex);

  switch (operation) {
    case 'getAll': {
      const response = (await wapioApiRequest.call(
        this,
        'wapioApi',
        'GET',
        '/api/groups',
        { qs: { session_id: sessionId }, headers: { 'x-session-id': sessionId } },
      )) as WapioResponse;
      return extractResponsePayload(response);
    }
    case 'get': {
      const groupJid = getResourceLocatorValue.call(this, 'groupJid', itemIndex);
      const response = (await wapioApiRequest.call(
        this,
        'wapioApi',
        'GET',
        `/api/groups/${encodeURIComponent(groupJid)}`,
        { qs: { session_id: sessionId }, headers: { 'x-session-id': sessionId } },
      )) as WapioResponse;
      return extractResponsePayload(response);
    }
    case 'create': {
      const subject = this.getNodeParameter('groupSubject', itemIndex) as string;
      const participants = this.getNodeParameter('createParticipants', itemIndex, []) as string[];
      const body: IDataObject = { session_id: sessionId, name: subject, participants };
      const response = (await wapioApiRequest.call(
        this,
        'wapioApi',
        'POST',
        '/api/groups',
        { body, headers: { 'x-session-id': sessionId } },
      )) as WapioResponse;
      return extractResponsePayload(response);
    }
    case 'getProfilePicture': {
      const groupJid = getResourceLocatorValue.call(this, 'groupJid', itemIndex);
      const response = (await wapioApiRequest.call(
        this,
        'wapioApi',
        'GET',
        `/api/groups/${encodeURIComponent(groupJid)}/picture`,
        { qs: { session_id: sessionId }, headers: { 'x-session-id': sessionId } },
      )) as WapioResponse;
      return extractResponsePayload(response);
    }
    case 'getInviteLink': {
      const groupJid = getResourceLocatorValue.call(this, 'groupJid', itemIndex);
      const response = (await wapioApiRequest.call(
        this,
        'wapioApi',
        'GET',
        `/api/groups/${encodeURIComponent(groupJid)}/invite-link`,
        { qs: { session_id: sessionId }, headers: { 'x-session-id': sessionId } },
      )) as WapioResponse;
      return extractResponsePayload(response);
    }
    case 'acceptInvite': {
      const inviteCode = this.getNodeParameter('inviteCode', itemIndex) as string;
      const code = inviteCode.replace(/^https:\/\/chat\.whatsapp\.com\//, '').trim();
      const body: IDataObject = { session_id: sessionId, code };
      const response = (await wapioApiRequest.call(
        this,
        'wapioApi',
        'POST',
        '/api/groups/invite/accept',
        { body, headers: { 'x-session-id': sessionId } },
      )) as WapioResponse;
      return extractResponsePayload(response);
    }
    case 'getParticipants': {
      const groupJid = getResourceLocatorValue.call(this, 'groupJid', itemIndex);
      const response = (await wapioApiRequest.call(
        this,
        'wapioApi',
        'GET',
        `/api/groups/${encodeURIComponent(groupJid)}/participants`,
        { qs: { session_id: sessionId }, headers: { 'x-session-id': sessionId } },
      )) as WapioResponse;
      return extractResponsePayload(response);
    }
    case 'addParticipants':
    case 'removeParticipants':
    case 'promoteParticipants':
    case 'demoteParticipants': {
      const groupJid = getResourceLocatorValue.call(this, 'groupJid', itemIndex);
      const participants = this.getNodeParameter('participants', itemIndex, []) as string[];
      const actionMap: Record<string, string> = {
        addParticipants: 'add',
        removeParticipants: 'remove',
        promoteParticipants: 'promote',
        demoteParticipants: 'demote',
      };
      const endpoint = actionMap[operation];
      const body: IDataObject = { session_id: sessionId, participants };
      const response = (await wapioApiRequest.call(
        this,
        'wapioApi',
        'POST',
        `/api/groups/${encodeURIComponent(groupJid)}/participants/${endpoint}`,
        { body, headers: { 'x-session-id': sessionId } },
      )) as WapioResponse;
      return extractResponsePayload(response);
    }
    case 'updateSettings': {
      const groupJid = getResourceLocatorValue.call(this, 'groupJid', itemIndex);
      const restrictEditInfo = this.getNodeParameter('restrictEditInfo', itemIndex, false) as boolean;
      const restrictSendMessages = this.getNodeParameter('restrictSendMessages', itemIndex, false) as boolean;
      const body: IDataObject = {
        session_id: sessionId,
        restrict: restrictEditInfo,
        announce: restrictSendMessages,
      };
      const response = (await wapioApiRequest.call(
        this,
        'wapioApi',
        'PUT',
        `/api/groups/${encodeURIComponent(groupJid)}/settings`,
        { body, headers: { 'x-session-id': sessionId } },
      )) as WapioResponse;
      return extractResponsePayload(response);
    }
    case 'leave': {
      const groupJid = getResourceLocatorValue.call(this, 'groupJid', itemIndex);
      const body: IDataObject = { session_id: sessionId };
      const response = (await wapioApiRequest.call(
        this,
        'wapioApi',
        'POST',
        `/api/groups/${encodeURIComponent(groupJid)}/leave`,
        { body, headers: { 'x-session-id': sessionId } },
      )) as WapioResponse;
      return extractResponsePayload(response);
    }
    default:
      throw new NodeOperationError(this.getNode(), `Unsupported group operation: ${operation}`);
  }
}

function getSessionId(
  this: IExecuteFunctions,
  itemIndex: number,
  required: boolean = true,
): string {
  const explicit = getResourceLocatorValue.call(this, 'sessionId', itemIndex);
  if (explicit) return explicit;

  const auto = (this.getNodeParameter('autoSelectedSessionId', itemIndex, '') as string).trim();
  if (auto) return auto;

  if (required) {
    throw new NodeOperationError(
      this.getNode(),
      'Session ID is required. Please select a session in the node properties.',
      { itemIndex },
    );
  }

  return '';
}

function getResourceLocatorValue(
  this: IExecuteFunctions,
  parameterName: string,
  itemIndex: number,
): string {
  try {
    const parameterValue = this.getNodeParameter(parameterName, itemIndex, undefined, {
      extractValue: true,
    });
    return typeof parameterValue === 'string' || typeof parameterValue === 'number'
      ? String(parameterValue).trim()
      : '';
  } catch {
    return '';
  }
}

function extractResponsePayload(response: WapioResponse | unknown): unknown {
  if (response && typeof response === 'object' && 'data' in (response as Record<string, unknown>)) {
    return (response as Record<string, unknown>).data;
  }
  return response;
}

function toExecutionData(data: unknown, itemIndex: number): INodeExecutionData[] {
  if (Array.isArray(data)) {
    return data.map((entry) => ({
      json: wrapJsonPayload(entry),
      pairedItem: { item: itemIndex },
    }));
  }

  return [
    {
      json: wrapJsonPayload(data),
      pairedItem: { item: itemIndex },
    },
  ];
}

function wrapJsonPayload(value: unknown): IDataObject {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as IDataObject;
  }
  return { value: value as IDataObject };
}

function isNodeExecutionDataResult(value: unknown): value is NodeExecutionDataResult {
  return Boolean(
    value &&
      typeof value === 'object' &&
      Array.isArray((value as NodeExecutionDataResult).__executionData),
  );
}

async function downloadMediaBuffer(
  this: IExecuteFunctions,
  downloadUrl: string,
): Promise<Buffer> {
  const downloaded = await this.helpers.httpRequest({
    method: 'GET',
    url: downloadUrl,
    encoding: 'arraybuffer',
  });

  if (Buffer.isBuffer(downloaded)) return downloaded;
  if (downloaded instanceof ArrayBuffer) return Buffer.from(downloaded);
  if (ArrayBuffer.isView(downloaded)) {
    return Buffer.from(downloaded.buffer, downloaded.byteOffset, downloaded.byteLength);
  }

  throw new NodeOperationError(this.getNode(), 'Could not download decrypted media as binary data');
}

function getDecryptFileName(payload: IDataObject): string {
  const content = payload.content as IDataObject | undefined;
  return String(payload.file_name ?? content?.file_name ?? 'decrypted-media');
}

function getDecryptMimeType(payload: IDataObject): string {
  const content = payload.content as IDataObject | undefined;
  return String(payload.mime_type ?? payload.mimetype ?? content?.mime_type ?? 'application/octet-stream');
}

async function createQrCodeBinaryData(
  this: IExecuteFunctions,
  payload: unknown,
  itemIndex: number,
  fileName: string,
): Promise<NodeExecutionDataResult | null> {
  const qrString = extractQrString(payload);
  if (!qrString) return null;

  const pngBuffer = renderQrCodeBuffer(qrString);
  const binaryData = await this.helpers.prepareBinaryData(pngBuffer, fileName, 'image/png');

  return {
    __executionData: [
      {
        json: wrapJsonPayload(payload),
        binary: {
          qrcode: binaryData,
        },
        pairedItem: { item: itemIndex },
      },
    ],
  };
}

function extractQrString(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;

  for (const key of ['qrcode', 'qrCode', 'qr', 'code', 'pairing_code']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  return null;
}
