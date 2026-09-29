import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { fmtBrl } from "@shared/billing";
import {
  PROPOSAL_ISSUER,
  itemTotal,
  proposalSubtotal,
  proposalTotal,
  type ProposalItem,
} from "@shared/proposals";

export type ProposalPdfData = {
  number: string;
  clientName: string;
  contactName?: string | null;
  contactEmail?: string | null;
  title: string;
  intro?: string | null;
  scope?: string | null;
  items: ProposalItem[];
  discount: number;
  paymentTerms?: string | null;
  deliveryTime?: string | null;
  validUntil?: string | null;
  notes?: string | null;
  issuedAt?: Date;
};

const ACCENT = PROPOSAL_ISSUER.accentColor;
const INK = "#132A44";
const PAPER = "#F7F5F0";
const MUTED = "#4A627C";
const LINE = "#E4DDD2";
const ZEBRA = "#F7F5F0";

const s = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 64,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: INK,
    backgroundColor: PAPER,
  },
  hero: {
    marginTop: -40,
    backgroundColor: INK,
    color: PAPER,
    paddingHorizontal: 48,
    paddingTop: 40,
    paddingBottom: 32,
  },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  brand: { fontSize: 13, fontFamily: "Helvetica-Bold", letterSpacing: 0.5 },
  heroNumber: { fontSize: 9, opacity: 0.85 },
  heroEyebrow: {
    marginTop: 36,
    fontSize: 9,
    letterSpacing: 2,
    textTransform: "uppercase",
    opacity: 0.85,
  },
  heroTitle: { marginTop: 6, fontSize: 24, fontFamily: "Helvetica-Bold", lineHeight: 1.2 },
  body: { paddingHorizontal: 48, paddingTop: 28 },
  metaRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    paddingBottom: 16,
    marginBottom: 8,
  },
  metaCol: { flex: 1, paddingRight: 12 },
  metaLabel: {
    fontSize: 8,
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 3,
  },
  metaValue: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  metaSub: { fontSize: 9, color: MUTED },
  section: { marginTop: 20 },
  sectionHeader: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  sectionBar: { width: 3, height: 12, backgroundColor: ACCENT, marginRight: 8, borderRadius: 1 },
  sectionTitle: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  // Absolute lineHeight on leaf Text only: unitless values render ~2.7x, and on Page it hides fixed footers.
  paragraph: { color: INK, lineHeight: "15pt" },
  table: { borderWidth: 1, borderColor: LINE, borderRadius: 4 },
  tr: { flexDirection: "row", paddingVertical: 7, paddingHorizontal: 10 },
  th: {
    backgroundColor: INK,
    color: PAPER,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  cDesc: { flex: 5 },
  cQty: { flex: 1, textAlign: "right" },
  cPrice: { flex: 2, textAlign: "right" },
  cTotal: { flex: 2, textAlign: "right" },
  totals: { marginTop: 10, alignSelf: "flex-end", width: 230 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  grandTotal: {
    marginTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: ACCENT,
    color: INK,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  grandTotalValue: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  conditions: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -6 },
  conditionCard: {
    width: "33.33%",
    paddingHorizontal: 6,
    marginBottom: 8,
  },
  conditionInner: {
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 4,
    padding: 10,
    minHeight: 58,
  },
  signatures: { flexDirection: "row", marginTop: 44 },
  signature: { flex: 1, marginHorizontal: 12, borderTopWidth: 1, borderTopColor: INK, paddingTop: 6 },
  signatureLabel: { fontSize: 9, color: MUTED, textAlign: "center" },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingTop: 8,
    fontSize: 8,
    color: MUTED,
  },
});

