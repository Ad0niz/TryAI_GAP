/**
 * Branded TryAIGap executive report — generated fully client-side with
 * @react-pdf/renderer (product decision; the backend report job endpoint is
 * intentionally unused).
 *
 * Layout: cover → methodology + 5-dimension radar + dimension table →
 * heatmap + priorities → recommendations/next steps.
 */
import {
  Document,
  Line,
  Page,
  Polygon,
  StyleSheet,
  Svg,
  Text,
  View,
} from '@react-pdf/renderer';
import type { ResultOut } from '@/api/types';

const BRAND = {
  primary: '#6d28d9',
  primarySoft: '#ede9fe',
  ink: '#1f2937',
  muted: '#6b7280',
  line: '#e5e7eb',
  accent: '#0ea5e9',
};

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 10, color: BRAND.ink, fontFamily: 'Helvetica' },
  brandBar: {
    height: 6,
    backgroundColor: BRAND.primary,
    borderRadius: 3,
    marginBottom: 24,
  },
  h1: { fontSize: 26, fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  h2: { fontSize: 14, fontFamily: 'Helvetica-Bold', marginBottom: 8, marginTop: 18 },
  sub: { color: BRAND.muted, marginBottom: 4 },
  coverBox: {
    marginTop: 32,
    padding: 20,
    backgroundColor: BRAND.primarySoft,
    borderRadius: 8,
  },
  coverScore: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: BRAND.primary },
  meta: { color: BRAND.muted, marginTop: 12, fontSize: 9 },
  body: { lineHeight: 1.5, color: BRAND.ink },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: BRAND.line,
    paddingBottom: 4,
    marginTop: 6,
    fontFamily: 'Helvetica-Bold',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: BRAND.line,
    paddingVertical: 4,
  },
  cell: { flex: 1 },
  cellNarrow: { width: 70, textAlign: 'right' },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    color: BRAND.muted,
    fontSize: 8,
  },
  radarWrap: { alignItems: 'center', marginVertical: 10 },
  chip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: BRAND.primarySoft,
    color: BRAND.primary,
    fontSize: 8,
  },
  step: { flexDirection: 'row', marginBottom: 6, gap: 6 },
  stepN: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: BRAND.primary,
    color: '#ffffff',
    textAlign: 'center',
    fontSize: 9,
    paddingTop: 2,
  },
});

export interface ReportLabels {
  coverTitle: string;
  coverSub: string;
  generatedOn: string;
  overallScore: string;
  methodology: string;
  methodologyBody: string;
  dimTitle: string;
  dimName: string;
  dimScore: string;
  heatTitle: string;
  prioTitle: string;
  recoTitle: string;
  nextSteps: string[];
  footer: string;
  prioritiesHeaders: { initiative: string; area: string; vector: string; recommendation: string };
  recoLabels: Record<string, string>;
}

export interface ReportData {
  orgName: string;
  date: string;
  results: ResultOut;
}

// ------------------------------------------------------------------ SVG radar
const RADAR_SIZE = 240;
const RADAR_R = 90;
const CX = RADAR_SIZE / 2;
const CY = RADAR_SIZE / 2;

function point(index: number, total: number, radius: number): string {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
  return `${CX + radius * Math.cos(angle)},${CY + radius * Math.sin(angle)}`;
}

function RadarSvg({ scores }: { scores: number[] }) {
  const n = scores.length;
  const rings = [1, 2, 3, 4, 5].map((v) => (RADAR_R * v) / 5);
  const valuePoints = scores.map((s, i) => point(i, n, (RADAR_R * Math.min(s, 5)) / 5)).join(' ');
  return (
    <Svg width={RADAR_SIZE} height={RADAR_SIZE}>
      {rings.map((r) => (
        <Polygon
          key={r}
          points={Array.from({ length: n }, (_, i) => point(i, n, r)).join(' ')}
          fill="none"
          stroke={BRAND.line}
          strokeWidth={1}
        />
      ))}
      {Array.from({ length: n }, (_, i) => (
        <Line key={i} x1={CX} y1={CY} x2={parseFloat(point(i, n, RADAR_R).split(',')[0])} y2={parseFloat(point(i, n, RADAR_R).split(',')[1])} stroke={BRAND.line} strokeWidth={1} />
      ))}
      <Polygon points={valuePoints} fill={BRAND.primary} fillOpacity={0.3} stroke={BRAND.primary} strokeWidth={2} />
    </Svg>
  );
}

