"""Provider-agnostic WhatsApp sending, mirroring email.py's role for SMTP.

Supports three provider modes (SystemSettings.whatsapp_provider), all
configured from the same small set of fields (see branding/models.py):

- meta_cloud: Meta's official WhatsApp Cloud API. Business-initiated
  messages (which every ticket notification is - the customer didn't just
  message us) require an admin-approved template outside the customer's own
  24h reply window, so this always sends a template message with the
  human-readable notification text as its single {{1}} body parameter.
- twilio: Twilio's WhatsApp Messages API. Sent as a plain body message -
  works out of the box in the Twilio Sandbox and within an existing 24h
  conversation; a production Twilio WhatsApp sender may require an approved
  Content Template for the first message to a new recipient, which Twilio
  enforces on their side (not something this code can pre-validate).
- generic: POSTs {"to": ..., "message": ...} as JSON to any custom
  `whatsapp_webhook_url`, with the access token (if set) sent as a Bearer
  token - covers any other BSP/self-hosted gateway without new fields.

No third-party HTTP library dependency - the payloads here are simple
enough that Python's stdlib (urllib) covers it without adding `requests` to
requirements.txt.
"""
import base64
import json
import logging
import re
import urllib.error
import urllib.parse
import urllib.request

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 15


def _digits_only(phone):
    """Strips everything but digits (and a leading +) - user.phone is
    free-text (e.g. "+968 9123 4567" or "09123 4567"), but every WhatsApp
    provider's API wants a plain international-format number."""
    if not phone:
        return ''
    cleaned = re.sub(r'[^\d+]', '', phone)
    return cleaned.lstrip('+')


def _post_json(url, payload, headers):
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json', **headers}, method='POST')
    with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
        return resp.status, resp.read().decode('utf-8', errors='replace')


def _post_form(url, fields, headers):
    data = '&'.join(f'{k}={urllib.parse.quote(str(v))}' for k, v in fields.items()).encode('utf-8')
    req = urllib.request.Request(
        url, data=data,
        headers={'Content-Type': 'application/x-www-form-urlencoded', **headers},
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
        return resp.status, resp.read().decode('utf-8', errors='replace')


def _send_meta_cloud(s, to_number, message):
    if not (s.whatsapp_phone_number_id and s.whatsapp_access_token):
        logger.info('WhatsApp (Meta) not sent: phone_number_id or access_token missing.')
        return False
    url = f'https://graph.facebook.com/v20.0/{s.whatsapp_phone_number_id}/messages'
    payload = {
        'messaging_product': 'whatsapp',
        'to': to_number,
        'type': 'template',
        'template': {
            'name': s.whatsapp_template_name or 'ticket_notification',
            'language': {'code': s.whatsapp_template_language or 'en_US'},
            'components': [
                {'type': 'body', 'parameters': [{'type': 'text', 'text': message}]},
            ],
        },
    }
    _post_json(url, payload, {'Authorization': f'Bearer {s.whatsapp_access_token}'})
    return True


def _send_twilio(s, to_number, message):
    if not (s.whatsapp_account_sid and s.whatsapp_access_token and s.whatsapp_sender_number):
        logger.info('WhatsApp (Twilio) not sent: account_sid, access_token or sender_number missing.')
        return False
    url = f'https://api.twilio.com/2010-04-01/Accounts/{s.whatsapp_account_sid}/Messages.json'
    auth = base64.b64encode(f'{s.whatsapp_account_sid}:{s.whatsapp_access_token}'.encode()).decode()
    from_number = s.whatsapp_sender_number if s.whatsapp_sender_number.startswith('whatsapp:') else f'whatsapp:{s.whatsapp_sender_number}'
    to = to_number if to_number.startswith('whatsapp:') else f'whatsapp:+{to_number}'
    _post_form(url, {'From': from_number, 'To': to, 'Body': message}, {'Authorization': f'Basic {auth}'})
    return True


def _send_generic(s, to_number, message):
    if not s.whatsapp_webhook_url:
        logger.info('WhatsApp (generic) not sent: whatsapp_webhook_url missing.')
        return False
    headers = {'Authorization': f'Bearer {s.whatsapp_access_token}'} if s.whatsapp_access_token else {}
    _post_json(s.whatsapp_webhook_url, {'to': to_number, 'message': message}, headers)
    return True


_SENDERS = {
    'meta_cloud': _send_meta_cloud,
    'twilio': _send_twilio,
    'generic': _send_generic,
}


def send_whatsapp_message(phone, message):
    """Sends a WhatsApp message via whichever provider is configured in
    SystemSettings. Returns True/False - never raises, same as
    send_ticket_email, so a WhatsApp failure never breaks the ticket action
    that triggered it."""
    from branding.models import SystemSettings
    s = SystemSettings.get()
    if not s.whatsapp_enabled:
        return False
    to_number = _digits_only(phone)
    if not to_number:
        return False
    sender = _SENDERS.get(s.whatsapp_provider)
    if sender is None:
        logger.warning('WhatsApp not sent: unknown provider "%s".', s.whatsapp_provider)
        return False
    try:
        return sender(s, to_number, message)
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace') if e.fp else ''
        logger.error('WhatsApp send error (%s) to %s: HTTP %s %s', s.whatsapp_provider, phone, e.code, body[:500])
        return False
    except Exception:
        logger.exception('WhatsApp send error (%s) to %s', s.whatsapp_provider, phone)
        return False
