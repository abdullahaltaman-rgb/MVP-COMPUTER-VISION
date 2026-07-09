"""بوابة الثقة: auto ≥ 0.85 / مراجعة 0.60–0.84 / إهمال < 0.60."""
from abyad_bridge.gating import gate
from abyad_bridge.settings import Rule


RULE = Rule(item_code='x', mode='live', auto_threshold=0.85, review_threshold=0.60)


def test_auto_at_and_above_threshold():
    assert gate(0.85, RULE) == 'auto'
    assert gate(0.99, RULE) == 'auto'


def test_review_band():
    assert gate(0.60, RULE) == 'review'
    assert gate(0.84, RULE) == 'review'


def test_drop_below_review():
    assert gate(0.59, RULE) == 'drop'
    assert gate(0.0, RULE) == 'drop'


def test_thresholds_follow_rule_config():
    custom = Rule(item_code='x', mode='live', auto_threshold=0.9, review_threshold=0.7)
    assert gate(0.85, custom) == 'review'
    assert gate(0.65, custom) == 'drop'
