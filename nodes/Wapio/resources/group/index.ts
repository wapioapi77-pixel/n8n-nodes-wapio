import type { INodeProperties } from 'n8n-workflow';

import { createStringListField, groupJidSelect, showFor } from '../../shared/descriptions';

export const groupDescription: INodeProperties[] = [
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    noDataExpression: true,
    displayOptions: showFor('group'),
    options: [
      {
        name: 'Accept Group Invite',
        value: 'acceptInvite',
        action: 'Join a group using invite link or code',
      },
      {
        name: 'Add Participants',
        value: 'addParticipants',
        action: 'Add members to a group',
      },
      {
        name: 'Create Group',
        value: 'create',
        action: 'Create a new whats app group',
      },
      {
        name: 'Demote Participants',
        value: 'demoteParticipants',
        action: 'Demote group admins to regular participants',
      },
      {
        name: 'Get Group Invite Link',
        value: 'getInviteLink',
        action: 'Get the invite link for a group',
      },
      {
        name: 'Get Group Metadata',
        value: 'get',
        action: 'Get group details and members',
      },
      {
        name: 'Get Group Profile Picture',
        value: 'getProfilePicture',
        action: 'Get group icon picture',
      },
      {
        name: 'Get Many',
        value: 'getAll',
        action: 'List all groups for the session',
      },
      {
        name: 'Get Participants',
        value: 'getParticipants',
        action: 'Get list of participants in a group',
      },
      {
        name: 'Leave Group',
        value: 'leave',
        action: 'Leave a whats app group',
      },
      {
        name: 'Promote Participants',
        value: 'promoteParticipants',
        action: 'Promote group participants to admin',
      },
      {
        name: 'Remove Participants',
        value: 'removeParticipants',
        action: 'Remove members from a group',
      },
      {
        name: 'Update Group Settings',
        value: 'updateSettings',
        action: 'Update group settings and permissions',
      },
    ],
    default: 'getAll',
  },
  {
    ...groupJidSelect,
    displayOptions: showFor('group', [
      'get',
      'getProfilePicture',
      'getInviteLink',
      'getParticipants',
      'addParticipants',
      'removeParticipants',
      'promoteParticipants',
      'demoteParticipants',
      'updateSettings',
      'leave',
    ]),
  },
  // Create Group
  {
    displayName: 'Group Subject / Name',
    name: 'groupSubject',
    type: 'string',
    default: '',
    required: true,
    displayOptions: showFor('group', ['create']),
    description: 'Name/subject for the new group',
  },
  createStringListField(
    'Initial Participants',
    'createParticipants',
    'e.g. 1234567890 or 1234567890@s.whatsapp.net',
    'Phone numbers or JIDs of participants to include',
    showFor('group', ['create']),
  ),
  // Manage Participants
  createStringListField(
    'Participants',
    'participants',
    'e.g. 1234567890 or 1234567890@s.whatsapp.net',
    'Phone numbers or JIDs of participants to add, remove, promote, or demote',
    showFor('group', ['addParticipants', 'removeParticipants', 'promoteParticipants', 'demoteParticipants']),
  ),
  // Accept Invite
  {
    displayName: 'Invite Code or Link',
    name: 'inviteCode',
    type: 'string',
    default: '',
    required: true,
    displayOptions: showFor('group', ['acceptInvite']),
    placeholder: 'https://chat.whatsapp.com/ABCxyz or ABCxyz',
    description: 'WhatsApp group invite link or code',
  },
  // Update Settings
  {
    displayName: 'Only Admins Can Edit Group Info',
    name: 'restrictEditInfo',
    type: 'boolean',
    default: false,
    displayOptions: showFor('group', ['updateSettings']),
    description: 'Whether only admins can change group name, icon, and description',
  },
  {
    displayName: 'Only Admins Can Send Messages (Announcement Group)',
    name: 'restrictSendMessages',
    type: 'boolean',
    default: false,
    displayOptions: showFor('group', ['updateSettings']),
    description: 'Whether only admins can send messages to this group',
  },
];
