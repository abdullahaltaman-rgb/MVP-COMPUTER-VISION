'use client';

// خريطة Leaflet الحيّة للرياض — تُحمّل ديناميكيًا بـ ssr:false (Leaflet يحتاج window).
// تعرض المنشآت الحقيقية من Neon ومنشآت العرض جنبًا إلى جنب، ملوّنة بحالة الامتثال.
import { useEffect, useRef } from 'react';
import type { Map as LeafletMap, Marker } from 'leaflet';
import { COMPLIANCE_AR, COMPLIANCE_COLOR, type Facility } from '@/lib/facilities';
import { RIYADH_CENTER } from '@/lib/geo';

interface Props {
  facilities: Facility[];
  /** الحي المختار أو «الكل» */
  district: string;
  /** الحالة المختارة أو «الكل» */
  status: string;
  /** بحث برقم الرخصة */
  query: string;
}

function markerHtml(status: Facility['status']): string {
  const color = COMPLIANCE_COLOR[status];
  const halo =
    status === 'alert'
      ? '<span style="position:absolute;inset:-8px;border-radius:50%;background:rgba(206,74,60,.4);animation:om-ping 1.5s infinite"></span>'
      : '';
  return (
    '<span style="position:relative;display:block;width:15px;height:15px">' +
    halo +
    '<span style="position:absolute;inset:0;border-radius:50%;background:' +
    color +
    ';border:2.5px solid #fff;box-shadow:0 1px 5px rgba(15,41,66,.45)"></span></span>'
  );
}

function popupHtml(f: Facility): string {
  const color = COMPLIANCE_COLOR[f.status];
  const badge = f.demo
    ? '<span style="font-size:10px;font-weight:700;color:#8A99A5;background:#F0F5F2;border-radius:5px;padding:2px 6px">بيانات عرض</span>'
    : '<span style="font-size:10px;font-weight:700;color:#165D3A;background:#E7F2EB;border-radius:5px;padding:2px 6px">منشأة مُتصلة</span>';

  const line =
    f.status === 'alert'
      ? '<div style="font-size:12.5px;color:#CE4A3C;font-weight:700;background:#FBEAE7;border-radius:6px;padding:6px 9px;margin-bottom:6px">تصعيد نشط — مخالفة تجاوزت مهلة التصحيح</div>'
      : f.status === 'warn'
        ? '<div style="font-size:12.5px;color:#8A6A1F;font-weight:700;background:#FBF3E3;border-radius:6px;padding:6px 9px;margin-bottom:6px">مخالفة قائمة ضمن مهلة التصحيح ⏳</div>'
        : '<div style="font-size:12.5px;color:#165D3A;font-weight:700;background:#E7F2EB;border-radius:6px;padding:6px 9px;margin-bottom:6px">ملتزمة — لا مخالفات قائمة ✓</div>';

  return (
    '<div dir="rtl" style="font-family:var(--font-naskh),sans-serif;min-width:240px">' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px">' +
    '<span style="width:10px;height:10px;border-radius:50%;background:' +
    color +
    ';flex:none"></span>' +
    '<span style="font-family:var(--font-kufi),sans-serif;font-weight:700;font-size:14px;color:#0F2942">' +
    f.nameAr +
    ' — ' +
    f.districtAr +
    '</span></div>' +
    '<div style="font-size:12px;color:#5B6B78;margin-bottom:6px">رخصة رقم <span style="font-family:ui-monospace,monospace;font-weight:700;color:#0F2942">' +
    f.licenseNo +
    '</span></div>' +
    line +
    '<div style="display:flex;justify-content:space-between;align-items:center">' +
    badge +
    '<span style="font-size:11px;color:#8A99A5">' +
    COMPLIANCE_AR[f.status] +
    '</span></div></div>'
  );
}

export default function MinistryMap({ facilities, district, status, query }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const markers = useRef<{ marker: Marker; facility: Facility }[]>([]);

  // ── الإنشاء (مرة واحدة) ──
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !el.current || map.current) return;

      const m = L.map(el.current, { zoomControl: true }).setView(RIYADH_CENTER, 11);
      m.zoomControl.setPosition('topleft');
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap &copy; CARTO',
      }).addTo(m);
      map.current = m;

      markers.current = facilities.map((f) => {
        const marker = L.marker([f.lat, f.lng], {
          icon: L.divIcon({
            className: '',
            html: markerHtml(f.status),
            iconSize: [15, 15],
            iconAnchor: [8, 8],
            popupAnchor: [0, -12],
          }),
        })
          .bindTooltip(`${f.nameAr} · ${f.districtAr} — ${COMPLIANCE_AR[f.status]}`, {
            direction: 'top',
            offset: [0, -10],
          })
          .bindPopup(popupHtml(f), { maxWidth: 300 })
          .addTo(m);
        return { marker, facility: f };
      });
    })();

    return () => {
      cancelled = true;
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
      markers.current = [];
    };
    // العلامات تُبنى مرة واحدة؛ التصفية تتم في التأثير التالي بإضافة/إزالة الطبقات
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilities]);

  // ── التصفية ──
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const q = query.trim();

    markers.current.forEach(({ marker, facility }) => {
      const show =
        (district === 'الكل' || facility.districtAr === district) &&
        (status === 'الكل' || COMPLIANCE_AR[facility.status] === status) &&
        (!q || facility.licenseNo.includes(q));

      if (show) {
        if (!m.hasLayer(marker)) marker.addTo(m);
      } else if (m.hasLayer(marker)) {
        m.removeLayer(marker);
      }
    });
  }, [district, status, query]);

  return <div ref={el} className="h-[560px] w-full bg-[#E9EEEA]" />;
}
