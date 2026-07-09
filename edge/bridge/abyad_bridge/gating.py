"""بوابة الثقة على الحافة: auto ≥ عتبة الإصدار / مراجعة 0.60–0.84 / إهمال.

السحابة تعيد تطبيق البوابة كمصدر حقيقة (وقد تعدّل الثقة بالتحقق الدلالي)؛
دور الحافة إسقاط ما دون عتبة المراجعة لتوفير النطاق الترددي فقط.
"""
from __future__ import annotations

from .settings import Rule


def gate(confidence: float, rule: Rule) -> str:
    if confidence >= rule.auto_threshold:
        return 'auto'
    if confidence >= rule.review_threshold:
        return 'review'
    return 'drop'
