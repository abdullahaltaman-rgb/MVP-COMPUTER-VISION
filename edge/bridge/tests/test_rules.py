"""اختبارات محرك قواعد §5: نوافذ التأكيد، التهدئة، التحديث عن بُعد."""
from abyad_bridge.rules import FrigateEvent, RulesEngine
from abyad_bridge.settings import Rule


class FakeClock:
    def __init__(self, t: float = 1000.0):
        self.t = t

    def __call__(self) -> float:
        return self.t

    def advance(self, sec: float) -> None:
        self.t += sec


def make_rule(**overrides) -> Rule:
    base = dict(
        item_code='7/8/1/1',
        mode='live',
        zones=['processing_area'],
        objects=['cup', 'bottle'],
        confirm_window_sec=30,
        cooldown_sec=900,
        verify='semantic',
    )
    base.update(overrides)
    return Rule(**base)


def ev(event_id='obj1', label='cup', zones=None, etype='update', score=0.9, camera='cam_processing'):
    return FrigateEvent(
        type=etype,
        event_id=event_id,
        camera=camera,
        label=label,
        score=score,
        current_zones=zones if zones is not None else ['processing_area'],
    )


def test_no_fire_before_confirm_window():
    clock = FakeClock()
    engine = RulesEngine([make_rule()], clock=clock)
    assert engine.process(ev()) == []
    clock.advance(20)
    assert engine.process(ev()) == []  # 20 < 30 ثانية


def test_fires_once_after_confirm_window():
    clock = FakeClock()
    engine = RulesEngine([make_rule()], clock=clock)
    engine.process(ev())
    clock.advance(31)
    cands = engine.process(ev())
    assert len(cands) == 1
    c = cands[0]
    assert c.item_code == '7/8/1/1'
    assert c.zones_hit == ['processing_area']
    assert c.verify == 'semantic'
    assert c.confidence == 0.9
    # نفس الجسم لا يطلق مرة ثانية
    clock.advance(10)
    assert engine.process(ev()) == []


def test_leaving_zone_resets_window():
    clock = FakeClock()
    engine = RulesEngine([make_rule()], clock=clock)
    engine.process(ev())
    clock.advance(20)
    engine.process(ev(zones=[]))  # خرج من المنطقة
    clock.advance(15)
    # عاد — نافذة جديدة (15 < 30 رغم أن المجموع 35)
    assert engine.process(ev()) == []
    clock.advance(31)
    assert len(engine.process(ev())) == 1


def test_cooldown_blocks_new_object_same_camera():
    clock = FakeClock()
    engine = RulesEngine([make_rule(cooldown_sec=900)], clock=clock)
    engine.process(ev('obj1'))
    clock.advance(31)
    assert len(engine.process(ev('obj1'))) == 1
    # جسم جديد خلال التهدئة — لا إطلاق
    engine.process(ev('obj2'))
    clock.advance(31)
    assert engine.process(ev('obj2')) == []
    # بعد انقضاء التهدئة يُطلق
    clock.advance(900)
    engine.process(ev('obj3'))
    clock.advance(31)
    assert len(engine.process(ev('obj3'))) == 1


def test_end_event_clears_tracking():
    clock = FakeClock()
    engine = RulesEngine([make_rule()], clock=clock)
    engine.process(ev())
    engine.process(ev(etype='end'))
    clock.advance(31)
    assert engine.process(ev()) == []  # بدأ من جديد


def test_wrong_object_or_zone_ignored():
    clock = FakeClock()
    engine = RulesEngine([make_rule()], clock=clock)
    engine.process(ev(label='person'))
    clock.advance(31)
    assert engine.process(ev(label='person')) == []
    engine.process(ev(zones=['entrance']))
    clock.advance(31)
    assert engine.process(ev(zones=['entrance'])) == []


def test_multiple_rules_same_object():
    """شخص في منطقة المعالجة يغذي بندي الزي والملابس معًا."""
    clock = FakeClock()
    uniform = make_rule(item_code='3/8/1/1', objects=['person'],
                        zones=['processing_area', 'reception_pos'], confirm_window_sec=45)
    floor = make_rule(item_code='1/4/1/1', objects=['person'],
                      zones=['processing_area'], confirm_window_sec=60)
    engine = RulesEngine([uniform, floor], clock=clock)
    p = lambda: ev(label='person', event_id='p1')
    engine.process(p())
    clock.advance(46)
    cands = engine.process(p())
    assert [c.item_code for c in cands] == ['3/8/1/1']
    clock.advance(15)  # 61 ثانية إجمالًا
    cands = engine.process(p())
    assert [c.item_code for c in cands] == ['1/4/1/1']


def test_remote_update_applies():
    clock = FakeClock()
    engine = RulesEngine([make_rule()], clock=clock)
    engine.update_remote([
        {'itemCode': '7/8/1/1', 'enabled': True, 'confirmWindowSec': 5,
         'cooldownSec': 10, 'autoThreshold': 0.9, 'reviewThreshold': 0.7},
    ])
    engine.process(ev())
    clock.advance(6)
    assert len(engine.process(ev())) == 1
    rule = engine.rules['7/8/1/1']
    assert rule.auto_threshold == 0.9 and rule.cooldown_sec == 10


def test_disabled_rule_never_fires():
    clock = FakeClock()
    engine = RulesEngine([make_rule()], clock=clock)
    engine.update_remote([{'itemCode': '7/8/1/1', 'enabled': False}])
    engine.process(ev())
    clock.advance(100)
    assert engine.process(ev()) == []
