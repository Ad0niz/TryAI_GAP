/**
 * Branded TryAIGap executive report — generated fully client-side with
 * @react-pdf/renderer (product decision; the backend report job endpoint is
 * intentionally unused).
 *
 * Layout: cover → methodology + 5-dimension radar + dimension table →
 * value vectors → area matrix → heatmap + optional initiatives + next steps.
 */
import {
  Circle,
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
  locale: string;
  heatNote: string;
  noPriorities: string;
  noData: string;
  unavailable: string;
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
  analytics: {
    vectorsTitle: string; vectorsDescription: string; vectorsNotice: string; unmapped: string;
    vectorNames: Record<string, string>; areaNames: Record<string, string>;
    matrixTitle: string; matrixDescription: string; coverageRule: string; boundaryRule: string;
    noPoints: string; pendingAreas: string; coverageColumn: string; answersLabel: string;
    pain: string; readiness: string; classification: string; legend: string; noData: string;
    quadrants: Record<string, string>;
  };
}

export interface ReportData {
  orgName: string;
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

function Footer({ footer }: { footer: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text>{footer}</Text>
      <Text render={({ pageNumber }) => String(pageNumber)} />
    </View>
  );
}

/** Coordinates and classifications are taken unchanged from the API. */
function MatrixSvg({ matrix, labels }: { matrix: NonNullable<ResultOut['pain_readiness']>; labels: ReportLabels }) {
  // Draw Quick Wins last so coincident points do not hide them.
  const drawPoints = [...matrix.points].sort((a, b) => Number(a.quick_win) - Number(b.quick_win));
  const left = 40, top = 18, width = 400, height = 180;
  const x = (value: number) => left + (value - 1) * width / 4;
  const y = (value: number) => top + (5 - value) * height / 4;
  return <Svg width={480} height={240}>
    {[1, 2, 3, 4, 5].map(value => <Line key={`x${value}`} x1={x(value)} x2={x(value)} y1={top} y2={top + height} stroke={BRAND.line} />)}
    {[1, 2, 3, 4, 5].map(value => <Line key={`y${value}`} x1={left} x2={left + width} y1={y(value)} y2={y(value)} stroke={BRAND.line} />)}
    <Line x1={x(matrix.threshold)} x2={x(matrix.threshold)} y1={top} y2={top + height} stroke={BRAND.muted} strokeDasharray="4 4" />
    <Line x1={left} x2={left + width} y1={y(matrix.threshold)} y2={y(matrix.threshold)} stroke={BRAND.muted} strokeDasharray="4 4" />
    {[1, 2, 3, 4, 5].map(value => <Text key={`tx${value}`} x={x(value) - 3} y={top + height + 14} style={{ fontSize: 8 }}>{value}</Text>)}
    {[1, 2, 3, 4, 5].map(value => <Text key={`ty${value}`} x={left - 16} y={y(value) + 3} style={{ fontSize: 8 }}>{value}</Text>)}
    <Text x={left} y={10} style={{ fontSize: 9 }}>{labels.analytics.pain}</Text>
    <Text x={left + width / 2 - 24} y={232} style={{ fontSize: 9 }}>{labels.analytics.readiness}</Text>
    {drawPoints.map((point) => <Circle key={point.area_key} cx={x(point.readiness)} cy={y(point.pain)} r={8}
      fill={point.quick_win ? BRAND.primary : BRAND.muted} />)}
  </Svg>;
}

export function ReportDocument({ data, labels }: { data: ReportData; labels: ReportLabels }) {
  const { results } = data;
  const { maturity, heatmap, priorities } = results;
  const number = new Intl.NumberFormat(labels.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const coordinate = new Intl.NumberFormat(labels.locale, { minimumFractionDigits: 1, maximumFractionDigits: 3 });

  return (
    <Document title={labels.coverTitle} author="TryAIGap" language={labels.locale}>
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
        <Text style={styles.h2} minPresenceAhead={40}>{labels.methodology}</Text>
        <Text style={styles.body}>{labels.methodologyBody}</Text>
        <Footer footer={labels.footer} />
      </Page>

      {/* Dimensions */}
      <Page size="A4" style={styles.page}>
        <View style={styles.brandBar} />
        <Text style={styles.h2} minPresenceAhead={40}>{labels.dimTitle}</Text>
        <View style={styles.radarWrap}>
          <RadarSvg scores={maturity.dimensions.map((d) => d.score)} />
        </View>
        <View style={styles.tableHeader}>
          <Text style={styles.cell}>{labels.dimName}</Text>
          <Text style={styles.cellNarrow}>{labels.dimScore}</Text>
        </View>
        {maturity.dimensions.map((d) => (
          <View wrap={false} style={styles.tableRow} key={d.key}>
            <Text style={styles.cell}>{d.label}</Text>
            <Text style={styles.cellNarrow}>{number.format(d.score)}</Text>
          </View>
        ))}
        <Footer footer={labels.footer} />
      </Page>

      {/* Value vectors: absence of data is never rendered as zero. */}
      <Page size="A4" style={styles.page}>
        <View style={styles.brandBar} />
        <Text style={styles.h2} minPresenceAhead={40}>{labels.analytics.vectorsTitle}</Text>
        <Text style={styles.body}>{labels.analytics.vectorsDescription}</Text>
        {!!labels.analytics.vectorsNotice && <Text style={styles.meta}>{labels.analytics.vectorsNotice}</Text>}
        {Object.entries(labels.analytics.vectorNames).map(([key, name]) => {
          const vector = results.value_vectors?.vectors.find(item => item.key === key);
          return <View wrap={false} style={{ marginTop: 18 }} key={key}>
            <View style={styles.tableRow}>
              <Text style={styles.cell}>{name}</Text>
              <Text style={styles.cellNarrow}>{vector?.percentage == null ? labels.analytics.noData : `${number.format(vector.percentage)} %`}</Text>
            </View>
            {vector?.percentage != null && <>
              <View style={{ height: 6, marginTop: 6, backgroundColor: BRAND.line }}>
                <View style={{ height: 6, width: `${vector.percentage}%`, backgroundColor: BRAND.primary }} />
              </View>
              <Text style={styles.meta}>{labels.analytics.answersLabel}: {vector.numeric_answers}</Text>
            </>}
          </View>;
        })}
        {!!labels.analytics.unmapped && <Text style={styles.meta}>{labels.analytics.unmapped}</Text>}
        <Footer footer={labels.footer} />
      </Page>

      {/* The area matrix does not generate or rank individual initiatives. */}
      <Page size="A4" style={styles.page}>
        <View style={styles.brandBar} />
        <Text style={styles.h2} minPresenceAhead={40}>{labels.analytics.matrixTitle}</Text>
        <Text style={styles.body}>{labels.analytics.matrixDescription}</Text>
        <Text style={styles.meta}>{labels.analytics.coverageRule}</Text>
        {!results.pain_readiness?.points.length ? <Text style={styles.meta}>{labels.analytics.noPoints}</Text> : <>
          <View wrap={false} style={{ marginTop: 12 }}><MatrixSvg matrix={results.pain_readiness} labels={labels} /></View>
          <Text style={styles.sub}>{labels.analytics.boundaryRule}</Text>
          <Text style={styles.sub}>{labels.analytics.legend}</Text>
          <View style={styles.tableHeader}>
            <Text style={{ flex: 2 }}>{labels.prioritiesHeaders.area}</Text>
            <Text style={{ width: 48 }}>{labels.analytics.pain}</Text>
            <Text style={{ width: 65 }}>{labels.analytics.readiness}</Text>
            <Text style={styles.cell}>{labels.analytics.classification}</Text>
          </View>
          {results.pain_readiness.points.map((point) => <View wrap={false} key={point.area_key} style={styles.tableRow}>
            <Text style={{ flex: 2 }}>{labels.analytics.areaNames[point.area_key] ?? labels.unavailable}</Text>
            <Text style={{ width: 48 }}>{coordinate.format(point.pain)}</Text>
            <Text style={{ width: 65 }}>{coordinate.format(point.readiness)}</Text>
            <Text style={styles.cell}>{labels.analytics.quadrants[point.quadrant] ?? labels.unavailable}</Text>
          </View>)}
        </>}
        {!!results.pain_readiness?.pending_areas.length && <>
          <Text style={styles.h2} minPresenceAhead={40}>{labels.analytics.pendingAreas}</Text>
          <View style={styles.tableHeader}>
            <Text style={styles.cell}>{labels.prioritiesHeaders.area}</Text>
            <Text style={{ width: 140, textAlign: 'right' }}>{labels.analytics.coverageColumn}</Text>
          </View>
          {results.pain_readiness.pending_areas.map(area => <View wrap={false} style={styles.tableRow} key={area.area_key}>
            <Text style={styles.cell}>{labels.analytics.areaNames[area.area_key] ?? labels.unavailable}</Text>
            <Text style={{ width: 140, textAlign: 'right' }}>{area.numeric_answers}/{area.total_questions}</Text>
          </View>)}
        </>}
        <Footer footer={labels.footer} />
      </Page>

      {/* Heatmap + optional initiatives + recommendations */}
      <Page size="A4" style={styles.page}>
        <View style={styles.brandBar} />
        <Text style={styles.h2} minPresenceAhead={40}>{labels.heatTitle}</Text>
        <Text style={styles.sub}>{labels.heatNote}</Text>
        {heatmap.areas.length === 0 && <Text style={styles.sub}>{labels.noData}</Text>}
        <View style={styles.tableHeader}>
          <Text style={styles.cell}>{labels.prioritiesHeaders.area}</Text>
          {heatmap.vectors.map((v) => (
            <Text style={styles.cellNarrow} key={v}>
              {v}
            </Text>
          ))}
        </View>
        {heatmap.areas.map((area) => (
          <View wrap={false} style={styles.tableRow} key={area.name}>
            <Text style={styles.cell}>{area.name}</Text>
            {area.row.map((v, i) => (
              <Text style={styles.cellNarrow} key={i}>
                {v === null ? "—" : number.format(v)}
              </Text>
            ))}
          </View>
        ))}

        {priorities.length > 0 && <>
        <Text style={styles.h2} minPresenceAhead={40}>{labels.prioTitle}</Text>
        <View style={styles.tableHeader}>
          <Text style={{ flex: 2 }}>{labels.prioritiesHeaders.initiative}</Text>
          <Text style={styles.cell}>{labels.prioritiesHeaders.area}</Text>
          <Text style={styles.cell}>{labels.prioritiesHeaders.vector}</Text>
          <Text style={styles.cellNarrow}>{labels.prioritiesHeaders.recommendation}</Text>
        </View>
        {priorities.map((p) => (
          <View wrap={false} style={styles.tableRow} key={p.initiative}>
            <Text style={{ flex: 2 }}>{p.initiative}</Text>
            <Text style={styles.cell}>{p.area}</Text>
            <Text style={styles.cell}>{p.vector}</Text>
            <Text style={styles.cellNarrow}>
              {labels.recoLabels[p.recommendation] ?? labels.unavailable}
            </Text>
          </View>
        ))}

        </>}
        <Text style={styles.h2} minPresenceAhead={40}>{labels.recoTitle}</Text>
        {labels.nextSteps.map((step, i) => (
          <View wrap={false} style={styles.step} key={i}>
            <Text style={styles.stepN}>{i + 1}</Text>
            <Text style={[styles.body, { flex: 1 }]}>{step}</Text>
          </View>
        ))}
        <Footer footer={labels.footer} />
      </Page>
    </Document>
  );
}
