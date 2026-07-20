import re
import urllib.error
import urllib.request
from urllib.parse import urljoin, urlparse

from django.core.cache import cache
from rest_framework import serializers
from .models import DirectoryTab, DirectoryField, StaffDirectoryEntry, Portal, PortalCategory

FAVICON_CACHE_TTL = 7 * 24 * 3600  # 1 week
FAVICON_FETCH_TIMEOUT = 3
# Matches a <link rel="icon"|"shortcut icon"|"apple-touch-icon" href="..."> tag
# regardless of which attribute (rel/href) comes first, or what else is on the tag.
_ICON_LINK_RE = re.compile(
    r'<link\b(?=[^>]*\brel=["\'](?:shortcut icon|icon|apple-touch-icon)["\'])(?=[^>]*\bhref=["\']([^"\']+)["\'])[^>]*>',
    re.IGNORECASE,
)


def _discover_favicon(url):
    """Best-effort favicon resolution: most real sites declare their icon via
    a <link rel="icon"> tag pointing at some arbitrary path (not always
    /favicon.ico), so a plain domain-root guess misses them. Fetches just
    the first chunk of the homepage (the <head> is always near the top) and
    scans for that tag; falls back to the /favicon.ico convention if nothing
    is found or the page can't be reached at all."""
    parsed = urlparse(url)
    if not parsed.netloc:
        return None
    fallback = f'{parsed.scheme}://{parsed.netloc}/favicon.ico'
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (compatible; HelpdeskFaviconBot/1.0)'})
        with urllib.request.urlopen(req, timeout=FAVICON_FETCH_TIMEOUT) as resp:
            html = resp.read(65536).decode('utf-8', errors='ignore')
        match = _ICON_LINK_RE.search(html)
        if match:
            return urljoin(url, match.group(1))
    except (urllib.error.URLError, TimeoutError, ValueError, UnicodeDecodeError):
        pass
    return fallback


class DirectoryFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = DirectoryField
        fields = ['id', 'tab', 'name', 'order', 'created_at']
        read_only_fields = ['created_at']


class DirectoryTabSerializer(serializers.ModelSerializer):
    entry_count = serializers.SerializerMethodField()
    custom_fields = DirectoryFieldSerializer(source='fields', many=True, read_only=True)

    class Meta:
        model = DirectoryTab
        fields = ['id', 'name', 'order', 'custom_fields', 'entry_count', 'created_at']
        read_only_fields = ['created_at']

    def get_entry_count(self, obj):
        return obj.entries.count()


class StaffDirectoryEntrySerializer(serializers.ModelSerializer):
    tab_name = serializers.CharField(source='tab.name', read_only=True)

    class Meta:
        model = StaffDirectoryEntry
        fields = ['id', 'tab', 'tab_name', 'values', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at']

    def validate_values(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError('values must be an object keyed by field id.')
        cleaned = {str(k): ('' if v is None else str(v)) for k, v in value.items()}
        if not any(v.strip() for v in cleaned.values()):
            raise serializers.ValidationError('Fill in at least one detail.')
        return cleaned


class PortalCategorySerializer(serializers.ModelSerializer):
    portal_count = serializers.SerializerMethodField()
    allowed_role_names = serializers.SerializerMethodField()

    class Meta:
        model = PortalCategory
        fields = ['id', 'name', 'order', 'allowed_roles', 'allowed_role_names', 'portal_count', 'created_at']
        read_only_fields = ['created_at']

    def get_portal_count(self, obj):
        return obj.portals.count()

    def get_allowed_role_names(self, obj):
        return [r.name for r in obj.allowed_roles.all()]


class PortalSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.full_name', read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True)
    favicon_url = serializers.SerializerMethodField()

    class Meta:
        model = Portal
        fields = [
            'id', 'name', 'url', 'category', 'category_name', 'favicon_url',
            'created_by', 'created_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = ['created_by', 'created_at', 'updated_at']

    def get_favicon_url(self, obj):
        # Resolves the icon from the portal's own site rather than Google's
        # s2/favicons lookup service - that service only has icons cached
        # for sites it has already crawled, and silently returns its own
        # generic placeholder (not an error) for anything obscure it doesn't
        # recognize, which for this app is the common case (internal
        # ERP/HR/vendor portals, not public sites).
        #
        # _discover_favicon() does a real outbound HTTP request, so the
        # result is cached per portal - without this, every load of the
        # Directory page would re-fetch every portal's homepage on every
        # request. Cache is keyed on the URL too so editing a portal's URL
        # doesn't keep serving a stale result from the old address.
        cache_key = f'portal_favicon:{obj.id}:{obj.url}'
        cached = cache.get(cache_key)
        if cached is not None:
            return cached or None
        result = _discover_favicon(obj.url)
        cache.set(cache_key, result or '', FAVICON_CACHE_TTL)
        return result