function fmtDate(value?: string | Date | null): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(`${value.slice(0, 10)}T00:00:00`) : value;
  return d.toLocaleDateString("pt-BR");
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section} wrap={false}>
      <View style={s.sectionHeader}>
        <View style={s.sectionBar} />
        <Text style={s.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

export function ProposalPdf({ data }: { data: ProposalPdfData }) {
  const items = data.items.filter((i) => i.description.trim() || i.unitPrice > 0);
  const subtotal = proposalSubtotal(items);
  const total = proposalTotal(items, data.discount);
  const discount = subtotal - total;
  const conditions = [
    { label: "Pagamento", value: data.paymentTerms },
    { label: "Prazo de entrega", value: data.deliveryTime },
    { label: "Validade", value: data.validUntil ? `Até ${fmtDate(data.validUntil)}` : null },
  ].filter((c) => c.value);

  return (
    <Document title={`${data.number} - ${data.title}`} author={PROPOSAL_ISSUER.companyName}>
      <Page size="A4" style={s.page}>
        <View style={s.hero}>
          <View style={s.heroTop}>
            <Text style={s.brand}>{PROPOSAL_ISSUER.companyName}</Text>
            <Text style={s.heroNumber}>{data.number}</Text>
          </View>
          <Text style={s.heroEyebrow}>{PROPOSAL_ISSUER.tagline}</Text>
          <Text style={s.heroTitle}>{data.title || "Sem título"}</Text>
        </View>

        <View style={s.body}>
          <View style={s.metaRow}>
            <View style={s.metaCol}>
              <Text style={s.metaLabel}>Preparado para</Text>
              <Text style={s.metaValue}>{data.clientName || "—"}</Text>
              {data.contactName ? <Text style={s.metaSub}>{data.contactName}</Text> : null}
              {data.contactEmail ? <Text style={s.metaSub}>{data.contactEmail}</Text> : null}
            </View>
            <View style={s.metaCol}>
              <Text style={s.metaLabel}>Emitida em</Text>
              <Text style={s.metaValue}>{fmtDate(data.issuedAt ?? new Date())}</Text>
            </View>
            <View style={s.metaCol}>
              <Text style={s.metaLabel}>Investimento</Text>
              <Text style={[s.metaValue, { color: ACCENT }]}>{fmtBrl(total)}</Text>
            </View>
          </View>

          {data.intro ? (
            <Section title="Apresentação">
              <Text style={s.paragraph}>{data.intro}</Text>
            </Section>
          ) : null}

          {data.scope ? (
            <Section title="Escopo">
              <Text style={s.paragraph}>{data.scope}</Text>
            </Section>
          ) : null}

          {items.length ? (
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <View style={s.sectionBar} />
                <Text style={s.sectionTitle}>Investimento</Text>
              </View>
              <View style={s.table}>
                <View style={[s.tr, s.th]} fixed>
                  <Text style={s.cDesc}>Descrição</Text>
                  <Text style={s.cQty}>Qtd</Text>
                  <Text style={s.cPrice}>Valor unit.</Text>
                  <Text style={s.cTotal}>Total</Text>
                </View>
                {items.map((item, idx) => (
                  <View
                    key={idx}
                    style={[s.tr, idx % 2 === 1 ? { backgroundColor: ZEBRA } : {}]}
                    wrap={false}
                  >
                    <Text style={s.cDesc}>{item.description || "—"}</Text>
                    <Text style={s.cQty}>{item.quantity}</Text>
                    <Text style={s.cPrice}>{fmtBrl(item.unitPrice)}</Text>
                    <Text style={[s.cTotal, { fontFamily: "Helvetica-Bold" }]}>
                      {fmtBrl(itemTotal(item))}
                    </Text>
                  </View>
                ))}
              </View>
              <View style={s.totals} wrap={false}>
                <View style={s.totalRow}>
                  <Text style={{ color: MUTED }}>Subtotal</Text>
                  <Text>{fmtBrl(subtotal)}</Text>
                </View>
                {discount > 0 ? (
                  <View style={s.totalRow}>
                    <Text style={{ color: MUTED }}>Desconto</Text>
                    <Text>- {fmtBrl(discount)}</Text>
                  </View>
                ) : null}
                <View style={s.grandTotal}>
                  <Text style={{ fontSize: 9, letterSpacing: 1, fontFamily: "Helvetica-Bold" }}>TOTAL</Text>
                  <Text style={s.grandTotalValue}>{fmtBrl(total)}</Text>
                </View>
              </View>
            </View>
          ) : null}

          {conditions.length ? (
            <Section title="Condições">
              <View style={s.conditions}>
                {conditions.map((c) => (
                  <View key={c.label} style={s.conditionCard}>
                    <View style={s.conditionInner}>
                      <Text style={s.metaLabel}>{c.label}</Text>
                      <Text>{c.value}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </Section>
          ) : null}

          {data.notes ? (
            <Section title="Observações">
              <Text style={s.paragraph}>{data.notes}</Text>
            </Section>
          ) : null}

          <View wrap={false}>
            <Section title="Aceite">
              <Text style={s.paragraph}>
                Ao assinar abaixo, as partes concordam com os termos, valores e condições descritos
                nesta proposta.
              </Text>
            </Section>
            <View style={s.signatures}>
              <View style={s.signature}>
                <Text style={s.signatureLabel}>{PROPOSAL_ISSUER.companyName}</Text>
              </View>
              <View style={s.signature}>
                <Text style={s.signatureLabel}>{data.clientName || "Cliente"}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={s.footer} fixed>
          <Text>{PROPOSAL_ISSUER.footer}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function downloadProposalPdf(data: ProposalPdfData) {
  const blob = await pdf(<ProposalPdf data={data} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${data.number || "proposta"}-${slug(data.clientName)}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
