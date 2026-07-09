"""منسّق الجسر: مستهلك MQTT + نبض 60 ثانية + لقطات مجدولة + مضخة الطابور.

التدفق: Frigate MQTT → محرك قواعد §5 → بوابة الثقة → إطار دليل من Frigate API
→ طابور SQLite (offline-first) → رفع سحابي مع إعادة محاولة.
SILENT_MODE يُدار سحابيًا (البوابة الإلزامية في ingest) — الجسر يواصل الرفع دائمًا.
"""
from __future__ import annotations

import datetime as dt
import json
import logging
import threading
import time

import paho.mqtt.client as mqtt

from .cloud import CloudClient
from .frigate import FrigateClient
from .gating import gate
from .outbox import Outbox
from .rules import FrigateEvent, RulesEngine
from .settings import Settings, load_settings

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(name)s %(levelname)s %(message)s')
log = logging.getLogger('bridge')


def iso_utc(ts: float) -> str:
    return dt.datetime.fromtimestamp(ts, tz=dt.timezone.utc).isoformat().replace('+00:00', 'Z')


class Bridge:
    def __init__(self, settings: Settings):
        self.s = settings
        self.engine = RulesEngine(settings.rules)
        self.outbox = Outbox(settings.outbox_db)
        self.cloud = CloudClient(settings.cloud_base_url, settings.device_token)
        self.frigate = FrigateClient(settings.frigate_base_url)
        self.silent_mode = True
        self.snapshot_interval_min = settings.snapshot_interval_minutes
        self._stop = threading.Event()

    # ── MQTT ──

    def on_mqtt_message(self, _client: mqtt.Client, _userdata: object, msg: mqtt.MQTTMessage) -> None:
        try:
            payload = json.loads(msg.payload.decode('utf-8'))
        except (ValueError, UnicodeDecodeError):
            return
        event = FrigateEvent.from_payload(payload)
        if not event:
            return

        for cand in self.engine.process(event):
            rule = self.engine.rules[cand.item_code]
            decision = gate(cand.confidence, rule)
            if decision == 'drop':
                continue

            frame = self.frigate.event_snapshot_b64(cand.frigate_event_id) or \
                self.frigate.latest_frame_b64(cand.camera)
            if not frame:
                log.error('لا إطار دليل للحدث %s — أُسقط', cand.frigate_event_id)
                continue

            self.outbox.enqueue(
                'event',
                {
                    'dedupeKey': f'evt_{cand.frigate_event_id}_{cand.item_code.replace("/", "-")}',
                    'cameraKey': cand.camera,
                    'itemCode': cand.item_code,
                    'confidence': round(cand.confidence, 4),
                    'occurredAt': iso_utc(cand.occurred_at),
                    'zonesHit': cand.zones_hit,
                    'frameB64': frame,
                    'meta': {'verify': cand.verify, 'frigateEventId': cand.frigate_event_id}
                    if cand.verify
                    else {'frigateEventId': cand.frigate_event_id},
                },
            )
            log.info(
                'مرشح %s من %s (ثقة %.2f → %s) دخل الطابور',
                cand.item_code, cand.camera, cand.confidence, decision,
            )

    def run_mqtt(self) -> None:
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id='abyad-bridge')
        client.on_message = self.on_mqtt_message
        while not self._stop.is_set():
            try:
                client.connect(self.s.mqtt_host, self.s.mqtt_port, keepalive=60)
                client.subscribe('frigate/events')
                log.info('متصل بـ MQTT %s:%s', self.s.mqtt_host, self.s.mqtt_port)
                client.loop_forever(retry_first_connection=False)
            except Exception as exc:
                log.warning('انقطاع MQTT: %s — إعادة محاولة بعد 5 ثوانٍ', exc)
                time.sleep(5)

    # ── النبض + الإعداد عن بُعد ──

    def heartbeat_once(self) -> None:
        stats = self.frigate.stats()
        cam_stats = stats.get('cameras', {})
        cameras = []
        for cam_key in self.s.cameras:
            cs = cam_stats.get(cam_key, {})
            fps = float(cs.get('camera_fps', 0) or 0)
            cameras.append({'key': cam_key, 'online': fps > 0, 'fps': fps})
        try:
            self.cloud.heartbeat(
                {
                    'version': self.s.version,
                    'cameras': cameras,
                    'stats': {
                        'outboxPending': self.outbox.pending_count(),
                        'silentMode': self.silent_mode,
                        'detectionFps': stats.get('detection_fps'),
                        'cpu': (stats.get('cpu_usages') or {}).get('frigate.full_system', {}),
                    },
                },
            )
        except Exception as exc:
            log.warning('فشل النبض (سيتكرر): %s', exc)

        remote = self.cloud.get_config()
        if remote:
            self.silent_mode = bool(remote.get('silentMode', True))
            if remote.get('snapshotIntervalMinutes'):
                self.snapshot_interval_min = int(remote['snapshotIntervalMinutes'])
            self.engine.update_remote(remote.get('rules', []))

    def run_heartbeat(self) -> None:
        while not self._stop.is_set():
            self.heartbeat_once()
            self.engine.sweep()
            self._stop.wait(self.s.heartbeat_sec)

    # ── لقطات الفحص الدلالي المجدول ──

    def scheduled_cameras(self) -> list[str]:
        """الكاميرات التي تغطي مناطق البنود المجدولة المفعّلة."""
        zones: set[str] = set()
        for rule in self.engine.rules.values():
            if rule.mode == 'scheduled' and rule.enabled:
                zones.update(rule.zones)
        return [cam for cam, cam_zones in self.s.cameras.items() if zones & set(cam_zones)]

    def snapshots_once(self) -> None:
        for cam in self.scheduled_cameras():
            frame = self.frigate.latest_frame_b64(cam)
            if not frame:
                continue
            self.outbox.enqueue(
                'snapshot',
                {'cameraKey': cam, 'takenAt': iso_utc(time.time()), 'frameB64': frame},
            )
            log.info('لقطة مجدولة من %s دخلت الطابور', cam)

    def run_snapshots(self) -> None:
        while not self._stop.is_set():
            self.snapshots_once()
            self._stop.wait(max(self.snapshot_interval_min, 1) * 60)

    # ── مضخة الطابور ──

    def _send(self, kind: str, payload: dict) -> bool:
        if kind == 'event':
            return self.cloud.post_event(payload)
        if kind == 'snapshot':
            return self.cloud.post_snapshot(payload)
        return True  # نوع مجهول — لا نعلق الطابور عليه

    def run_outbox(self) -> None:
        while not self._stop.is_set():
            try:
                sent = self.outbox.flush(self._send)
                if sent:
                    log.info('رُفع %s سجل من الطابور (متبقٍ %s)', sent, self.outbox.pending_count())
            except Exception as exc:
                log.warning('خطأ مضخة الطابور: %s', exc)
            self._stop.wait(self.s.outbox_flush_sec)

    # ── التشغيل ──

    def run(self) -> None:
        log.info('جسر أبيض فيجن %s — يتصل بـ %s', self.s.version, self.s.cloud_base_url)
        threads = [
            threading.Thread(target=self.run_mqtt, name='mqtt', daemon=True),
            threading.Thread(target=self.run_heartbeat, name='heartbeat', daemon=True),
            threading.Thread(target=self.run_snapshots, name='snapshots', daemon=True),
            threading.Thread(target=self.run_outbox, name='outbox', daemon=True),
        ]
        for t in threads:
            t.start()
        try:
            while True:
                time.sleep(60)
        except KeyboardInterrupt:
            self._stop.set()


def main() -> None:
    settings = load_settings()
    if not settings.cloud_base_url or not settings.device_token:
        raise SystemExit('CLOUD_BASE_URL و CLOUD_DEVICE_TOKEN مطلوبان (انظر edge/.env.example)')
    Bridge(settings).run()


if __name__ == '__main__':
    main()
