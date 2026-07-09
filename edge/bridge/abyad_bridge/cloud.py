"""عميل REST السحابي (مصادقة برمز الجهاز)."""
from __future__ import annotations

import logging
from typing import Any

import requests

log = logging.getLogger('bridge.cloud')


class CloudClient:
    def __init__(self, base_url: str, device_token: str, timeout: float = 30.0):
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers['Authorization'] = f'Bearer {device_token}'

    def post_event(self, payload: dict[str, Any]) -> bool:
        """يرفع حدثًا؛ True عند القبول (بما فيه المكرر/المُهمَل بالبوابة)."""
        r = self.session.post(f'{self.base_url}/api/edge/events', json=payload, timeout=self.timeout)
        if r.status_code == 400:
            # حمولة فاسدة — إعادة المحاولة عبثية، نُسقطها من الطابور مع تسجيلها
            log.error('حمولة حدث مرفوضة (400): %s', r.text[:300])
            return True
        r.raise_for_status()
        return True

    def post_snapshot(self, payload: dict[str, Any]) -> bool:
        r = self.session.post(f'{self.base_url}/api/edge/snapshots', json=payload, timeout=self.timeout)
        if r.status_code == 400:
            log.error('حمولة لقطة مرفوضة (400): %s', r.text[:300])
            return True
        r.raise_for_status()
        return True

    def heartbeat(self, payload: dict[str, Any]) -> bool:
        r = self.session.post(f'{self.base_url}/api/edge/heartbeat', json=payload, timeout=self.timeout)
        r.raise_for_status()
        return True

    def get_config(self) -> dict[str, Any] | None:
        try:
            r = self.session.get(f'{self.base_url}/api/edge/config', timeout=self.timeout)
            r.raise_for_status()
            return r.json()
        except Exception as exc:
            log.warning('تعذر سحب الإعداد عن بُعد: %s', exc)
            return None