function Footer({ footer, pageLabel }: { footer: string; pageLabel: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text>{footer}</Text>
      <Text>{pageLabel}</Text>
    </View>
  );
}

export function ReportDocument({ data, labels }: { data: ReportData; labels: ReportLabels }) {
  const { results } = data;
  const { maturity, heatmap, priorities } = results;

  return (
    <Document title={labels.coverTitle} author="TryAIGap">
      {/* Cover */}
      <Page size="A4" style={styles.page}>
        <View style={styles.brandBar} />
        <Text style={styles.h1}>{labels.coverTitle}</Text>
        <Text style={styles.sub}>{labels.coverSub}</Text>
        <Text style={styles.meta}>
          {data.orgName} · {labels.generatedOn}
        </Text>
        <View style={styles.coverBox}>
          <Text style={styles.coverScore}>{labels.overallScore}</Text>
        </View>
        <Text style={styles.h2}>{labels.methodology}</Text>
        <Text style={styles.body}>{labels.methodologyBody}</Text>
        <Footer footer={labels.footer} pageLabel="1" />
      </Page>

      {/* Dimensions */}
      <Page size="A4" style={styles.page}>
        <View style={styles.brandBar} />
        <Text style={styles.h2}>{labels.dimTitle}</Text>
        <View style={styles.radarWrap}>
          <RadarSvg scores={maturity.dimensions.map((d) => d.score)} />
        </View>
        <View style={styles.tableHeader}>
          <Text style={styles.cell}>{labels.dimName}</Text>
          <Text style={styles.cellNarrow}>{labels.dimScore}</Text>
        </View>
        {maturity.dimensions.map((d) => (
          <View style={styles.tableRow} key={d.key}>
            <Text style={styles.cell}>{d.label}</Text>
            <Text style={styles.cellNarrow}>{d.score.toFixed(1)}</Text>
          </View>
        ))}
        <Footer footer={labels.footer} pageLabel="2" />
      </Page>

      {/* Heatmap + priorities + recommendations */}
      <Page size="A4" style={styles.page}>
        <View style={styles.brandBar} />
        <Text style={styles.h2}>{labels.heatTitle}</Text>
        <View style={styles.tableHeader}>
          <Text style={styles.cell}>{labels.prioritiesHeaders.area}</Text>
          {heatmap.vectors.map((v) => (
            <Text style={styles.cellNarrow} key={v}>
              {v}
            </Text>
          ))}
        </View>
        {heatmap.areas.map((area) => (
          <View style={styles.tableRow} key={area.name}>
            <Text style={styles.cell}>{area.name}</Text>
            {area.row.map((v, i) => (
              <Text style={styles.cellNarrow} key={i}>
                {v}
              </Text>
            ))}
          </View>
        ))}

        <Text style={styles.h2}>{labels.prioTitle}</Text>
        <View style={styles.tableHeader}>
          <Text style={{ flex: 2 }}>{labels.prioritiesHeaders.initiative}</Text>
          <Text style={styles.cell}>{labels.prioritiesHeaders.area}</Text>
          <Text style={styles.cell}>{labels.prioritiesHeaders.vector}</Text>
          <Text style={styles.cellNarrow}>{labels.prioritiesHeaders.recommendation}</Text>
        </View>
        {priorities.map((p) => (
          <View style={styles.tableRow} key={p.initiative}>
            <Text style={{ flex: 2 }}>{p.initiative}</Text>
            <Text style={styles.cell}>{p.area}</Text>
            <Text style={styles.cell}>{p.vector}</Text>
            <Text style={styles.cellNarrow}>
              {labels.recoLabels[p.recommendation] ?? p.recommendation}
            </Text>
          </View>
        ))}

        <Text style={styles.h2}>{labels.recoTitle}</Text>
        {labels.nextSteps.map((step, i) => (
          <View style={styles.step} key={i}>
            <Text style={styles.stepN}>{i + 1}</Text>
            <Text style={[styles.body, { flex: 1 }]}>{step}</Text>
          </View>
        ))}
        <Footer footer={labels.footer} pageLabel="3" />
      </Page>
    </Document>
  );
}
