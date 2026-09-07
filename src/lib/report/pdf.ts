"use client";

/**
 * Report PDF export.
 *
 * Built with jsPDF's vector primitives rather than rasterising the DOM. A
 * screenshot of the panel would carry the page's own layout and hand back an
 * image nobody can select text from; drawing the document produces something
 * that reads as a report and stays searchable.
 *
 * One constraint shapes the whole file: jsPDF's built-in fonts are Latin-1 only,
 * so CJK glyphs render as blanks. Embedding a Chinese font would add megabytes to
 * the bundle for a secondary feature, so the PDF is issued in English with the
 * Chinese headline carried as document metadata. `pdfLanguageNote` states this in
 * the UI rather than letting a Chinese reader discover empty boxes.
 */

import { jsPDF } from "jspdf";
import type { ReportResult, SignalsResult } from "@/lib/agents/analysis";
import type { OrderPreview } from "@/lib/agents/order";
import type { Lang } from "@/lib/i18n/types";

/** A4 in points, the unit jsPDF defaults to. */
const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const CONTENT_WIDTH = PAGE.width - MARGIN * 2;

const INK = { r: 10, g: 22, b: 40 };
const MUTED = { r: 91, g: 107, b: 133 };
const BRAND = { r: 11, g: 99, b: 246 };

const GRADE_RGB: Record<string, [number, number, number]> = {
  A: [15, 157, 88],
  B: [61, 139, 64],
  C: [183, 121, 31],
  D: [217, 119, 6],
  E: [217, 48, 37],
};

export interface ReportExportInput {
  symbol: string;
  report: ReportResult;
  signals?: SignalsResult;
  order?: OrderPreview | null;
  /** Which language the reader is viewing, recorded in the metadata. */
  lang: Lang;
  /** Settlement hashes, so the PDF carries its own provenance. */
  transactions?: { agent: string; hash: string }[];
  explorerBase?: string;
}

/** Tracks the cursor and starts a new page before content would overflow. */
class Cursor {
  y = MARGIN;

  constructor(private readonly doc: jsPDF) {}

  needs(space: number) {
    if (this.y + space > PAGE.height - MARGIN) {
      this.doc.addPage();
      this.y = MARGIN;
    }
  }

  advance(amount: number) {
    this.y += amount;
  }
}

function setColour(doc: jsPDF, colour: { r: number; g: number; b: number }) {
  doc.setTextColor(colour.r, colour.g, colour.b);
}

/** Draws wrapped body text and returns the height consumed. */
function paragraph(
  doc: jsPDF,
  cursor: Cursor,
  text: string,
  options: { size?: number; leading?: number; colour?: typeof INK } = {},
) {
  const size = options.size ?? 9.5;
  const leading = options.leading ?? size * 1.5;

  doc.setFontSize(size);
  setColour(doc, options.colour ?? MUTED);

  const lines = doc.splitTextToSize(text, CONTENT_WIDTH) as string[];
  for (const line of lines) {
    cursor.needs(leading);
    doc.text(line, MARGIN, cursor.y);
    cursor.advance(leading);
  }
}

function sectionHeading(doc: jsPDF, cursor: Cursor, label: string) {
  cursor.needs(30);
  cursor.advance(10);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  setColour(doc, BRAND);
  doc.text(label.toUpperCase(), MARGIN, cursor.y);
  cursor.advance(6);

  doc.setDrawColor(227, 234, 245);
  doc.setLineWidth(0.6);
  doc.line(MARGIN, cursor.y, PAGE.width - MARGIN, cursor.y);
  cursor.advance(14);

  doc.setFont("helvetica", "normal");
}

/**
 * The grade circle, approximated with two arcs.
 *
 * jsPDF has no arc primitive, so the ring is drawn as a polyline of ~60 segments
 * with a deliberate gap and a slight radius wobble — enough to read as drawn by
 * hand rather than as a perfect vector circle.
 */
