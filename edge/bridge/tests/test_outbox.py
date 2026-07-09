"""طابور offline-first: الإدراج، الرفع، التراجع الأُسّي عند الانقطاع."""
from abyad_bridge.outbox import Outbox


class FakeClock:
    def __init__(self, t: float = 1000.0):
        self.t = t

    def __call__(self) -> float:
        return self.t

    def advance(self, sec: float) -> None:
        self.t += sec


def make_outbox(tmp_path, clock):
    return Outbox(str(tmp_path / 'outbox.db'), clock=clock)


def test_enqueue_and_flush_success(tmp_path):
    clock = FakeClock()
    ob = make_outbox(tmp_path, clock)
    ob.enqueue('event', {'a': 1})
    ob.enqueue('snapshot', {'b': 'نص عربي'})
    sent = []
    assert ob.flush(lambda kind, p: sent.append((kind, p)) or True) == 2
    assert ob.pending_count() == 0
    assert sent[0][0] == 'event' and sent[1][1]['b'] == 'نص عربي'


def test_offline_keeps_records_with_backoff(tmp_path):
    clock = FakeClock()
    ob = make_outbox(tmp_path, clock)
    ob.enqueue('event', {'a': 1})
    ob.enqueue('event', {'a': 2})

    # انقطاع: الإرسال يفشل — لا فقدان، وتُجدول إعادة المحاولة
    assert ob.flush(lambda k, p: False) == 0
    assert ob.pending_count() == 2

    # قبل موعد المحاولة التالية لا يُرسل شيء
    assert ob.flush(lambda k, p: (_ for _ in ()).throw(AssertionError('مبكر'))) == 0

    # بعد التراجع (5 ثوانٍ للمحاولة الأولى) يعاود
    clock.advance(6)
    assert ob.flush(lambda k, p: True) == 2
    assert ob.pending_count() == 0


def test_backoff_grows_exponentially(tmp_path):
    clock = FakeClock()
    ob = make_outbox(tmp_path, clock)
    ob.enqueue('event', {'a': 1})
    for expected_backoff in (5, 10, 20):
        assert ob.flush(lambda k, p: False) == 0
        clock.advance(expected_backoff - 1)
        assert ob.flush(lambda k, p: True) == 0  # لم يحن الموعد
        clock.advance(1.5)
    assert ob.flush(lambda k, p: True) == 1


def test_sender_exception_treated_as_failure(tmp_path):
    clock = FakeClock()
    ob = make_outbox(tmp_path, clock)
    ob.enqueue('event', {'a': 1})

    def boom(kind, payload):
        raise ConnectionError('لا إنترنت')

    assert ob.flush(boom) == 0
    assert ob.pending_count() == 1


def test_persistence_across_instances(tmp_path):
    clock = FakeClock()
    ob1 = make_outbox(tmp_path, clock)
    ob1.enqueue('event', {'a': 1})
    # إعادة تشغيل الجسر (نسخة جديدة على نفس الملف) — السجل باقٍ
    ob2 = make_outbox(tmp_path, clock)
    assert ob2.pending_count() == 1
    assert ob2.flush(lambda k, p: True) == 1
