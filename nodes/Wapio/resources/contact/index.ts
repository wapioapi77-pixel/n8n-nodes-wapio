import type { INodeProperties } from 'n8n-workflow';

import { contactJidSelect, showFor } from '../../shared/descriptions';

export const contactDescription: INodeProperties[] = [
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    noDataExpression: true,
    displayOptions: showFor('contact'),
    options: [
      {
        name: 'Block Contact',
        value: 'block',
        action: 'Block a whats app contact',
      },
      {
        name: 'Check If Number Exists (onWhatsApp)',
        value: 'checkOnWhatsApp',
        action: 'Check if a phone number is registered on whats app',
      },
      {
        name: 'Get Contact',
        value: 'get',
        action: 'Get contact profile info',
      },
      {
        name: 'Get Many',
        value: 'getAll',
        action: 'Get many contacts from session address book',
      },
      {
        name: 'Get Profile Picture',
        value: 'getProfilePicture',
        action: 'Get contact profile picture',
      },
      {
        name: 'Unblock Contact',
        value: 'unblock',
        action: 'Unblock a whats app contact',
      },
    ],
    default: 'get',
  },
  {
    ...contactJidSelect,
    displayOptions: showFor('contact', ['get', 'getProfilePicture', 'block', 'unblock']),
  },
  {
    displayName: 'Phone Number',
    name: 'phoneNumber',
    type: 'string',
    default: '',
    required: true,
    displayOptions: showFor('contact', ['checkOnWhatsApp']),
    placeholder: 'e.g. +1234567890',
    description: 'Phone number in E.164 format to check for WhatsApp registration',
  },
];