function drawGradeMark(
  doc: jsPDF,
  centreX: number,
  centreY: number,
  radius: number,
  grade: string,
) {
  const [r, g, b] = GRADE_RGB[grade] ?? GRADE_RGB.C;

  doc.setDrawColor(r, g, b);
  doc.setLineWidth(2.6);
  doc.setLineCap("round");

  // Leave the last few degrees open so the stroke does not close cleanly.
  const start = -0.35;
  const end = Math.PI * 2 - 0.12;
  const steps = 64;

  let previousX = 0;
  let previousY = 0;

  for (let i = 0; i <= steps; i += 1) {
    const angle = start + ((end - start) * i) / steps;
    // Wobble the radius so the ring is not a machine-perfect circle.
    const wobble = radius * (1 + Math.sin(angle * 3) * 0.022);
    const x = centreX + Math.cos(angle) * wobble;
    const y = centreY + Math.sin(angle) * wobble;

    if (i > 0) doc.line(previousX, previousY, x, y);
    previousX = x;
    previousY = y;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(radius * 1.15);
  doc.setTextColor(r, g, b);
  doc.text(grade, centreX, centreY + radius * 0.4, { align: "center" });
  doc.setFont("helvetica", "normal");
}

/** Builds the document. Returns the jsPDF instance so callers can save or open it. */
export function buildReportPdf(input: ReportExportInput): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const cursor = new Cursor(doc);

  const { report, signals, order, symbol } = input;

  // Metadata carries the Chinese headline, which the built-in fonts cannot draw.
  doc.setProperties({
    title: `AgentMesh report — ${symbol}`,
    subject: report.headline.en,
    keywords: [symbol, report.direction, signals?.grade ?? "", report.headline.zh]
      .filter(Boolean)
      .join(", "),
    creator: "AgentMesh · x402 payment mesh",
  });

  // ---- Masthead ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  setColour(doc, INK);
  doc.text("AgentMesh", MARGIN, cursor.y + 4);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  setColour(doc, MUTED);
  doc.text(
    "Autonomous agent-to-agent research · x402 v2 on BNB Smart Chain",
    MARGIN,
    cursor.y + 18,
  );
  doc.text(
    new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC",
    PAGE.width - MARGIN,
    cursor.y + 18,
    { align: "right" },
  );

  cursor.advance(34);
  doc.setDrawColor(11, 99, 246);
  doc.setLineWidth(1.4);
  doc.line(MARGIN, cursor.y, PAGE.width - MARGIN, cursor.y);
  cursor.advance(26);

  // ---- Headline and grade ----
  if (signals) {
    drawGradeMark(doc, PAGE.width - MARGIN - 30, cursor.y + 16, 26, signals.grade);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  setColour(doc, INK);
  const headlineLines = doc.splitTextToSize(
    report.headline.en,
    CONTENT_WIDTH - 80,
  ) as string[];
  for (const line of headlineLines) {
    doc.text(line, MARGIN, cursor.y + 6);
    cursor.advance(18);
  }
  doc.setFont("helvetica", "normal");

  cursor.advance(6);
  doc.setFontSize(9);
  setColour(doc, MUTED);
  doc.text(
    `Direction ${report.direction.toUpperCase()}  ·  Confidence ${Math.round(
      report.confidence * 100,
    )}%` +
      (signals
        ? `  ·  Signal grade ${signals.grade} (${signals.score}/100)  ·  Regime ${signals.regimeLabel.en}`
        : ""),
    MARGIN,
    cursor.y,
  );
  cursor.advance(10);

  // ---- Findings ----
  sectionHeading(doc, cursor, "Findings");
  for (const item of report.narrative) {
    paragraph(doc, cursor, item.en);
    cursor.advance(4);
  }

  // ---- Signal breakdown ----
  if (signals) {
    sectionHeading(doc, cursor, "Signal breakdown");
    paragraph(doc, cursor, signals.regimeNote.en, { colour: INK });
    cursor.advance(6);

    for (const component of signals.components) {
      cursor.needs(24);

      doc.setFontSize(9);
      setColour(doc, INK);
      doc.text(component.label.en, MARGIN, cursor.y);

      doc.setFontSize(8.5);
      setColour(doc, MUTED);
      doc.text(
        `${Math.round(component.score * 100)}/100 · weight ${(component.weight * 100).toFixed(0)}%`,
        PAGE.width - MARGIN,
        cursor.y,
        { align: "right" },
      );
      cursor.advance(12);

      paragraph(doc, cursor, component.detail.en, { size: 8.5, leading: 11.5 });
      cursor.advance(3);
    }
  }

  // ---- Key levels ----
  if (report.levels.length > 0) {
    sectionHeading(doc, cursor, "Key levels");
    for (const level of report.levels) {
      cursor.needs(14);
      doc.setFontSize(9);
      setColour(doc, MUTED);
      doc.text(level.label.en, MARGIN, cursor.y);
      setColour(doc, INK);
      doc.text(
        level.value.toLocaleString(undefined, { maximumFractionDigits: 8 }),
        PAGE.width - MARGIN,
        cursor.y,
        { align: "right" },
      );
      cursor.advance(14);
    }
  }

  // ---- Order preview ----
  if (order) {
    sectionHeading(doc, cursor, "Order preview — awaiting human approval");

    const rows: [string, string][] = [
      ["Side", order.side],
      ["Type", order.type],
      ["Quantity", String(order.quantity)],
      ["Limit price", String(order.price)],
      ["Stop loss", String(order.stopLossPrice)],
      ["Take profit", String(order.takeProfitPrice)],
      ["Notional", `$${order.notionalUsd.toLocaleString()}`],
      ["Leverage", `${order.leverage.toFixed(1)}x`],
    ];

    for (const [label, value] of rows) {
      cursor.needs(14);
      doc.setFontSize(9);
      setColour(doc, MUTED);
      doc.text(label, MARGIN, cursor.y);
      setColour(doc, INK);
      doc.text(value, MARGIN + 130, cursor.y);
      cursor.advance(14);
    }

    cursor.advance(6);
    for (const line of order.rationale) {
      paragraph(doc, cursor, line.en, { size: 8.5, leading: 11.5 });
    }

    cursor.advance(4);
    paragraph(
      doc,
      cursor,
      "Executing this would require the Agent OS trade scope. AgentMesh requests " +
        "market_data and account only, so no code path can place an order.",
      { size: 8, leading: 11 },
    );
  }

  // ---- Provenance ----
  if (input.transactions?.length) {
    sectionHeading(doc, cursor, "On-chain provenance");
    paragraph(
      doc,
      cursor,
      "Each agent released its analysis only after payment settled on BNB Smart Chain. " +
        "Every hash below is independently verifiable.",
      { size: 8.5, leading: 11.5 },
    );
    cursor.advance(4);

    for (const tx of input.transactions) {
      cursor.needs(13);
      doc.setFontSize(8);
      setColour(doc, MUTED);
      doc.text(tx.agent, MARGIN, cursor.y);
      setColour(doc, INK);
      doc.text(tx.hash, MARGIN + 130, cursor.y);
      cursor.advance(13);
    }
  }

  // ---- Footer on every page ----
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(7.5);
    setColour(doc, MUTED);
    doc.text(
      "Demo software · testnet by default · not financial advice, not audited",
      MARGIN,
      PAGE.height - 22,
    );
    doc.text(`${page} / ${pageCount}`, PAGE.width - MARGIN, PAGE.height - 22, {
      align: "right",
    });
  }

  return doc;
}

export function reportFilename(symbol: string): string {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "");
  return `agentmesh-${symbol.toLowerCase()}-${stamp}.pdf`;
}
