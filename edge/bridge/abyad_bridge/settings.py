"""تحميل الإعدادات: config.yaml + متغيرات البيئة."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any

import yaml


@dataclass
class Rule:
    item_code: str
    mode: str  # live | scheduled
    zones: list[str] = field(default_factory=list)
    objects: list[str] = field(default_factory=list)
    confirm_window_sec: float = 30.0
    cooldown_sec: float = 900.0
    auto_threshold: float = 0.85
    review_threshold: float = 0.60
    verify: str | None = None  # semantic | None
    schedule_minutes: int | None = None
    enabled: bool = True

    def merge_remote(self, remote: dict[str, Any]) -> None:
        """تطبيق تحديث عن بُعد من /api/edge/config (السحابة هي المرجع)."""
        self.enabled = bool(remote.get('enabled', self.enabled))
        self.auto_threshold = float(remote.get('autoThreshold', self.auto_threshold))
        self.review_threshold = float(remote.get('reviewThreshold', self.review_threshold))
        self.confirm_window_sec = float(remote.get('confirmWindowSec', self.confirm_window_sec))
        self.cooldown_sec = float(remote.get('cooldownSec', self.cooldown_sec))
        if remote.get('zones'):
            self.zones = list(remote['zones'])
        if remote.get('objects'):
            self.objects = list(remote['objects'])
        if remote.get('scheduleMinutes'):
            self.schedule_minutes = int(remote['scheduleMinutes'])


@dataclass
class Settings:
    cloud_base_url: str
    device_token: str
    mqtt_host: str
    mqtt_port: int
    frigate_base_url: str
    outbox_db: str
    version: str
    heartbeat_sec: int
    outbox_flush_sec: int
    snapshot_interval_minutes: int
    cameras: dict[str, list[str]]  # camera -> zones
    rules: list[Rule]


def load_settings(config_path: str = 'config.yaml') -> Settings:
    with open(config_path, encoding='utf-8') as f:
        cfg: dict[str, Any] = yaml.safe_load(f)

    rules = [
        Rule(
            item_code=r['item_code'],
            mode=r.get('mode', 'live'),
            zones=list(r.get('zones', [])),
            objects=list(r.get('objects', [])),
            confirm_window_sec=float(r.get('confirm_window_sec', 30)),
            cooldown_sec=float(r.get('cooldown_sec', 900)),
            auto_threshold=float(r.get('auto_threshold', 0.85)),
            review_threshold=float(r.get('review_threshold', 0.60)),
            verify=r.get('verify'),
            schedule_minutes=r.get('schedule_minutes'),
        )
        for r in cfg.get('rules', [])
    ]

    return Settings(
        cloud_base_url=os.environ.get('CLOUD_BASE_URL', '').rstrip('/'),
        device_token=os.environ.get('CLOUD_DEVICE_TOKEN', ''),
        mqtt_host=os.environ.get('MQTT_HOST', 'localhost'),
        mqtt_port=int(os.environ.get('MQTT_PORT', '1883')),
        frigate_base_url=os.environ.get('FRIGATE_BASE_URL', 'http://localhost:5000').rstrip('/'),
        outbox_db=os.environ.get('OUTBOX_DB', '/data/outbox.db'),
        version=os.environ.get('BRIDGE_VERSION', '1.0.0'),
        heartbeat_sec=int(cfg.get('heartbeat_sec', 60)),
        outbox_flush_sec=int(cfg.get('outbox_flush_sec', 10)),
        snapshot_interval_minutes=int(cfg.get('snapshot_interval_minutes', 120)),
        cameras={k: list(v.get('zones', [])) for k, v in cfg.get('cameras', {}).items()},
        rules=rules,
    )
