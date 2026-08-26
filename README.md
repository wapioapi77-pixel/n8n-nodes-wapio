# n8n-nodes-wapio

Official [n8n](https://n8n.io/) community node for [Wapio](https://www.wapio.io) — the developer-first WhatsApp API platform.

Automate WhatsApp messaging, session management, group coordination, contact synchronization, and real-time webhook workflows effortlessly inside n8n.

---

## Features

- 💬 **Rich Messaging:** Send text, images, videos, audio/voice notes (PTT), documents, stickers, locations, contact cards (vCard), and interactive polls.
- 🔄 **Conversations & Threads:** Support for mentions, reply-to / quoted messages, and view-once media.
- ⚡ **Real-time Webhook Triggers (`WapioTrigger`):** Automatically trigger n8n workflows when incoming WhatsApp messages, media, reactions, group updates, or session status changes happen.
- 📱 **Session Lifecycle:** Connect, disconnect, restart sessions, and generate QR code binary PNGs directly inside workflows.
- 👥 **Contacts & Presence:** Fetch contact details, query profile pictures, block/unblock, and check WhatsApp number existence (`onWhatsApp`).
- 👨‍👩‍👧‍👦 **Group Management:** Create groups, retrieve metadata, adjust group settings, fetch invite links, accept invites, and manage group participants (add, remove, promote, demote).
- 🔓 **End-to-End Media Decryption:** Decrypt incoming encrypted WhatsApp media streams straight into n8n binary data files.

---

## Installation

### Community Nodes UI (Recommended)

1. Open your n8n instance.
2. Go to **Settings** > **Community Nodes**.
3. Select **Install a community node**.
4. Enter `n8n-nodes-wapio` and click **Install**.

### CLI / Self-Hosted Docker

In your n8n installation directory or Docker container:

```bash
npm install n8n-nodes-wapio
```

Or add `N8N_COMMUNITY_PACKAGES_ENABLED=true` to your environment variables.

---

## Credentials

1. In n8n, navigate to **Credentials** > **New Credential** > search for **Wapio API**.
2. Provide your:
   - **Personal Access Token** (`bps_pat_...`) from your [Wapio Dashboard](https://www.wapio.io) for account and session-management operations. A **Session API Key** (`bps_sk_...`) is suitable for session-scoped actions.
   - **Base URL** (Defaults to `https://api.wapio.io`). Self-hosted or custom server instances can use their own custom endpoint (e.g. `http://your-vps:3005`).
   - For **Wapio Trigger**, also set a unique **Webhook Signing Secret** (at least 16 characters). The package sends it only when registering the Wapio webhook and verifies every incoming request with its HMAC signature.

---

## Available Nodes

### 1. `Wapio` (Action Node)

Execute actions across 5 core resources:

- **Message:**
  - `Send Text`: Send plain or formatted text messages with emojis and mentions.
  - `Send Image`: Send image via URL or upload with optional caption.
  - `Send Video`: Send MP4 video with optional caption and view-once.
  - `Send Audio`: Send MP3/OGG audio files or voice notes (PTT).
  - `Send Document`: Send PDF, ZIP, spreadsheets, or any document attachment.
  - `Send Sticker`: Send WebP sticker images.
  - `Send Location`: Send GPS coordinates with place name and address.
  - `Send Contact`: Send vCard contact details.
  - `Send Poll`: Send interactive single or multi-select polls.
  - `Decrypt Webhook Media`: Convert incoming encrypted WhatsApp media payloads to downloadable n8n binary files.
  - `Get Message Info`: Fetch message delivery receipt status (`sent`, `delivered`, `read`).
  - `Mark as Read`: Send read receipt (`blue ticks`) for incoming messages.
  - `Edit Message`: Edit already sent messages.
  - `Delete Message`: Revoke/delete sent messages.
  - `Resend Message`: Retry failed messages.

- **Session:**
  - `Get Current Session Status`: Fetch connection status and phone number.
  - `Get Current Session User Info`: Fetch connected WhatsApp profile info.
  - `Send Presence Update`: Send `composing` (typing), `recording`, `available`, or `unavailable`.
  - `Connect Session`: Request QR code pairing data.
  - `Get QR Code`: Render live QR code as a PNG binary image.
  - `Disconnect Session`: Unlink WhatsApp session.
  - `Restart Session`: Reboot connection state.
  - `Regenerate Session Key`: Rotate session API key.

- **Account:**
  - `Get All Sessions`: List all WhatsApp sessions under your account.
  - `Get Session`: Retrieve session metadata and configuration.
  - `Create Session`: Provision a new WhatsApp session.
  - `Update Session`: Modify session settings.
  - `Delete Session`: Destroy a session.

- **Contact:**
  - `Check If Number Exists (onWhatsApp)`: Verify if phone numbers are registered on WhatsApp.
  - `Get Contact`: Retrieve contact profile information.
  - `Get Contact Profile Picture`: Download high-resolution profile pictures.
  - `List Contacts`: Query synchronized address book contacts.
  - `Block / Unblock Contact`: Manage blacklists.

- **Group:**
  - `List Groups`: List all joined groups.
  - `Create Group`: Create new WhatsApp group with participants.
  - `Get Group Metadata`: View group subject, description, owner, creation date, and members.
  - `Get Group Profile Picture`: Download group icon.
  - `Get Group Invite Link`: Generate sharable invite URL.
  - `Join Group via Invite Link`: Accept invite code and join group.
  - `Manage Participants`: Add, remove, promote to admin, or demote participants.
  - `Update Group Settings`: Control who can send messages or edit info.
  - `Leave Group`: Exit a WhatsApp group.

---

### 2. `WapioTrigger` (Webhook Node)

Starts workflows instantly when events happen on your WhatsApp session:

- `messages.received`: Incoming direct messages (text, media, location, etc.).
- `messages-group.received`: Incoming group messages.
- `messages.update`: Delivery and read status updates (`sent`, `delivered`, `read`).
- `session.status`: Connection state changes (`connected`, `disconnected`, `connecting`).
- `qrcode.updated`: Fresh QR code received for pairing.
- `group-participants.update`: Members joining or leaving groups.
- `poll.results`: Real-time voting updates.

When activated, n8n registers its webhook URL on the selected Wapio session and verifies each delivered event before starting the workflow. Wapio allows one webhook configuration per session, so do not activate another Wapio Trigger for the same session unless it uses the same workflow URL.

---

## Compatibility

- **n8n version:** `1.0.0` or higher
- **Node.js:** `>= 20.19.0`
- **Wapio API:** Compatible with `https://api.wapio.io`. Account operations and Wapio Trigger require a Personal Access Token (`bps_pat_*`); session keys (`bps_sk_*`) are for session-scoped actions.

---

## License

[MIT](LICENSE.md) © [Wapio](https://www.wapio.io)
