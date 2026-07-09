"""محرك قواعد بنود §5 الحية — نوافذ التأكيد وفترات التهدئة.

المنطق لكل بند حي:
- جسم من أصناف البند يظهر داخل منطقة من مناطق البند → يبدأ عدّاد التأكيد.
- استمرار الوجود طوال confirm_window_sec (عبر رسائل update من Frigate) → يُطلق
  مرشح حدث واحد لكل جسم، ثم تهدئة cooldown_sec لكل (بند، كاميرا).
- خروج الجسم من المنطقة أو انتهاؤه (type=end) يصفّر عدّاده.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Callable

from .settings import Rule


@dataclass
class FrigateEvent:
    """تمثيل مبسّط لرسالة frigate/events."""
    type: str  # new | update | end
    event_id: str
    camera: str
    label: str
    score: float
    current_zones: list[str]

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> 'FrigateEvent | None':
        after = payload.get('after') or payload.get('before') or {}
        if not after.get('id') or not after.get('camera') or not after.get('label'):
            return None
        score = after.get('top_score') or after.get('score') or 0.0
        return cls(
            type=payload.get('type', 'update'),
            event_id=str(after['id']),
            camera=str(after['camera']),
            label=str(after['label']),
            score=float(score),
            current_zones=list(after.get('current_zones') or []),
        )


@dataclass
class Candidate:
    """مرشح حدث جاهز للرفع (قبل بوابة الثقة)."""
    item_code: str
    camera: str
    object_id: str
    frigate_event_id: str
    confidence: float
    zones_hit: list[str]
    verify: str | None
    occurred_at: float


@dataclass
class _Tracking:
    first_seen: float
    last_score: float
    fired: bool = False


class RulesEngine:
    def __init__(self, rules: list[Rule], clock: Callable[[], float] = time.time):
        self.rules = {r.item_code: r for r in rules}
        self.clock = clock
        # (item_code, camera, object_id) → تتبع نافذة التأكيد
        self._tracking: dict[tuple[str, str, str], _Tracking] = {}
        # (item_code, camera) → نهاية التهدئة
        self._cooldown_until: dict[tuple[str, str], float] = {}

    def live_rules(self) -> list[Rule]:
        return [r for r in self.rules.values() if r.mode == 'live' and r.enabled]

    def update_remote(self, remote_rules: list[dict[str, Any]]) -> None:
        """دمج إعدادات /api/edge/config — تحديث حي دون إعادة تشغيل."""
        for remote in remote_rules:
            rule = self.rules.get(str(remote.get('itemCode', '')))
            if rule:
                rule.merge_remote(remote)

    def process(self, event: FrigateEvent) -> list[Candidate]:
        now = self.clock()
        candidates: list[Candidate] = []

        if event.type == 'end':
            for key in [k for k in self._tracking if k[2] == event.event_id]:
                del self._tracking[key]
            return candidates

        for rule in self.live_rules():
            key = (rule.item_code, event.camera, event.event_id)
            zones_hit = [z for z in event.current_zones if z in rule.zones]

            if event.label not in rule.objects or not zones_hit:
                # خرج من المنطقة أو صنف غير معنيّ — يصفّر عدّاد هذا البند
                self._tracking.pop(key, None)
                continue

            tr = self._tracking.get(key)
            if tr is None:
                tr = _Tracking(first_seen=now, last_score=event.score)
                self._tracking[key] = tr
            tr.last_score = max(tr.last_score, event.score)

            if tr.fired:
                continue
            if now - tr.first_seen < rule.confirm_window_sec:
                continue
            if now < self._cooldown_until.get((rule.item_code, event.camera), 0.0):
                continue

            tr.fired = True
            self._cooldown_until[(rule.item_code, event.camera)] = now + rule.cooldown_sec
            candidates.append(
                Candidate(
                    item_code=rule.item_code,
                    camera=event.camera,
                    object_id=event.event_id,
                    frigate_event_id=event.event_id,
                    confidence=tr.last_score,
                    zones_hit=zones_hit,
                    verify=rule.verify,
                    occurred_at=now,
                ),
            )
        return candidates

    def sweep(self, max_age_sec: float = 3600.0) -> None:
        """تنظيف تتبعات قديمة (أجسام لم يصلها end)."""
        now = self.clock()
        stale = [k for k, tr in self._tracking.items() if now - tr.first_seen > max_age_sec]
        for k in stale:
            del self._tracking[k]
