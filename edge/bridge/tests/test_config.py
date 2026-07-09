"""مطابقة config.yaml مع PRD §5 (قرارات المطابقة 2026-07-09)."""
import pathlib

from abyad_bridge.settings import load_settings

CONFIG = str(pathlib.Path(__file__).resolve().parents[1] / 'config.yaml')


def rules_by_code():
    s = load_settings(CONFIG)
    return {r.item_code: r for r in s.rules}


def test_six_items_present():
    rules = rules_by_code()
    assert set(rules) == {'3/8/1/1', '1/4/1/1', '7/8/1/1', '1/5/1/1', '6/5/1/1', '10/4/1/1'}


def test_live_windows_match_prd():
    rules = rules_by_code()
    assert rules['3/8/1/1'].confirm_window_sec == 60  # زي غير مطابق ≥ 60 ث
    assert rules['1/4/1/1'].confirm_window_sec == 30  # تأكيد 3 إطارات / 30 ث
    assert rules['7/8/1/1'].confirm_window_sec == 120  # أدوات طعام ≥ 120 ث


def test_uniform_zones_include_reception():
    # قرار المالك: كاونتر الاستقبال منطقة عمل — يبقى ضمن 3/8/1/1
    rules = rules_by_code()
    assert set(rules['3/8/1/1'].zones) == {'processing_area', 'reception_pos'}


def test_scheduled_items():
    rules = rules_by_code()
    for code in ('1/5/1/1', '6/5/1/1', '10/4/1/1'):
        assert rules[code].mode == 'scheduled'
        assert rules[code].schedule_minutes == 120
