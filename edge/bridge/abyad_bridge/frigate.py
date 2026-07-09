"""عميل Frigate API: التقاط إطارات الدليل وإحصاءات الكاميرات."""
from __future__ import annotations

import base64
import logging
from typing import Any

import requests

log = logging.getLogger('bridge.frigate')


class FrigateClient:
    def __init__(self, base_url: str, timeout: float = 15.0):
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout

    def event_snapshot_b64(self, event_id: str) -> str | None:
        """إطار الدليل لحدث متتبع (مع صندوق الإحاطة)."""
        try:
            r = requests.get(
                f'{self.base_url}/api/events/{event_id}/snapshot.jpg',
                params={'bbox': 1, 'quality': 85},
                timeout=self.timeout,
            )
            r.raise_for_status()
            return base64.b64encode(r.content).decode()
        except Exception as exc:
            log.warning('تعذر التقاط snapshot للحدث %s: %s', event_id, exc)
            return None

    def latest_frame_b64(self, camera: str) -> str | None:
        """أحدث إطار من كاميرا (للقطات المجدولة والاحتياط)."""
        try:
            r = requests.get(
                f'{self.base_url}/api/{camera}/latest.jpg',
                params={'quality': 85},
                timeout=self.timeout,
            )
            r.raise_for_status()
            return base64.b64encode(r.content).decode()
        except Exception as exc:
            log.warning('تعذر التقاط إطار من %s: %s', camera, exc)
            return None

    def stats(self) -> dict[str, Any]:
        try:
            r = requests.get(f'{self.base_url}/api/stats', timeout=self.timeout)
            r.raise_for_status()
            return r.json()
        except Exception as exc:
            log.warning('تعذرت قراءة إحصاءات Frigate: %s', exc)
            return {}
